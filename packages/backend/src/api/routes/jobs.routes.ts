import { Router } from 'express';
import { JobsController } from '../controllers/jobs.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createJobsRouter = (authService: AuthService): Router => {
	const router = Router();
	const jobsController = new JobsController();

	router.use(requireAuth(authService));

	router.get(
		'/queues',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.getQueues
	);
	router.get(
		'/queues/:queueName',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.getQueueJobs
	);
	router.get(
		'/schedules',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.getSchedules
	);
	router.post(
		'/schedules/:scheduleId',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.createSchedule
	);
	router.patch(
		'/schedules/:scheduleId',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.updateSchedule
	);
	router.delete(
		'/schedules/:scheduleId',
		requirePermission('manage', 'all', 'user.requiresSuperAdminRole'),
		jobsController.deleteSchedule
	);

	return router;
};
