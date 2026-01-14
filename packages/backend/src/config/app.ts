import 'dotenv/config';
import { parseByteSize } from '../helpers/size';
import { normalizeCronPattern } from '../helpers/cron';

const DEFAULT_MAX_EMAIL_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const DEFAULT_LOCK_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_LOCK_RENEW_MS = 60 * 1000;
const DEFAULT_STALLED_INTERVAL_MS = 60 * 1000;
const DEFAULT_MAX_STALLED_COUNT = 3;
const DEFAULT_QUEUE_JOB_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_INGESTION_WORKER_CONCURRENCY = 2;
const DEFAULT_COMPLIANCE_WORKER_CONCURRENCY = 1;
const DEFAULT_RETENTION_FREQUENCY = '0 2 * * *';
const DEFAULT_AUDIT_VERIFY_FREQUENCY = '0 3 * * *';
const DEFAULT_LEGAL_HOLD_REMINDER_FREQUENCY = '0 9 * * *';
const DEFAULT_LEGAL_HOLD_REMINDER_DAYS = 7;

export const app = {
	nodeEnv: process.env.NODE_ENV || 'development',
	port: process.env.PORT_BACKEND ? parseInt(process.env.PORT_BACKEND, 10) : 4000,
	encryptionKey: process.env.ENCRYPTION_KEY,
	syncFrequency: normalizeCronPattern(process.env.SYNC_FREQUENCY), //default to 1 minute
	retentionFrequency: normalizeCronPattern(
		process.env.RETENTION_FREQUENCY,
		DEFAULT_RETENTION_FREQUENCY
	),
	auditLogVerificationFrequency: normalizeCronPattern(
		process.env.AUDIT_VERIFY_FREQUENCY,
		DEFAULT_AUDIT_VERIFY_FREQUENCY
	),
	legalHoldNoticeReminderFrequency: normalizeCronPattern(
		process.env.LEGAL_HOLD_NOTICE_REMINDER_FREQUENCY,
		DEFAULT_LEGAL_HOLD_REMINDER_FREQUENCY
	),
	legalHoldNoticeReminderDays: (() => {
		const raw = process.env.LEGAL_HOLD_NOTICE_REMINDER_DAYS;
		if (raw === undefined || raw === '') {
			return DEFAULT_LEGAL_HOLD_REMINDER_DAYS;
		}
		const parsed = parseInt(raw, 10);
		return Number.isNaN(parsed) ? DEFAULT_LEGAL_HOLD_REMINDER_DAYS : parsed;
	})(),
	enableDeletion: process.env.ENABLE_DELETION === 'true',
	deleteFromSourceAfterArchive: process.env.DELETE_FROM_SOURCE_AFTER_ARCHIVE === 'true',
	allInclusiveArchive: process.env.ALL_INCLUSIVE_ARCHIVE === 'true',
	maxEmailBytes: parseByteSize(process.env.MAX_EMAIL_BYTES, DEFAULT_MAX_EMAIL_BYTES),
	maxPreviewBytes: parseByteSize(process.env.MAX_PREVIEW_BYTES, DEFAULT_MAX_PREVIEW_BYTES),
	maxAttachmentBytes: parseByteSize(
		process.env.MAX_ATTACHMENT_BYTES,
		DEFAULT_MAX_ATTACHMENT_BYTES
	),
	queueLockDurationMs:
		parseInt(process.env.QUEUE_LOCK_DURATION_MS || '', 10) || DEFAULT_LOCK_DURATION_MS,
	queueLockRenewTimeMs:
		parseInt(process.env.QUEUE_LOCK_RENEW_TIME_MS || '', 10) || DEFAULT_LOCK_RENEW_MS,
	queueStalledIntervalMs:
		parseInt(process.env.QUEUE_STALLED_INTERVAL_MS || '', 10) || DEFAULT_STALLED_INTERVAL_MS,
	queueMaxStalledCount:
		parseInt(process.env.QUEUE_MAX_STALLED_COUNT || '', 10) || DEFAULT_MAX_STALLED_COUNT,
	queueJobTimeoutMs:
		parseInt(process.env.QUEUE_JOB_TIMEOUT_MS || '', 10) || DEFAULT_QUEUE_JOB_TIMEOUT_MS,
	ingestionWorkerConcurrency:
		parseInt(process.env.INGESTION_WORKER_CONCURRENCY || '', 10) ||
		DEFAULT_INGESTION_WORKER_CONCURRENCY,
	complianceWorkerConcurrency:
		parseInt(process.env.COMPLIANCE_WORKER_CONCURRENCY || '', 10) ||
		DEFAULT_COMPLIANCE_WORKER_CONCURRENCY,
};
