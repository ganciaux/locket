<script lang="ts">
	// Copie un texte dans le presse-papiers ; l'icône confirme un instant.
	import Icon from '$lib/components/Icon.svelte';

	let {
		text,
		label,
		class: className = 'btn btn-ghost btn-sm btn-square'
	}: { text: string; label: string; class?: string } = $props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<button type="button" class={className} onclick={copy} aria-label={copied ? 'Copié' : label} title={copied ? 'Copié' : label}>
	<Icon name={copied ? 'check' : 'copy'} class="size-4" />
</button>
