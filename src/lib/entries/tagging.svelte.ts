/**
 * Mode Tagger : file de fiches figée au démarrage (depuis l'index), fiche affichée et fiches enregistrées.
 * En mémoire seulement, vidée au verrouillage ; ne contient que des identifiants.
 */
import { onLock } from '$lib/auth/session.svelte';

type Tagging = { ids: string[]; currentId: string; done: string[] };

let state = $state.raw<Tagging | null>(null);

export const tagging = {
	get current() {
		return state;
	}
};

export function startTagging(ids: string[]): void {
	state = ids.length ? { ids, currentId: ids[0], done: [] } : null;
}

export function showTagged(id: string): void {
	if (state?.ids.includes(id)) state = { ...state, currentId: id };
}

export function markTagged(id: string): void {
	if (state && !state.done.includes(id)) state = { ...state, done: [...state.done, id] };
}

export function stopTagging(): void {
	state = null;
}

onLock(() => (state = null));
