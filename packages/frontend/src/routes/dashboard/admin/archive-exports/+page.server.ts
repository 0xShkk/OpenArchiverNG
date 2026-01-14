import { api } from '$lib/server/api';
import { error, type NumericRange } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PaginatedArchiveExportJobs } from '@open-archiver/types';

export const load: PageServerLoad = async (event) => {
	try {
		const page = parseInt(event.url.searchParams.get('page') ?? '1', 10) || 1;
		const limit = parseInt(event.url.searchParams.get('limit') ?? '20', 10) || 20;
		const response = await api(`/archive-exports?page=${page}&limit=${limit}`, event);
		if (!response.ok) {
			const responseText = await response.json();
			throw error(
				response.status as NumericRange<400, 599>,
				responseText.message || 'Failed to fetch archive exports.'
			);
		}

		const exportJobs: PaginatedArchiveExportJobs = await response.json();
		return {
			exportJobs,
		};
	} catch (e: any) {
		console.error('Failed to load archive exports:', e);
		throw error(e.status || 500, e.body?.message || 'Failed to load archive exports');
	}
};
