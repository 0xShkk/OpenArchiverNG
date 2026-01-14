import { Router } from 'express';
import { ComplianceController } from '../controllers/compliance.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createComplianceRouter = (authService: AuthService): Router => {
	const router = Router();
	const controller = new ComplianceController();

	router.use(requireAuth(authService));

	router.get('/cases', requirePermission('read', 'compliance'), controller.getCases);
	router.post('/cases', requirePermission('create', 'compliance'), controller.createCase);
	router.get(
		'/cases/summary',
		requirePermission('read', 'compliance'),
		controller.getCaseSummaries
	);
	router.patch('/cases/:id', requirePermission('update', 'compliance'), controller.updateCase);

	router.get('/custodians', requirePermission('read', 'compliance'), controller.getCustodians);
	router.post(
		'/custodians',
		requirePermission('create', 'compliance'),
		controller.createCustodian
	);

	router.get('/legal-holds', requirePermission('read', 'compliance'), controller.getLegalHolds);
	router.get(
		'/legal-holds/:id/emails',
		requirePermission('read', 'compliance'),
		controller.getLegalHoldEmails
	);
	router.get(
		'/legal-holds/:id/notices',
		requirePermission('read', 'compliance'),
		controller.getLegalHoldNotices
	);
	router.post(
		'/legal-holds',
		requirePermission('create', 'compliance'),
		controller.createLegalHold
	);
	router.patch(
		'/legal-holds/:id',
		requirePermission('update', 'compliance'),
		controller.updateLegalHold
	);
	router.post(
		'/legal-holds/:id/release',
		requirePermission('update', 'compliance'),
		controller.releaseLegalHold
	);
	router.post(
		'/legal-holds/:id/notices',
		requirePermission('create', 'compliance'),
		controller.createLegalHoldNotice
	);
	router.post(
		'/legal-holds/:id/notices/:noticeId/acknowledge',
		requirePermission('update', 'compliance'),
		controller.acknowledgeLegalHoldNotice
	);

	router.get('/export-jobs', requirePermission('read', 'compliance'), controller.getExportJobs);
	router.post(
		'/export-jobs',
		requirePermission('create', 'compliance'),
		controller.createExportJob
	);
	router.get(
		'/export-jobs/:id/download',
		requirePermission('read', 'compliance'),
		controller.downloadExportJob
	);

	router.get('/audit-logs', requirePermission('read', 'compliance'), controller.getAuditLogs);
	router.post(
		'/audit-logs/verify',
		requirePermission('update', 'compliance'),
		controller.verifyAuditLogs
	);
	router.get(
		'/audit-logs/verifications',
		requirePermission('read', 'compliance'),
		controller.getAuditLogVerifications
	);

	return router;
};
