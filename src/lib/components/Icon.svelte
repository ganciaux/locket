<script lang="ts" module>
	// Icônes au trait (24 × 24), en SVG inline : pas de dépendance, compatible CSP.
	const PATHS = {
		plus: 'M12 5v14M5 12h14',
		chart: 'M4 20h16M7 16v-4M12 16V6M17 16v-7',
		close: 'M6 6l12 12M18 6 6 18',
		back: 'M15 18l-6-6 6-6',
		forward: 'M9 18l6-6-6-6',
		chevronDown: 'M6 9l6 6 6-6',
		chevronRight: 'M9 6l6 6-6 6',
		chevronUp: 'M6 15l6-6 6 6',
		// Rosette avec une coche : fiche validée.
		validated:
			'M8.6 3.9a4 4 0 0 1 6.8 0 4 4 0 0 1 4.7 4.7 4 4 0 0 1 0 6.8 4 4 0 0 1-4.7 4.7 4 4 0 0 1-6.8 0 4 4 0 0 1-4.7-4.7 4 4 0 0 1 0-6.8 4 4 0 0 1 4.7-4.7zM9 12l2 2 4-4',
		dice: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
		shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4',
		lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
		face: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 9v1M15 9v1M12 9v4h-1M9 16a4 4 0 0 0 6 0',
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
		folder: 'M3 6h6l2 2h10v11H3z',
		podium: 'M3 20h18M4 20v-6h5v6M9 20V8h6v12M15 20v-9h5v9',
		list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
		save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-7h8v7',
		saveMore: 'M8 8h9l3 3v9H8zM11 8v4h5V8M11 20v-5h6v5M4 16V4h11'
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
