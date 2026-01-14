import { JobScheduleService } from '../../services/JobScheduleService';

const scheduleService = new JobScheduleService();

scheduleService
	.refreshSchedules()
	.then(() => {
		console.log('Job schedules refreshed.');
	})
	.catch((error) => {
		console.error('Failed to refresh job schedules.', error);
	});
