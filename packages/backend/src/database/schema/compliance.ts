import { relations } from 'drizzle-orm';
import {
	boolean,
	bigint,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
	index,
} from 'drizzle-orm/pg-core';
import { custodians } from './custodians';
import { archivedEmails } from './archived-emails';
import { auditLogs } from './audit-logs';

// --- Enums ---

export const retentionActionEnum = pgEnum('retention_action', [
	'delete_permanently',
	'notify_admin',
]);

// --- Tables ---

export const retentionPolicies = pgTable('retention_policies', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	description: text('description'),
	priority: integer('priority').notNull(),
	retentionPeriodDays: integer('retention_period_days').notNull(),
	actionOnExpiry: retentionActionEnum('action_on_expiry').notNull(),
	isEnabled: boolean('is_enabled').notNull().default(true),
	conditions: jsonb('conditions'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ediscoveryCases = pgTable('ediscovery_cases', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	description: text('description'),
	status: text('status').notNull().default('open'),
	createdByIdentifier: text('created_by_identifier').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const legalHolds = pgTable('legal_holds', {
	id: uuid('id').primaryKey().defaultRandom(),
	caseId: uuid('case_id')
		.notNull()
		.references(() => ediscoveryCases.id, { onDelete: 'cascade' }),
	custodianId: uuid('custodian_id').references(() => custodians.id, { onDelete: 'cascade' }),
	holdCriteria: jsonb('hold_criteria'),
	reason: text('reason'),
	appliedByIdentifier: text('applied_by_identifier').notNull(),
	appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
	removedAt: timestamp('removed_at', { withTimezone: true }),
});

export const legalHoldEmails = pgTable(
	'legal_hold_emails',
	{
		holdId: uuid('hold_id')
			.notNull()
			.references(() => legalHolds.id, { onDelete: 'cascade' }),
		emailId: uuid('email_id')
			.notNull()
			.references(() => archivedEmails.id, { onDelete: 'cascade' }),
		matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
		removedAt: timestamp('removed_at', { withTimezone: true }),
		matchedByIdentifier: text('matched_by_identifier'),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.holdId, table.emailId] }),
		holdIdIdx: index('legal_hold_emails_hold_id_idx').on(table.holdId),
		emailIdIdx: index('legal_hold_emails_email_id_idx').on(table.emailId),
		activeIdx: index('legal_hold_emails_active_idx').on(table.holdId, table.removedAt),
	})
);

export const legalHoldNotices = pgTable(
	'legal_hold_notices',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		holdId: uuid('hold_id')
			.notNull()
			.references(() => legalHolds.id, { onDelete: 'cascade' }),
		custodianId: uuid('custodian_id')
			.notNull()
			.references(() => custodians.id, { onDelete: 'cascade' }),
		channel: text('channel').notNull().default('manual'),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
		sentByIdentifier: text('sent_by_identifier').notNull(),
		acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
		acknowledgedByIdentifier: text('acknowledged_by_identifier'),
		notes: text('notes'),
	},
	(table) => ({
		holdIdIdx: index('legal_hold_notices_hold_id_idx').on(table.holdId),
		custodianIdIdx: index('legal_hold_notices_custodian_id_idx').on(table.custodianId),
	})
);

export const exportJobs = pgTable('export_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	caseId: uuid('case_id').references(() => ediscoveryCases.id, { onDelete: 'set null' }),
	format: text('format').notNull(),
	status: text('status').notNull().default('pending'),
	query: jsonb('query').notNull(),
	filePath: text('file_path'),
	createdByIdentifier: text('created_by_identifier').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const auditLogVerifications = pgTable(
	'audit_log_verifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		ok: boolean('ok').notNull().default(false),
		message: text('message'),
		failedLogId: bigint('failed_log_id', { mode: 'number' }),
		verifiedByIdentifier: text('verified_by_identifier'),
	},
	(table) => ({
		okIdx: index('audit_log_verifications_ok_idx').on(table.ok),
	})
);

// --- Relations ---

export const ediscoveryCasesRelations = relations(ediscoveryCases, ({ many }) => ({
	legalHolds: many(legalHolds),
	exportJobs: many(exportJobs),
}));

export const legalHoldsRelations = relations(legalHolds, ({ one }) => ({
	ediscoveryCase: one(ediscoveryCases, {
		fields: [legalHolds.caseId],
		references: [ediscoveryCases.id],
	}),
	custodian: one(custodians, {
		fields: [legalHolds.custodianId],
		references: [custodians.id],
	}),
}));

export const legalHoldEmailsRelations = relations(legalHoldEmails, ({ one }) => ({
	hold: one(legalHolds, {
		fields: [legalHoldEmails.holdId],
		references: [legalHolds.id],
	}),
	email: one(archivedEmails, {
		fields: [legalHoldEmails.emailId],
		references: [archivedEmails.id],
	}),
}));

export const legalHoldNoticesRelations = relations(legalHoldNotices, ({ one }) => ({
	hold: one(legalHolds, {
		fields: [legalHoldNotices.holdId],
		references: [legalHolds.id],
	}),
	custodian: one(custodians, {
		fields: [legalHoldNotices.custodianId],
		references: [custodians.id],
	}),
}));

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
	ediscoveryCase: one(ediscoveryCases, {
		fields: [exportJobs.caseId],
		references: [ediscoveryCases.id],
	}),
}));

export const auditLogVerificationsRelations = relations(auditLogVerifications, ({ one }) => ({
	auditLog: one(auditLogs, {
		fields: [auditLogVerifications.failedLogId],
		references: [auditLogs.id],
	}),
}));
