import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		// SPA : tout est rendu côté client (les données sont déchiffrées dans le navigateur).
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
