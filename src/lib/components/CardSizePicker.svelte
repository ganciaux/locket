<script lang="ts">
	// Taille des cartes (préférence de l'appareil), sur la recherche et l'index en cartes.
	import { CARD_SIZES } from '$lib/components/cardGrid';
	import { prefs } from '$lib/prefs.svelte';
</script>

<div class="join ml-auto" role="radiogroup" aria-label="Taille des cartes">
	{#each CARD_SIZES as size (size.value)}
		<input
			class="join-item btn btn-xs"
			type="radio"
			name="card-size"
			value={size.value}
			aria-label={size.label}
			title={size.title}
			bind:group={prefs.cardSize}
		/>
	{/each}
</div>
