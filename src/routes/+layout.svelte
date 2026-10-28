<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/auth/session.svelte';
	import Unlock from '$lib/components/Unlock.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Pages accessibles sans session déverrouillée.
	const PUBLIC_ROUTES = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/action'];
	const isPublic = $derived(PUBLIC_ROUTES.includes(page.route.id ?? ''));

	$effect(() => {
		if (session.ready && !session.user && !isPublic) goto('/connexion');
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Locket</title>
</svelte:head>

<main>
	{#if isPublic}
		{@render children()}
	{:else if !session.user}
		<p>Chargement…</p>
	{:else if !session.dek}
		<Unlock />
	{:else}
		{@render children()}
	{/if}
</main>
