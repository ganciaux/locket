/** Types communs des fiches, collections et tags (contenu des champs chiffrés). */

/** `hidden` : conservé sur la fiche, mais pas affiché. */
export type Link = { url: string; label?: string; hidden?: boolean };

/** Contenu du champ chiffré `data` (JSON). */
export type EntryData = {
	/** Une fiche appartient toujours à une seule collection. */
	collectionId: string;
	name: string;
	links: Link[];
	createdAt: number;
	updatedAt: number;
	/** Type MIME de l'image et de la miniature, absent si la fiche n'a pas d'image. */
	imageType?: string;
	/** Tags de sa collection ; un identifiant inconnu (tag supprimé) est ignoré. */
	tagIds?: string[];
	/** Par site de la collection : terme à chercher s'il diffère du nom de la fiche. */
	siteTerms?: Record<string, string>;
	/** Sites de la collection qui ne donnent pas de lien sur cette fiche. */
	hiddenSites?: string[];
	/** Sites « sur demande » de la collection activés sur cette fiche. */
	shownSites?: string[];
	/** Rangée à l'écart : absente de la liste sauf avec le bouton « Cachées ». Simple filtre, pas une protection. */
	hidden?: boolean;
	/** Note de 1 à `MAX_RATING` : 5 étoiles par demi-étoile ; absente, la fiche n'est pas notée. */
	rating?: number;
	/** Pays : code ISO 3166-1 alpha-2 (`FR`, `GB`…), un seul par fiche. */
	country?: string;
	/** Année de naissance seulement (une date précise serait pénible à trouver) : sert à afficher l'âge. */
	birthYear?: number;
	/** Dans la corbeille depuis cette date ; supprimée pour de bon après `TRASH_DAYS` jours. */
	deletedAt?: number;
};

export type Entry = EntryData & { id: string };

/** Regroupement exclusif des fiches (Manga, Chanteurs…) ; l'ordre du catalogue est l'ordre d'affichage. */
export type Collection = {
	id: string;
	name: string;
	sites?: Site[];
	/** Classement par duels : ids de la meilleure fiche à la moins bonne ; une fiche absente n'est pas classée. */
	ranking?: string[];
	/** Nouveau classement en cours : reçoit les duels, puis remplace `ranking` une fois terminé. */
	rankingDraft?: string[];
	/** Catégories de tags, dans l'ordre d'affichage choisi. */
	tagGroups?: TagGroup[];
	/** Cachée : absente des menus et sélecteurs, sauf avec la préférence `showHidden` (comme les fiches cachées). */
	hidden?: true;
};

/** Site d'une collection : ses liens sont calculés à l'affichage, le modèle se corrige donc en un seul endroit. */
export type Site = {
	id: string;
	label: string;
	urlTemplate: string;
	enabled: boolean;
	/** Sur demande : le lien n'apparaît que sur les fiches qui l'activent (terme propre souvent nécessaire). */
	optIn?: boolean;
};

/** Tag libre, propre à une collection : l'app ne connaît que son identifiant aléatoire et son libellé. */
export type Tag = {
	id: string;
	name: string;
	collectionId: string;
	groupId?: string;
	/** Place dans le filtre de la liste, à l'intérieur de sa catégorie ; absent : recherche simple. */
	filter?: 'advanced' | 'off';
};

/** Catégorie de tags (Genre, Statut…) : simple rangement, une fiche peut porter 0 ou n tags d'une catégorie. */
export type TagGroup = {
	id: string;
	name: string;
	/** Place dans le filtre de la liste ; absent : recherche simple. */
	filter?: 'advanced' | 'off';
};
