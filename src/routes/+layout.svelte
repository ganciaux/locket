<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { lock, session } from '$lib/auth/session.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Unlock from '$lib/components/Unlock.svelte';
	import type { Snippet } from 'svelte';
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

{#snippet brand()}
	<Icon name="lock" class="text-primary size-6" />
	<span>Locket</span>
{/snippet}

<!-- Pages de connexion : une carte centrée. -->
{#snippet authShell(content: Snippet)}
	<div class="bg-base-200 grid min-h-dvh place-items-center p-4">
		<div class="w-full max-w-sm">
			<p class="mb-4 flex items-center justify-center gap-2 text-2xl font-bold">{@render brand()}</p>
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body gap-4">{@render content()}</div>
			</div>
		</div>
	</div>
{/snippet}

{#if isPublic}
	{@render authShell(children)}
{:else if !session.user}
	<div class="grid min-h-dvh place-items-center">
		<span class="loading loading-spinner loading-lg text-primary"></span>
	</div>
{:else if !session.dek}
	{@render authShell(unlockScreen)}
{:else}
	<div class="bg-base-200 min-h-dvh">
		<header class="navbar bg-base-100 sticky top-0 z-10 shadow-sm">
			<div class="flex-1">
				<a href="/" class="btn btn-ghost text-xl">{@render brand()}</a>
			</div>
			<a href="/parametres" class="btn btn-ghost btn-circle" aria-label="Paramètres" title="Paramètres">
				<Icon name="settings" />
			</a>
			<button class="btn btn-ghost btn-circle" onclick={lock} aria-label="Verrouiller" title="Verrouiller">
				<Icon name="lock" />
			</button>
		</header>
		<main class="mx-auto max-w-3xl px-4 pt-6 pb-28">{@render children()}</main>
	</div>
{/if}

{#snippet unlockScreen()}
	<Unlock />
{/snippet}
