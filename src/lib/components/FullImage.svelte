<script lang="ts">
	// Image complète d'une fiche, dans un conteneur `relative` : téléchargée et déchiffrée ici, libérée au démontage.
	// La miniature reste affichée en attendant, ou si l'image manque (sauvegarde légère dans un compte recréé).
	import { session } from '$lib/auth/session.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { getImage } from '$lib/entries/repository';

	let {
		id,
		type,
		thumbUrl,
		alt,
		class: className,
		onfail
	}: { id: string; type?: string; thumbUrl?: string; alt: string; class: string; onfail: (error: unknown) => void } = $props();

	let url = $state<string | null>(null);
	let loading = $state(false);

	$effect(() => {
		const { user, dek } = session;
		if (!user || !dek || !type) return;
		let current: string | null = null;
		let cancelled = false;
		loading = true;
		getImage(user.uid, dek, id)
			.then(
				(bytes) => {
					if (cancelled || !bytes) return;
					current = bytesToUrl(bytes, type);
					url = current;
				},
				(e) => onfail(e)
			)
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
			if (current) URL.revokeObjectURL(current);
			url = null;
			loading = false;
		};
	});
</script>

<img class={className} src={url ?? thumbUrl} {alt} />
{#if loading}
	<span class="loading loading-spinner text-primary absolute top-3 right-3"></span>
{/if}
