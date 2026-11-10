/**
 * Glisser-déposer pour réordonner : `use:sortable={{ onmove }}` sur la liste, `data-sort-index` sur chaque élément.
 * Souris : dès quelques pixels. Doigt : après un appui immobile (avant, le doigt fait défiler la page, comme partout).
 * L'élément suit le pointeur (`data-dragging`), celui qu'il survole est la destination (`data-drop-target`, app.css).
 * Les boutons ← → de chaque élément restent l'accès clavier : ce geste n'est qu'un raccourci.
 */
const HOLD_MS = 300;
const MOUSE_THRESHOLD_PX = 5;
const TOUCH_SLOP_PX = 8;

type SortableOptions = { onmove: (from: number, to: number) => void; disabled?: boolean };

type Drag = {
	item: HTMLElement;
	from: number;
	pointerId: number;
	x: number;
	y: number;
	active: boolean;
	timer?: ReturnType<typeof setTimeout>;
	target?: HTMLElement;
};

export function sortable(node: HTMLElement, initial: SortableOptions) {
	let options = initial;
	let drag: Drag | null = null;

	const itemIn = (el: Element | null) => {
		const item = el?.closest<HTMLElement>('[data-sort-index]');
		return item && node.contains(item) ? item : undefined;
	};

	function onDown(event: PointerEvent) {
		if (options.disabled || drag || !event.isPrimary || event.button !== 0) return;
		const target = event.target instanceof Element ? event.target : null;
		const item = itemIn(target);
		if (!item || target?.closest('button, a, input')) return;
		drag = { item, from: Number(item.dataset.sortIndex), pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
		if (event.pointerType !== 'mouse') drag.timer = setTimeout(start, HOLD_MS);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', stop);
	}

	function start() {
		if (!drag) return;
		drag.active = true;
		drag.item.dataset.dragging = '';
	}

	function onMove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (!drag.active) {
			// Doigt qui bouge avant la fin de l'appui : c'est un défilement, pas un glisser.
			if (event.pointerType !== 'mouse') return void (Math.hypot(dx, dy) > TOUCH_SLOP_PX && stop());
			if (Math.hypot(dx, dy) < MOUSE_THRESHOLD_PX) return;
			start();
		}
		drag.item.style.translate = `${dx}px ${dy}px`;
		const over = itemIn(document.elementFromPoint(event.clientX, event.clientY));
		const target = over === drag.item ? undefined : over;
		if (target === drag.target) return;
		if (drag.target) delete drag.target.dataset.dropTarget;
		if (target) target.dataset.dropTarget = '';
		drag.target = target;
	}

	function onUp(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const { active, from, target } = drag;
		stop();
		if (active && target) options.onmove(from, Number(target.dataset.sortIndex));
	}

	function stop() {
		if (!drag) return;
		clearTimeout(drag.timer);
		drag.item.style.translate = '';
		delete drag.item.dataset.dragging;
		if (drag.target) delete drag.target.dataset.dropTarget;
		drag = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', stop);
	}

	// Pendant un glisser au doigt, la page ne défile pas ; l'appui long n'ouvre pas le menu de l'image.
	const onTouchMove = (event: TouchEvent) => drag?.active && event.preventDefault();
	const onContextMenu = (event: Event) => drag && event.preventDefault();
	// Glisser natif d'une image (souris) : remplacé par celui-ci.
	const onDragStart = (event: DragEvent) => itemIn(event.target as Element) && event.preventDefault();

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('touchmove', onTouchMove, { passive: false });
	node.addEventListener('contextmenu', onContextMenu);
	node.addEventListener('dragstart', onDragStart);

	return {
		update(next: SortableOptions) {
			options = next;
		},
		destroy() {
			stop();
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('contextmenu', onContextMenu);
			node.removeEventListener('dragstart', onDragStart);
		}
	};
}
