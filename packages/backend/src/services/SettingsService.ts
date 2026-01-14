import { db } from '../database';
import { systemSettings } from '../database/schema/system-settings';
import type { SystemSettings, User } from '@open-archiver/types';
import { AuditService } from './AuditService';
import { config } from '../config';

const DEFAULT_SETTINGS: SystemSettings = {
	language: 'en',
	theme: 'system',
	supportEmail: null,
	allInclusiveArchive: config.app.allInclusiveArchive,
	maxEmailBytes: config.app.maxEmailBytes,
	maxPreviewBytes: config.app.maxPreviewBytes,
	maxAttachmentBytes: config.app.maxAttachmentBytes,
	legalHoldNoticeReminderDays: config.app.legalHoldNoticeReminderDays,
	enableDeletion: config.app.enableDeletion,
	deleteFromSourceAfterArchive: config.app.deleteFromSourceAfterArchive,
	jobSchedules: {
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
	},
};

const SETTINGS_CACHE_TTL_MS = 5000;

export class SettingsService {
	private auditService = new AuditService();
	private static cachedSettings: SystemSettings | null = null;
	private static cacheExpiresAt = 0;

	private static cacheSettings(settings: SystemSettings) {
		SettingsService.cachedSettings = settings;
		SettingsService.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
	}

	/**
	 * Retrieves the current system settings.
	 * If no settings exist, it initializes and returns the default settings.
	 * @returns The system settings.
	 */
	public async getSystemSettings(): Promise<SystemSettings> {
		if (
			SettingsService.cachedSettings &&
			Date.now() < SettingsService.cacheExpiresAt
		) {
			return SettingsService.cachedSettings;
		}

		const settings = await db.select().from(systemSettings).limit(1);

		if (settings.length === 0) {
			const created = await this.createDefaultSystemSettings();
			SettingsService.cacheSettings(created);
			return created;
		}

		const merged = { ...DEFAULT_SETTINGS, ...settings[0].config };
		SettingsService.cacheSettings(merged);
		return merged;
	}

	/**
	 * Updates the system settings by merging the new configuration with the existing one.
	 * @param newConfig - A partial object of the new settings configuration.
	 * @returns The updated system settings.
	 */
	public async updateSystemSettings(
		newConfig: Partial<SystemSettings>,
		actor: User,
		actorIp: string
	): Promise<SystemSettings> {
		const currentConfig = await this.getSystemSettings();
		const mergedConfig = { ...currentConfig, ...newConfig };

		// Since getSettings ensures a record always exists, we can directly update.
		const [result] = await db.update(systemSettings).set({ config: mergedConfig }).returning();

		const changedFields = Object.keys(newConfig).filter(
			(key) =>
				currentConfig[key as keyof SystemSettings] !==
				newConfig[key as keyof SystemSettings]
		);

		if (changedFields.length > 0) {
			await this.auditService.createAuditLog({
				actorIdentifier: actor.id,
				actionType: 'UPDATE',
				targetType: 'SystemSettings',
				targetId: 'system',
				actorIp,
				details: {
					changedFields,
				},
			});
		}

		SettingsService.cacheSettings(result.config);
		return result.config;
	}

	/**
	 * Creates and saves the default system settings.
	 * This is called internally when no settings are found.
	 * @returns The newly created default settings.
	 */
	private async createDefaultSystemSettings(): Promise<SystemSettings> {
		const [result] = await db
			.insert(systemSettings)
			.values({ config: DEFAULT_SETTINGS })
			.returning();
		SettingsService.cacheSettings(result.config);
		return result.config;
	}
}
