/**
 * Initialisation Firebase. En mode émulateur, projet fictif `demo-locket` :
 * aucun appel au vrai projet, quelle que soit la config de `.env.local`.
 */
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_APP_ID,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_USE_EMULATORS
} from '$env/static/public';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { Bytes, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { Encrypted } from './crypto/crypto';

export const USE_EMULATORS = PUBLIC_USE_EMULATORS === 'true';
const EMULATOR_PROJECT_ID = 'demo-locket';
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const app = initializeApp(
	USE_EMULATORS
		? { apiKey: 'demo-api-key', projectId: EMULATOR_PROJECT_ID }
		: {
				apiKey: PUBLIC_FIREBASE_API_KEY,
				authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: PUBLIC_FIREBASE_PROJECT_ID,
				appId: PUBLIC_FIREBASE_APP_ID
			}
);

export const auth = getAuth(app);
export const db = getFirestore(app);
auth.languageCode = 'fr';

if (USE_EMULATORS) {
	connectAuthEmulator(auth, AUTH_EMULATOR_URL);
	connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// ---------------------------------------------------------------------------
// Chiffrés dans Firestore : uniquement le type Bytes, jamais de base64.

export type StoredEncrypted = { iv: Bytes; data: Bytes };

export const toStored = (encrypted: Encrypted): StoredEncrypted => ({
	iv: Bytes.fromUint8Array(encrypted.iv),
	data: Bytes.fromUint8Array(encrypted.data)
});

export const fromStored = (stored: StoredEncrypted): Encrypted => ({
	iv: new Uint8Array(stored.iv.toUint8Array()),
	data: new Uint8Array(stored.data.toUint8Array())
});

// ---------------------------------------------------------------------------
// Émulateur uniquement : l'émulateur n'envoie pas d'email, et son lien mène à sa propre page
// de réinitialisation (interdite ici). On lit le code via son API REST pour viser /action.

export async function emulatorResetLink(email: string): Promise<string | null> {
	if (!USE_EMULATORS) return null;
	const response = await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/oobCodes`);
	const { oobCodes = [] } = (await response.json()) as {
		oobCodes?: { email: string; oobCode: string; requestType: string }[];
	};
	const last = oobCodes.findLast((c) => c.requestType === 'PASSWORD_RESET' && c.email === email);
	return last ? `/action?mode=resetPassword&oobCode=${encodeURIComponent(last.oobCode)}` : null;
}
