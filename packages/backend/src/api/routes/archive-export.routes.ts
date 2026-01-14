import { Router } from 'express';
import { ArchiveExportController } from '../controllers/archive-export.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createArchiveExportRouter = (authService: AuthService): Router => {
	const router = Router();
	const controller = new ArchiveExportController();

	router.use(requireAuth(authService));

	router.get('/', requirePermission('read', 'archive'), controller.getArchiveExportJobs);
	router.post('/', requirePermission('export', 'archive'), controller.createArchiveExportJob);
	router.get(
		'/:id/download',
		requirePermission('export', 'archive'),
		controller.downloadArchiveExportJob
	);

	return router;
};
