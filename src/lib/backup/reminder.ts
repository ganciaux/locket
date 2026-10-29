/**
 * Rappel de sauvegarde, propre à chaque appareil (localStorage) : seules deux dates y sont gardées,
 * jamais de contenu. Le plan Spark ne sauvegarde pas Firestore : sans export, une erreur serait définitive.
 */
const STORAGE_KEY = 'locket.backup';
const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 30;
export const SNOOZE_DAYS = 7;

export type BackupInfo = { lastAt?: number; snoozedUntil?: number };

/** Rappel dû : jamais sauvegardé ou dernière sauvegarde trop ancienne, hors période « Plus tard ». */
export function isReminderDue(info: BackupInfo, now: number): boolean {
	if (info.snoozedUntil && now < info.snoozedUntil) return false;
	return !info.lastAt || now - info.lastAt >= REMIND_AFTER_DAYS * DAY_MS;
}

export const daysSince = (time: number, now: number): number => Math.floor((now - time) / DAY_MS);

export function readBackupInfo(): BackupInfo {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function write(info: BackupInfo): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
	} catch {
		// Stockage indisponible (navigation privée) : le rappel réapparaîtra.
	}
}

export const recordBackup = (now = Date.now()): void => write({ lastAt: now });

export const snoozeReminder = (now = Date.now()): void =>
	write({ ...readBackupInfo(), snoozedUntil: now + SNOOZE_DAYS * DAY_MS });
