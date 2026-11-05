/**
 * Bordure des cartes : une catégorie de tags par collection la donne (ex. « Rareté »), en un seul choix ; chacun de
 * ses tags porte une couleur d'une palette fixe. Classes écrites en entier pour que Tailwind les génère.
 */
import { type BorderColor, type Tag, type TagGroup } from './types';

/** `ring` : anneau autour de la carte, hors de sa taille (pas de décalage de la grille) ; `swatch` : pastille de choix. */
export const BORDER_COLORS: { value: BorderColor; label: string; ring: string; swatch: string }[] = [
	{ value: 'gold', label: 'Or', ring: 'ring-[#c9a227]', swatch: 'bg-[#c9a227]' },
	{ value: 'silver', label: 'Argent', ring: 'ring-[#a7adb7]', swatch: 'bg-[#a7adb7]' },
	{ value: 'bronze', label: 'Bronze', ring: 'ring-[#b0703a]', swatch: 'bg-[#b0703a]' },
	{ value: 'blue', label: 'Bleu', ring: 'ring-[#2563eb]', swatch: 'bg-[#2563eb]' },
	{ value: 'red', label: 'Rouge', ring: 'ring-[#dc2626]', swatch: 'bg-[#dc2626]' },
	{ value: 'green', label: 'Vert', ring: 'ring-[#16a34a]', swatch: 'bg-[#16a34a]' },
	// Couleur du texte : noire en thème clair, claire en thème sombre (une bordure noire y disparaîtrait).
	{ value: 'black', label: 'Noir', ring: 'ring-base-content', swatch: 'bg-base-content' }
];

export const borderColor = (value: unknown) => BORDER_COLORS.find((color) => color.value === value);

/** Catégorie qui donne la bordure dans une collection ; une seule (la première si un catalogue en avait plusieurs). */
export const borderGroup = (groups: TagGroup[]): TagGroup | undefined => groups.find((group) => group.border);

/** Tags de la catégorie de bordure, dans l'ordre du catalogue. */
export function borderTags(tags: Tag[], groups: TagGroup[]): Tag[] {
	const group = borderGroup(groups);
	return group ? tags.filter((tag) => tag.groupId === group.id) : [];
}

/**
 * Classe de l'anneau d'une fiche : le premier de ses tags de la catégorie de bordure qui a une couleur (le premier
 * dans l'ordre de la catégorie, si une fiche ancienne en porte deux) ; '' sans bordure.
 */
export function borderRing(tagIds: string[] | undefined, tags: Tag[], groups: TagGroup[]): string {
	const tag = borderTags(tags, groups).find((candidate) => candidate.color && tagIds?.includes(candidate.id));
	const color = borderColor(tag?.color);
	return color ? `ring-2 ${color.ring}` : '';
}

/**
 * Un seul tag de la catégorie de bordure par fiche : s'il y en a plusieurs, garde le dernier de `preferred` (ceux qu'on
 * vient d'ajouter), sinon le premier dans l'ordre de la catégorie. Les autres tags ne bougent pas.
 */
export function keepOneBorderTag(tagIds: string[], tags: Tag[], groups: TagGroup[], preferred: string[] = []): string[] {
	const ids = borderTags(tags, groups).map((tag) => tag.id);
	const present = ids.filter((id) => tagIds.includes(id));
	if (present.length < 2) return tagIds;
	const kept = preferred.findLast((id) => present.includes(id)) ?? present[0];
	return tagIds.filter((id) => !ids.includes(id) || id === kept);
}
