/**
 * Build de l'outil de lecture d'une sauvegarde (src/tools/decrypt) : un seul fichier `build/stash-dechiffrer.html`,
 * JS et CSS intégrés, qui marche hors ligne ouvert depuis le disque. `npm run build` le produit après l'app.
 * Intégration par un petit plugin maison plutôt qu'une dépendance de build de plus (voir MEMORY.md).
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { type Plugin, defineConfig } from 'vite';

const OUTPUT = 'stash-dechiffrer.html';

const hash = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/**
 * Remplace les balises <script src> et <link rel=stylesheet> de Vite par leur contenu, et la CSP `__CSP__` par une
 * CSP qui n'autorise que ce script et ce style (empreintes), les images déchiffrées (blob:, data:) et aucun réseau.
 */
function singleFile(): Plugin {
	return {
		name: 'stash-single-file',
		apply: 'build',
		enforce: 'post',
		generateBundle(_, bundle) {
			const html = Object.values(bundle).find((item) => item.type === 'asset' && item.fileName.endsWith('.html'));
			if (!html || html.type !== 'asset') throw new Error('Page de l’outil introuvable dans le build.');
			let script = '';
			let style = '';
			for (const [key, item] of Object.entries(bundle)) {
				if (item.type === 'chunk') script += item.code;
				else if (item.fileName.endsWith('.css')) style += String(item.source);
				else continue;
				delete bundle[key];
			}
			// Dans un script intégré, « </script » fermerait la balise : on l'échappe (sans effet sur le JS).
			script = script.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
			const csp = [
				"default-src 'none'",
				`script-src ${hash(script)}`,
				`style-src ${hash(style)}`,
				'img-src blob: data:',
				// Ouverte depuis le disque, la page n'a pas d'origine (blob:null) : Chrome contrôle alors l'affichage d'une
				// image blob: par connect-src. blob: ne désigne que des données déjà en mémoire, aucun réseau.
				'connect-src blob:',
				"base-uri 'none'",
				"form-action 'none'",
				"object-src 'none'"
			].join('; ');
			const source = String(html.source);
			// Sans ce repère, la page partirait sans CSP, sans que rien ne le montre : le build échoue plutôt.
			if (source.split('__CSP__').length !== 2) throw new Error('Repère __CSP__ absent ou en double dans index.html.');
			const page = source
				.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>\s*/g, '')
				.replace(/<link\b[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*>\s*/g, '')
				.replace('__CSP__', csp)
				.replace('</head>', () => `<style>${style}</style>\n</head>`)
				.replace('</body>', () => `<script type="module">${script}</script>\n</body>`);
			// Le seul script et le seul style sont ceux intégrés : une balise externe restante échapperait aux empreintes.
			const outside = page.replace(/<script type="module">[\s\S]*<\/script>/, '').replace(/<style>[\s\S]*<\/style>/, '');
			if (/<script\b|<link\b[^>]*rel="stylesheet"|\ssrc=/i.test(outside))
				throw new Error('Script ou style externe resté dans la page de l’outil.');
			delete bundle[html.fileName];
			this.emitFile({ type: 'asset', fileName: OUTPUT, source: page });
		}
	};
}

export default defineConfig({
	root: fileURLToPath(new URL('./src/tools/decrypt', import.meta.url)),
	plugins: [
		tailwindcss(),
		svelte({ configFile: false, preprocess: vitePreprocess(), compilerOptions: { runes: true } }),
		singleFile()
	],
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	build: {
		outDir: fileURLToPath(new URL('./build', import.meta.url)),
		emptyOutDir: false,
		modulePreload: false,
		cssCodeSplit: false,
		// Une seule entrée sans import dynamique : un seul chunk, intégré par `singleFile`.
		assetsInlineLimit: Number.MAX_SAFE_INTEGER
	}
});
