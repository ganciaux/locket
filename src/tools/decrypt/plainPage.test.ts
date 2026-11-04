import { describe, expect, it } from 'vitest';
import { sha256 } from '$lib/crypto/crypto';
import { toBase64, utf8 } from '$lib/crypto/encoding';
import { plainFileName, plainPage } from './plainPage';

describe('page en clair', () => {
	it('sans script : CSP qui n’autorise que son style (par empreinte) et des images data:', async () => {
		const css = '.a{color:red}';
		const page = await plainPage({ title: 'Stash <test>', body: '<main>Fiche</main>', css });
		const hash = toBase64(await sha256([utf8(css)]));
		expect(page).toContain(`content="default-src 'none'; style-src 'sha256-${hash}'; img-src data:;`);
		expect(page).toContain('<title>Stash &lt;test&gt;</title>');
		expect(page).toContain(`<style>${css}</style>`);
		expect(page).not.toMatch(/<script/i);
	});

	it('nom de fichier daté', () => {
		expect(plainFileName(new Date('2026-11-04T10:00:00Z'))).toBe('stash-en-clair-2026-11-04.html');
	});
});
