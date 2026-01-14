import { api } from '$lib/server/api';
import { error, type NumericRange } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { IGetJobSchedulesResponse, IGetQueuesResponse } from '@open-archiver/types';

export const load: PageServerLoad = async (event) => {
	try {
		const [queuesResponse, schedulesResponse] = await Promise.all([
			api('/jobs/queues', event),
			api('/jobs/schedules', event),
		]);

		if (!queuesResponse.ok) {
			const responseText = await queuesResponse.json();
			throw error(
				queuesResponse.status as NumericRange<400, 599>,
				responseText.message || 'Failed to fetch job queues.'
			);
		}

		if (!schedulesResponse.ok) {
			const responseText = await schedulesResponse.json();
			throw error(
				schedulesResponse.status as NumericRange<400, 599>,
				responseText.message || 'Failed to fetch job schedules.'
			);
		}

		const queuesData: IGetQueuesResponse = await queuesResponse.json();
		const schedulesData: IGetJobSchedulesResponse = await schedulesResponse.json();

		return {
			queues: queuesData.queues,
			schedules: schedulesData.schedules,
		};
	} catch (e: any) {
		console.error('Failed to load job queues:', e);
		throw error(e.status || 500, e.body?.message || 'Failed to load job queues');
	}
};
