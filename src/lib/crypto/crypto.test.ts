import { beforeAll, describe, expect, it } from 'vitest';
import {
	decrypt,
	decryptJson,
	deriveKeys,
	deriveRecoveryKek,
	encrypt,
	encryptJson,
	generateDek,
	generateRecoveryKey,
	normalizeEmail,
	rewrapDek,
	sha256,
	unwrapDek,
	wrapDek,
	type DerivedKeys
} from './crypto';
import { utf8 } from './encoding';

// PBKDF2 600k est volontairement lent : on dérive une seule fois par jeu d'identifiants.
let alice: DerivedKeys;
let aliceUpper: DerivedKeys;
let aliceOtherPassword: DerivedKeys;
let bob: DerivedKeys;

beforeAll(async () => {
	[alice, aliceUpper, aliceOtherPassword, bob] = await Promise.all([
		deriveKeys('correct horse', 'alice@example.com'),
		deriveKeys('correct horse', '  Alice@Example.COM '),
		deriveKeys('battery staple', 'alice@example.com'),
		deriveKeys('correct horse', 'bob@example.com')
	]);
}, 60_000);

describe('sha256', () => {
	it('suit le vecteur de test du NIST, morceaux mis bout à bout', async () => {
		const hash = await sha256([utf8('a'), utf8('bc')]);
		expect(Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});

describe('normalizeEmail', () => {
	it('supprime les espaces et met en minuscules', () => {
		expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
	});
});

describe('deriveKeys', () => {
	it('est déterministe et insensible à la casse de l’email', () => {
		expect(aliceUpper.authToken).toBe(alice.authToken);
	});

	it('dépend du mot de passe et du sel (email)', () => {
		expect(aliceOtherPassword.authToken).not.toBe(alice.authToken);
		expect(bob.authToken).not.toBe(alice.authToken);
	});

	it('produit un jeton de 256 bits en base64 et une KEK non extractible', () => {
		expect(atob(alice.authToken)).toHaveLength(32);
		expect(alice.kek.extractable).toBe(false);
		expect(alice.kek.usages.sort()).toEqual(['unwrapKey', 'wrapKey']);
	});

	it('sépare KEK et jeton : le jeton ne permet pas de déballer la DEK', async () => {
		const dek = await generateDek();
		const wrapped = await wrapDek(dek, alice.kek);
		const tokenAsKey = await crypto.subtle.importKey(
			'raw',
			Uint8Array.from(atob(alice.authToken), (c) => c.charCodeAt(0)),
			'AES-GCM',
			false,
			['unwrapKey']
		);
		await expect(unwrapDek(wrapped, tokenAsKey)).rejects.toThrow();
	});
});

describe('DEK', () => {
	it('se déballe en clé non extractible avec la bonne KEK', async () => {
		const dek = await generateDek();
		const wrapped = await wrapDek(dek, alice.kek);
		const unwrapped = await unwrapDek(wrapped, alice.kek);

		expect(unwrapped.extractable).toBe(false);
		const encrypted = await encrypt(dek, utf8('secret'), 'ctx');
		expect(await decrypt(unwrapped, encrypted, 'ctx')).toEqual(utf8('secret'));
	});

	it('refuse une mauvaise KEK', async () => {
		const wrapped = await wrapDek(await generateDek(), alice.kek);
		await expect(unwrapDek(wrapped, aliceOtherPassword.kek)).rejects.toThrow();
	});

	it('changement de mot de passe : réemballage sans rechiffrer les données', async () => {
		const dek = await generateDek();
		const encrypted = await encryptJson(dek, { nom: 'Fiche' }, 'e1/data');
		const oldWrapped = await wrapDek(dek, alice.kek);

		const newWrapped = await rewrapDek(oldWrapped, alice.kek, aliceOtherPassword.kek);
		const dekAfter = await unwrapDek(newWrapped, aliceOtherPassword.kek);

		expect(await decryptJson(dekAfter, encrypted, 'e1/data')).toEqual({ nom: 'Fiche' });
		await expect(unwrapDek(newWrapped, alice.kek)).rejects.toThrow();
	});
});

describe('clé de récupération', () => {
	it('est formatée en groupes de 4 et aléatoire', () => {
		const key = generateRecoveryKey();
		expect(key).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
		expect(generateRecoveryKey()).not.toBe(key);
	});

	it('déballe la seconde copie de la DEK, même saisie en minuscules', async () => {
		const dek = await generateDek();
		const recoveryKey = generateRecoveryKey();
		const wrapped = await wrapDek(dek, await deriveRecoveryKek(recoveryKey));
		const encrypted = await encrypt(dek, utf8('x'), 'ctx');

		const recovered = await unwrapDek(wrapped, await deriveRecoveryKek(recoveryKey.toLowerCase()));
		expect(await decrypt(recovered, encrypted, 'ctx')).toEqual(utf8('x'));
	});

	it('rejette une clé de mauvaise longueur', async () => {
		await expect(deriveRecoveryKek('ABCD-EFGH')).rejects.toThrow();
	});
});

describe('encrypt / decrypt', () => {
	it('utilise un IV neuf à chaque chiffrement (même contenu)', async () => {
		const dek = await generateDek();
		const a = await encrypt(dek, utf8('même texte'), 'ctx');
		const b = await encrypt(dek, utf8('même texte'), 'ctx');
		expect(a.iv).toHaveLength(12);
		expect(a.iv).not.toEqual(b.iv);
		expect(a.data).not.toEqual(b.data);
	});

	it('échoue si le chiffré est déplacé vers un autre contexte (AAD)', async () => {
		const dek = await generateDek();
		const encrypted = await encrypt(dek, utf8('miniature'), 'e1/thumb');
		await expect(decrypt(dek, encrypted, 'e2/thumb')).rejects.toThrow();
	});

	it('échoue si le chiffré est altéré', async () => {
		const dek = await generateDek();
		const encrypted = await encrypt(dek, utf8('données'), 'ctx');
		encrypted.data[0] ^= 1;
		await expect(decrypt(dek, encrypted, 'ctx')).rejects.toThrow();
	});
});
