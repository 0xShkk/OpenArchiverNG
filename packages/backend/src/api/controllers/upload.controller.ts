import { Request, Response } from 'express';
import { StorageService } from '../../services/StorageService';
import { randomUUID } from 'crypto';
import busboy from 'busboy';
import { config } from '../../config/index';
import { parseByteSize } from '../../helpers/size';
import { sanitizeFilename } from '../../helpers/storagePath';

export const uploadFile = async (req: Request, res: Response) => {
	const storage = new StorageService();
	const maxFileSize = parseByteSize(process.env.BODY_SIZE_LIMIT);
	const limits =
		typeof maxFileSize === 'number' && Number.isFinite(maxFileSize)
			? { fileSize: maxFileSize }
			: undefined;
	const bb = busboy({ headers: req.headers, limits });
	const uploads: Promise<void>[] = [];
	let filePath = '';
	let originalFilename = '';
	let uploadError: Error | null = null;
	let responded = false;

	bb.on('file', (fieldname, file, info) => {
		const incomingFilename = typeof info === 'string' ? info : info.filename;
		originalFilename = sanitizeFilename(incomingFilename, 'upload');
		const uuid = randomUUID();
		filePath = `${config.storage.openArchiverFolderName}/tmp/${uuid}-${originalFilename}`;
		uploads.push(storage.put(filePath, file));

		file.on('limit', () => {
			uploadError = new Error('Uploaded file exceeds the configured size limit.');
			file.unpipe();
			file.resume();
		});
		file.on('error', (error) => {
			uploadError = error instanceof Error ? error : new Error('File upload failed.');
		});
	});

	bb.on('error', (error) => {
		if (responded) return;
		responded = true;
		const message = error instanceof Error ? error.message : 'File upload failed';
		res.status(400).json({ message });
	});

	bb.on('finish', async () => {
		if (responded) return;
		if (uploadError) {
			responded = true;
			return res.status(413).json({ message: uploadError.message });
		}
		if (!filePath) {
			responded = true;
			return res.status(400).json({ message: 'No file received for upload.' });
		}
		try {
			await Promise.all(uploads);
		} catch (error) {
			responded = true;
			const message = error instanceof Error ? error.message : 'File upload failed';
			return res.status(500).json({ message });
		}
		responded = true;
		res.json({ filePath });
	});

	req.pipe(bb);
};
