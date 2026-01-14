import { createHash } from 'crypto';
import path from 'path';

const DEFAULT_MAX_SEGMENT_LENGTH = 80;

const stripNonAscii = (value: string): string => value.replace(/[^\x20-\x7E]/g, '');

export const sanitizePathSegment = (
	input: string,
	fallback = 'unknown',
	maxLength = DEFAULT_MAX_SEGMENT_LENGTH
): string => {
	const normalized = stripNonAscii(String(input || '')).trim();
	if (!normalized) {
		return fallback;
	}

	const replaced = normalized.replace(/[\\/]/g, '-').replace(/[:*?"<>|]/g, '-');
	const collapsed = replaced.replace(/\s+/g, '-').replace(/-+/g, '-');
	const trimmed = collapsed.replace(/^[-.]+|[-.]+$/g, '');
	const sliced = trimmed.slice(0, maxLength);

	return sliced || fallback;
};

export const sanitizeMailboxPath = (mailboxPath?: string | null): string => {
	if (!mailboxPath) {
		return '';
	}
	const parts = mailboxPath.split(/[\\/]/);
	const safeParts = parts
		.map((part) => sanitizePathSegment(part, 'folder'))
		.filter((part) => part.length > 0);
	return safeParts.join('/');
};

export const buildEmailStorageFilename = (messageId: string): string => {
	const hash = createHash('sha256').update(messageId).digest('hex');
	return `${hash}.eml`;
};

export const sanitizeFilename = (filename: string | undefined, fallback = 'file'): string => {
	const name = filename || '';
	const ext = path.extname(name);
	const base = ext ? name.slice(0, -ext.length) : name;
	const safeBase = sanitizePathSegment(base, fallback);
	const safeExt = ext ? sanitizePathSegment(ext.replace('.', ''), '') : '';
	return safeExt ? `${safeBase}.${safeExt}` : safeBase;
};

export const buildSourceFolderName = (name: string, id: string): string => {
	return `${sanitizePathSegment(name, 'source')}-${id}`;
};
