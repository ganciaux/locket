/**
 * Taille des catalogues chiffrés (`meta/collections`, `meta/tags`) : chacun tient dans un seul document Firestore
 * (1 Mio), réécrit en entier. Les fiches ont chacune leur document ; seuls le classement (ids) et les tags grossissent.
 * Mesuré sur un cas chargé : 2 000 fiches classées deux fois (classement et relance en cours), 500 tags.
 */
import { describe, expect, it } from 'vitest';
import { utf8 } from '$lib/crypto/encoding';
import { type Collection, MAX_DOC_BYTES, type Tag } from './model';

/** JSON chiffré : AES-GCM ajoute 16 octets de tag, l'IV (12 octets) est un champ à part. */
const encryptedSize = (value: unknown) => utf8(JSON.stringify(value)).length + 16 + 12;
const firestoreId = (i: number) => `id${String(i).padStart(18, '0')}`; // 20 caractères, comme `doc().id`
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('taille des catalogues', () => {
	it('2 000 fiches classées et en relance : le catalogue des collections reste loin du plafond', () => {
		const ids = Array.from({ length: 2000 }, (_, i) => firestoreId(i));
		const loaded: Collection = {
			id: uuid(0),
			name: 'Une collection au nom assez long pour compter',
			sites: Array.from({ length: 10 }, (_, i) => ({
				id: uuid(100 + i),
				label: `Site ${i}`,
				urlTemplate: `https://exemple-${i}.example.com/recherche?q={{name}}`,
				enabled: true,
				optIn: i % 2 === 0
			})),
			ranking: ids,
			rankingDraft: [...ids].reverse(),
			tagGroups: Array.from({ length: 20 }, (_, i) => ({ id: uuid(200 + i), name: `Catégorie ${i}`, filter: 'advanced' }))
		};
		const others = Array.from({ length: 9 }, (_, i) => ({ id: uuid(300 + i), name: `Collection ${i}` }));
		const size = encryptedSize([loaded, ...others]);
		// ~96 Ko mesurés : environ 46 octets par fiche classée deux fois, plafond (900 Ko) vers 19 000 fiches.
		expect(size).toBeLessThan(MAX_DOC_BYTES / 8);
	});

	it('500 tags rangés et réglés : le catalogue des tags reste loin du plafond', () => {
		const tags: Tag[] = Array.from({ length: 500 }, (_, i) => ({
			id: uuid(i),
			name: `Tag numéro ${i} au libellé moyen`,
			collectionId: uuid(1000 + (i % 10)),
			groupId: uuid(2000 + (i % 20)),
			filter: i % 3 === 0 ? 'advanced' : undefined
		}));
		// ~99 Ko mesurés : environ 200 octets par tag, plafond (900 Ko) vers 4 500 tags.
		expect(encryptedSize(tags)).toBeLessThan(MAX_DOC_BYTES / 8);
	});
});
