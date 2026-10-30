import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
	'auth/invalid-credential': 'Email ou mot de passe incorrect.',
	'auth/wrong-password': 'Email ou mot de passe incorrect.',
	'auth/user-not-found': 'Email ou mot de passe incorrect.',
	'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
	// Création de comptes désactivée dans la console Firebase (app personnelle).
	'auth/admin-restricted-operation': 'Les inscriptions sont fermées.',
	'auth/invalid-email': 'Adresse email invalide.',
	'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
	// Plafond quotidien d'emails de connexion de Firebase.
	'auth/quota-exceeded': 'Trop de liens envoyés aujourd’hui. Utilisez le dernier lien reçu ou réessayez demain.',
	'auth/network-request-failed': 'Connexion réseau impossible.',
	'auth/requires-recent-login': 'Reconnectez-vous puis réessayez.',
	'auth/expired-action-code': 'Ce lien a expiré. Demandez-en un nouveau.',
	'auth/invalid-action-code': 'Ce lien est invalide ou a déjà servi. Demandez-en un nouveau.',
	'permission-denied': 'Accès refusé.',
	unavailable: 'Service indisponible. Vérifiez votre connexion.'
};

/** Message affichable en français. Nos propres erreurs (`new Error(...)`) sont déjà rédigées pour l'utilisateur. */
export function errorMessage(error: unknown): string {
	if (error instanceof FirebaseError) return MESSAGES[error.code] ?? `Erreur inattendue (${error.code}).`;
	// Web Crypto : échec d'AES-GCM (donnée altérée ou mauvaise clé). Sous Chrome, son message est vide.
	if (error instanceof DOMException && error.name === 'OperationError')
		return 'Données illisibles : elles sont peut-être endommagées. Restaurez une sauvegarde saine.';
	if (error instanceof Error && error.message) return error.message;
	return 'Erreur inattendue.';
}
