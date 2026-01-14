import { pgTable, text, timestamp, uuid, bigint } from 'drizzle-orm/pg-core';

export const archiveExportJobs = pgTable('archive_export_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	format: text('format').notNull(),
	status: text('status').notNull().default('pending'),
	snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
	filePath: text('file_path'),
	emailCount: bigint('email_count', { mode: 'number' }),
	attachmentCount: bigint('attachment_count', { mode: 'number' }),
	errorMessage: text('error_message'),
	createdByIdentifier: text('created_by_identifier').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true }),
});
