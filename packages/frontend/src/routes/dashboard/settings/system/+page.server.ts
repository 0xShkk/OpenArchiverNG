import { api } from '$lib/server/api';
import type { SystemSettings } from '@open-archiver/types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const [settingsResponse, accessResponse] = await Promise.all([
		api('/settings/system', event),
		api('/settings/system/access', event),
	]);

	if (!settingsResponse.ok) {
		const { message } = await settingsResponse.json();
		throw error(settingsResponse.status, message || 'Failed to fetch system settings');
	}

	const systemSettings: SystemSettings = await settingsResponse.json();
	let canManageSettings = false;
	if (accessResponse.ok) {
		const access = (await accessResponse.json()) as { canManage?: boolean };
		canManageSettings = Boolean(access?.canManage);
	}
	return {
		systemSettings,
		canManageSettings,
	};
};
