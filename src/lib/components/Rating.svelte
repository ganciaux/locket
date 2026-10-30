<script lang="ts">
	// Note en étoiles, par demi-étoile (1 à 10). Avec `onchange` : boutons radio, retoucher la note actuelle l'efface ;
	// sans : affichage seul, rien si la fiche n'est pas notée.
	import { MAX_RATING, formatRating } from '$lib/entries/model';

	type Size = 'xs' | 'sm' | 'md' | 'lg';
	let {
		value,
		onchange,
		size = 'md',
		disabled = false
	}: { value?: number; onchange?: (value: number | undefined) => void; size?: Size; disabled?: boolean } = $props();

	const name = $props.id();
	const STEPS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);
	// Classes écrites en entier : Tailwind ne détecte pas les noms construits dynamiquement.
	const SIZES: Record<Size, string> = { xs: 'rating-xs', sm: 'rating-sm', md: 'rating-md', lg: 'rating-lg' };
	const half = (step: number) => (step % 2 ? 'mask-half-1' : 'mask-half-2');
</script>

{#if onchange}
	<div class="rating rating-half {SIZES[size]}" role="radiogroup" aria-label="Note">
		{#each STEPS as step (step)}
			<input
				type="radio"
				{name}
				class="mask mask-star-2 bg-warning {half(step)}"
				aria-label="{formatRating(step)} sur 5"
				checked={value === step}
				{disabled}
				onclick={() => onchange(step === value ? undefined : step)}
			/>
		{/each}
	</div>
{:else if value}
	<div class="rating rating-half {SIZES[size]}" role="img" aria-label="Note : {formatRating(value)} sur 5">
		{#each STEPS as step (step)}
			<div class="mask mask-star-2 bg-warning {half(step)}" aria-current={step === value}></div>
		{/each}
	</div>
{/if}
