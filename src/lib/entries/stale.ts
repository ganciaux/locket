/**
 * Écrasement entre appareils : une écriture part de la copie en mémoire. Si un autre appareil a écrit depuis son
 * chargement (jeton `meta/version` des fiches, IV d'un catalogue, voir repository.ts et catalog.ts), elle est refusée
 * plutôt que d'effacer ses changements sans le dire ; les données sont relues et l'utilisateur recommence.
 */
export class StaleDataError extends Error {
	constructor() {
		super('Vos fiches ont été modifiées depuis un autre appareil : elles viennent d’être relues. Recommencez.');
		this.name = 'StaleDataError';
	}
}

let onStale: (() => void) | null = null;

/** Le store s'y inscrit pour relire les données. */
export function whenStale(callback: () => void): void {
	onStale = callback;
}

/** Exécute une écriture ; si elle est refusée pour cause de données périmées, prévient le store avant de relever l'erreur. */
export async function guardStale<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (e) {
		if (e instanceof StaleDataError) onStale?.();
		throw e;
	}
}
