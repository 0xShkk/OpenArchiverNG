import type { Request, Response } from 'express';
import { SettingsService } from '../../services/SettingsService';
import { UserService } from '../../services/UserService';
import { AuthorizationService } from '../../services/AuthorizationService';
import { z } from 'zod';
import { parseByteSize } from '../../helpers/size';
import type { SystemSettings } from '@open-archiver/types';

const settingsService = new SettingsService();
const userService = new UserService();
const authorizationService = new AuthorizationService();

const supportedLanguages = [
	'en',
	'es',
	'fr',
	'de',
	'it',
	'pt',
	'nl',
	'ja',
	'et',
	'el',
] as const;

const settingsUpdateSchema = z
	.object({
		language: z.enum(supportedLanguages).optional(),
		theme: z.enum(['light', 'dark', 'system']).optional(),
		supportEmail: z.string().email().nullable().optional(),
		allInclusiveArchive: z.boolean().optional(),
		enableDeletion: z.boolean().optional(),
		deleteFromSourceAfterArchive: z.boolean().optional(),
		maxEmailBytes: z.union([z.string(), z.number()]).optional(),
		maxPreviewBytes: z.union([z.string(), z.number()]).optional(),
		maxAttachmentBytes: z.union([z.string(), z.number()]).optional(),
		legalHoldNoticeReminderDays: z.union([z.string(), z.number()]).optional(),
	})
	.strict();

const parseOptionalByteSize = (
	value: string | number | undefined,
	fieldName: string
): number | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'number') {
		if (value === Number.POSITIVE_INFINITY || (Number.isFinite(value) && value > 0)) {
			return value;
		}
		throw new Error(`Invalid ${fieldName} value.`);
	}
	const parsed = parseByteSize(value, undefined);
	if (parsed === Number.POSITIVE_INFINITY || (typeof parsed === 'number' && parsed > 0)) {
		return parsed;
	}
	throw new Error(`Invalid ${fieldName} value.`);
};

const parseOptionalInt = (
	value: string | number | undefined,
	fieldName: string
): number | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const parsed =
		typeof value === 'number'
			? value
			: Number.isFinite(Number(value))
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
		throw new Error(`Invalid ${fieldName} value.`);
	}
	return parsed;
};

export const getSystemSettings = async (req: Request, res: Response) => {
	try {
		const settings = await settingsService.getSystemSettings();
		res.status(200).json(settings);
	} catch (error) {
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToRetrieve') });
	}
};

export const getSystemSettingsAccess = async (req: Request, res: Response) => {
	try {
		if (!req.user || !req.user.sub) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const canManage = await authorizationService.can(req.user.sub, 'manage', 'settings');
		return res.status(200).json({ canManage });
	} catch (error) {
		return res.status(500).json({ message: req.t('errors.internalServerError') });
	}
};

export const updateSystemSettings = async (req: Request, res: Response) => {
	try {
		// Basic validation can be performed here if necessary
		if (!req.user || !req.user.sub) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const actor = await userService.findById(req.user.sub);
		if (!actor) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const parsed = settingsUpdateSchema.parse(req.body);
		const updatePayload: Partial<SystemSettings> = {};

		if (parsed.language !== undefined) {
			updatePayload.language = parsed.language;
		}
		if (parsed.theme !== undefined) {
			updatePayload.theme = parsed.theme;
		}
		if (parsed.supportEmail !== undefined) {
			updatePayload.supportEmail = parsed.supportEmail;
		}
		if (parsed.allInclusiveArchive !== undefined) {
			updatePayload.allInclusiveArchive = parsed.allInclusiveArchive;
		}
		if (parsed.enableDeletion !== undefined) {
			updatePayload.enableDeletion = parsed.enableDeletion;
		}
		if (parsed.deleteFromSourceAfterArchive !== undefined) {
			updatePayload.deleteFromSourceAfterArchive = parsed.deleteFromSourceAfterArchive;
		}
		if (parsed.legalHoldNoticeReminderDays !== undefined) {
			updatePayload.legalHoldNoticeReminderDays = parseOptionalInt(
				parsed.legalHoldNoticeReminderDays,
				'legalHoldNoticeReminderDays'
			);
		}

		const maxEmailBytes = parseOptionalByteSize(
			parsed.maxEmailBytes,
			'maxEmailBytes'
		);
		if (maxEmailBytes !== undefined) {
			updatePayload.maxEmailBytes = maxEmailBytes;
		}

		const maxPreviewBytes = parseOptionalByteSize(
			parsed.maxPreviewBytes,
			'maxPreviewBytes'
		);
		if (maxPreviewBytes !== undefined) {
			updatePayload.maxPreviewBytes = maxPreviewBytes;
		}

		const maxAttachmentBytes = parseOptionalByteSize(
			parsed.maxAttachmentBytes,
			'maxAttachmentBytes'
		);
		if (maxAttachmentBytes !== undefined) {
			updatePayload.maxAttachmentBytes = maxAttachmentBytes;
		}

		const updatedSettings = await settingsService.updateSystemSettings(
			updatePayload,
			actor,
			req.ip || 'unknown'
		);
		res.status(200).json(updatedSettings);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res
				.status(400)
				.json({ message: 'Invalid settings payload.', errors: error.message });
		}
		if (error instanceof Error && error.message.startsWith('Invalid')) {
			return res.status(400).json({ message: error.message });
		}
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToUpdate') });
	}
};
