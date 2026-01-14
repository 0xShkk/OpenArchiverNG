import { simpleParser, ParsedMail } from 'mailparser';

export const HEADER_MAX_BYTES = 256 * 1024;

const sliceHeaders = (emlBuffer: Buffer): Buffer => {
	const delimiterCrlf = Buffer.from('\r\n\r\n');
	const delimiterLf = Buffer.from('\n\n');
	let index = emlBuffer.indexOf(delimiterCrlf);
	let delimiterLength = delimiterCrlf.length;

	if (index < 0) {
		index = emlBuffer.indexOf(delimiterLf);
		delimiterLength = delimiterLf.length;
	}

	const end = index >= 0 ? index + delimiterLength : Math.min(emlBuffer.length, HEADER_MAX_BYTES);
	return emlBuffer.subarray(0, Math.min(end, HEADER_MAX_BYTES));
};

export const parseEmailWithLimit = async (
	emlBuffer: Buffer,
	maxBytes: number,
	totalSize: number = emlBuffer.length
): Promise<{ parsedEmail: ParsedMail; isTruncated: boolean }> => {
	if (totalSize <= maxBytes) {
		const parsedEmail = await simpleParser(emlBuffer);
		return { parsedEmail, isTruncated: false };
	}

	const headerBuffer = sliceHeaders(emlBuffer);
	const parsedEmail = await simpleParser(headerBuffer);
	return { parsedEmail, isTruncated: true };
};
