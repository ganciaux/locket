<script lang="ts" module>
	// Icônes au trait (24 × 24), en SVG inline : pas de dépendance, compatible CSP.
	const PATHS = {
		plus: 'M12 5v14M5 12h14',
		close: 'M6 6l12 12M18 6 6 18',
		back: 'M15 18l-6-6 6-6',
		chevronDown: 'M6 9l6 6 6-6',
		chevronUp: 'M6 15l6-6 6 6',
		shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4',
		lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
		settings: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4',
		edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
		trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
		link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
		external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
		image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 8.5a1 1 0 1 0 0 .01',
		copy: 'M8 8h12v12H8zM4 16V4h12',
		import: 'M12 4v11M7 10l5 5 5-5M4 20h16',
		tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
		check: 'M5 12l5 5 9-10',
		folder: 'M3 6h6l2 2h10v11H3z'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, class: className = 'size-5' }: { name: IconName; class?: string } = $props();
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={PATHS[name]} />
</svg>
