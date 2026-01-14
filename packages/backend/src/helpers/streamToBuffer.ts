export function streamToBuffer(
	stream: NodeJS.ReadableStream,
	maxBytes: number = Number.POSITIVE_INFINITY
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let finished = false;

		const onData = (chunk: Buffer) => {
			const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			totalBytes += bufferChunk.length;
			if (totalBytes > maxBytes) {
				finished = true;
				const destroy = (stream as NodeJS.ReadableStream & { destroy?: () => void })
					.destroy;
				if (destroy) {
					destroy.call(stream);
				}
				reject(new Error('Stream exceeded the maximum allowed size.'));
				return;
			}
			chunks.push(bufferChunk);
		};

		stream.on('data', onData);
		stream.on('error', (error) => {
			if (!finished) {
				reject(error);
			}
		});
		stream.on('end', () => {
			if (!finished) {
				resolve(Buffer.concat(chunks));
			}
		});
	});
}
