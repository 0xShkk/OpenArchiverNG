import type { Job } from 'bullmq';
import { ComplianceService } from '../../services/ComplianceService';
import { logger } from '../../config/logger';

export default async function legalHoldNoticeReminderProcessor(job: Job) {
	logger.info({ jobId: job.id }, 'Legal hold notice reminder job started.');
	const service = new ComplianceService();
	const result = await service.sendLegalHoldNoticeReminders();
	logger.info({ jobId: job.id, result }, 'Legal hold notice reminder job completed.');
	return result;
}
