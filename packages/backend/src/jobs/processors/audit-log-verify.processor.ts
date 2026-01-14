import type { Job } from 'bullmq';
import { AuditService } from '../../services/AuditService';
import { logger } from '../../config/logger';

export default async function auditLogVerifyProcessor(job: Job) {
	logger.info({ jobId: job.id }, 'Audit log verification job started.');
	const auditService = new AuditService();
	const result = await auditService.verifyAuditLog();
	const record = await auditService.recordAuditVerification(result, 'system');

	await auditService.createAuditLog({
		actorIdentifier: 'system',
		actionType: 'CREATE',
		targetType: 'AuditLogVerification',
		targetId: record.id,
		actorIp: 'system',
		details: {
			ok: result.ok,
			message: result.message,
			failedLogId: result.logId ?? null,
		},
	});

	logger.info({ jobId: job.id, result }, 'Audit log verification job completed.');
	return result;
}
