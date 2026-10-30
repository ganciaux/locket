<script lang="ts">
	// Pays d'une fiche : saisie libre (code ou nom) avec suggestions ; seul un code ISO reconnu est retenu.
	import Icon from '$lib/components/Icon.svelte';
	import {
		COUNTRY_CODES,
		FAVORITE_COUNTRIES,
		countryFlag,
		countryLabel,
		countryName,
		resolveCountry
	} from '$lib/entries/model';

	let { value = $bindable(), frequent = [] }: { value?: string; frequent?: string[] } = $props();

	const id = $props.id();
	// svelte-ignore state_referenced_locally
	let text = $state(value ? countryLabel(value) : '');

	// En tête : les pays déjà utilisés puis les favoris ; ensuite tous les autres, par nom.
	const options = $derived.by(() => {
		const first = [...new Set([...frequent, ...FAVORITE_COUNTRIES])];
		const rest = COUNTRY_CODES.filter((code) => !first.includes(code)).sort((a, b) =>
			countryName(a).localeCompare(countryName(b), 'fr')
		);
		return [...first, ...rest];
	});
	const unknown = $derived(!!text.trim() && !value);

	function clear() {
		text = '';
		value = undefined;
	}
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-center gap-2">
		<input
			class="input w-full"
			list="{id}-countries"
			placeholder="Code ou nom : FR, Brésil…"
			aria-label="Pays"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			bind:value={text}
			oninput={() => (value = resolveCountry(text))}
			onblur={() => value && (text = countryLabel(value))}
		/>
		{#if text}
			<button type="button" class="btn btn-ghost btn-sm btn-square" onclick={clear} aria-label="Retirer le pays" title="Retirer le pays">
				<Icon name="close" class="size-4" />
			</button>
		{/if}
	</div>
	<datalist id="{id}-countries">
		{#each options as code (code)}
			<option value={countryLabel(code)}></option>
		{/each}
	</datalist>
	{#if value}
		<p class="flex items-center gap-1.5 text-sm" role="status"><span>{countryFlag(value)}</span>{countryName(value)}</p>
	{:else if unknown}
		<p class="text-warning text-xs" role="status">Pays non reconnu : il ne sera pas enregistré.</p>
	{/if}
</div>
