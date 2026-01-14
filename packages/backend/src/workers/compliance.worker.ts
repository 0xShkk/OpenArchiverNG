import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import retentionEnforcementProcessor from '../jobs/processors/retention-enforcement.processor';
import auditLogVerifyProcessor from '../jobs/processors/audit-log-verify.processor';
import exportJobProcessor from '../jobs/processors/export-job.processor';
import archiveExportJobProcessor from '../jobs/processors/archive-export-job.processor';
import legalHoldNoticeReminderProcessor from '../jobs/processors/legal-hold-notice-reminder.processor';
import { config } from '../config';

const processor = async (job: any) => {
	switch (job.name) {
		case 'retention-enforcement':
			return retentionEnforcementProcessor(job);
		case 'audit-log-verify':
			return auditLogVerifyProcessor(job);
		case 'export-job':
			return exportJobProcessor(job);
		case 'archive-export-job':
			return archiveExportJobProcessor(job);
		case 'legal-hold-notice-reminder':
			return legalHoldNoticeReminderProcessor(job);
		default:
			throw new Error(`Unknown job name: ${job.name}`);
	}
};

const worker = new Worker('compliance', processor, {
	connection,
	concurrency: config.app.complianceWorkerConcurrency,
	lockDuration: config.app.queueLockDurationMs,
	lockRenewTime: config.app.queueLockRenewTimeMs,
	stalledInterval: config.app.queueStalledIntervalMs,
	maxStalledCount: config.app.queueMaxStalledCount,
	removeOnComplete: {
		count: 100,
	},
	removeOnFail: {
		count: 500,
	},
});

console.log('Compliance worker started');

process.on('SIGINT', () => worker.close());
process.on('SIGTERM', () => worker.close());
