import type { Job } from 'bullmq';
import { RetentionService } from '../../services/RetentionService';
import { logger } from '../../config/logger';

export default async function retentionEnforcementProcessor(job: Job) {
	logger.info({ jobId: job.id }, 'Retention enforcement job started.');
	const service = new RetentionService();
	const result = await service.runRetentionEnforcement();
	logger.info({ jobId: job.id, result }, 'Retention enforcement job completed.');
	return result;
}
