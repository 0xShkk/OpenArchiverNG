import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';
import { db } from '../database';
import {
	archivedEmails,
	attachments,
	emailAttachments,
	exportJobs,
	legalHoldEmails,
	legalHolds,
} from '../database/schema';
import { StorageService } from './StorageService';
import { AuditService } from './AuditService';
import { complianceQueue } from '../jobs/queues';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
	CreateExportJobDto,
	ExportJob,
	PaginatedExportJobs,
	User,
} from '@open-archiver/types';
import { config } from '../config';
import { logger } from '../config/logger';

type ExportFormat = 'eml' | 'mbox' | 'json';
type ExportQuery = {
	holdId?: string;
	caseId?: string;
	emailIds?: string[];
};

type ExportEmail = {
	id: string;
	ingestionSourceId: string;
	userEmail: string;
	senderEmail: string;
	subject: string | null;
	sentAt: Date;
	storagePath: string;
	storageHashSha256: string;
	attachments: {
		id: string;
		filename: string;
		mimeType: string | null;
		sizeBytes: number;
		storagePath: string;
		contentHashSha256: string;
	}[];
};

const mapExportJob = (job: typeof exportJobs.$inferSelect): ExportJob => ({
	...job,
	query: (job.query as Record<string, unknown>) || {},
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

export class ExportService {
	private auditService = new AuditService();
	private storageService = new StorageService();

	public async createExportJob(
		dto: CreateExportJobDto,
		actor: User,
		actorIp: string
	): Promise<ExportJob> {
		const format = dto.format as ExportFormat;
		if (!['eml', 'mbox', 'json'].includes(format)) {
			throw new Error('Unsupported export format.');
		}

		const [created] = await db
			.insert(exportJobs)
			.values({
				caseId: dto.caseId ?? null,
				format,
				status: 'pending',
				query: dto.query,
				createdByIdentifier: actor.id,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'ExportJob',
			targetId: created.id,
			actorIp,
			details: {
				format,
				caseId: created.caseId,
			},
		});

		await complianceQueue.add('export-job', { exportJobId: created.id });

		return mapExportJob(created);
	}

	public async getExportJobs(
		page = 1,
		limit = 20,
		caseId?: string
	): Promise<PaginatedExportJobs> {
		const offset = (page - 1) * limit;
		const whereClause = caseId ? eq(exportJobs.caseId, caseId) : undefined;
		const [totalResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(exportJobs)
			.where(whereClause);

		const rows = await db
			.select()
			.from(exportJobs)
			.where(whereClause)
			.orderBy(desc(exportJobs.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			items: rows.map(mapExportJob),
			total: Number(totalResult?.count ?? 0),
			page,
			limit,
		};
	}

	public async getExportJobById(id: string): Promise<ExportJob | null> {
		const job = await db.query.exportJobs.findFirst({
			where: eq(exportJobs.id, id),
		});
		return job ? mapExportJob(job) : null;
	}

	public async runExportJob(exportJobId: string): Promise<void> {
		const job = await db.query.exportJobs.findFirst({
			where: eq(exportJobs.id, exportJobId),
		});
		if (!job) {
			throw new Error('Export job not found.');
		}

		await db
			.update(exportJobs)
			.set({ status: 'running' })
			.where(eq(exportJobs.id, exportJobId));

		try {
			const exportQuery = (job.query || {}) as ExportQuery;
			const emails = await this.resolveEmailsForExport(exportQuery, job.caseId ?? undefined);
			const exportPath = `${config.storage.openArchiverFolderName}/exports/${job.id}/export.zip`;

			const archive = archiver('zip', { zlib: { level: 9 } });
			const outputStream = new PassThrough();
			const uploadPromise = this.storageService.put(exportPath, outputStream);

			archive.on('warning', (warning) => {
				logger.warn({ warning, exportJobId }, 'Export archive warning.');
			});
			archive.on('error', (error) => {
				throw error;
			});

			archive.pipe(outputStream);

			const manifest = {
				exportJobId: job.id,
				generatedAt: new Date().toISOString(),
				format: job.format,
				caseId: job.caseId,
				query: exportQuery,
				emailCount: emails.length,
				emails: emails.map((email) => ({
					id: email.id,
					userEmail: email.userEmail,
					senderEmail: email.senderEmail,
					subject: email.subject,
					sentAt: email.sentAt.toISOString(),
					storageHashSha256: email.storageHashSha256,
					attachments: email.attachments.map((attachment) => ({
						id: attachment.id,
						filename: attachment.filename,
						mimeType: attachment.mimeType,
						sizeBytes: attachment.sizeBytes,
						contentHashSha256: attachment.contentHashSha256,
					})),
				})),
			};

			archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
			archive.append(
				JSON.stringify(
					{
						caseId: job.caseId,
						createdBy: job.createdByIdentifier,
						createdAt: job.createdAt.toISOString(),
					},
					null,
					2
				),
				{ name: 'metadata.json' }
			);

			if (job.format === 'json') {
				const jsonStream = new PassThrough();
				archive.append(jsonStream, { name: 'export.json' });
				jsonStream.write('[');
				for (let i = 0; i < emails.length; i += 1) {
					const email = emails[i];
					const payload = {
						id: email.id,
						userEmail: email.userEmail,
						senderEmail: email.senderEmail,
						subject: email.subject,
						sentAt: email.sentAt.toISOString(),
						storagePath: email.storagePath,
						storageHashSha256: email.storageHashSha256,
						attachments: email.attachments.map((attachment) => ({
							id: attachment.id,
							filename: attachment.filename,
							mimeType: attachment.mimeType,
							sizeBytes: attachment.sizeBytes,
							storagePath: attachment.storagePath,
							contentHashSha256: attachment.contentHashSha256,
						})),
					};
					jsonStream.write(JSON.stringify(payload));
					if (i < emails.length - 1) {
						jsonStream.write(',');
					}
				}
				jsonStream.write(']');
				jsonStream.end();
			}

			if (job.format === 'eml') {
				for (const email of emails) {
					const rawStream = (await this.storageService.get(
						email.storagePath
					)) as Readable;
					archive.append(rawStream, { name: `eml/${email.id}.eml` });
				}
			}

			if (job.format === 'mbox') {
				const mboxStream = new PassThrough();
				archive.append(mboxStream, { name: 'export.mbox' });
				for (const email of emails) {
					mboxStream.write(
						`From ${email.senderEmail || 'unknown'} ${email.sentAt.toUTCString()}\n`
					);
					const rawStream = (await this.storageService.get(
						email.storagePath
					)) as Readable;
					await streamToStream(rawStream, mboxStream);
					mboxStream.write('\n\n');
				}
				mboxStream.end();
			}

			await archive.finalize();
			await uploadPromise;

			await db
				.update(exportJobs)
				.set({
					status: 'completed',
					filePath: exportPath,
					completedAt: new Date(),
				})
				.where(eq(exportJobs.id, exportJobId));

			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'UPDATE',
				targetType: 'ExportJob',
				targetId: exportJobId,
				actorIp: 'system',
				details: {
					status: 'completed',
					emailCount: emails.length,
				},
			});
		} catch (error) {
			logger.error({ error, exportJobId }, 'Export job failed.');
			await db
				.update(exportJobs)
				.set({ status: 'failed', completedAt: new Date() })
				.where(eq(exportJobs.id, exportJobId));
			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'UPDATE',
				targetType: 'ExportJob',
				targetId: exportJobId,
				actorIp: 'system',
				details: {
					status: 'failed',
					error: error instanceof Error ? error.message : String(error),
				},
			});
			throw error;
		}
	}

	private async resolveEmailsForExport(
		query: ExportQuery,
		caseId?: string
	): Promise<ExportEmail[]> {
		let emailIds: string[] = [];
		if (query.holdId) {
			const rows = await db
				.select({ emailId: legalHoldEmails.emailId })
				.from(legalHoldEmails)
				.where(
					and(eq(legalHoldEmails.holdId, query.holdId), isNull(legalHoldEmails.removedAt))
				);
			emailIds = rows.map((row) => row.emailId);
		} else if (query.caseId || caseId) {
			const caseTarget = query.caseId ?? caseId;
			if (!caseTarget) {
				return [];
			}
			const holds = await db
				.select({ id: legalHolds.id })
				.from(legalHolds)
				.where(eq(legalHolds.caseId, caseTarget));
			const holdIds = holds.map((row) => row.id);
			if (holdIds.length === 0) {
				return [];
			}
			const rows = await db
				.select({ emailId: legalHoldEmails.emailId })
				.from(legalHoldEmails)
				.where(
					and(inArray(legalHoldEmails.holdId, holdIds), isNull(legalHoldEmails.removedAt))
				);
			emailIds = rows.map((row) => row.emailId);
		} else if (query.emailIds && query.emailIds.length > 0) {
			emailIds = query.emailIds;
		}

		const uniqueIds = Array.from(new Set(emailIds));
		if (uniqueIds.length === 0) {
			return [];
		}

		const emails = await db
			.select()
			.from(archivedEmails)
			.where(inArray(archivedEmails.id, uniqueIds));
		const attachmentsRows = await db
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
			.where(inArray(emailAttachments.emailId, uniqueIds));

		const attachmentsByEmail = new Map<string, ExportEmail['attachments']>();
		for (const row of attachmentsRows) {
			const list = attachmentsByEmail.get(row.emailId) ?? [];
			list.push({
				id: row.id,
				filename: row.filename,
				mimeType: row.mimeType,
				sizeBytes: row.sizeBytes,
				storagePath: row.storagePath,
				contentHashSha256: row.contentHashSha256,
			});
			attachmentsByEmail.set(row.emailId, list);
		}

		return emails.map((email) => ({
			id: email.id,
			ingestionSourceId: email.ingestionSourceId,
			userEmail: email.userEmail,
			senderEmail: email.senderEmail,
			subject: email.subject,
			sentAt: email.sentAt,
			storagePath: email.storagePath,
			storageHashSha256: email.storageHashSha256,
			attachments: attachmentsByEmail.get(email.id) ?? [],
		}));
	}
}
