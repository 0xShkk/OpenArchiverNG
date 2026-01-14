import { count, desc, eq, asc, and } from 'drizzle-orm';
import { db } from '../database';
import {
	archivedEmails,
	attachments,
	emailAttachments,
	ingestionSources,
} from '../database/schema';
import { FilterBuilder } from './FilterBuilder';
import { AuthorizationService } from './AuthorizationService';
import type {
	PaginatedArchivedEmails,
	ArchivedEmail,
	Recipient,
	ThreadEmail,
} from '@open-archiver/types';
import { StorageService } from './StorageService';
import { SearchService } from './SearchService';
import type { Readable } from 'stream';
import { AuditService } from './AuditService';
import { User } from '@open-archiver/types';
import { assertEmailNotOnLegalHold, checkDeletionEnabled } from '../helpers/deletionGuard';
import { streamToBuffer } from '../helpers/streamToBuffer';
import { logger } from '../config/logger';
import { SettingsService } from './SettingsService';

interface DbRecipients {
	to: { name: string; address: string }[];
	cc: { name: string; address: string }[];
	bcc: { name: string; address: string }[];
}

export class ArchivedEmailService {
	private static auditService = new AuditService();
	private static settingsService = new SettingsService();
	private static mapRecipients(dbRecipients: unknown): Recipient[] {
		const { to = [], cc = [], bcc = [] } = dbRecipients as DbRecipients;

		const allRecipients = [...to, ...cc, ...bcc];

		return allRecipients.map((r) => ({
			name: r.name,
			email: r.address,
		}));
	}

	public static async getArchivedEmails(
		ingestionSourceId: string,
		page: number,
		limit: number,
		userId: string
	): Promise<PaginatedArchivedEmails> {
		const offset = (page - 1) * limit;
		const { drizzleFilter } = await FilterBuilder.create(userId, 'archive', 'read');
		const where = and(eq(archivedEmails.ingestionSourceId, ingestionSourceId), drizzleFilter);

		const countQuery = db
			.select({
				count: count(archivedEmails.id),
			})
			.from(archivedEmails)
			.leftJoin(ingestionSources, eq(archivedEmails.ingestionSourceId, ingestionSources.id));

		if (where) {
			countQuery.where(where);
		}

		const [total] = await countQuery;

		const itemsQuery = db
			.select()
			.from(archivedEmails)
			.leftJoin(ingestionSources, eq(archivedEmails.ingestionSourceId, ingestionSources.id))
			.orderBy(desc(archivedEmails.sentAt))
			.limit(limit)
			.offset(offset);

		if (where) {
			itemsQuery.where(where);
		}

		const results = await itemsQuery;
		const items = results.map((r) => r.archived_emails);

		return {
			items: items.map((item) => ({
				...item,
				recipients: this.mapRecipients(item.recipients),
				tags: (item.tags as string[] | null) || null,
				path: item.path || null,
			})),
			total: total.count,
			page,
			limit,
		};
	}

	public static async getArchivedEmailById(
		emailId: string,
		userId: string,
		actor: User,
		actorIp: string
	): Promise<ArchivedEmail | null> {
		const email = await db.query.archivedEmails.findFirst({
			where: eq(archivedEmails.id, emailId),
			with: {
				ingestionSource: true,
			},
		});

		if (!email) {
			return null;
		}

		const authorizationService = new AuthorizationService();
		const canRead = await authorizationService.can(userId, 'read', 'archive', email);

		if (!canRead) {
			return null;
		}

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'READ',
			targetType: 'ArchivedEmail',
			targetId: emailId,
			actorIp,
			details: {},
		});

		let threadEmails: ThreadEmail[] = [];

		if (email.threadId) {
			threadEmails = await db.query.archivedEmails.findMany({
				where: and(
					eq(archivedEmails.threadId, email.threadId),
					eq(archivedEmails.ingestionSourceId, email.ingestionSourceId)
				),
				orderBy: [asc(archivedEmails.sentAt)],
				columns: {
					id: true,
					subject: true,
					sentAt: true,
					senderEmail: true,
				},
			});
		}

		const storage = new StorageService();
		let raw: Buffer | undefined;
		const settings = await this.settingsService.getSystemSettings();
		const maxPreviewBytes = settings.maxPreviewBytes;
		if (email.sizeBytes && email.sizeBytes > maxPreviewBytes) {
			logger.warn(
				{ emailId: email.id, sizeBytes: email.sizeBytes },
				'Skipping raw preview due to size limit.'
			);
		} else {
			try {
				const rawStream = await storage.get(email.storagePath);
				raw = await streamToBuffer(rawStream as Readable, maxPreviewBytes);
			} catch (error) {
				logger.warn({ emailId: email.id, error }, 'Failed to load raw email preview.');
			}
		}

		const mappedEmail = {
			...email,
			recipients: this.mapRecipients(email.recipients),
			raw,
			thread: threadEmails,
			tags: (email.tags as string[] | null) || null,
			path: email.path || null,
		};

		if (email.hasAttachments) {
			const emailAttachmentsResult = await db
				.select({
					id: attachments.id,
					filename: attachments.filename,
					mimeType: attachments.mimeType,
					sizeBytes: attachments.sizeBytes,
					storagePath: attachments.storagePath,
				})
				.from(emailAttachments)
				.innerJoin(attachments, eq(emailAttachments.attachmentId, attachments.id))
				.where(eq(emailAttachments.emailId, emailId));

			// const attachmentsWithRaw = await Promise.all(
			//     emailAttachmentsResult.map(async (attachment) => {
			//         const rawStream = await storage.get(attachment.storagePath);
			//         const raw = await streamToBuffer(rawStream as Readable);
			//         return { ...attachment, raw };
			//     })
			// );

			return {
				...mappedEmail,
				attachments: emailAttachmentsResult,
			};
		}

		return mappedEmail;
	}

	public static async deleteArchivedEmail(
		emailId: string,
		actor: Pick<User, 'id'>,
		actorIp: string,
		options?: { bypassDeletionGuard?: boolean; reason?: string; policyId?: string }
	): Promise<void> {
		if (!options?.bypassDeletionGuard) {
			await checkDeletionEnabled();
		}
		const [email] = await db
			.select()
			.from(archivedEmails)
			.where(eq(archivedEmails.id, emailId));

		if (!email) {
			throw new Error('Archived email not found');
		}
		assertEmailNotOnLegalHold(email.isOnLegalHold);

		const storage = new StorageService();

		// Load and handle attachments before deleting the email itself
		if (email.hasAttachments) {
			const attachmentsForEmail = await db
				.select({
					attachmentId: attachments.id,
					storagePath: attachments.storagePath,
				})
				.from(emailAttachments)
				.innerJoin(attachments, eq(emailAttachments.attachmentId, attachments.id))
				.where(eq(emailAttachments.emailId, emailId));

			try {
				for (const attachment of attachmentsForEmail) {
					// Delete the link between this email and the attachment record.
					await db
						.delete(emailAttachments)
						.where(
							and(
								eq(emailAttachments.emailId, emailId),
								eq(emailAttachments.attachmentId, attachment.attachmentId)
							)
						);

					// Check if any other emails are linked to this attachment record.
					const [recordRefCount] = await db
						.select({ count: count() })
						.from(emailAttachments)
						.where(eq(emailAttachments.attachmentId, attachment.attachmentId));

					// If no other emails are linked to this record, it's safe to delete it and the file.
					if (recordRefCount.count === 0) {
						await storage.delete(attachment.storagePath);
						await db
							.delete(attachments)
							.where(eq(attachments.id, attachment.attachmentId));
					}
				}
			} catch (error) {
				console.error('Failed to delete email attachments', error);
				throw new Error('Failed to delete email attachments');
			}
		}

		// Delete the email file from storage
		await storage.delete(email.storagePath);

		const searchService = new SearchService();
		await searchService.deleteDocuments('emails', [emailId]);

		await db.delete(archivedEmails).where(eq(archivedEmails.id, emailId));

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'DELETE',
			targetType: 'ArchivedEmail',
			targetId: emailId,
			actorIp,
			details: {
				reason: options?.reason ?? 'manual',
				policyId: options?.policyId ?? null,
			},
		});
	}
}
