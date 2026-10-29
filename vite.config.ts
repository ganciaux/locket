import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		// Le service worker ne met en cache que l'app (HTML, JS, CSS, icônes) : jamais de données,
		// qui restent dans Firestore (autre domaine) et ne sont déchiffrées qu'en mémoire.
		SvelteKitPWA({
			registerType: 'prompt', // pas de rechargement surprise : il effacerait la DEK en pleine saisie
			kit: { adapterFallback: 'index.html', spa: true },
			manifest: {
				name: 'Wanted Archive',
				short_name: 'Wanted Archive',
				description: 'Vos fiches chiffrées de bout en bout.',
				lang: 'fr',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#1c1917',
				theme_color: '#96101b',
				icons: [
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,html,svg,png,jpg,webmanifest}'],
				// Chemins réservés de Firebase Hosting (/__/auth/...) : jamais servis par l'app.
				navigateFallbackDenylist: [/^\/__\//]
			}
		})
	],
	test: {
		environment: 'node',
		projects: [
			{
				extends: true,
				test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.emulator.test.ts'] }
			},
			// Exige `npm run emulators` dans un autre terminal.
			{ extends: true, test: { name: 'emulators', include: ['src/**/*.emulator.test.ts'] } }
		]
	}
});
