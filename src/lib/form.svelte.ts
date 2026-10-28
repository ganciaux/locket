import { errorMessage } from './errors';

/**
 * État commun des formulaires : soumission, attente (PBKDF2 prend environ une seconde) et erreur.
 *
 *   const form = formAction(async () => { ... });
 *   <form onsubmit={form.submit}> … {form.error} … <button disabled={form.busy}>
 */
export function formAction(run: () => Promise<void>) {
	let busy = $state(false);
	let error = $state('');

	return {
		get busy() {
			return busy;
		},
		get error() {
			return error;
		},
		async submit(event: SubmitEvent) {
			event.preventDefault();
			if (busy) return;
			busy = true;
			error = '';
			try {
				await run();
			} catch (e) {
				error = errorMessage(e);
			} finally {
				busy = false;
			}
		}
	};
}
