/** Grille de cartes et tailles au choix, partagées par la recherche et l'index en cartes. */
import type { CardSize } from '$lib/prefs.svelte';

// Classes écrites en entier : Tailwind ne détecte pas les noms de classes construits dynamiquement.
export const CARD_GRID: Record<CardSize, string> = {
	small: 'grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6',
	medium: 'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4',
	large: 'grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3'
};

export const CARD_SIZES: { value: CardSize; label: string; title: string }[] = [
	{ value: 'small', label: 'S', title: 'Petites cartes' },
	{ value: 'medium', label: 'M', title: 'Cartes moyennes' },
	{ value: 'large', label: 'L', title: 'Grandes cartes' }
];
