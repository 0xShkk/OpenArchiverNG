<script lang="ts">
	import type { Email } from 'postal-mime';
	import type { Buffer } from 'buffer';
	import { t } from '$lib/translations';
	import { encode } from 'html-entities';
	import { browser } from '$app/environment';

	let {
		raw,
		rawHtml,
	}: { raw?: Buffer | { type: 'Buffer'; data: number[] } | undefined; rawHtml?: string } =
		$props();

	let parsedEmail: Email | null = $state(null);
	let isLoading = $state(true);

	const sanitizeEmailHtml = (html: string): string => {
		if (!browser) {
			return '';
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const blockedTags = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'form'];

		for (const tag of blockedTags) {
			doc.querySelectorAll(tag).forEach((node) => node.remove());
		}

		doc.querySelectorAll('*').forEach((node) => {
			for (const attr of Array.from(node.attributes)) {
				const name = attr.name.toLowerCase();
				const value = attr.value?.trim() || '';

				if (name.startsWith('on')) {
					node.removeAttribute(attr.name);
					continue;
				}

				if (name === 'src' || name === 'href' || name === 'xlink:href') {
					const lowered = value.toLowerCase();
					if (
						lowered.startsWith('javascript:') ||
						lowered.startsWith('data:text/html') ||
						lowered.startsWith('data:application')
					) {
						node.removeAttribute(attr.name);
					}
				}
			}

			if (node.tagName.toLowerCase() === 'a') {
				node.setAttribute('rel', 'noopener noreferrer');
			}
		});

		return doc.body.innerHTML;
	};

	const buildEmailHtml = (content: string): string => {
		const csp =
			"<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: http: https: cid:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'\" />";
		const base = '<base target="_blank" rel="noopener noreferrer" />';
		return `${csp}${base}${content}`;
	};

	// By adding a <base> tag, all relative and absolute links in the HTML document
	// will open in a new tab by default.
	let emailHtml = $derived(() => {
		if (parsedEmail && parsedEmail.html) {
			const safeHtml = sanitizeEmailHtml(parsedEmail.html);
			return safeHtml ? buildEmailHtml(safeHtml) : null;
		} else if (parsedEmail && parsedEmail.text) {
			// display raw text email body in html
			const safeHtmlContent: string = encode(parsedEmail.text);
			return buildEmailHtml(`<div>${safeHtmlContent.replaceAll('\n', '<br>')}</div>`);
		} else if (rawHtml) {
			const safeHtml = sanitizeEmailHtml(rawHtml);
			return safeHtml ? buildEmailHtml(safeHtml) : null;
		}
		return null;
	});

	$effect(() => {
		async function parseEmail() {
			if (raw) {
				try {
					const { default: PostalMime } = await import('postal-mime');
					let buffer: Uint8Array;
					if ('type' in raw && raw.type === 'Buffer') {
						buffer = new Uint8Array(raw.data);
					} else {
						buffer = new Uint8Array(raw as Buffer);
					}
					const parsed = await new PostalMime().parse(buffer);
					parsedEmail = parsed;
				} catch (error) {
					console.error('Failed to parse email:', error);
				} finally {
					isLoading = false;
				}
			} else {
				isLoading = false;
			}
		}
		parseEmail();
	});
</script>

<div class="mt-2 rounded-md border bg-white p-4">
	{#if isLoading}
		<p>{$t('app.components.email_preview.loading')}</p>
	{:else if emailHtml()}
		<iframe
			title={$t('app.archive.email_preview')}
			srcdoc={emailHtml()}
			class="h-[600px] w-full border-none"
			sandbox="allow-popups allow-popups-to-escape-sandbox"
			referrerpolicy="no-referrer"
		></iframe>
	{:else if raw}
		<p>{$t('app.components.email_preview.render_error')}</p>
	{:else}
		<p class="text-gray-500">{$t('app.components.email_preview.not_available')}</p>
	{/if}
</div>
