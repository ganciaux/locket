<script lang="ts">
	import { lock } from '$lib/auth/session.svelte';
</script>

<h1>Locket</h1>
<p>Aucune fiche pour l'instant.</p>

<p><a href="/parametres">Paramètres</a></p>
<p><button class="link" onclick={lock}>Verrouiller</button></p>
