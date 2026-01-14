import { Request, Response } from 'express';
import { z } from 'zod';
import { ArchiveExportService } from '../../services/ArchiveExportService';
import { StorageService } from '../../services/StorageService';
import { UserService } from '../../services/UserService';

const createArchiveExportJobSchema = z.object({
	format: z.enum(['eml', 'mbox', 'json']),
});

export class ArchiveExportController {
	private exportService = new ArchiveExportService();
	private storageService = new StorageService();
	private userService = new UserService();

	public getArchiveExportJobs = async (req: Request, res: Response): Promise<Response> => {
		try {
			const page = parseInt(req.query.page as string, 10) || 1;
			const limit = parseInt(req.query.limit as string, 10) || 20;
			const result = await this.exportService.getArchiveExportJobs(page, limit);
			return res.status(200).json(result);
		} catch (error) {
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public createArchiveExportJob = async (req: Request, res: Response): Promise<Response> => {
		try {
			const dto = createArchiveExportJobSchema.parse(req.body);
			const userId = req.user?.sub;
			if (!userId) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const actor = await this.userService.findById(userId);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const created = await this.exportService.createArchiveExportJob(
				{ format: dto.format },
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
					error instanceof Error ? error.message : 'Failed to create archive export job.',
			});
		}
	};

	public downloadArchiveExportJob = async (
		req: Request,
		res: Response
	): Promise<Response> => {
		try {
			const exportJobId = z.string().uuid().parse(req.params.id);
			const job = await this.exportService.getArchiveExportJobById(exportJobId);
			if (!job || !job.filePath) {
				return res.status(404).json({ message: 'Export file not found.' });
			}

			const stream = await this.storageService.get(job.filePath);
			res.setHeader('Content-Type', 'application/zip');
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="archive-export-${exportJobId}.zip"`
			);
			stream.pipe(res);
			return res;
		} catch (error) {
			return res.status(500).json({
				message:
					error instanceof Error ? error.message : 'Failed to download archive export.',
			});
		}
	};
}
