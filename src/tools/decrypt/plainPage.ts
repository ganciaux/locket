/**
 * Page en clair enregistrée par l'outil, sur action volontaire : la vue affichée, sans aucun script, images en data:.
 * Sa CSP n'autorise que son style (par empreinte) et ses images intégrées : elle ne charge rien et n'exécute rien.
 */
import { sha256 } from '$lib/crypto/crypto';
import { toBase64, utf8 } from '$lib/crypto/encoding';

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function plainPage({ title, body, css }: { title: string; body: string; css: string }): Promise<string> {
	const hash = toBase64(await sha256([utf8(css)]));
	const csp = `default-src 'none'; style-src 'sha256-${hash}'; img-src data:; base-uri 'none'; form-action 'none'`;
	return [
		'<!doctype html>',
		'<html lang="fr">',
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<meta http-equiv="Content-Security-Policy" content="${csp}">`,
		'<meta name="referrer" content="no-referrer">',
		`<title>${escapeHtml(title)}</title>`,
		`<style>${css}</style>`,
		'</head>',
		`<body class="bg-base-200">${body}</body>`,
		'</html>',
		''
	].join('\n');
}

/** Nom proposé : stash-en-clair-AAAA-MM-JJ.html */
export const plainFileName = (date: Date): string => `stash-en-clair-${date.toISOString().slice(0, 10)}.html`;
