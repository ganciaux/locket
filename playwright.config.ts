/**
 * Tests de bout en bout : `npm run test:e2e`, qui démarre lui-même les émulateurs.
 * `--mode test` charge `.env.test` : l'app ne parle qu'aux émulateurs, jamais au vrai projet.
 * Chrome installé sur le poste (et sur les runners GitHub) : pas de navigateur à télécharger. En CI : job `e2e` de ci.yml.
 */
import { defineConfig } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	expect: { timeout: 15_000 },
	workers: 1,
	// En CI : un `test.only` oublié fait échouer ; une relance absorbe un runner lent (le test reste signalé « flaky »).
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'retain-on-failure' },
	webServer: {
		command: `npx vite dev --mode test --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
