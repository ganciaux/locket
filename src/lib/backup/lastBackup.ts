/**
 * Date de la dernière sauvegarde, partagée entre appareils : `users/{uid}/meta/backup` = { data }, JSON `{ lastAt }`
 * chiffré par la DEK (AAD `meta/backup`). Le rappel prend la plus récente de cette date et de celle de l'appareil
 * (reminder.ts) ; « Plus tard » reste propre à chaque appareil.
 * Facultative : illisible, absente ou refusée (règles pas encore déployées), on retombe sur la date de l'appareil.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { session } from '$lib/auth/session.svelte';
import { decryptJson, encryptJson } from '$lib/crypto/crypto';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { readBackupInfo, recordBackup } from './reminder';

const CONTEXT = 'meta/backup';
const ref = (uid: string) => doc(db, 'users', uid, 'meta', 'backup');

async function readShared(): Promise<number | undefined> {
	const { user, dek } = session;
	if (!user || !dek) return undefined;
	try {
		const snapshot = await getDoc(ref(user.uid));
		if (!snapshot.exists()) return undefined;
		const { lastAt } = await decryptJson<{ lastAt: unknown }>(dek, fromStored((snapshot.data() as { data: StoredEncrypted }).data), CONTEXT);
		return typeof lastAt === 'number' && Number.isFinite(lastAt) ? lastAt : undefined;
	} catch {
		return undefined;
	}
}

/** La plus récente des deux dates : celle de cet appareil et celle partagée. */
export async function lastBackupAt(): Promise<number | undefined> {
	const local = readBackupInfo().lastAt;
	const shared = await readShared();
	return local && shared ? Math.max(local, shared) : (local ?? shared);
}

/** Après un export complet : date gardée sur l'appareil et partagée (sans bloquer si l'écriture est refusée). */
export async function recordSharedBackup(now = Date.now()): Promise<void> {
	recordBackup(now);
	const { user, dek } = session;
	if (!user || !dek) return;
	try {
		await setDoc(ref(user.uid), { data: toStored(await encryptJson(dek, { lastAt: now }, CONTEXT)) });
	} catch {
		// Règles pas encore déployées ou réseau : la date reste au moins sur cet appareil.
	}
}
