/** Octets adossés à un ArrayBuffer (type attendu par Web Crypto en TS 5.7+). */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (text: string): Bytes => encoder.encode(text) as Bytes;
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

export function fromBase64(text: string): Bytes {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// Base32 RFC 4648 sans padding : lisible et sans ambiguïté de casse pour la clé de récupération.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase32(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out;
}

/** Tolère minuscules, espaces et tirets (saisie manuelle). */
export function fromBase32(text: string): Bytes {
	const clean = text.toUpperCase().replace(/[\s-]/g, '');
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		const index = BASE32.indexOf(char);
		if (index === -1) throw new Error('Caractère invalide');
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return new Uint8Array(out);
}
