import type { Job } from 'bullmq';
import { ArchiveExportService } from '../../services/ArchiveExportService';
import { logger } from '../../config/logger';

export default async function archiveExportJobProcessor(job: Job) {
	const { archiveExportJobId } = job.data || {};
	if (!archiveExportJobId) {
		throw new Error('archiveExportJobId is required.');
	}
	logger.info({ jobId: job.id, archiveExportJobId }, 'Archive export job started.');
	const service = new ArchiveExportService();
	await service.runArchiveExportJob(archiveExportJobId);
	logger.info({ jobId: job.id, archiveExportJobId }, 'Archive export job completed.');
}
