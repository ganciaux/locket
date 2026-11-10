/**
 * Glissement du doigt : horizontal pour passer à la fiche voisine, vertical pour fermer une fiche agrandie, sans gêner
 * le défilement.
 */
const MIN_DISTANCE_PX = 60;

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** Geste net dans un axe (au moins deux fois plus long que dans l'autre) et assez long ; sinon null. */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
	if (Math.abs(dx) >= MIN_DISTANCE_PX && Math.abs(dx) >= 2 * Math.abs(dy)) return dx < 0 ? 'left' : 'right';
	if (Math.abs(dy) >= MIN_DISTANCE_PX && Math.abs(dy) >= 2 * Math.abs(dx)) return dy < 0 ? 'up' : 'down';
	return null;
}

/**
 * Le geste part-il d'un endroit déjà défilé jusqu'en bas ? Zone qui défile la plus proche entre `target` et `root` ;
 * aucune : oui. Sinon, glisser vers le haut fait défiler le contenu, ce n'est pas un geste de fermeture.
 */
function scrolledToEnd(target: EventTarget | null, root: HTMLElement): boolean {
	for (let el = target instanceof Element ? target : null; el; el = el === root ? null : el.parentElement) {
		if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))
			return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
	}
	return true;
}

type SwipeHandlers = { onleft?: () => void; onright?: () => void; onup?: () => void };

/**
 * Action Svelte : `use:swipe={{ onleft, onright, onup }}`. Deux doigts (zoom du navigateur) ne comptent pas. Parti d'une
 * zone qui défile à l'horizontale (`data-no-swipe` : bande, carrousel d'images), un geste horizontal lui revient ; vers
 * le haut, il compte encore. Vers le haut : seulement depuis le bas du contenu.
 */
export function swipe(node: HTMLElement, initial: SwipeHandlers) {
	let handlers = initial;
	let start: { x: number; y: number; atEnd: boolean; sideways: boolean } | null = null;

	function onStart(event: TouchEvent) {
		const touch = event.touches[0];
		const scrolls = event.target instanceof Element && !!event.target.closest('[data-no-swipe]');
		start =
			event.touches.length === 1
				? { x: touch.clientX, y: touch.clientY, atEnd: !!handlers.onup && scrolledToEnd(event.target, node), sideways: !scrolls }
				: null;
	}

	function onEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!start || !touch) return;
		const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
		const { atEnd, sideways } = start;
		start = null;
		if (direction === 'left' && sideways) handlers.onleft?.();
		if (direction === 'right' && sideways) handlers.onright?.();
		if (direction === 'up' && atEnd) handlers.onup?.();
	}

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchend', onEnd, { passive: true });
	return {
		update(next: SwipeHandlers) {
			handlers = next;
		},
		destroy() {
			node.removeEventListener('touchstart', onStart);
			node.removeEventListener('touchend', onEnd);
		}
	};
}
