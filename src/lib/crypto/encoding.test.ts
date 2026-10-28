import { describe, expect, it } from 'vitest';
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding';

describe('base64', () => {
	it('fait un aller-retour sur tous les octets', () => {
		const bytes = new Uint8Array(256).map((_, i) => i);
		expect(fromBase64(toBase64(bytes))).toEqual(bytes);
	});
});

describe('base32', () => {
	it('suit la RFC 4648 (sans padding)', () => {
		expect(toBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
	});

	it('fait un aller-retour et tolère tirets, espaces et minuscules', () => {
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		const text = toBase32(bytes).toLowerCase().replace(/(.{4})/g, '$1- ');
		expect(fromBase32(text)).toEqual(bytes);
	});

	it('rejette un caractère hors alphabet', () => {
		expect(() => fromBase32('ABC1')).toThrow();
	});
});
