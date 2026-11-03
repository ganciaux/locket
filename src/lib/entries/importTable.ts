/**
 * Import d'un tableau de fiches dans une collection : première ligne = en-têtes (seul « Nom » est obligatoire),
 * colonnes séparées par « ; » (ou des tabulations, copier-coller d'un tableur).
 * Un nom déjà présent (sans casse ni accents) met la fiche à jour, un nom inconnu crée la fiche.
 * Case vide : valeur gardée ; « - » : valeur effacée. Une colonne de catégorie ne touche que les tags de sa catégorie.
 * Fonctions pures : l'aperçu se calcule sans rien écrire.
 */
import {
	type Entry,
	type EntryData,
	type Tag,
	type TagGroup,
	MAX_NAME_LENGTH,
	countryName,
	formatRating,
	parseBirthYear,
	parseRating,
	resolveCountry,
	searchKey
} from './model';

export type ImportTarget = Pick<Entry, 'id' | 'name' | 'country' | 'birthYear' | 'rating' | 'tagIds'>;
export type ImportFields = Pick<EntryData, 'country' | 'birthYear' | 'rating' | 'tagIds'>;
/** Une ligne retenue : ses champs complets après fusion, et les changements lisibles pour l'aperçu. */
export type ImportRow = { line: number; name: string; fields: ImportFields; changes: string[] };
export type ImportPlan = {
	added: ImportRow[];
	updated: (ImportRow & { id: string })[];
	unchanged: number;
	errors: string[];
	/** Numéros des lignes en erreur, non retenues : les autres peuvent être importées sans elles. */
	failed: number[];
};

export const CLEAR = '-';
/** Au-delà, mieux vaut découper : moins d'écritures perdues en cas de panne, aperçu lisible, quota Spark ménagé. */
export const MAX_IMPORT_ROWS = 2000;
export const OTHER_TAGS = 'Autres tags';
const FIXED = ['Nom', 'Pays', 'Naissance', 'Note'] as const;
const NONE = '—';

/** Tags d'une colonne : ceux d'une catégorie, ou ceux sans catégorie (« Autres tags »). */
type Scope = { label: string; tags: Tag[] };
type Column = { kind: (typeof FIXED)[number] } | { kind: 'tags'; scope: Scope };

function scopesOf(tags: Tag[], groups: TagGroup[]): Scope[] {
	const known = new Set(groups.map((group) => group.id));
	return [
		...groups.map((group) => ({ label: group.name, tags: tags.filter((tag) => tag.groupId === group.id) })),
		{ label: OTHER_TAGS, tags: tags.filter((tag) => !tag.groupId || !known.has(tag.groupId)) }
	];
}

const splitLine = (line: string, separator: string): string[] => line.split(separator).map((cell) => cell.trim());

function parseHeader(cells: string[], scopes: Scope[]): { columns: Column[]; errors: string[] } {
	const errors: string[] = [];
	const seen = new Set<string>();
	const columns = cells.map((cell): Column => {
		const key = searchKey(cell);
		if (seen.has(key)) errors.push(`En-tête : colonne « ${cell} » en double.`);
		seen.add(key);
		const fixed = FIXED.find((name) => searchKey(name) === key);
		if (fixed) return { kind: fixed };
		const scope = scopes.find((s) => searchKey(s.label) === key);
		if (scope) return { kind: 'tags', scope };
		errors.push(`En-tête : colonne « ${cell} » inconnue (ni un champ, ni une catégorie de tags).`);
		return { kind: 'tags', scope: { label: cell, tags: [] } };
	});
	if (!columns.some((column) => column.kind === 'Nom')) errors.push('En-tête : la colonne « Nom » est obligatoire.');
	return { columns, errors };
}

/** Note en étoiles, à la française (« 4,5 ») ; stockée en demi-étoiles. */
const parseStars = (cell: string): number | undefined => parseRating(Number(cell.replace(',', '.')) * 2);

const scopeNames = (tagIds: string[] | undefined, scope: Scope): string[] =>
	scope.tags.filter((tag) => tagIds?.includes(tag.id)).map((tag) => tag.name);

function describeChanges(before: ImportFields, after: ImportFields, scopes: Scope[]): string[] {
	const changes: string[] = [];
	const show = (value: string | undefined) => value ?? NONE;
	const add = (label: string, from: string | undefined, to: string | undefined) => {
		if (from !== to) changes.push(`${label} : ${show(from)} → ${show(to)}`);
	};
	const country = (code?: string) => (code ? countryName(code) : undefined);
	const stars = (rating?: number) => (rating ? formatRating(rating) : undefined);
	add('Pays', country(before.country), country(after.country));
	add('Naissance', before.birthYear?.toString(), after.birthYear?.toString());
	add('Note', stars(before.rating), stars(after.rating));
	for (const scope of scopes) {
		const from = scopeNames(before.tagIds, scope).join(', ');
		const to = scopeNames(after.tagIds, scope).join(', ');
		add(scope.label, from || undefined, to || undefined);
	}
	return changes;
}

export function planImport(text: string, items: ImportTarget[], tags: Tag[], groups: TagGroup[]): ImportPlan {
	const plan: ImportPlan = { added: [], updated: [], unchanged: 0, errors: [], failed: [] };
	const lines = text.split(/\r?\n/);
	const headerIndex = lines.findIndex((line) => line.trim());
	if (headerIndex < 0) return plan;
	const header = lines[headerIndex];
	const separator = !header.includes(';') && header.includes('\t') ? '\t' : ';';
	const scopes = scopesOf(tags, groups);
	const { columns, errors } = parseHeader(splitLine(header, separator), scopes);
	if (errors.length) return { ...plan, errors };

	const rowCount = lines.slice(headerIndex + 1).filter((line) => line.trim()).length;
	if (rowCount > MAX_IMPORT_ROWS) {
		return { ...plan, errors: [`${rowCount} lignes : ${MAX_IMPORT_ROWS} au plus par import, découpez le tableau.`] };
	}

	const byKey = new Map(items.map((item) => [searchKey(item.name), item]));
	const seen = new Map<string, number>();
	for (let index = headerIndex + 1; index < lines.length; index++) {
		const line = index + 1;
		const cells = splitLine(lines[index], separator);
		if (cells.every((cell) => !cell)) continue;
		const fail = (message: string) => {
			plan.errors.push(`Ligne ${line} : ${message}`);
			if (plan.failed.at(-1) !== line) plan.failed.push(line);
		};
		if (cells.length > columns.length) {
			fail(`${cells.length} colonnes pour ${columns.length} en-têtes (un « ${separator === ';' ? ';' : 'tabulation'} » dans une valeur ?).`);
			continue;
		}

		const name = (cells[columns.findIndex((column) => column.kind === 'Nom')] ?? '').replace(/\s+/g, ' ');
		if (!name || name === CLEAR) {
			fail('nom manquant.');
			continue;
		}
		if (name.length > MAX_NAME_LENGTH) {
			fail(`nom trop long (${MAX_NAME_LENGTH} caractères au plus).`);
			continue;
		}
		const key = searchKey(name);
		if (seen.has(key)) {
			fail(`« ${name} » déjà présent ligne ${seen.get(key)}.`);
			continue;
		}
		seen.set(key, line);

		const existing = byKey.get(key);
		const before: ImportFields = existing
			? { country: existing.country, birthYear: existing.birthYear, rating: existing.rating, tagIds: existing.tagIds }
			: {};
		const after: ImportFields = { ...before };
		const rowErrors: string[] = [];
		columns.forEach((column, i) => {
			const cell = cells[i] ?? '';
			if (!cell || column.kind === 'Nom') return;
			const clear = cell === CLEAR;
			if (column.kind === 'Pays') {
				after.country = clear ? undefined : resolveCountry(cell);
				if (!clear && !after.country) rowErrors.push(`pays « ${cell} » inconnu (code comme FR, ou nom en français ou en anglais).`);
			} else if (column.kind === 'Naissance') {
				after.birthYear = clear ? undefined : parseBirthYear(/^\d+$/.test(cell) ? Number(cell) : NaN);
				if (!clear && !after.birthYear) rowErrors.push(`année de naissance « ${cell} » invalide.`);
			} else if (column.kind === 'Note') {
				after.rating = clear ? undefined : parseStars(cell);
				if (!clear && !after.rating) rowErrors.push(`note « ${cell} » invalide (de 0,5 à 5, par demi-étoile).`);
			} else if (column.kind === 'tags') {
				const { scope } = column;
				const chosen: string[] = [];
				for (const tagName of clear ? [] : cell.split(',').map((part) => part.trim()).filter(Boolean)) {
					const tag = scope.tags.find((t) => searchKey(t.name) === searchKey(tagName));
					if (tag) chosen.push(tag.id);
					else rowErrors.push(`tag « ${tagName} » inconnu dans ${scope.label}.`);
				}
				const others = (after.tagIds ?? []).filter((id) => !scope.tags.some((tag) => tag.id === id));
				const next = [...others, ...new Set(chosen)];
				after.tagIds = next.length ? next : undefined;
			}
		});
		if (rowErrors.length) {
			rowErrors.forEach(fail);
			continue;
		}

		const changes = describeChanges(before, after, scopes);
		if (!existing) plan.added.push({ line, name, fields: after, changes });
		else if (changes.length) plan.updated.push({ line, name: existing.name, fields: after, changes, id: existing.id });
		else plan.unchanged++;
	}
	return plan;
}

/** En-tête du tableau suivi des seules lignes `numbers` (comptées à partir de 1) : les lignes ignorées, à corriger. */
export function rowsText(text: string, numbers: number[]): string {
	const lines = text.split(/\r?\n/);
	const header = lines.find((line) => line.trim()) ?? '';
	return [header, ...numbers.map((number) => lines[number - 1] ?? '')].join('\n');
}

/**
 * Modèle à remplir : en-têtes de la collection (catégories ayant des tags) et ses fiches avec leurs valeurs actuelles,
 * à reprendre dans un tableur puis à recoller.
 */
export function importTemplate(items: ImportTarget[], tags: Tag[], groups: TagGroup[]): string {
	const scopes = scopesOf(tags, groups).filter((scope) => scope.tags.length);
	const rows = items.map((item) => [
		item.name,
		item.country ? countryName(item.country) : '',
		item.birthYear?.toString() ?? '',
		item.rating ? formatRating(item.rating) : '',
		...scopes.map((scope) => scopeNames(item.tagIds, scope).join(', '))
	]);
	return [[...FIXED, ...scopes.map((scope) => scope.label)], ...rows].map((cells) => cells.join(';')).join('\n');
}

/** Valeurs acceptées par colonne de tags, pour la légende sous le tableau. */
export const importTagColumns = (tags: Tag[], groups: TagGroup[]): { label: string; values: string[] }[] =>
	scopesOf(tags, groups)
		.filter((scope) => scope.tags.length)
		.map((scope) => ({ label: scope.label, values: scope.tags.map((tag) => tag.name) }));
