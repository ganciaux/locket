/**
 * Copie locale (IndexedDB) des fiches telles que stockées dans Firestore : chiffrés uniquement, jamais de clé ni de
 * donnée déchiffrée, jamais d'image complète. Conservée au verrouillage, effacée à la déconnexion.
 * Le jeton dit à quelle version de Firestore correspond la copie (voir `commitEntries`, repository.ts).
 * Ce n'est qu'un cache : toute erreur (navigation privée, stockage vidé par Safari) revient à ne pas en avoir.
 */
import type { Encrypted } from '$lib/crypto/crypto';

export type CachedEntry = { id: string; data: Encrypted; thumb?: Encrypted };
export type CacheChanges = { put?: CachedEntry[]; patch?: (Pick<CachedEntry, 'id'> & Partial<CachedEntry>)[]; remove?: string[] };
type CacheState = { uid: string; token: string; filledAt: number };

// Filet si une écriture n'a pas changé le jeton (ancienne version de l'app sur un autre appareil) : relecture complète.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ENTRIES = 'entries';
const STATE = 'state';
const STATE_KEY = 'current';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

const finished = (tx: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = tx.onabort = () => reject(tx.error);
	});

function open(): Promise<IDBDatabase> {
	const req = indexedDB.open('stash-cache', 1);
	req.onupgradeneeded = () => {
		req.result.createObjectStore(ENTRIES, { keyPath: 'id' });
		req.result.createObjectStore(STATE);
	};
	return request(req);
}

async function withCache<T>(fallback: T, use: (cache: IDBDatabase) => Promise<T>): Promise<T> {
	try {
		const cache = await open();
		try {
			return await use(cache);
		} finally {
			cache.close();
		}
	} catch {
		return fallback;
	}
}

const readState = (tx: IDBTransaction): Promise<CacheState | undefined> => request(tx.objectStore(STATE).get(STATE_KEY));

export const cachedToken = (uid: string): Promise<string | null> =>
	withCache(null, async (cache) => {
		const state = await readState(cache.transaction(STATE));
		return state?.uid === uid ? state.token : null;
	});

/** Les fiches en cache, ou null si elles sont trop anciennes ou ne correspondent pas exactement à ce compte et à ce jeton. */
export const readCache = (uid: string, token: string): Promise<CachedEntry[] | null> =>
	withCache(null, async (cache) => {
		const tx = cache.transaction([ENTRIES, STATE]);
		const state = await readState(tx);
		if (state?.uid !== uid || state.token !== token || Date.now() - state.filledAt > MAX_AGE_MS) return null;
		return request<CachedEntry[]>(tx.objectStore(ENTRIES).getAll());
	});

export const fillCache = (uid: string, token: string, list: CachedEntry[]): Promise<void> =>
	withCache(undefined, async (cache) => {
		const tx = cache.transaction([ENTRIES, STATE], 'readwrite');
		const store = tx.objectStore(ENTRIES);
		store.clear();
		list.forEach((entry) => store.put(entry));
		tx.objectStore(STATE).put({ uid, token, filledAt: Date.now() } satisfies CacheState, STATE_KEY);
		await finished(tx);
	});

/** Passe du jeton `from` à `to` ; si la copie n'est plus à `from`, elle est vidée plutôt que mélangée. */
export const applyToCache = (uid: string, from: string, to: string, changes: CacheChanges): Promise<void> =>
	withCache(undefined, async (cache) => {
		const tx = cache.transaction([ENTRIES, STATE], 'readwrite');
		const store = tx.objectStore(ENTRIES);
		const state = await readState(tx);
		if (state?.uid !== uid || state.token !== from) {
			store.clear();
			tx.objectStore(STATE).delete(STATE_KEY);
		} else {
			changes.put?.forEach((entry) => store.put(entry));
			changes.remove?.forEach((id) => store.delete(id));
			for (const fields of changes.patch ?? []) {
				const entry = await request<CachedEntry | undefined>(store.get(fields.id));
				if (entry) store.put({ ...entry, ...fields });
			}
			tx.objectStore(STATE).put({ ...state, token: to } satisfies CacheState, STATE_KEY);
		}
		await finished(tx);
	});

export const clearCache = (): Promise<void> =>
	withCache(undefined, async (cache) => {
		const tx = cache.transaction([ENTRIES, STATE], 'readwrite');
		tx.objectStore(ENTRIES).clear();
		tx.objectStore(STATE).clear();
		await finished(tx);
	});
