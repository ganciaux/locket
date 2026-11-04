/** Sites d'une collection et liens d'une fiche : modèles d'URL, visibilité, validation des adresses. */
import { type EntryData, type Link, type Site } from './types';

/** Mode d'un site dans l'administration : inutilisé, sur toutes les fiches, ou seulement celles qui l'activent. */
export type SiteMode = 'off' | 'all' | 'optIn';

export const siteMode = (site: Site): SiteMode => (!site.enabled ? 'off' : site.optIn ? 'optIn' : 'all');

export const withSiteMode = (site: Site, mode: SiteMode): Site => ({
	...site,
	enabled: mode !== 'off',
	optIn: mode === 'off' ? site.optIn : mode === 'optIn' || undefined
});

type SiteChoices = Pick<EntryData, 'hiddenSites' | 'shownSites'>;

/** Lien du site affiché sur la fiche : site utilisé, puis non masqué (toutes les fiches) ou activé (sur demande). */
export const siteShown = (entry: SiteChoices, site: Site): boolean =>
	site.enabled && (site.optIn ? !!entry.shownSites?.includes(site.id) : !entry.hiddenSites?.includes(site.id));

/**
 * Affiche ou masque des sites sur une fiche : `visible` renvoie true, false, ou undefined pour ne pas y toucher.
 * Un site pour toutes les fiches passe par `hiddenSites`, un site sur demande par `shownSites` ; les deux listes
 * sont gardées, pour retrouver les choix de la fiche si le mode du site change.
 */
export function withSiteVisibility(entry: SiteChoices, sites: Site[], visible: (siteId: string) => boolean | undefined): SiteChoices {
	const hidden = new Set(entry.hiddenSites ?? []);
	const shown = new Set(entry.shownSites ?? []);
	for (const site of sites) {
		const show = visible(site.id);
		if (show === undefined) continue;
		const [set, add] = site.optIn ? [shown, show] : [hidden, !show];
		if (add) set.add(site.id);
		else set.delete(site.id);
	}
	return { hiddenSites: hidden.size ? [...hidden] : undefined, shownSites: shown.size ? [...shown] : undefined };
}

/**
 * Normalise une URL saisie et refuse tout ce qui n'est pas http(s).
 * Un lien `javascript:` exécuterait du code dans l'app au clic, avec la DEK en mémoire.
 */
export function parseLinkUrl(input: string): string | null {
	const text = withScheme(input.trim());
	if (!text) return null;
	try {
		const url = new URL(text);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

const withScheme = (text: string): string => (!text || /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);

export const NAME_PLACEHOLDER = '{{name}}';
/** Variante de {{name}} sans aucun espace : « my name » donne « myname ». */
export const NOSPACE_PLACEHOLDER = '{{nospace}}';
const PLACEHOLDER = /\{\{(name|nospace)\}\}/g;

const fill = (template: string, value: (placeholder: string) => string): string =>
	template.replace(PLACEHOLDER, (_, placeholder: string) => value(placeholder));

/** Le terme est encodé (`%20` vaut partout, `+` seulement dans une querystring) : il ne peut pas sortir de sa place. */
const fillTemplate = (template: string, term: string): string =>
	fill(template, (placeholder) => encodeURIComponent(placeholder === 'nospace' ? term.replace(/\s+/g, '') : term));

/**
 * Valide le modèle d'URL d'un site ; lève une erreur affichable. Sans {{name}} ni {{nospace}}, le terme va à la fin (préfixe).
 * Le domaine doit être fixe : le contenu d'une fiche ne doit pas décider du site contacté.
 */
export function parseSiteTemplate(input: string): string {
	const text = withScheme(input.trim());
	const template = text.includes(NAME_PLACEHOLDER) || text.includes(NOSPACE_PLACEHOLDER) ? text : text + NAME_PLACEHOLDER;
	const [a, b] = ['a', 'b'].map((term) => parseLinkUrl(fillTemplate(template, term)));
	if (!text || !a || !b || new URL(a).host !== new URL(b).host)
		throw new Error(`Modèle invalide : http(s), domaine fixe, ${NAME_PLACEHOLDER} après le domaine.`);
	return template;
}

/**
 * URL d'un site ; null si le modèle n'est pas valable. Le nom de la fiche est encodé en entier (« AC/DC » reste un
 * seul mot). Un terme propre (`explicit`) peut être un chemin (« model/name », « / » gardés, « . » et « .. » retirés)
 * ou l'adresse complète d'une page de ce site ; jamais d'un autre domaine. Il est pris tel quel, même pour {{nospace}}.
 */
export function buildSiteUrl(site: Site, term: string, explicit = false): string | null {
	if (!explicit) return parseLinkUrl(fillTemplate(site.urlTemplate, term));
	const direct = /^https?:\/\//i.test(term) ? parseLinkUrl(term) : null;
	const siteUrl = parseLinkUrl(fillTemplate(site.urlTemplate, 'x'));
	if (direct && siteUrl && new URL(direct).host === new URL(siteUrl).host) return direct;
	const segments = term.split('/').filter((part) => part && part !== '.' && part !== '..');
	const path = segments.map(encodeURIComponent).join('/');
	return parseLinkUrl(fill(site.urlTemplate, () => path));
}

/**
 * Liens à afficher : sites de sa collection affichés sur la fiche (voir `siteShown`),
 * avec le nom de la fiche sauf terme propre, puis liens saisis non masqués.
 */
export function entryLinks(
	entry: Pick<EntryData, 'name' | 'links' | 'siteTerms' | 'hiddenSites' | 'shownSites'>,
	sites: Site[] = []
): Link[] {
	const fromSites = sites
		.filter((site) => siteShown(entry, site))
		.flatMap((site) => {
			const term = entry.siteTerms?.[site.id]?.trim();
			const url = term ? buildSiteUrl(site, term, true) : buildSiteUrl(site, entry.name);
			return url ? [{ url, label: site.label }] : [];
		});
	return [...fromSites, ...entry.links.filter((link) => !link.hidden)];
}

/** Texte court d'un lien : son libellé, sinon le nom de domaine (sans « www. »). */
export function linkTitle(link: Link): string {
	if (link.label) return link.label;
	try {
		return new URL(link.url).hostname.replace(/^www\./, '');
	} catch {
		return link.url;
	}
}
