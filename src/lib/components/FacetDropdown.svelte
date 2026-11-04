<script module lang="ts">
	export type FacetOption = { value: string; label: string; extra?: boolean };
</script>

<script lang="ts">
	// Pastille de filtre qui ouvre une liste à cocher et résume la sélection (« Genre : Combat +1 »).
	// Les options `extra` (« Non renseigné », « Sans pays ») viennent après un séparateur, en italique.
	// Clic à l'extérieur ou Échap la ferment (<details> ne le fait pas seul) : une seule ouverte à la fois.
	// `single` : un seul choix (boutons radio), la liste se ferme dès qu'il est fait ; rien de coché = pas de filtre.
	import Icon from '$lib/components/Icon.svelte';

	let {
		name,
		options,
		selected,
		single = false,
		onchange
	}: {
		name: string;
		options: FacetOption[];
		selected: string[];
		single?: boolean;
		onchange: (selected: string[]) => void;
	} = $props();

	const radioName = $props.id();

	let details = $state<HTMLDetailsElement>();
	let open = $state(false);

	const chosen = $derived(options.filter((option) => selected.includes(option.value)).map((option) => option.label));
	const main = $derived(options.filter((option) => !option.extra));
	const extras = $derived(options.filter((option) => option.extra));

	function toggle(value: string) {
		if (single) {
			open = false;
			onchange([value]);
		} else onchange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
	}

	function closeOutside(event: MouseEvent) {
		if (open && !details?.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window onclick={closeOutside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#snippet item(option: FacetOption)}
	<li>
		<label class="hover:bg-base-200 rounded-field flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm {option.extra ? 'italic' : ''}">
			<input
				type={single ? 'radio' : 'checkbox'}
				name={single ? radioName : undefined}
				class={single ? 'radio radio-sm radio-primary' : 'checkbox checkbox-sm checkbox-primary'}
				checked={selected.includes(option.value)}
				onchange={() => toggle(option.value)}
			/>
			<span class="min-w-0 flex-1 break-words">{option.label}</span>
		</label>
	</li>
{/snippet}

<details bind:this={details} class="dropdown" bind:open>
	<summary
		class="badge badge-lg max-w-64 cursor-pointer list-none gap-1 [&::-webkit-details-marker]:hidden badge-primary {chosen.length ? '' : 'badge-outline'}"
		aria-label="{name}{chosen.length ? ` : ${chosen.join(', ')}` : ''}"
	>
		<span class="truncate">
			{name}{#if chosen.length}&nbsp;: {chosen[0]}{/if}
		</span>
		{#if chosen.length > 1}<span class="shrink-0">+{chosen.length - 1}</span>{/if}
		<Icon name="chevronDown" class="size-3 shrink-0" />
	</summary>
	<div class="dropdown-content bg-base-100 rounded-box z-20 mt-1 flex w-56 max-w-[calc(100vw-2rem)] flex-col p-2 shadow-lg">
		<ul class="flex max-h-72 flex-col overflow-y-auto" role="group" aria-label={name}>
			{#each main as option (option.value)}{@render item(option)}{/each}
			{#if extras.length}
				<li class="border-base-200 mt-1 border-t pt-1"><ul>{#each extras as option (option.value)}{@render item(option)}{/each}</ul></li>
			{/if}
		</ul>
		<div class="border-base-200 mt-1 flex justify-between border-t pt-2">
			<button type="button" class="btn btn-ghost btn-xs" disabled={!chosen.length} onclick={() => onchange([])}>Effacer</button>
			<button type="button" class="btn btn-primary btn-xs" onclick={() => (open = false)}>Fermer</button>
		</div>
	</div>
</details>
