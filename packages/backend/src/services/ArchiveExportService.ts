import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';
import { db } from '../database';
import {
	archiveExportJobs,
	archivedEmails,
	attachments,
	emailAttachments,
	ingestionSources,
} from '../database/schema';
import { StorageService } from './StorageService';
import { AuditService } from './AuditService';
import { complianceQueue } from '../jobs/queues';
import { asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type {
	ArchiveExportFormat,
	ArchiveExportJob,
	ArchiveExportStatus,
	CreateArchiveExportJobDto,
	PaginatedArchiveExportJobs,
	User,
} from '@open-archiver/types';
import { config } from '../config';
import { logger } from '../config/logger';
import {
	buildSourceFolderName,
	sanitizeFilename,
	sanitizeMailboxPath,
} from '../helpers/storagePath';

type ArchiveExportEmail = {
	id: string;
	ingestionSourceId: string;
	userEmail: string;
	senderEmail: string;
	subject: string | null;
	sentAt: Date;
	archivedAt: Date;
	storagePath: string;
	storageHashSha256: string;
	path: string | null;
};

type ArchiveExportAttachment = {
	id: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	storagePath: string;
	contentHashSha256: string;
};

const mapArchiveExportJob = (
	job: typeof archiveExportJobs.$inferSelect
): ArchiveExportJob => ({
	id: job.id,
	format: job.format as ArchiveExportFormat,
	status: job.status as ArchiveExportStatus,
	snapshotAt: job.snapshotAt.toISOString(),
	filePath: job.filePath ?? null,
	emailCount: job.emailCount ?? null,
	attachmentCount: job.attachmentCount ?? null,
	errorMessage: job.errorMessage ?? null,
	createdByIdentifier: job.createdByIdentifier,
	createdAt: job.createdAt.toISOString(),
	completedAt: job.completedAt ? job.completedAt.toISOString() : null,
});

const streamToStream = (input: Readable, output: PassThrough): Promise<void> =>
	new Promise((resolve, reject) => {
		input.on('error', reject);
		output.on('error', reject);
		input.on('end', resolve);
		input.pipe(output, { end: false });
	});

export class ArchiveExportService {
	private auditService = new AuditService();
	private storageService = new StorageService();

	public async createArchiveExportJob(
		dto: CreateArchiveExportJobDto,
		actor: User,
		actorIp: string
	): Promise<ArchiveExportJob> {
		const format = dto.format as ArchiveExportFormat;
		if (!['eml', 'mbox', 'json'].includes(format)) {
			throw new Error('Unsupported export format.');
		}

		const [created] = await db
			.insert(archiveExportJobs)
			.values({
				format,
				status: 'pending',
				snapshotAt: new Date(),
				createdByIdentifier: actor.id,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'ArchiveExportJob',
			targetId: created.id,
			actorIp,
			details: {
				format,
				snapshotAt: created.snapshotAt.toISOString(),
			},
		});

		await complianceQueue.add('archive-export-job', { archiveExportJobId: created.id });

		return mapArchiveExportJob(created);
	}

	public async getArchiveExportJobs(
		page = 1,
		limit = 20
	): Promise<PaginatedArchiveExportJobs> {
		const offset = (page - 1) * limit;
		const [totalResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(archiveExportJobs);

		const rows = await db
			.select()
			.from(archiveExportJobs)
			.orderBy(desc(archiveExportJobs.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			items: rows.map(mapArchiveExportJob),
			total: Number(totalResult?.count ?? 0),
			page,
			limit,
		};
	}

	public async getArchiveExportJobById(id: string): Promise<ArchiveExportJob | null> {
		const job = await db.query.archiveExportJobs.findFirst({
			where: eq(archiveExportJobs.id, id),
		});
		return job ? mapArchiveExportJob(job) : null;
	}

	public async runArchiveExportJob(archiveExportJobId: string): Promise<void> {
		const job = await db.query.archiveExportJobs.findFirst({
			where: eq(archiveExportJobs.id, archiveExportJobId),
		});
		if (!job) {
			throw new Error('Archive export job not found.');
		}

		await db
			.update(archiveExportJobs)
			.set({ status: 'running', errorMessage: null })
			.where(eq(archiveExportJobs.id, archiveExportJobId));

		let emailCount = 0;
		let attachmentCount = 0;

		try {
			const snapshotAt = job.snapshotAt;
			const format = job.format as ArchiveExportFormat;
			const exportPath = `${config.storage.openArchiverFolderName}/archive-exports/${job.id}/export.zip`;
			const archive = archiver('zip', { zlib: { level: 9 } });
			const outputStream = new PassThrough();
			const uploadPromise = this.storageService.put(exportPath, outputStream);

			archive.on('warning', (warning) => {
				logger.warn({ warning, archiveExportJobId }, 'Archive export warning.');
			});
			archive.on('error', (error) => {
				throw error;
			});

			archive.pipe(outputStream);

			const metadata = {
				exportJobId: job.id,
				snapshotAt: snapshotAt.toISOString(),
				format,
				createdBy: job.createdByIdentifier,
				createdAt: job.createdAt.toISOString(),
			};
			archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

			const manifestStream = new PassThrough();
			archive.append(manifestStream, { name: 'manifest.jsonl' });

			let jsonStream: PassThrough | null = null;
			let wroteJsonItem = false;
			if (format === 'json') {
				jsonStream = new PassThrough();
				archive.append(jsonStream, { name: 'export.json' });
				jsonStream.write('[');
			}

			let mboxStream: PassThrough | null = null;
			if (format === 'mbox') {
				mboxStream = new PassThrough();
				archive.append(mboxStream, { name: 'export.mbox' });
			}

			const sources = await db
				.select({ id: ingestionSources.id, name: ingestionSources.name })
				.from(ingestionSources);
			const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

			const seenAttachments = new Set<string>();
			const batchSize = 200;
			let offset = 0;

			while (true) {
				const rows = (await db
					.select()
					.from(archivedEmails)
					.where(lte(archivedEmails.archivedAt, snapshotAt))
					.orderBy(asc(archivedEmails.archivedAt), asc(archivedEmails.id))
					.limit(batchSize)
					.offset(offset)) as ArchiveExportEmail[];

				if (rows.length === 0) {
					break;
				}

				const emailIds = rows.map((row) => row.id);
				const attachmentRows = await db
					.select({
						emailId: emailAttachments.emailId,
						id: attachments.id,
						filename: attachments.filename,
						mimeType: attachments.mimeType,
						sizeBytes: attachments.sizeBytes,
						storagePath: attachments.storagePath,
						contentHashSha256: attachments.contentHashSha256,
					})
					.from(emailAttachments)
					.innerJoin(attachments, eq(emailAttachments.attachmentId, attachments.id))
					.where(inArray(emailAttachments.emailId, emailIds));

				const attachmentsByEmail = new Map<string, ArchiveExportAttachment[]>();
				for (const row of attachmentRows) {
					const list = attachmentsByEmail.get(row.emailId) ?? [];
					list.push({
						id: row.id,
						filename: row.filename,
						mimeType: row.mimeType,
						sizeBytes: Number(row.sizeBytes),
						storagePath: row.storagePath,
						contentHashSha256: row.contentHashSha256,
					});
					attachmentsByEmail.set(row.emailId, list);
				}

				for (const email of rows) {
					emailCount += 1;
					const sourceName = sourceNameById.get(email.ingestionSourceId) ?? 'source';
					const sourceFolder = buildSourceFolderName(sourceName, email.ingestionSourceId);
					const mailboxPath = sanitizeMailboxPath(email.path);
					const emailFolder = mailboxPath ? `${sourceFolder}/${mailboxPath}` : sourceFolder;
					const emlPath = `eml/${emailFolder}/${email.id}.eml`;
					const attachmentEntries = attachmentsByEmail.get(email.id) ?? [];

					if (format === 'eml' || format === 'json') {
						const rawStream = (await this.storageService.get(
							email.storagePath
						)) as Readable;
						archive.append(rawStream, { name: emlPath });
					}

					if (format === 'mbox' && mboxStream) {
						mboxStream.write(
							`From ${email.senderEmail || 'unknown'} ${email.sentAt.toUTCString()}\n`
						);
						const rawStream = (await this.storageService.get(
							email.storagePath
						)) as Readable;
						await streamToStream(rawStream, mboxStream);
						mboxStream.write('\n\n');
					}

					const attachmentExports = attachmentEntries.map((attachment) => {
						const safeName = sanitizeFilename(attachment.filename, 'attachment');
						return {
							...attachment,
							exportPath: `attachments/${attachment.id}/${safeName}`,
						};
					});

					for (const attachment of attachmentExports) {
						if (!seenAttachments.has(attachment.id)) {
							seenAttachments.add(attachment.id);
							attachmentCount += 1;
							if (format === 'json') {
								const attachmentStream = (await this.storageService.get(
									attachment.storagePath
								)) as Readable;
								archive.append(attachmentStream, { name: attachment.exportPath });
							}
						}
					}

					const manifestEntry = {
						id: email.id,
						ingestionSourceId: email.ingestionSourceId,
						ingestionSourceName: sourceName,
						userEmail: email.userEmail,
						senderEmail: email.senderEmail,
						subject: email.subject,
						sentAt: email.sentAt.toISOString(),
						archivedAt: email.archivedAt.toISOString(),
						storageHashSha256: email.storageHashSha256,
						emlPath: format === 'mbox' ? null : emlPath,
						mboxPath: format === 'mbox' ? 'export.mbox' : null,
						attachments: attachmentExports.map((attachment) => ({
							id: attachment.id,
							filename: attachment.filename,
							mimeType: attachment.mimeType,
							sizeBytes: attachment.sizeBytes,
							contentHashSha256: attachment.contentHashSha256,
							exportPath: format === 'json' ? attachment.exportPath : null,
						})),
					};
					manifestStream.write(`${JSON.stringify(manifestEntry)}\n`);

					if (jsonStream) {
						if (wroteJsonItem) {
							jsonStream.write(',');
						}
						jsonStream.write(
							JSON.stringify({
								id: email.id,
								ingestionSourceId: email.ingestionSourceId,
								ingestionSourceName: sourceName,
								userEmail: email.userEmail,
								senderEmail: email.senderEmail,
								subject: email.subject,
								sentAt: email.sentAt.toISOString(),
								archivedAt: email.archivedAt.toISOString(),
								emlPath,
								storageHashSha256: email.storageHashSha256,
								attachments: attachmentExports.map((attachment) => ({
									id: attachment.id,
									filename: attachment.filename,
									mimeType: attachment.mimeType,
									sizeBytes: attachment.sizeBytes,
									contentHashSha256: attachment.contentHashSha256,
									exportPath: attachment.exportPath,
								})),
							})
						);
						wroteJsonItem = true;
					}
				}

				offset += rows.length;
			}

			if (mboxStream) {
				mboxStream.end();
			}
			if (jsonStream) {
				jsonStream.write(']');
				jsonStream.end();
			}
			manifestStream.end();

			const summary = {
				exportJobId: job.id,
				snapshotAt: snapshotAt.toISOString(),
				format,
				emailCount,
				attachmentCount,
			};
			archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });

			await archive.finalize();
			await uploadPromise;

			await db
				.update(archiveExportJobs)
				.set({
					status: 'completed',
					filePath: exportPath,
					completedAt: new Date(),
					emailCount,
					attachmentCount,
				})
				.where(eq(archiveExportJobs.id, archiveExportJobId));

			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'UPDATE',
				targetType: 'ArchiveExportJob',
				targetId: archiveExportJobId,
				actorIp: 'system',
				details: {
					status: 'completed',
					emailCount,
					attachmentCount,
				},
			});
		} catch (error) {
			logger.error({ error, archiveExportJobId }, 'Archive export job failed.');
			await db
				.update(archiveExportJobs)
				.set({
					status: 'failed',
					completedAt: new Date(),
					errorMessage: error instanceof Error ? error.message : String(error),
				})
				.where(eq(archiveExportJobs.id, archiveExportJobId));
			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'UPDATE',
				targetType: 'ArchiveExportJob',
				targetId: archiveExportJobId,
				actorIp: 'system',
				details: {
					status: 'failed',
					error: error instanceof Error ? error.message : String(error),
				},
			});
			throw error;
		}
	}
}
