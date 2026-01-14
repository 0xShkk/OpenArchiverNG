import type { Queue } from 'bullmq';
import type {
	JobSchedule,
	JobScheduleSettings,
	JobScheduleSettingsMap,
	SystemSettings,
	User,
} from '@open-archiver/types';
import { config } from '../config';
import { complianceQueue, ingestionQueue } from '../jobs/queues';
import { SettingsService } from './SettingsService';
import { db } from '../database';
import { ingestionSources } from '../database/schema';
import { isValidCronPattern, normalizeCronPattern } from '../helpers/cron';

type ScheduleDefinition = {
	id: string;
	queue: Queue;
	queueName: string;
	jobName: string;
	defaultCron: string;
	requiresIngestionSources?: boolean;
};

const scheduleDefinitions: ScheduleDefinition[] = [
	{
		id: 'ingestion:schedule-continuous-sync',
		queue: ingestionQueue,
		queueName: ingestionQueue.name,
		jobName: 'schedule-continuous-sync',
		defaultCron: config.app.syncFrequency,
		requiresIngestionSources: true,
	},
	{
		id: 'compliance:retention-enforcement',
		queue: complianceQueue,
		queueName: complianceQueue.name,
		jobName: 'retention-enforcement',
		defaultCron: config.app.retentionFrequency,
	},
	{
		id: 'compliance:audit-log-verify',
		queue: complianceQueue,
		queueName: complianceQueue.name,
		jobName: 'audit-log-verify',
		defaultCron: config.app.auditLogVerificationFrequency,
	},
	{
		id: 'compliance:legal-hold-notice-reminder',
		queue: complianceQueue,
		queueName: complianceQueue.name,
		jobName: 'legal-hold-notice-reminder',
		defaultCron: config.app.legalHoldNoticeReminderFrequency,
	},
];

export class JobScheduleService {
	private settingsService = new SettingsService();

	private getDefinition(scheduleId: string): ScheduleDefinition {
		const definition = scheduleDefinitions.find((entry) => entry.id === scheduleId);
		if (!definition) {
			throw new Error('Unknown schedule');
		}
		return definition;
	}

	private getScheduleSettings(settings: SystemSettings): JobScheduleSettingsMap {
		if (settings.jobSchedules) {
			return settings.jobSchedules;
		}
		return {
			'ingestion:schedule-continuous-sync': {
				cron: config.app.syncFrequency,
				enabled: true,
			},
			'compliance:retention-enforcement': {
				cron: config.app.retentionFrequency,
				enabled: true,
			},
			'compliance:audit-log-verify': {
				cron: config.app.auditLogVerificationFrequency,
				enabled: true,
			},
			'compliance:legal-hold-notice-reminder': {
				cron: config.app.legalHoldNoticeReminderFrequency,
				enabled: true,
			},
		};
	}

	private async hasAnyIngestionSources(): Promise<boolean> {
		const sources = await db
			.select({ id: ingestionSources.id })
			.from(ingestionSources)
			.limit(1);
		return sources.length > 0;
	}

	public async listSchedules(): Promise<JobSchedule[]> {
		const settings = await this.settingsService.getSystemSettings();
		const scheduleSettings = this.getScheduleSettings(settings);
		const eligibleIngestionSources = await this.hasAnyIngestionSources();

		return Promise.all(
			scheduleDefinitions.map(async (definition) => {
				const configEntry = scheduleSettings[definition.id];
				const configured = Boolean(configEntry);
				const enabled = Boolean(configEntry?.enabled);
				const cron = normalizeCronPattern(
					configEntry?.cron || definition.defaultCron,
					definition.defaultCron
				);
				const eligible = definition.requiresIngestionSources
					? eligibleIngestionSources
					: true;

				const repeatableJobs = await definition.queue.getRepeatableJobs();
				const matchingJobs = repeatableJobs.filter(
					(job) => job.name === definition.jobName
				);
				const activeJob =
					matchingJobs.find((job) => job.id === definition.id) ?? matchingJobs[0];

				return {
					id: definition.id,
					queueName: definition.queueName,
					jobName: definition.jobName,
					cron,
					enabled,
					configured,
					isScheduled: Boolean(activeJob),
					nextRunAt: activeJob?.next,
					eligible,
				};
			})
		);
	}

	public async createSchedule(
		scheduleId: string,
		cron: string | undefined,
		actor: User,
		actorIp: string
	): Promise<JobSchedule> {
		const definition = this.getDefinition(scheduleId);
		const settings = await this.settingsService.getSystemSettings();
		const scheduleSettings = this.getScheduleSettings(settings);

		if (scheduleSettings[scheduleId]) {
			throw new Error('Schedule already exists');
		}

		if (cron && !isValidCronPattern(cron)) {
			throw new Error('Invalid cron pattern');
		}

		const normalizedCron = normalizeCronPattern(cron, definition.defaultCron);
		const updatedSettings: JobScheduleSettingsMap = {
			...scheduleSettings,
			[scheduleId]: {
				cron: normalizedCron,
				enabled: true,
			},
		};

		await this.settingsService.updateSystemSettings(
			{ jobSchedules: updatedSettings },
			actor,
			actorIp
		);

		await this.refreshSchedules();
		const schedules = await this.listSchedules();
		return schedules.find((schedule) => schedule.id === scheduleId)!;
	}

	public async updateSchedule(
		scheduleId: string,
		update: Partial<JobScheduleSettings>,
		actor: User,
		actorIp: string
	): Promise<JobSchedule> {
		const definition = this.getDefinition(scheduleId);
		const settings = await this.settingsService.getSystemSettings();
		const scheduleSettings = this.getScheduleSettings(settings);
		const existing = scheduleSettings[scheduleId];

		if (!existing) {
			throw new Error('Schedule not configured');
		}

		if (update.cron && !isValidCronPattern(update.cron)) {
			throw new Error('Invalid cron pattern');
		}

		const updated: JobScheduleSettings = {
			cron: normalizeCronPattern(update.cron || existing.cron, definition.defaultCron),
			enabled: update.enabled ?? existing.enabled,
		};

		await this.settingsService.updateSystemSettings(
			{
				jobSchedules: {
					...scheduleSettings,
					[scheduleId]: updated,
				},
			},
			actor,
			actorIp
		);

		await this.refreshSchedules();
		const schedules = await this.listSchedules();
		return schedules.find((schedule) => schedule.id === scheduleId)!;
	}

	public async deleteSchedule(scheduleId: string, actor: User, actorIp: string): Promise<void> {
		this.getDefinition(scheduleId);
		const settings = await this.settingsService.getSystemSettings();
		const scheduleSettings = this.getScheduleSettings(settings);

		if (!scheduleSettings[scheduleId]) {
			throw new Error('Schedule not configured');
		}

		const updatedSettings = { ...scheduleSettings };
		delete updatedSettings[scheduleId];

		await this.settingsService.updateSystemSettings(
			{ jobSchedules: updatedSettings },
			actor,
			actorIp
		);

		await this.refreshSchedules();
	}

	public async refreshSchedules(): Promise<void> {
		const settings = await this.settingsService.getSystemSettings();
		const scheduleSettings = this.getScheduleSettings(settings);
		const eligibleIngestionSources = await this.hasAnyIngestionSources();

		for (const definition of scheduleDefinitions) {
			const configEntry = scheduleSettings[definition.id];
			const shouldSchedule =
				Boolean(configEntry?.enabled) &&
				(!definition.requiresIngestionSources || eligibleIngestionSources);
			await this.applySchedule(definition, configEntry, shouldSchedule);
		}
	}

	private async applySchedule(
		definition: ScheduleDefinition,
		configEntry: JobScheduleSettings | undefined,
		shouldSchedule: boolean
	): Promise<void> {
		const repeatableJobs = await definition.queue.getRepeatableJobs();
		const matchingJobs = repeatableJobs.filter((job) => job.name === definition.jobName);

		if (!shouldSchedule) {
			for (const job of matchingJobs) {
				await definition.queue.removeRepeatableByKey(job.key);
			}
			return;
		}

		const cron = normalizeCronPattern(
			configEntry?.cron || definition.defaultCron,
			definition.defaultCron
		);

		const hasMatchingJob = matchingJobs.some(
			(job) => job.pattern === cron && (!job.id || job.id === definition.id)
		);
		if (hasMatchingJob) {
			return;
		}

		for (const job of matchingJobs) {
			await definition.queue.removeRepeatableByKey(job.key);
		}

		await definition.queue.add(
			definition.jobName,
			{},
			{
				jobId: definition.id,
				repeat: {
					pattern: cron,
				},
			}
		);
	}
}
