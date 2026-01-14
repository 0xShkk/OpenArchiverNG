import { Request, Response } from 'express';
import { z } from 'zod';
import { ComplianceService } from '../../services/ComplianceService';
import { UserService } from '../../services/UserService';
import { ExportService } from '../../services/ExportService';
import { AuditService } from '../../services/AuditService';
import { StorageService } from '../../services/StorageService';

const ingestionProviders = [
	'google_workspace',
	'microsoft_365',
	'generic_imap',
	'pst_import',
	'eml_import',
	'mbox_import',
] as const;

const caseStatuses = ['open', 'closed'] as const;
const exportFormats = ['eml', 'mbox', 'json'] as const;

const createCaseSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().max(2000).optional().nullable(),
});

const updateCaseSchema = z
	.object({
		status: z.enum(caseStatuses).optional(),
		description: z.string().max(2000).optional().nullable(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field is required.',
	});

const createCustodianSchema = z.object({
	email: z.string().email(),
	displayName: z.string().max(255).optional().nullable(),
	sourceType: z.enum(ingestionProviders),
});

const holdCriteriaSchema = z
	.object({
		userEmail: z.string().email().optional(),
		ingestionSourceId: z.string().uuid().optional(),
		senderEmail: z.string().email().optional(),
		subjectContains: z.string().max(200).optional(),
		startDate: z.string().optional(),
		endDate: z.string().optional(),
	})
	.partial();

const createLegalHoldSchema = z
	.object({
		caseId: z.string().uuid(),
		custodianId: z.string().uuid().optional().nullable(),
		holdCriteria: holdCriteriaSchema.optional().nullable(),
		reason: z.string().max(1000).optional().nullable(),
	})
	.refine(
		(data) => {
			if (data.custodianId) {
				return true;
			}
			if (!data.holdCriteria) {
				return false;
			}
			return Object.keys(data.holdCriteria).length > 0;
		},
		{
			message: 'Legal hold requires a custodian or at least one criteria field.',
		}
	);

const updateLegalHoldSchema = z
	.object({
		custodianId: z.string().uuid().optional().nullable(),
		holdCriteria: holdCriteriaSchema.optional().nullable(),
		reason: z.string().max(1000).optional().nullable(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field is required.',
	});

const createLegalHoldNoticeSchema = z.object({
	custodianId: z.string().uuid().optional().nullable(),
	channel: z.string().max(50).optional(),
	notes: z.string().max(2000).optional().nullable(),
});

const acknowledgeLegalHoldNoticeSchema = z.object({
	notes: z.string().max(2000).optional().nullable(),
});

const exportQuerySchema = z
	.object({
		holdId: z.string().uuid().optional(),
		caseId: z.string().uuid().optional(),
		emailIds: z.array(z.string().uuid()).optional(),
	})
	.refine(
		(data) => Boolean(data.holdId || data.caseId || (data.emailIds && data.emailIds.length)),
		{
			message: 'Export query requires a holdId, caseId, or emailIds.',
		}
	);

const createExportJobSchema = z.object({
	caseId: z.string().uuid().optional().nullable(),
	format: z.enum(exportFormats),
	query: exportQuerySchema,
});

export class ComplianceController {
	private complianceService = new ComplianceService();
	private userService = new UserService();
	private exportService = new ExportService();
	private auditService = new AuditService();
	private storageService = new StorageService();

	public getCases = async (req: Request, res: Response): Promise<Response> => {
		try {
			const cases = await this.complianceService.getCases();
			return res.status(200).json(cases);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public getCaseSummaries = async (req: Request, res: Response): Promise<Response> => {
		try {
			const summaries = await this.complianceService.getCaseSummaries();
			return res.status(200).json(summaries);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public createCase = async (req: Request, res: Response): Promise<Response> => {
		try {
			const dto = createCaseSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.complianceService.createCase(
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(created);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to create case.',
			});
		}
	};

	public updateCase = async (req: Request, res: Response): Promise<Response> => {
		try {
			const caseId = z.string().uuid().parse(req.params.id);
			const dto = updateCaseSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const updated = await this.complianceService.updateCase(
				caseId,
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(200).json(updated);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to update case.',
			});
		}
	};

	public getCustodians = async (req: Request, res: Response): Promise<Response> => {
		try {
			const custodians = await this.complianceService.getCustodians();
			return res.status(200).json(custodians);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public createCustodian = async (req: Request, res: Response): Promise<Response> => {
		try {
			const dto = createCustodianSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.complianceService.createCustodian(
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(created);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to create custodian.',
			});
		}
	};

	public getLegalHolds = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holds = await this.complianceService.getLegalHolds();
			return res.status(200).json(holds);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public getLegalHoldEmails = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const page = parseInt(req.query.page as string, 10) || 1;
			const limit = parseInt(req.query.limit as string, 10) || 25;
			const result = await this.complianceService.getLegalHoldEmails(holdId, page, limit);
			return res.status(200).json(result);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message:
					error instanceof Error ? error.message : 'Failed to load legal hold emails.',
			});
		}
	};

	public updateLegalHold = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const dto = updateLegalHoldSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const updated = await this.complianceService.updateLegalHold(
				holdId,
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(200).json(updated);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to update legal hold.',
			});
		}
	};

	public getLegalHoldNotices = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const notices = await this.complianceService.getLegalHoldNotices(holdId);
			return res.status(200).json(notices);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message:
					error instanceof Error ? error.message : 'Failed to load legal hold notices.',
			});
		}
	};

	public createLegalHoldNotice = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const dto = createLegalHoldNoticeSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.complianceService.createLegalHoldNotice(
				holdId,
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(created);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message:
					error instanceof Error ? error.message : 'Failed to create legal hold notice.',
			});
		}
	};

	public acknowledgeLegalHoldNotice = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const noticeId = z.string().uuid().parse(req.params.noticeId);
			const dto = acknowledgeLegalHoldNoticeSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const updated = await this.complianceService.acknowledgeLegalHoldNotice(
				holdId,
				noticeId,
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(200).json(updated);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message:
					error instanceof Error
						? error.message
						: 'Failed to acknowledge legal hold notice.',
			});
		}
	};

	public createLegalHold = async (req: Request, res: Response): Promise<Response> => {
		try {
			const dto = createLegalHoldSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.complianceService.createLegalHold(
				dto,
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(created);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to create legal hold.',
			});
		}
	};

	public releaseLegalHold = async (req: Request, res: Response): Promise<Response> => {
		try {
			const holdId = z.string().uuid().parse(req.params.id);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			await this.complianceService.releaseLegalHold(holdId, actor, req.ip || 'unknown');
			return res.status(200).json({ message: req.t('compliance.holdReleased') });
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to release legal hold.',
			});
		}
	};

	public getExportJobs = async (req: Request, res: Response): Promise<Response> => {
		try {
			const page = parseInt(req.query.page as string, 10) || 1;
			const limit = parseInt(req.query.limit as string, 10) || 20;
			const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
			const result = await this.exportService.getExportJobs(page, limit, caseId);
			return res.status(200).json(result);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public createExportJob = async (req: Request, res: Response): Promise<Response> => {
		try {
			const dto = createExportJobSchema.parse(req.body);
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.exportService.createExportJob(
				{
					caseId: dto.caseId ?? null,
					format: dto.format,
					query: dto.query,
				},
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(created);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res
					.status(400)
					.json({ message: req.t('api.requestBodyInvalid'), errors: error.message });
			}
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Failed to create export job.',
			});
		}
	};

	public downloadExportJob = async (req: Request, res: Response): Promise<Response> => {
		try {
			const exportJobId = z.string().uuid().parse(req.params.id);
			const job = await this.exportService.getExportJobById(exportJobId);
			if (!job || !job.filePath) {
				return res.status(404).json({ message: 'Export file not found.' });
			}

			const stream = await this.storageService.get(job.filePath);
			res.setHeader('Content-Type', 'application/zip');
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="export-${exportJobId}.zip"`
			);
			stream.pipe(res);
			return res;
		} catch (error) {
			return res.status(500).json({
				message: error instanceof Error ? error.message : 'Failed to download export job.',
			});
		}
	};

	public getAuditLogs = async (req: Request, res: Response): Promise<Response> => {
		try {
			const page = parseInt(req.query.page as string, 10) || 1;
			const limit = parseInt(req.query.limit as string, 10) || 20;
			const startDate = req.query.startDate
				? new Date(String(req.query.startDate))
				: undefined;
			const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
			const actor = typeof req.query.actor === 'string' ? req.query.actor : undefined;
			const actionType =
				typeof req.query.actionType === 'string' ? req.query.actionType : undefined;
			const sort = req.query.sort === 'asc' ? 'asc' : 'desc';

			const result = await this.auditService.getAuditLogs({
				page,
				limit,
				startDate,
				endDate,
				actor,
				actionType: actionType as any,
				sort,
			});
			return res.status(200).json(result);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public verifyAuditLogs = async (req: Request, res: Response): Promise<Response> => {
		try {
			const actor = await this.requireActor(req, res);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const result = await this.auditService.verifyAuditLog();
			await this.auditService.recordAuditVerification(result, actor.id);
			return res.status(200).json(result);
		} catch (error) {
			return res.status(500).json({
				message: error instanceof Error ? error.message : 'Failed to verify audit logs.',
			});
		}
	};

	public getAuditLogVerifications = async (req: Request, res: Response): Promise<Response> => {
		try {
			const items = await this.auditService.getAuditLogVerifications(5);
			return res.status(200).json({ items });
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	private async requireActor(req: Request, res: Response) {
		const userId = req.user?.sub;
		if (!userId) {
			return null;
		}
		return this.userService.findById(userId);
	}
}
