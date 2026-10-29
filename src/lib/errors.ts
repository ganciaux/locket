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
	if (error instanceof Error) return error.message;
	return 'Erreur inattendue.';
}
