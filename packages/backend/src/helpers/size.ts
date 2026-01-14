export function parseByteSize(value: string | undefined, defaultValue: number): number;
export function parseByteSize(value: string | undefined, defaultValue?: number): number | undefined;
export function parseByteSize(
	value: string | undefined,
	defaultValue?: number
): number | undefined {
	if (!value) {
		return defaultValue;
	}

	const trimmed = value.trim();
	const unquoted =
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
			? trimmed.slice(1, -1)
			: trimmed;
	if (!unquoted) {
		return defaultValue;
	}

	if (unquoted.toLowerCase() === 'infinity') {
		return Number.POSITIVE_INFINITY;
	}

	const match = unquoted.match(/^(\d+(?:\.\d+)?)([kKmMgG])?$/);
	if (!match) {
		return defaultValue;
	}

	const number = parseFloat(match[1]);
	const unit = match[2]?.toLowerCase();
	const multiplier =
		unit === 'k' ? 1024 : unit === 'm' ? 1024 * 1024 : unit === 'g' ? 1024 ** 3 : 1;

	return Math.floor(number * multiplier);
}
