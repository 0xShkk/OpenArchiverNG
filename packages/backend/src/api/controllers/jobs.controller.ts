import { Request, Response } from 'express';
import { JobsService } from '../../services/JobsService';
import { JobScheduleService } from '../../services/JobScheduleService';
import { UserService } from '../../services/UserService';
import {
	ICreateJobScheduleRequestBody,
	IGetQueueJobsRequestParams,
	IGetQueueJobsRequestQuery,
	IJobScheduleRequestParams,
	IUpdateJobScheduleRequestBody,
} from '@open-archiver/types';

export class JobsController {
	private jobsService: JobsService;
	private scheduleService: JobScheduleService;
	private userService: UserService;

	constructor() {
		this.jobsService = new JobsService();
		this.scheduleService = new JobScheduleService();
		this.userService = new UserService();
	}

	public getQueues = async (req: Request, res: Response) => {
		try {
			const queues = await this.jobsService.getQueues();
			res.status(200).json({ queues });
		} catch (error) {
			res.status(500).json({ message: 'Error fetching queues', error });
		}
	};

	public getQueueJobs = async (req: Request, res: Response) => {
		try {
			const { queueName } = req.params as unknown as IGetQueueJobsRequestParams;
			const { status, page, limit } = req.query as unknown as IGetQueueJobsRequestQuery;
			const pageNumber = parseInt(page, 10) || 1;
			const limitNumber = parseInt(limit, 10) || 10;
			const queueDetails = await this.jobsService.getQueueDetails(
				queueName,
				status,
				pageNumber,
				limitNumber
			);
			res.status(200).json(queueDetails);
		} catch (error) {
			res.status(500).json({ message: 'Error fetching queue jobs', error });
		}
	};

	public getSchedules = async (req: Request, res: Response) => {
		try {
			const schedules = await this.scheduleService.listSchedules();
			res.status(200).json({ schedules });
		} catch (error) {
			res.status(500).json({ message: 'Error fetching job schedules', error });
		}
	};

	public createSchedule = async (req: Request, res: Response) => {
		try {
			if (!req.user?.sub) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const actor = await this.userService.findById(req.user.sub);
			if (!actor) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const { scheduleId } = req.params as unknown as IJobScheduleRequestParams;
			const { cron } = req.body as ICreateJobScheduleRequestBody;
			const schedule = await this.scheduleService.createSchedule(
				scheduleId,
				cron,
				actor,
				req.ip || 'unknown'
			);
			return res.status(201).json(schedule);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Error creating job schedule';
			if (message === 'Unknown schedule') {
				return res.status(404).json({ message });
			}
			if (message === 'Schedule already exists') {
				return res.status(409).json({ message });
			}
			if (message === 'Invalid cron pattern') {
				return res.status(400).json({ message });
			}
			return res.status(500).json({ message });
		}
	};

	public updateSchedule = async (req: Request, res: Response) => {
		try {
			if (!req.user?.sub) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const actor = await this.userService.findById(req.user.sub);
			if (!actor) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const { scheduleId } = req.params as unknown as IJobScheduleRequestParams;
			const { cron, enabled } = req.body as IUpdateJobScheduleRequestBody;
			const schedule = await this.scheduleService.updateSchedule(
				scheduleId,
				{ cron, enabled },
				actor,
				req.ip || 'unknown'
			);
			return res.status(200).json(schedule);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Error updating job schedule';
			if (message === 'Unknown schedule' || message === 'Schedule not configured') {
				return res.status(404).json({ message });
			}
			if (message === 'Invalid cron pattern') {
				return res.status(400).json({ message });
			}
			return res.status(500).json({ message });
		}
	};

	public deleteSchedule = async (req: Request, res: Response) => {
		try {
			if (!req.user?.sub) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const actor = await this.userService.findById(req.user.sub);
			if (!actor) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const { scheduleId } = req.params as unknown as IJobScheduleRequestParams;
			await this.scheduleService.deleteSchedule(scheduleId, actor, req.ip || 'unknown');
			return res.status(204).send();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Error deleting job schedule';
			if (message === 'Unknown schedule' || message === 'Schedule not configured') {
				return res.status(404).json({ message });
			}
			return res.status(500).json({ message });
		}
	};
}
