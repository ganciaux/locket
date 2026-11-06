// Lint : bugs courants, pièges de Svelte 5, et les invariants de sécurité de CLAUDE.md vérifiés automatiquement.
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
	{ ignores: ['build/', '.svelte-kit/', 'dev-dist/', 'test-results/', 'playwright-report/', '.firebase/'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// Les types sont vérifiés par svelte-check ; ESLint ne connaît pas les globaux de TypeScript.
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Pas de chemin de base (`paths.base`) : `resolve()` n'apporterait rien sur chaque lien.
			'svelte/no-navigation-without-resolve': 'off',
			// Signale toute Map/Set locale, même hors de l'état réactif (calculs, caches) : que des faux positifs ici.
			'svelte/prefer-svelte-reactivity': 'off',
			// Une chaîne entre accolades garde ses `\n` (placeholder sur plusieurs lignes).
			'svelte/no-useless-mustaches': ['error', { ignoreStringEscape: true }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parserOptions: { projectService: true, extraFileExtensions: ['.svelte'], parser: ts.parser, svelteConfig } }
	},
	{
		// Invariants de sécurité (CLAUDE.md) pour le code de l'application.
		files: ['src/**'],
		rules: {
			// Aucun `console.*` : une donnée déchiffrée, un mot de passe ou une clé ne doit jamais finir dans la console.
			'no-console': 'error',
			// Sa page hébergée par Firebase recevrait le vrai mot de passe : récupération par lien email + clé.
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'firebase/auth',
							importNames: ['sendPasswordResetEmail', 'confirmPasswordReset'],
							message: 'Interdit : la page de Firebase recevrait le vrai mot de passe (voir CLAUDE.md).'
						}
					]
				}
			],
			// Tout le code crypto vit dans src/lib/crypto/.
			'no-restricted-properties': [
				'error',
				{ object: 'crypto', property: 'subtle', message: 'Web Crypto uniquement dans src/lib/crypto/.' }
			],
			// CSP `style-src 'self'` : un style en ligne est bloqué ; passer par une classe ou le CSSOM.
			'svelte/no-inline-styles': 'error',
			// Pas de HTML brut : risque XSS.
			'svelte/no-at-html-tags': 'error'
		}
	},
	{ files: ['src/lib/crypto/**'], rules: { 'no-restricted-properties': 'off' } }
);
