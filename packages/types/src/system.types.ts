import type { JobScheduleSettingsMap } from './jobs.types';

export type SupportedLanguage =
	| 'en' // English
	| 'es' // Spanish
	| 'fr' // French
	| 'de' // German
	| 'it' // Italian
	| 'pt' // Portuguese
	| 'nl' // Dutch
	| 'ja' // Japanese
	| 'et' // Estonian
	| 'el'; // Greek

export type Theme = 'light' | 'dark' | 'system';

export interface SystemSettings {
	/** The default display language for the application UI. */
	language: SupportedLanguage;

	/** The default color theme for the application. */
	theme: Theme;

	/** A public-facing email address for user support inquiries. */
	supportEmail: string | null;

	/** Whether to include Junk/Trash folders in IMAP ingestion. */
	allInclusiveArchive: boolean;

	/** Max size allowed for parsing emails (bytes). */
	maxEmailBytes: number;

	/** Max size allowed for raw preview loading (bytes). */
	maxPreviewBytes: number;

	/** Max size allowed for attachment text extraction (bytes). */
	maxAttachmentBytes: number;

	/** Days before sending legal hold notice reminders. */
	legalHoldNoticeReminderDays: number;

	/** Allow permanent deletion of emails and ingestion sources. */
	enableDeletion: boolean;

	/** Delete emails from the source mailbox after successful archiving. */
	deleteFromSourceAfterArchive: boolean;

	/** Repeatable job schedules configured by administrators. */
	jobSchedules?: JobScheduleSettingsMap;
}
