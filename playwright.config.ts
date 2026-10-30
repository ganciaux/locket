/**
 * Tests de bout en bout : `npm run test:e2e`, qui démarre lui-même les émulateurs.
 * `--mode test` charge `.env.test` : l'app ne parle qu'aux émulateurs, jamais au vrai projet.
 * Chrome installé sur le poste : pas de navigateur à télécharger.
 */
import { defineConfig } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	expect: { timeout: 15_000 },
	workers: 1,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'retain-on-failure' },
	webServer: {
		command: `npx vite dev --mode test --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
