import { describe, expect, it } from 'vitest';
import { importTemplate, planImport, rowsText } from './importTable';
import type { Tag, TagGroup } from './model';

const groups: TagGroup[] = [
	{ id: 'g-genre', name: 'Genre' },
	{ id: 'g-statut', name: 'Statut' }
];
const tags: Tag[] = [
	{ id: 't-action', name: 'Action', collectionId: 'c', groupId: 'g-genre' },
	{ id: 't-aventure', name: 'Aventure', collectionId: 'c', groupId: 'g-genre' },
	{ id: 't-fini', name: 'Terminé', collectionId: 'c', groupId: 'g-statut' },
	{ id: 't-cours', name: 'En cours', collectionId: 'c', groupId: 'g-statut' },
	{ id: 't-fav', name: 'Favori', collectionId: 'c' }
];
const items = [
	{ id: 'naruto', name: 'Naruto', country: 'JP', tagIds: ['t-action', 't-fini'] },
	{ id: 'akira', name: 'Akira', rating: 8 }
];
const plan = (text: string) => planImport(text, items, tags, groups);

describe('planImport', () => {
	it('crée les noms inconnus avec leurs champs', () => {
		const result = plan('Nom;Pays;Naissance;Note;Genre;Autres tags\nOne Piece;Japon;1997;4,5;Aventure, action;favori');
		expect(result.errors).toEqual([]);
		expect(result.added).toEqual([
			{
				line: 2,
				name: 'One Piece',
				fields: { country: 'JP', birthYear: 1997, rating: 9, tagIds: ['t-aventure', 't-action', 't-fav'] },
				changes: ['Pays : — → Japon', 'Naissance : — → 1997', 'Note : — → 4,5', 'Genre : — → Action, Aventure', 'Autres tags : — → Favori']
			}
		]);
	});

	it('met à jour un nom connu (sans casse ni accents) avec les seules cases remplies', () => {
		const result = plan('nom;pays;note;Genre\nNARUTO;;-;Aventure\nakira;FR;;');
		expect(result.errors).toEqual([]);
		expect(result.updated).toEqual([
			{
				line: 2,
				name: 'Naruto',
				id: 'naruto',
				// Statut gardé : seule la colonne Genre touche aux tags, et seulement à ceux du genre.
				fields: { country: 'JP', rating: undefined, tagIds: ['t-fini', 't-aventure'], birthYear: undefined },
				changes: ['Genre : Action → Aventure']
			},
			{
				line: 3,
				name: 'Akira',
				id: 'akira',
				fields: { country: 'FR', birthYear: undefined, rating: 8, tagIds: undefined },
				changes: ['Pays : — → France']
			}
		]);
	});

	it('« - » efface, une ligne sans changement est comptée à part', () => {
		const result = plan('Nom;Pays;Genre;Statut\nNaruto;-;-;-\nAkira');
		expect(result.updated[0].fields).toMatchObject({ country: undefined, tagIds: undefined });
		expect(result.updated[0].changes).toEqual(['Pays : Japon → —', 'Genre : Action → —', 'Statut : Terminé → —']);
		expect(result.unchanged).toBe(1);
	});

	it('accepte les tabulations d’un tableur', () => {
		expect(plan('Nom\tPays\nBleach\tJP').added[0].fields).toEqual({ country: 'JP' });
	});

	it('refuse un en-tête sans nom, inconnu ou en double', () => {
		expect(plan('Pays\nJP').errors).toEqual(['En-tête : la colonne « Nom » est obligatoire.']);
		expect(plan('Nom;Auteur;nom\nX').errors).toEqual([
			'En-tête : colonne « Auteur » inconnue (ni un champ, ni une catégorie de tags).',
			'En-tête : colonne « nom » en double.'
		]);
	});

	it('signale chaque valeur invalide avec sa ligne, sans retenir la ligne', () => {
		const result = plan('Nom;Pays;Naissance;Note;Genre;Statut\nA;Atlantide;3000;6;Acion;\nB;;19x;4,25;;\n;FR\nA;;;;;\nC;JP;;;;;;');
		expect(result.errors).toEqual([
			'Ligne 2 : pays « Atlantide » inconnu (code comme FR, ou nom en français ou en anglais).',
			'Ligne 2 : année de naissance « 3000 » invalide.',
			'Ligne 2 : note « 6 » invalide (de 0,5 à 5, par demi-étoile).',
			'Ligne 2 : tag « Acion » inconnu dans Genre.',
			'Ligne 3 : année de naissance « 19x » invalide.',
			'Ligne 3 : note « 4,25 » invalide (de 0,5 à 5, par demi-étoile).',
			'Ligne 4 : nom manquant.',
			'Ligne 5 : « A » déjà présent ligne 2.',
			'Ligne 6 : 8 colonnes pour 6 en-têtes (un « ; » dans une valeur ?).'
		]);
		expect(result.added).toEqual([]);
	});

	it('refuse un tableau trop long', () => {
		const text = ['Nom', ...Array.from({ length: 2001 }, (_, i) => `Fiche ${i}`)].join('\n');
		expect(plan(text).errors).toEqual(['2001 lignes : 2000 au plus par import, découpez le tableau.']);
	});

	it('un tag d’une autre catégorie est refusé', () => {
		expect(plan('Nom;Genre\nX;Terminé').errors).toEqual(['Ligne 2 : tag « Terminé » inconnu dans Genre.']);
	});
});

describe('importTemplate', () => {
	it('en-têtes de la collection et fiches avec leurs valeurs, relisible tel quel', () => {
		const template = importTemplate(items, tags, groups);
		expect(template).toBe('Nom;Pays;Naissance;Note;Genre;Statut;Autres tags\nNaruto;Japon;;;Action;Terminé;\nAkira;;;4;;;');
		const result = plan(template);
		expect(result).toMatchObject({ errors: [], added: [], updated: [], unchanged: 2 });
	});

	it('les lignes en erreur sont écartées et se retrouvent, avec l’en-tête, pour être corrigées', () => {
		const text = '\nNom;Pays\nA;FR\nB;Atlantide;x\nC;JP\nD;XX\nE;\n';
		const result = planImport(text, [], [], []);
		expect(result.added.map((row) => row.name)).toEqual(['A', 'C', 'E']);
		expect(result.failed).toEqual([4, 6]);
		expect(rowsText(text, result.failed)).toBe('Nom;Pays\nB;Atlantide;x\nD;XX');
	});
});
