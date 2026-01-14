import { and, asc, eq, gte, inArray, lte, not, sql } from 'drizzle-orm';
import { db } from '../database';
import { archivedEmails, retentionPolicies } from '../database/schema';
import { AuditService } from './AuditService';
import { ArchivedEmailService } from './ArchivedEmailService';

type RetentionPolicyConditions = {
	ingestionSourceId?: string;
	userEmail?: string;
	senderEmail?: string;
	subjectContains?: string;
	startDate?: string;
	endDate?: string;
};

const normalizeConditions = (
	conditions?: RetentionPolicyConditions | null
): RetentionPolicyConditions | null => {
	if (!conditions) {
		return null;
	}
	const normalized: RetentionPolicyConditions = {};
	if (conditions.ingestionSourceId?.trim()) {
		normalized.ingestionSourceId = conditions.ingestionSourceId.trim();
	}
	if (conditions.userEmail?.trim()) {
		normalized.userEmail = conditions.userEmail.trim().toLowerCase();
	}
	if (conditions.senderEmail?.trim()) {
		normalized.senderEmail = conditions.senderEmail.trim().toLowerCase();
	}
	if (conditions.subjectContains?.trim()) {
		normalized.subjectContains = conditions.subjectContains.trim();
	}
	if (conditions.startDate?.trim()) {
		normalized.startDate = conditions.startDate.trim();
	}
	if (conditions.endDate?.trim()) {
		normalized.endDate = conditions.endDate.trim();
	}
	return Object.keys(normalized).length > 0 ? normalized : null;
};

const isValidDateString = (value?: string | null): boolean => {
	if (!value) return false;
	return !Number.isNaN(Date.parse(value));
};

const toLower = (value?: string | null): string => (value || '').toLowerCase();

export class RetentionService {
	private auditService = new AuditService();

	private buildPolicyWhereClause(conditions: RetentionPolicyConditions | null, expiryDate: Date) {
		const clauses = [lte(archivedEmails.sentAt, expiryDate)];

		if (conditions?.ingestionSourceId) {
			clauses.push(eq(archivedEmails.ingestionSourceId, conditions.ingestionSourceId));
		}
		if (conditions?.userEmail) {
			clauses.push(sql`LOWER(${archivedEmails.userEmail}) = ${conditions.userEmail}`);
		}
		if (conditions?.senderEmail) {
			clauses.push(sql`LOWER(${archivedEmails.senderEmail}) = ${conditions.senderEmail}`);
		}
		if (conditions?.subjectContains) {
			clauses.push(
				sql`LOWER(${archivedEmails.subject}) LIKE ${`%${toLower(
					conditions.subjectContains
				)}%`}`
			);
		}
		if (conditions?.startDate && isValidDateString(conditions.startDate)) {
			clauses.push(gte(archivedEmails.sentAt, new Date(conditions.startDate)));
		}
		if (conditions?.endDate && isValidDateString(conditions.endDate)) {
			clauses.push(lte(archivedEmails.sentAt, new Date(conditions.endDate)));
		}

		return and(...clauses);
	}

	public async runRetentionEnforcement(): Promise<{
		processedPolicies: number;
		deleted: number;
		notified: number;
		skippedOnHold: number;
	}> {
		const policies = await db.query.retentionPolicies.findMany({
			where: eq(retentionPolicies.isEnabled, true),
			orderBy: [asc(retentionPolicies.priority)],
		});

		const now = new Date();
		let deleted = 0;
		let notified = 0;
		let skippedOnHold = 0;
		const processedIds = new Set<string>();

		for (const policy of policies) {
			const conditions = normalizeConditions(
				policy.conditions as RetentionPolicyConditions | null
			);
			const expiryDate = new Date(
				now.getTime() - policy.retentionPeriodDays * 24 * 60 * 60 * 1000
			);
			const baseWhere = this.buildPolicyWhereClause(conditions, expiryDate);

			const [heldCount] = await db
				.select({ count: sql<number>`count(*)` })
				.from(archivedEmails)
				.where(and(baseWhere, eq(archivedEmails.isOnLegalHold, true)));
			skippedOnHold += Number(heldCount?.count ?? 0);

			const processedArray = [...processedIds];
			const eligibilityClauses = [baseWhere, eq(archivedEmails.isOnLegalHold, false)];
			if (processedArray.length > 0) {
				eligibilityClauses.push(not(inArray(archivedEmails.id, processedArray)));
			}

			const eligibleRows = await db
				.select({ id: archivedEmails.id })
				.from(archivedEmails)
				.where(and(...eligibilityClauses));
			const eligibleIds = eligibleRows.map((row) => row.id);

			if (policy.actionOnExpiry === 'delete_permanently') {
				for (const emailId of eligibleIds) {
					await ArchivedEmailService.deleteArchivedEmail(
						emailId,
						{ id: 'system' },
						'system',
						{ bypassDeletionGuard: true, reason: 'retention', policyId: policy.id }
					);
				}
				deleted += eligibleIds.length;
			} else if (policy.actionOnExpiry === 'notify_admin') {
				notified += eligibleIds.length;
			}

			eligibleIds.forEach((id) => processedIds.add(id));

			await this.auditService.createAuditLog({
				actorIdentifier: 'system',
				actionType: 'DELETE',
				targetType: 'RetentionPolicy',
				targetId: policy.id,
				actorIp: 'system',
				details: {
					policyName: policy.name,
					action: policy.actionOnExpiry,
					expiryDate: expiryDate.toISOString(),
					deletedCount:
						policy.actionOnExpiry === 'delete_permanently' ? eligibleIds.length : 0,
					notifiedCount:
						policy.actionOnExpiry === 'notify_admin' ? eligibleIds.length : 0,
					skippedOnHold: Number(heldCount?.count ?? 0),
				},
			});
		}

		return {
			processedPolicies: policies.length,
			deleted,
			notified,
			skippedOnHold,
		};
	}
}
