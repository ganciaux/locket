import { describe, expect, it } from 'vitest';
import { type FaceIdRecord, parseFaceIdRecord, passwordDue, serializeFaceIdRecord } from './faceId';

const record: FaceIdRecord = {
	uid: 'uid-1',
	credentialId: new Uint8Array([1, 2, 3]),
	wrappedDek: { iv: new Uint8Array(12).fill(7), data: new Uint8Array([9, 8, 7, 6]) },
	passwordAt: 1_700_000_000_000
};

describe('copie Face ID de l’appareil', () => {
	it('se relit telle quelle pour son compte', () => {
		expect(parseFaceIdRecord(serializeFaceIdRecord(record), 'uid-1')).toEqual(record);
	});

	it("est ignorée pour un autre compte", () => {
		expect(parseFaceIdRecord(serializeFaceIdRecord(record), 'uid-2')).toBeNull();
	});

	it('est ignorée si absente ou abîmée', () => {
		expect(parseFaceIdRecord(null, 'uid-1')).toBeNull();
		expect(parseFaceIdRecord('{', 'uid-1')).toBeNull();
		expect(parseFaceIdRecord(JSON.stringify({ uid: 'uid-1', credentialId: 'AQID' }), 'uid-1')).toBeNull();
	});
});

describe('mot de passe redemandé tous les 30 jours', () => {
	const DAY = 24 * 60 * 60 * 1000;
	const now = Date.UTC(2026, 10, 6);
	const at = (passwordAt: number) => ({ ...record, passwordAt });

	it('Face ID suffit pendant 30 jours après le mot de passe', () => {
		expect(passwordDue(at(now), now)).toBe(false);
		expect(passwordDue(at(now - 30 * DAY), now)).toBe(false);
	});

	it('au-delà, ou date inconnue (copie d’avant ce rappel), ou dans le futur : mot de passe', () => {
		expect(passwordDue(at(now - 30 * DAY - 1), now)).toBe(true);
		expect(passwordDue(at(0), now)).toBe(true);
		expect(passwordDue(at(now + DAY), now)).toBe(true);
	});

	it('la date est gardée avec la copie ; absente, elle vaut 0', () => {
		expect(parseFaceIdRecord(serializeFaceIdRecord(at(now)), 'uid-1')?.passwordAt).toBe(now);
		const old = JSON.stringify({ uid: 'uid-1', credentialId: 'AQID', iv: 'AQID', data: 'AQID' });
		expect(parseFaceIdRecord(old, 'uid-1')?.passwordAt).toBe(0);
	});
});
