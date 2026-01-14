import i18next from 'i18next';
import { db } from '../database';
import { archivedEmails } from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { SettingsService } from '../services/SettingsService';

const settingsService = new SettingsService();

export async function checkDeletionEnabled() {
	const settings = await settingsService.getSystemSettings();
	if (!settings.enableDeletion) {
		const errorMessage = i18next.t('Deletion is disabled for this instance.');
		throw new Error(errorMessage);
	}
}

export function assertEmailNotOnLegalHold(isOnLegalHold: boolean) {
	if (isOnLegalHold) {
		throw new Error('Archived email is on legal hold and cannot be deleted.');
	}
}

export async function assertIngestionSourceNotOnLegalHold(sourceId: string): Promise<void> {
	const heldEmail = await db.query.archivedEmails.findFirst({
		where: and(
			eq(archivedEmails.ingestionSourceId, sourceId),
			eq(archivedEmails.isOnLegalHold, true)
		),
		columns: { id: true },
	});
	if (heldEmail) {
		throw new Error('Cannot delete ingestion source with emails on legal hold.');
	}
}
