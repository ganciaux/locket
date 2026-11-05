<script lang="ts">
	// Recadrer et pivoter une image avant l'enregistrement. L'image tournée est dessinée dans un canvas ; le cadre est
	// un SVG posé dessus, positionné par ses attributs (la CSP interdit le style en ligne). Rendu : PNG, ensuite
	// préparé (redimensionné, chiffré) comme n'importe quelle image choisie.
	import Icon from '$lib/components/Icon.svelte';
	import {
		CROP_HANDLES,
		type CropHandle,
		type CropRect,
		dragCrop,
		fullCrop,
		handlePoint,
		isFullCrop
	} from '$lib/entries/crop';

	let { source, onapply, oncancel }: { source: Blob; onapply: (file: File) => void; oncancel: () => void } = $props();

	// Au-delà, la mémoire des iPhone souffre ; l'image enregistrée fait de toute façon 1600 px au plus.
	const WORK_MAX_PX = 3200;

	let bitmap = $state<ImageBitmap | null>(null);
	let error = $state('');
	let turns = $state(0);
	let canvas = $state<HTMLCanvasElement>();
	let svg = $state<SVGSVGElement>();
	let size = $state({ width: 0, height: 0 });
	let crop = $state<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
	let busy = $state(false);

	$effect(() => {
		let current: ImageBitmap | undefined;
		let alive = true;
		createImageBitmap(source)
			.then((loaded) => {
				if (alive) bitmap = current = loaded;
				else loaded.close();
			})
			.catch(() => (error = 'Image illisible.'));
		return () => {
			alive = false;
			current?.close();
		};
	});

	// Image tournée de `turns` quarts de tour : aperçu et source du recadrage. Une rotation remet le cadre à l'image entière.
	$effect(() => {
		if (!bitmap || !canvas) return;
		const scale = Math.min(1, WORK_MAX_PX / Math.max(bitmap.width, bitmap.height));
		const width = Math.round(bitmap.width * scale);
		const height = Math.round(bitmap.height * scale);
		const sideways = turns % 2 === 1;
		canvas.width = sideways ? height : width;
		canvas.height = sideways ? width : height;
		const context = canvas.getContext('2d');
		if (!context) return void (error = 'Canvas indisponible.');
		context.translate(canvas.width / 2, canvas.height / 2);
		context.rotate((turns * Math.PI) / 2);
		context.drawImage(bitmap, -width / 2, -height / 2, width, height);
		const drawn = { width: canvas.width, height: canvas.height };
		size = drawn;
		crop = fullCrop(drawn);
	});

	// Poignées : environ 12 px à l'écran, quelle que soit la taille de l'image.
	const handleRadius = $derived(Math.max(size.width, size.height) / 40);

	let drag: { handle: CropHandle; x: number; y: number; start: CropRect; ratio: number } | null = null;

	function onPointerDown(event: PointerEvent) {
		const handle = (event.target as Element).getAttribute('data-handle') as CropHandle | null;
		if (!handle || !svg) return;
		event.preventDefault();
		const box = svg.getBoundingClientRect();
		drag = { handle, x: event.clientX, y: event.clientY, start: { ...crop }, ratio: size.width / box.width };
		svg.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag) return;
		const { handle, x, y, start, ratio } = drag;
		crop = dragCrop(start, handle, (event.clientX - x) * ratio, (event.clientY - y) * ratio, size);
	}

	const rotate = (delta: 1 | 3) => (turns = (turns + delta) % 4);

	async function apply() {
		if (!canvas || busy) return;
		busy = true;
		try {
			const out = Object.assign(document.createElement('canvas'), {
				width: Math.round(crop.width),
				height: Math.round(crop.height)
			});
			out.getContext('2d')?.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height);
			const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
			if (!blob) throw new Error();
			onapply(new File([blob], 'image.png', { type: 'image/png' }));
		} catch {
			error = 'Recadrage impossible.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-3" role="group" aria-label="Recadrer et pivoter">
	{#if error}<p class="alert alert-error alert-soft text-sm">{error}</p>{/if}
	<div class="bg-base-200 rounded-box flex justify-center p-2">
		<div class="relative">
			<canvas bind:this={canvas} class="block h-auto max-h-[60vh] w-auto max-w-full" aria-label="Image à recadrer"></canvas>
			{#if size.width}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<svg
					bind:this={svg}
					class="absolute inset-0 size-full touch-none select-none"
					viewBox="0 0 {size.width} {size.height}"
					preserveAspectRatio="none"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={() => (drag = null)}
					onpointercancel={() => (drag = null)}
				>
					<!-- Hors du cadre : assombri. -->
					<path
						class="fill-black/55"
						fill-rule="evenodd"
						d="M0 0H{size.width}V{size.height}H0Z M{crop.x} {crop.y}h{crop.width}v{crop.height}h{-crop.width}Z"
					/>
					<rect
						data-handle="move"
						class="cursor-move fill-transparent stroke-white"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
						x={crop.x}
						y={crop.y}
						width={crop.width}
						height={crop.height}
					/>
					{#each CROP_HANDLES as handle (handle)}
						{@const point = handlePoint(crop, handle, handleRadius)}
						<circle
							data-handle={handle}
							class="fill-white stroke-black/40 {handle === 'nw' || handle === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}"
							stroke-width="1"
							vector-effect="non-scaling-stroke"
							cx={point.x}
							cy={point.y}
							r={handleRadius}
						/>
					{/each}
				</svg>
			{:else if !error}
				<span class="loading loading-spinner loading-md m-8"></span>
			{/if}
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<button type="button" class="btn btn-ghost btn-sm btn-square" onclick={() => rotate(3)} aria-label="Pivoter à gauche" title="Pivoter à gauche">
			<Icon name="rotateLeft" class="size-4" />
		</button>
		<button type="button" class="btn btn-ghost btn-sm btn-square" onclick={() => rotate(1)} aria-label="Pivoter à droite" title="Pivoter à droite">
			<Icon name="rotateRight" class="size-4" />
		</button>
		<button type="button" class="btn btn-ghost btn-sm" disabled={isFullCrop(crop, size)} onclick={() => (crop = fullCrop(size))}>
			Image entière
		</button>
		<span class="ml-auto flex gap-2">
			<button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Annuler</button>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={busy || !size.width || (isFullCrop(crop, size) && turns === 0)}
				onclick={apply}
			>
				<Icon name="check" class="size-4" /> Appliquer
			</button>
		</span>
	</div>
	<p class="text-base-content/60 text-xs">Faites glisser le cadre ou ses coins. L'image est remplacée à l'enregistrement de la fiche.</p>
</div>
