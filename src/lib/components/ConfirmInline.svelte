<script lang="ts">
	// Confirmation sur place (alerte daisyUI) : le message, le bouton d'action et « Annuler », sur une ligne qui passe à
	// la ligne sur téléphone. Attente et erreur sont gérées ici ; `onconfirm` fait l'action puis referme (la page remet
	// son état « à confirmer » à zéro), `oncancel` referme sans rien faire.
	import type { Snippet } from 'svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { formAction } from '$lib/form.svelte';

	let {
		message,
		children,
		confirmLabel = 'Supprimer',
		tone = 'error',
		class: className = '',
		onconfirm,
		oncancel
	}: {
		message?: string;
		/** À la place de `message`, pour un texte mis en forme. */
		children?: Snippet;
		confirmLabel?: string;
		/** `warning` : action réversible ou sans perte de données (retirer, abandonner). */
		tone?: 'error' | 'warning';
		class?: string;
		/** Sa valeur est ignorée : seule compte sa fin (ou son erreur, affichée sur place). */
		onconfirm: () => unknown;
		oncancel: () => void;
	} = $props();

	// Classes écrites en entier : Tailwind ne voit pas les noms composés à l'exécution.
	const TONES = {
		error: { alert: 'alert-error', button: 'btn-error' },
		warning: { alert: 'alert-warning', button: 'btn-warning' }
	};

	const action = formAction(async () => {
		await onconfirm();
	});
</script>

<form class="alert {TONES[tone].alert} alert-soft flex flex-wrap items-center gap-2 {className}" onsubmit={action.submit}>
	<span class="flex-1 text-sm">
		{#if children}{@render children()}{:else}{message}{/if}
	</span>
	<button class="btn {TONES[tone].button} btn-sm" disabled={action.busy}>
		{#if action.busy}<span class="loading loading-spinner loading-xs"></span>{/if}
		{confirmLabel}
	</button>
	<button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Annuler</button>
	<ErrorAlert message={action.error} />
</form>
