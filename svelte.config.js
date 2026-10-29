import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// `vite dev` uniquement : l'app parle aux émulateurs Auth et Firestore, absents de la CSP de prod.
const EMULATORS = process.argv.includes('dev') ? ['http://127.0.0.1:9099', 'http://127.0.0.1:8080'] : [];

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		// SPA : tout est rendu côté client (les données sont déchiffrées dans le navigateur).
		adapter: adapter({ fallback: 'index.html' }),
		// CSP en <meta> dans index.html : SvelteKit y ajoute à chaque build le hash de son script de démarrage.
		// Seuls nos fichiers et les API Firebase sont autorisés ; frame-ancestors (ignoré en <meta>) est dans firebase.json.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self'],
				'img-src': ['self', 'blob:'],
				'connect-src': [
					'self',
					'https://firestore.googleapis.com',
					'https://identitytoolkit.googleapis.com',
					'https://securetoken.googleapis.com',
					...EMULATORS
				],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
