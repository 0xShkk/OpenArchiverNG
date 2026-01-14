export const normalizeCronPattern = (value: string | undefined, fallback = '* * * * *'): string => {
	const trimmed = String(value || '').trim();
	if (!trimmed) {
		return fallback;
	}
	const unquoted =
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
			? trimmed.slice(1, -1).trim()
			: trimmed;
	const parts = unquoted.split(/\s+/).filter(Boolean);
	return parts.length === 5 ? parts.join(' ') : fallback;
};

export const isValidCronPattern = (value: string | undefined): boolean => {
	const trimmed = String(value || '').trim();
	if (!trimmed) {
		return false;
	}
	const unquoted =
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
			? trimmed.slice(1, -1).trim()
			: trimmed;
	const parts = unquoted.split(/\s+/).filter(Boolean);
	return parts.length === 5;
};
