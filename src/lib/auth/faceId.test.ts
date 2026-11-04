import { describe, expect, it } from 'vitest';
import { type FaceIdRecord, parseFaceIdRecord, serializeFaceIdRecord } from './faceId';

const record: FaceIdRecord = {
	uid: 'uid-1',
	credentialId: new Uint8Array([1, 2, 3]),
	wrappedDek: { iv: new Uint8Array(12).fill(7), data: new Uint8Array([9, 8, 7, 6]) }
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
