import type { Job } from 'bullmq';
import { ExportService } from '../../services/ExportService';
import { logger } from '../../config/logger';

export default async function exportJobProcessor(job: Job) {
	const { exportJobId } = job.data || {};
	if (!exportJobId) {
		throw new Error('exportJobId is required.');
	}
	logger.info({ jobId: job.id, exportJobId }, 'Export job started.');
	const service = new ExportService();
	await service.runExportJob(exportJobId);
	logger.info({ jobId: job.id, exportJobId }, 'Export job completed.');
}
