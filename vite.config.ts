import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
