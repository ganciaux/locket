/** Pays : code ISO stocké, drapeau et nom calculés, saisie libre reconnue, filtre. */
import { searchKey } from './text';

// ---------------------------------------------------------------------------
// Pays : code ISO stocké ; drapeau et nom français calculés à l'affichage, aucune liste de noms à maintenir.

/** ISO 3166-1 alpha-2 : un code hors de cette liste ne s'enregistre pas. */
export const COUNTRY_CODES = (
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
	'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
	'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
	'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
	'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
	'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
	'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');
const COUNTRY_SET = new Set(COUNTRY_CODES);

/** Proposés en premier à la saisie, avec les pays déjà utilisés. */
export const FAVORITE_COUNTRIES = ['FR', 'ES', 'DE', 'IT', 'GB', 'UA', 'RU', 'PL', 'BR', 'CO', 'AU'];

export const parseCountry = (value: unknown): string | undefined =>
	typeof value === 'string' && COUNTRY_SET.has(value) ? value : undefined;

/** Drapeau emoji : deux « lettres régionales » Unicode. Windows les affiche en lettres (FR), pas en drapeau. */
export const countryFlag = (code: string): string =>
	String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
export const countryName = (code: string): string => regionNames.of(code) ?? code;

/** Libellé d'une suggestion de saisie : « 🇫🇷 France (FR) ». */
export const countryLabel = (code: string): string => `${countryFlag(code)} ${countryName(code)} (${code})`;

/** Noms usuels que `Intl.DisplayNames` ne donne pas (il dit « Tchéquie », « Myanmar (Birmanie) »…). */
const COUNTRY_ALIASES: Record<string, string[]> = {
	CZ: ['République tchèque'],
	GB: ['Angleterre', 'Écosse', 'Pays de Galles', 'Irlande du Nord', 'Grande-Bretagne', 'UK'],
	US: ['USA', "États-Unis d'Amérique", 'Amérique'],
	NL: ['Hollande'],
	MM: ['Birmanie', 'Myanmar'],
	MK: ['Macédoine'],
	KR: ['Corée'],
	CD: ['République démocratique du Congo', 'RDC'],
	CG: ['Congo', 'République du Congo'],
	VA: ['Vatican'],
	PS: ['Palestine'],
	HK: ['Hong Kong'],
	SZ: ['Swaziland'],
	TL: ['Timor-Leste'],
	VN: ['Vietnam'],
	BY: ['Bélarus']
};

const regionNamesEn = new Intl.DisplayNames(['en'], { type: 'region' });
/** Sans casse, accents ni ponctuation : « Royaume Uni » = « Royaume-Uni », « Cote d'Ivoire » = « Côte d’Ivoire ». */
const countryKey = (text: string): string =>
	searchKey(text)
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
let countryKeys: Map<string, string> | undefined;

/** Nom → code : nom français, nom anglais, puis noms usuels ; construit à la première saisie. */
function countryByKey(key: string): string | undefined {
	if (!countryKeys) {
		countryKeys = new Map();
		for (const code of COUNTRY_CODES)
			for (const name of [countryName(code), regionNamesEn.of(code) ?? '', ...(COUNTRY_ALIASES[code] ?? [])])
				if (name && !countryKeys.has(countryKey(name))) countryKeys.set(countryKey(name), code);
	}
	return countryKeys.get(key);
}

/**
 * Saisie libre → code : « fr », « France », « france » (sans casse, accents ni ponctuation), un nom anglais
 * (« Germany ») ou usuel (« République tchèque »), ou une suggestion choisie.
 */
export function resolveCountry(input: string): string | undefined {
	const text = input.trim();
	const code = /\(([A-Za-z]{2})\)$/.exec(text)?.[1] ?? (/^[A-Za-z]{2}$/.test(text) ? text : null);
	if (code) return parseCountry(code.toUpperCase());
	const key = countryKey(text);
	return key ? countryByKey(key) : undefined;
}

/** Codes cochés, en OU ; 'none' : sans pays ; vide : tous les pays. */
export type CountryFilter = string[];

export const NO_COUNTRY = 'none';

export const matchesCountryFilter = (country: string | undefined, filter: CountryFilter): boolean =>
	!filter.length || filter.includes(country ?? NO_COUNTRY);
