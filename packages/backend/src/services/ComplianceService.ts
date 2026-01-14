import { SQL, and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
	ComplianceCase,
	ComplianceCaseSummary,
	AcknowledgeLegalHoldNoticeDto,
	CreateComplianceCaseDto,
	CreateCustodianDto,
	CreateLegalHoldDto,
	CreateLegalHoldNoticeDto,
	Custodian,
	LegalHoldEmailRecord,
	LegalHoldNotice,
	LegalHold,
	LegalHoldCriteria,
	PaginatedLegalHoldEmails,
	UpdateComplianceCaseDto,
	UpdateLegalHoldDto,
	User,
} from '@open-archiver/types';
import { db } from '../database';
import {
	archivedEmails,
	custodians,
	ediscoveryCases,
	legalHoldEmails,
	legalHoldNotices,
	legalHolds,
} from '../database/schema';
import { AuditService } from './AuditService';
import { IndexingService } from './IndexingService';
import { DatabaseService } from './DatabaseService';
import { SearchService } from './SearchService';
import { StorageService } from './StorageService';
import { logger } from '../config/logger';
import { SettingsService } from './SettingsService';

type DbLegalHold = typeof legalHolds.$inferSelect;
type DbCustodian = typeof custodians.$inferSelect;
type DbArchivedEmail = typeof archivedEmails.$inferSelect;
type DbComplianceCase = typeof ediscoveryCases.$inferSelect;
type DbLegalHoldNotice = typeof legalHoldNotices.$inferSelect;

const mapComplianceCase = (record: DbComplianceCase): ComplianceCase => ({
	...record,
	createdAt: record.createdAt.toISOString(),
	updatedAt: record.updatedAt.toISOString(),
});

const mapCustodian = (record: DbCustodian): Custodian => ({
	...record,
	createdAt: record.createdAt.toISOString(),
	updatedAt: record.updatedAt.toISOString(),
});

const mapLegalHold = (
	hold: DbLegalHold & {
		ediscoveryCase?: DbComplianceCase | null;
		custodian?: DbCustodian | null;
	}
): LegalHold => ({
	...hold,
	holdCriteria: (hold.holdCriteria as LegalHoldCriteria | null) ?? null,
	appliedAt: hold.appliedAt.toISOString(),
	removedAt: hold.removedAt ? hold.removedAt.toISOString() : null,
	ediscoveryCase: hold.ediscoveryCase ? mapComplianceCase(hold.ediscoveryCase) : undefined,
	custodian: hold.custodian ? mapCustodian(hold.custodian) : null,
});

const mapLegalHoldNotice = (
	notice: DbLegalHoldNotice & { custodian?: DbCustodian | null }
): LegalHoldNotice => ({
	...notice,
	sentAt: notice.sentAt.toISOString(),
	acknowledgedAt: notice.acknowledgedAt ? notice.acknowledgedAt.toISOString() : null,
	custodian: notice.custodian ? mapCustodian(notice.custodian) : null,
});

const normalizeCriteria = (criteria?: LegalHoldCriteria | null): LegalHoldCriteria | null => {
	if (!criteria) {
		return null;
	}
	const normalized: LegalHoldCriteria = {};
	if (criteria.userEmail?.trim()) normalized.userEmail = criteria.userEmail.trim().toLowerCase();
	if (criteria.ingestionSourceId?.trim())
		normalized.ingestionSourceId = criteria.ingestionSourceId.trim();
	if (criteria.senderEmail?.trim())
		normalized.senderEmail = criteria.senderEmail.trim().toLowerCase();
	if (criteria.subjectContains?.trim())
		normalized.subjectContains = criteria.subjectContains.trim();
	if (criteria.startDate?.trim()) normalized.startDate = criteria.startDate.trim();
	if (criteria.endDate?.trim()) normalized.endDate = criteria.endDate.trim();

	return Object.keys(normalized).length > 0 ? normalized : null;
};

const isValidDateString = (value?: string | null): boolean => {
	if (!value) return false;
	return !Number.isNaN(Date.parse(value));
};

const toLower = (value?: string | null): string => (value || '').toLowerCase();

export class ComplianceService {
	private auditService = new AuditService();
	private settingsService = new SettingsService();

	public async getCases(): Promise<ComplianceCase[]> {
		const cases = await db
			.select()
			.from(ediscoveryCases)
			.orderBy(desc(ediscoveryCases.createdAt));
		return cases.map(mapComplianceCase);
	}

	public async getCaseSummaries(): Promise<ComplianceCaseSummary[]> {
		const holdCounts = await db
			.select({
				caseId: legalHolds.caseId,
				totalHoldCount: sql<number>`count(*)`,
				activeHoldCount: sql<number>`count(*) filter (where ${legalHolds.removedAt} is null)`,
			})
			.from(legalHolds)
			.groupBy(legalHolds.caseId);
		const emailCounts = await db
			.select({
				caseId: legalHolds.caseId,
				totalEmailCount: sql<number>`count(*)`,
				activeEmailCount: sql<number>`count(*) filter (where ${legalHoldEmails.removedAt} is null)`,
			})
			.from(legalHoldEmails)
			.innerJoin(legalHolds, eq(legalHoldEmails.holdId, legalHolds.id))
			.groupBy(legalHolds.caseId);

		const holdCountMap = new Map(
			holdCounts.map((entry) => [
				entry.caseId,
				{
					totalHoldCount: Number(entry.totalHoldCount),
					activeHoldCount: Number(entry.activeHoldCount),
				},
			])
		);
		const emailCountMap = new Map(
			emailCounts.map((entry) => [
				entry.caseId,
				{
					totalEmailCount: Number(entry.totalEmailCount),
					activeEmailCount: Number(entry.activeEmailCount),
				},
			])
		);

		const cases = await db.select({ id: ediscoveryCases.id }).from(ediscoveryCases);
		return cases.map((caseRow) => ({
			caseId: caseRow.id,
			activeHoldCount: holdCountMap.get(caseRow.id)?.activeHoldCount ?? 0,
			totalHoldCount: holdCountMap.get(caseRow.id)?.totalHoldCount ?? 0,
			activeEmailCount: emailCountMap.get(caseRow.id)?.activeEmailCount ?? 0,
			totalEmailCount: emailCountMap.get(caseRow.id)?.totalEmailCount ?? 0,
		}));
	}

	public async createCase(
		dto: CreateComplianceCaseDto,
		actor: User,
		actorIp: string
	): Promise<ComplianceCase> {
		const [created] = await db
			.insert(ediscoveryCases)
			.values({
				name: dto.name.trim(),
				description: dto.description?.trim() || null,
				status: 'open',
				createdByIdentifier: actor.id,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'ComplianceCase',
			targetId: created.id,
			actorIp,
			details: {
				caseName: created.name,
			},
		});

		return mapComplianceCase(created);
	}

	public async updateCase(
		id: string,
		dto: UpdateComplianceCaseDto,
		actor: User,
		actorIp: string
	): Promise<ComplianceCase> {
		const [existing] = await db
			.select()
			.from(ediscoveryCases)
			.where(eq(ediscoveryCases.id, id));
		if (!existing) {
			throw new Error('Compliance case not found.');
		}

		const updates: Partial<typeof ediscoveryCases.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (dto.status) {
			updates.status = dto.status;
		}
		if (dto.description !== undefined) {
			updates.description = dto.description?.trim() || null;
		}

		const [updated] = await db
			.update(ediscoveryCases)
			.set(updates)
			.where(eq(ediscoveryCases.id, id))
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'ComplianceCase',
			targetId: id,
			actorIp,
			details: {
				changedFields: Object.keys(dto),
			},
		});

		return mapComplianceCase(updated);
	}

	public async getCustodians(): Promise<Custodian[]> {
		const records = await db.select().from(custodians).orderBy(desc(custodians.createdAt));
		return records.map(mapCustodian);
	}

	public async createCustodian(
		dto: CreateCustodianDto,
		actor: User,
		actorIp: string
	): Promise<Custodian> {
		const [created] = await db
			.insert(custodians)
			.values({
				email: dto.email.trim().toLowerCase(),
				displayName: dto.displayName?.trim() || null,
				sourceType: dto.sourceType,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'Custodian',
			targetId: created.id,
			actorIp,
			details: {
				custodianEmail: created.email,
			},
		});

		return mapCustodian(created);
	}

	public async getLegalHolds(): Promise<LegalHold[]> {
		const holds = await db.query.legalHolds.findMany({
			with: {
				ediscoveryCase: true,
				custodian: true,
			},
			orderBy: [desc(legalHolds.appliedAt)],
		});
		const counts = await db
			.select({
				holdId: legalHoldEmails.holdId,
				total: sql<number>`count(*)`,
				active: sql<number>`count(*) filter (where ${legalHoldEmails.removedAt} is null)`,
			})
			.from(legalHoldEmails)
			.groupBy(legalHoldEmails.holdId);
		const countsByHold = new Map(
			counts.map((entry) => [
				entry.holdId,
				{ total: Number(entry.total), active: Number(entry.active) },
			])
		);

		return holds.map((hold) => {
			const mapped = mapLegalHold(hold);
			const countEntry = countsByHold.get(hold.id);
			return {
				...mapped,
				emailCount: countEntry?.total ?? 0,
				activeEmailCount: countEntry?.active ?? 0,
			};
		});
	}

	public async getLegalHoldEmails(
		holdId: string,
		page = 1,
		limit = 25
	): Promise<PaginatedLegalHoldEmails> {
		const offset = (page - 1) * limit;
		const [totalResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(legalHoldEmails)
			.where(eq(legalHoldEmails.holdId, holdId));

		const rows = await db
			.select({
				holdId: legalHoldEmails.holdId,
				emailId: legalHoldEmails.emailId,
				matchedAt: legalHoldEmails.matchedAt,
				removedAt: legalHoldEmails.removedAt,
				emailIdRef: archivedEmails.id,
				ingestionSourceId: archivedEmails.ingestionSourceId,
				userEmail: archivedEmails.userEmail,
				senderEmail: archivedEmails.senderEmail,
				subject: archivedEmails.subject,
				sentAt: archivedEmails.sentAt,
				isOnLegalHold: archivedEmails.isOnLegalHold,
			})
			.from(legalHoldEmails)
			.innerJoin(archivedEmails, eq(legalHoldEmails.emailId, archivedEmails.id))
			.where(eq(legalHoldEmails.holdId, holdId))
			.orderBy(desc(legalHoldEmails.matchedAt))
			.limit(limit)
			.offset(offset);

		const items: LegalHoldEmailRecord[] = rows.map((row) => ({
			holdId: row.holdId,
			emailId: row.emailId,
			matchedAt: row.matchedAt.toISOString(),
			removedAt: row.removedAt ? row.removedAt.toISOString() : null,
			email: {
				id: row.emailIdRef,
				ingestionSourceId: row.ingestionSourceId,
				userEmail: row.userEmail,
				senderEmail: row.senderEmail,
				subject: row.subject,
				sentAt: row.sentAt.toISOString(),
				isOnLegalHold: row.isOnLegalHold,
			},
		}));

		return {
			items,
			total: Number(totalResult?.count ?? 0),
			page,
			limit,
		};
	}

	public async getLegalHoldNotices(holdId: string): Promise<LegalHoldNotice[]> {
		const notices = await db.query.legalHoldNotices.findMany({
			where: eq(legalHoldNotices.holdId, holdId),
			with: {
				custodian: true,
			},
			orderBy: [desc(legalHoldNotices.sentAt)],
		});
		return notices.map(mapLegalHoldNotice);
	}

	public async createLegalHoldNotice(
		holdId: string,
		dto: CreateLegalHoldNoticeDto,
		actor: User,
		actorIp: string
	): Promise<LegalHoldNotice> {
		const hold = await db.query.legalHolds.findFirst({
			where: eq(legalHolds.id, holdId),
		});
		if (!hold) {
			throw new Error('Legal hold not found.');
		}

		const custodianId = dto.custodianId ?? hold.custodianId;
		if (!custodianId) {
			throw new Error('Custodian is required to send a legal hold notice.');
		}

		const [custodianRecord] = await db
			.select()
			.from(custodians)
			.where(eq(custodians.id, custodianId));
		if (!custodianRecord) {
			throw new Error('Custodian not found.');
		}

		const [created] = await db
			.insert(legalHoldNotices)
			.values({
				holdId,
				custodianId: custodianRecord.id,
				channel: dto.channel?.trim() || 'manual',
				notes: dto.notes?.trim() || null,
				sentByIdentifier: actor.id,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'LegalHoldNotice',
			targetId: created.id,
			actorIp,
			details: {
				holdId,
				custodianId: custodianRecord.id,
				channel: created.channel,
			},
		});

		return mapLegalHoldNotice({ ...created, custodian: custodianRecord });
	}

	public async acknowledgeLegalHoldNotice(
		holdId: string,
		noticeId: string,
		dto: AcknowledgeLegalHoldNoticeDto,
		actor: User,
		actorIp: string
	): Promise<LegalHoldNotice> {
		const notice = await db.query.legalHoldNotices.findFirst({
			where: and(eq(legalHoldNotices.id, noticeId), eq(legalHoldNotices.holdId, holdId)),
			with: {
				custodian: true,
			},
		});
		if (!notice) {
			throw new Error('Legal hold notice not found.');
		}

		const [updated] = await db
			.update(legalHoldNotices)
			.set({
				acknowledgedAt: new Date(),
				acknowledgedByIdentifier: actor.id,
				notes: dto.notes !== undefined ? dto.notes?.trim() || null : notice.notes,
			})
			.where(eq(legalHoldNotices.id, noticeId))
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHoldNotice',
			targetId: noticeId,
			actorIp,
			details: {
				action: 'acknowledge',
				holdId,
			},
		});

		return mapLegalHoldNotice({ ...updated, custodian: notice.custodian });
	}

	public async createLegalHold(
		dto: CreateLegalHoldDto,
		actor: User,
		actorIp: string
	): Promise<LegalHold> {
		const normalizedCriteria = normalizeCriteria(dto.holdCriteria);
		if (!dto.custodianId && !normalizedCriteria) {
			throw new Error('Legal hold requires a custodian or at least one criteria field.');
		}
		if (normalizedCriteria?.startDate && !isValidDateString(normalizedCriteria.startDate)) {
			throw new Error('Invalid startDate format.');
		}
		if (normalizedCriteria?.endDate && !isValidDateString(normalizedCriteria.endDate)) {
			throw new Error('Invalid endDate format.');
		}
		if (
			normalizedCriteria?.startDate &&
			normalizedCriteria?.endDate &&
			new Date(normalizedCriteria.startDate) > new Date(normalizedCriteria.endDate)
		) {
			throw new Error('startDate cannot be later than endDate.');
		}

		const [caseRecord] = await db
			.select()
			.from(ediscoveryCases)
			.where(eq(ediscoveryCases.id, dto.caseId));
		if (!caseRecord) {
			throw new Error('Compliance case not found.');
		}

		let custodianRecord: DbCustodian | undefined;
		if (dto.custodianId) {
			[custodianRecord] = await db
				.select()
				.from(custodians)
				.where(eq(custodians.id, dto.custodianId));
			if (!custodianRecord) {
				throw new Error('Custodian not found.');
			}
		}

		const [created] = await db
			.insert(legalHolds)
			.values({
				caseId: dto.caseId,
				custodianId: dto.custodianId || null,
				holdCriteria: normalizedCriteria,
				reason: dto.reason?.trim() || null,
				appliedByIdentifier: actor.id,
			})
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'CREATE',
			targetType: 'LegalHold',
			targetId: created.id,
			actorIp,
			details: {
				caseId: created.caseId,
				custodianId: created.custodianId,
			},
		});

		const matchedIds = await this.applyHoldToExistingEmails(created, actor.id);
		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHold',
			targetId: created.id,
			actorIp,
			details: {
				action: 'membership_applied',
				matchedEmailCount: matchedIds.length,
			},
		});

		const hydrated = await db.query.legalHolds.findFirst({
			where: eq(legalHolds.id, created.id),
			with: {
				ediscoveryCase: true,
				custodian: true,
			},
		});
		const counts = await this.getHoldCounts(created.id);
		const mapped = hydrated
			? mapLegalHold(hydrated)
			: mapLegalHold({
					...created,
					ediscoveryCase: caseRecord,
					custodian: custodianRecord ?? null,
				});

		return {
			...mapped,
			emailCount: counts.total,
			activeEmailCount: counts.active,
		};
	}

	public async updateLegalHold(
		id: string,
		dto: UpdateLegalHoldDto,
		actor: User,
		actorIp: string
	): Promise<LegalHold> {
		const hold = await db.query.legalHolds.findFirst({
			where: eq(legalHolds.id, id),
			with: {
				ediscoveryCase: true,
				custodian: true,
			},
		});
		if (!hold) {
			throw new Error('Legal hold not found.');
		}
		if (hold.removedAt) {
			throw new Error('Cannot update a released legal hold.');
		}

		let nextCustodianId: string | null | undefined = hold.custodianId;
		if (dto.custodianId !== undefined) {
			if (dto.custodianId) {
				const [custodianRecord] = await db
					.select()
					.from(custodians)
					.where(eq(custodians.id, dto.custodianId));
				if (!custodianRecord) {
					throw new Error('Custodian not found.');
				}
				nextCustodianId = custodianRecord.id;
			} else {
				nextCustodianId = null;
			}
		}

		let nextCriteria = hold.holdCriteria as LegalHoldCriteria | null;
		if (dto.holdCriteria !== undefined) {
			nextCriteria = normalizeCriteria(dto.holdCriteria);
		}

		if (!nextCustodianId && !nextCriteria) {
			throw new Error('Legal hold requires a custodian or at least one criteria field.');
		}
		if (nextCriteria?.startDate && !isValidDateString(nextCriteria.startDate)) {
			throw new Error('Invalid startDate format.');
		}
		if (nextCriteria?.endDate && !isValidDateString(nextCriteria.endDate)) {
			throw new Error('Invalid endDate format.');
		}
		if (
			nextCriteria?.startDate &&
			nextCriteria?.endDate &&
			new Date(nextCriteria.startDate) > new Date(nextCriteria.endDate)
		) {
			throw new Error('startDate cannot be later than endDate.');
		}

		const [updated] = await db
			.update(legalHolds)
			.set({
				custodianId: nextCustodianId,
				holdCriteria: nextCriteria,
				reason: dto.reason !== undefined ? dto.reason?.trim() || null : hold.reason,
			})
			.where(eq(legalHolds.id, id))
			.returning();

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHold',
			targetId: id,
			actorIp,
			details: {
				changedFields: Object.keys(dto),
			},
		});

		const custodianEmail = await this.getCustodianEmail(nextCustodianId);
		const matchingEmailIds = await this.getMatchingEmailIdsForHold(updated, custodianEmail);
		const existingMembership = await db
			.select({
				emailId: legalHoldEmails.emailId,
				removedAt: legalHoldEmails.removedAt,
			})
			.from(legalHoldEmails)
			.where(eq(legalHoldEmails.holdId, id));
		const existingActiveIds = existingMembership
			.filter((row) => !row.removedAt)
			.map((row) => row.emailId);
		const existingActiveSet = new Set(existingActiveIds);

		await this.upsertHoldMembership(id, matchingEmailIds, actor.id);
		const matchingSet = new Set(matchingEmailIds);
		const removedIds = existingActiveIds.filter((emailId) => !matchingSet.has(emailId));
		await this.markHoldMembershipRemoved(id, removedIds);

		const addedIds = matchingEmailIds.filter((emailId) => !existingActiveSet.has(emailId));
		const affectedIds = Array.from(new Set([...existingActiveIds, ...matchingEmailIds]));
		await this.recalculateHoldFlagsForEmails(affectedIds);

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHold',
			targetId: id,
			actorIp,
			details: {
				action: 'membership_recalculated',
				matchedEmailCount: matchingEmailIds.length,
				addedEmailCount: addedIds.length,
				removedEmailCount: removedIds.length,
			},
		});

		const hydrated = await db.query.legalHolds.findFirst({
			where: eq(legalHolds.id, id),
			with: {
				ediscoveryCase: true,
				custodian: true,
			},
		});
		const counts = await this.getHoldCounts(id);
		const mapped = hydrated ? mapLegalHold(hydrated) : mapLegalHold(updated as DbLegalHold);

		return {
			...mapped,
			emailCount: counts.total,
			activeEmailCount: counts.active,
		};
	}

	public async releaseLegalHold(id: string, actor: User, actorIp: string): Promise<void> {
		const hold = await db.query.legalHolds.findFirst({
			where: eq(legalHolds.id, id),
			with: {
				custodian: true,
			},
		});

		if (!hold) {
			throw new Error('Legal hold not found.');
		}

		if (hold.removedAt) {
			return;
		}

		await db.update(legalHolds).set({ removedAt: new Date() }).where(eq(legalHolds.id, id));

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHold',
			targetId: id,
			actorIp,
			details: {
				action: 'release',
			},
		});

		const affectedRows = await db
			.select({
				emailId: legalHoldEmails.emailId,
				removedAt: legalHoldEmails.removedAt,
			})
			.from(legalHoldEmails)
			.where(eq(legalHoldEmails.holdId, hold.id));
		const affectedIds = affectedRows.map((row) => row.emailId);
		const activeIds = affectedRows.filter((row) => !row.removedAt).map((row) => row.emailId);

		await db
			.update(legalHoldEmails)
			.set({ removedAt: new Date() })
			.where(eq(legalHoldEmails.holdId, hold.id));

		await this.recalculateHoldFlagsForEmails(affectedIds);

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'UPDATE',
			targetType: 'LegalHold',
			targetId: id,
			actorIp,
			details: {
				action: 'membership_released',
				removedEmailCount: activeIds.length,
			},
		});
	}

	public async applyLegalHoldsToEmail(
		email: DbArchivedEmail,
		actorIdentifier = 'system'
	): Promise<void> {
		if (email.isOnLegalHold) {
			return;
		}
		const activeHolds = await db.query.legalHolds.findMany({
			where: isNull(legalHolds.removedAt),
			with: {
				custodian: true,
			},
		});

		const matchingHolds = activeHolds.filter((hold) => this.holdMatchesEmail(hold, email));
		if (matchingHolds.length === 0) {
			return;
		}

		const holdIds = matchingHolds.map((hold) => hold.id);
		await this.upsertHoldMembershipForEmail(holdIds, email.id, actorIdentifier);
		await db
			.update(archivedEmails)
			.set({ isOnLegalHold: true })
			.where(eq(archivedEmails.id, email.id));

		await this.auditService.createAuditLog({
			actorIdentifier,
			actionType: 'UPDATE',
			targetType: 'ArchivedEmail',
			targetId: email.id,
			actorIp: 'system',
			details: {
				action: 'legal_hold_applied',
				holdIds,
			},
		});
	}

	private async applyHoldToExistingEmails(
		hold: DbLegalHold,
		actorIdentifier?: string
	): Promise<string[]> {
		const custodianEmail = await this.getCustodianEmail(hold.custodianId);
		const matchingIds = await this.getMatchingEmailIdsForHold(hold, custodianEmail);
		if (matchingIds.length === 0) {
			return [];
		}
		await this.upsertHoldMembership(hold.id, matchingIds, actorIdentifier);
		await db
			.update(archivedEmails)
			.set({ isOnLegalHold: true })
			.where(inArray(archivedEmails.id, matchingIds));
		await this.updateSearchIndexForEmails(matchingIds);
		return matchingIds;
	}

	private async getMatchingEmailIdsForHold(
		hold: DbLegalHold,
		custodianEmail: string | null
	): Promise<string[]> {
		const whereClause = this.buildHoldWhereClause(hold, custodianEmail);
		if (!whereClause) {
			return [];
		}
		const matches = await db
			.select({ id: archivedEmails.id })
			.from(archivedEmails)
			.where(whereClause);
		return matches.map((row) => row.id);
	}

	private async upsertHoldMembership(
		holdId: string,
		emailIds: string[],
		actorIdentifier?: string
	): Promise<void> {
		if (emailIds.length === 0) {
			return;
		}
		const now = new Date();
		await db
			.insert(legalHoldEmails)
			.values(
				emailIds.map((emailId) => ({
					holdId,
					emailId,
					matchedAt: now,
					matchedByIdentifier: actorIdentifier || null,
				}))
			)
			.onConflictDoNothing();

		await db
			.update(legalHoldEmails)
			.set({ removedAt: null, matchedAt: now, matchedByIdentifier: actorIdentifier || null })
			.where(
				and(eq(legalHoldEmails.holdId, holdId), inArray(legalHoldEmails.emailId, emailIds))
			);
	}

	private async upsertHoldMembershipForEmail(
		holdIds: string[],
		emailId: string,
		actorIdentifier?: string
	): Promise<void> {
		if (holdIds.length === 0) {
			return;
		}
		const now = new Date();
		await db
			.insert(legalHoldEmails)
			.values(
				holdIds.map((holdId) => ({
					holdId,
					emailId,
					matchedAt: now,
					matchedByIdentifier: actorIdentifier || null,
				}))
			)
			.onConflictDoNothing();

		await db
			.update(legalHoldEmails)
			.set({ removedAt: null, matchedAt: now, matchedByIdentifier: actorIdentifier || null })
			.where(
				and(inArray(legalHoldEmails.holdId, holdIds), eq(legalHoldEmails.emailId, emailId))
			);
	}

	private async markHoldMembershipRemoved(holdId: string, emailIds: string[]): Promise<void> {
		if (emailIds.length === 0) {
			return;
		}
		await db
			.update(legalHoldEmails)
			.set({ removedAt: new Date() })
			.where(
				and(
					eq(legalHoldEmails.holdId, holdId),
					inArray(legalHoldEmails.emailId, emailIds),
					isNull(legalHoldEmails.removedAt)
				)
			);
	}

	private async recalculateHoldFlagsForEmails(emailIds: string[]): Promise<void> {
		if (emailIds.length === 0) {
			return;
		}
		const activeRows = await db
			.select({ emailId: legalHoldEmails.emailId })
			.from(legalHoldEmails)
			.where(
				and(inArray(legalHoldEmails.emailId, emailIds), isNull(legalHoldEmails.removedAt))
			);
		const activeIds = new Set(activeRows.map((row) => row.emailId));

		const activeList = [...activeIds];
		if (activeList.length > 0) {
			await db
				.update(archivedEmails)
				.set({ isOnLegalHold: true })
				.where(inArray(archivedEmails.id, activeList));
		}

		const inactiveIds = emailIds.filter((emailId) => !activeIds.has(emailId));
		if (inactiveIds.length > 0) {
			await db
				.update(archivedEmails)
				.set({ isOnLegalHold: false })
				.where(inArray(archivedEmails.id, inactiveIds));
		}
		await this.updateSearchIndexForEmails(emailIds);
	}

	private async updateSearchIndexForEmails(emailIds: string[]): Promise<void> {
		if (emailIds.length === 0) {
			return;
		}
		try {
			const indexingService = new IndexingService(
				new DatabaseService(),
				new SearchService(),
				new StorageService()
			);
			await indexingService.reindexEmailsByIds(emailIds);
		} catch (error) {
			logger.warn(
				{ error, count: emailIds.length },
				'Failed to update search index after legal hold changes.'
			);
		}
	}

	private async getHoldCounts(holdId: string): Promise<{ total: number; active: number }> {
		const [counts] = await db
			.select({
				total: sql<number>`count(*)`,
				active: sql<number>`count(*) filter (where ${legalHoldEmails.removedAt} is null)`,
			})
			.from(legalHoldEmails)
			.where(eq(legalHoldEmails.holdId, holdId));

		return {
			total: Number(counts?.total ?? 0),
			active: Number(counts?.active ?? 0),
		};
	}

	public async sendLegalHoldNoticeReminders(): Promise<{ remindersSent: number }> {
		const settings = await this.settingsService.getSystemSettings();
		const reminderDays = settings.legalHoldNoticeReminderDays;
		if (!reminderDays || reminderDays <= 0) {
			return { remindersSent: 0 };
		}
		const threshold = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);

		const rows = await db
			.select({
				id: legalHoldNotices.id,
				holdId: legalHoldNotices.holdId,
				custodianId: legalHoldNotices.custodianId,
				sentAt: legalHoldNotices.sentAt,
				acknowledgedAt: legalHoldNotices.acknowledgedAt,
			})
			.from(legalHoldNotices)
			.innerJoin(legalHolds, eq(legalHoldNotices.holdId, legalHolds.id))
			.where(isNull(legalHolds.removedAt))
			.orderBy(desc(legalHoldNotices.sentAt));

		const latestByPair = new Map<
			string,
			{
				holdId: string;
				custodianId: string;
				sentAt: Date;
				acknowledgedAt: Date | null;
			}
		>();
		for (const row of rows) {
			const key = `${row.holdId}:${row.custodianId}`;
			if (!latestByPair.has(key)) {
				latestByPair.set(key, row);
			}
		}

		let remindersSent = 0;
		for (const notice of latestByPair.values()) {
			if (notice.acknowledgedAt) {
				continue;
			}
			if (notice.sentAt > threshold) {
				continue;
			}

			const [created] = await db
				.insert(legalHoldNotices)
				.values({
					holdId: notice.holdId,
					custodianId: notice.custodianId,
					channel: 'reminder',
					sentByIdentifier: 'system',
					notes: 'Automated reminder: legal hold notice pending acknowledgement.',
				})
				.returning();

			remindersSent += 1;

			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'CREATE',
				targetType: 'LegalHoldNotice',
				targetId: created.id,
				actorIp: 'system',
				details: {
					holdId: created.holdId,
					custodianId: created.custodianId,
					channel: created.channel,
					action: 'reminder',
				},
			});
		}

		return { remindersSent };
	}

	private async getCustodianEmail(custodianId?: string | null): Promise<string | null> {
		if (!custodianId) {
			return null;
		}
		const [custodianRecord] = await db
			.select({ email: custodians.email })
			.from(custodians)
			.where(eq(custodians.id, custodianId));
		return custodianRecord?.email || null;
	}

	private buildHoldWhereClause(
		hold: DbLegalHold,
		custodianEmail: string | null
	): SQL | undefined {
		const criteria = normalizeCriteria(hold.holdCriteria as LegalHoldCriteria | null);
		const conditions = [];

		if (custodianEmail) {
			conditions.push(
				sql`LOWER(${archivedEmails.userEmail}) = ${custodianEmail.toLowerCase()}`
			);
		}

		if (criteria?.userEmail) {
			conditions.push(
				sql`LOWER(${archivedEmails.userEmail}) = ${criteria.userEmail.toLowerCase()}`
			);
		}

		if (criteria?.ingestionSourceId) {
			conditions.push(eq(archivedEmails.ingestionSourceId, criteria.ingestionSourceId));
		}

		if (criteria?.senderEmail) {
			conditions.push(
				sql`LOWER(${archivedEmails.senderEmail}) = ${criteria.senderEmail.toLowerCase()}`
			);
		}

		if (criteria?.subjectContains) {
			conditions.push(
				sql`LOWER(${archivedEmails.subject}) LIKE ${`%${toLower(
					criteria.subjectContains
				)}%`}`
			);
		}

		if (criteria?.startDate && isValidDateString(criteria.startDate)) {
			conditions.push(gte(archivedEmails.sentAt, new Date(criteria.startDate)));
		}

		if (criteria?.endDate && isValidDateString(criteria.endDate)) {
			conditions.push(lte(archivedEmails.sentAt, new Date(criteria.endDate)));
		}

		if (conditions.length === 0) {
			return undefined;
		}

		return and(...conditions);
	}

	private holdMatchesEmail(
		hold: DbLegalHold & { custodian?: DbCustodian | null },
		email: DbArchivedEmail
	): boolean {
		const criteria = normalizeCriteria(hold.holdCriteria as LegalHoldCriteria | null);

		if (hold.custodian?.email && toLower(email.userEmail) !== toLower(hold.custodian.email)) {
			return false;
		}

		if (criteria?.userEmail && toLower(email.userEmail) !== toLower(criteria.userEmail)) {
			return false;
		}

		if (criteria?.ingestionSourceId && email.ingestionSourceId !== criteria.ingestionSourceId) {
			return false;
		}

		if (criteria?.senderEmail && toLower(email.senderEmail) !== toLower(criteria.senderEmail)) {
			return false;
		}

		if (criteria?.subjectContains) {
			const subject = toLower(email.subject);
			if (!subject.includes(toLower(criteria.subjectContains))) {
				return false;
			}
		}

		if (criteria?.startDate && isValidDateString(criteria.startDate)) {
			if (new Date(email.sentAt) < new Date(criteria.startDate)) {
				return false;
			}
		}

		if (criteria?.endDate && isValidDateString(criteria.endDate)) {
			if (new Date(email.sentAt) > new Date(criteria.endDate)) {
				return false;
			}
		}

		return true;
	}
}
