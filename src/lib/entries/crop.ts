/** Recadrage d'une image : le cadre se déplace ou se redimensionne par ses coins, sans sortir de l'image. Fonctions pures. */

export type CropRect = { x: number; y: number; width: number; height: number };
export type CropSize = { width: number; height: number };
/** Le cadre entier, ou l'un de ses coins (nord-ouest, nord-est, sud-ouest, sud-est). */
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const CROP_HANDLES: Exclude<CropHandle, 'move'>[] = ['nw', 'ne', 'sw', 'se'];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Toute l'image : le cadre de départ, et après chaque rotation. */
export const fullCrop = ({ width, height }: CropSize): CropRect => ({ x: 0, y: 0, width, height });

/** Plus petit côté du cadre : 5 % du plus petit côté de l'image, pour garder des poignées saisissables. */
export const minCropSide = ({ width, height }: CropSize): number => Math.max(1, Math.round(Math.min(width, height) * 0.05));

/** Cadre après un glissement de (dx, dy), en pixels de l'image, depuis `start`. */
export function dragCrop(start: CropRect, handle: CropHandle, dx: number, dy: number, image: CropSize): CropRect {
	if (handle === 'move')
		return {
			...start,
			x: clamp(start.x + dx, 0, image.width - start.width),
			y: clamp(start.y + dy, 0, image.height - start.height)
		};
	const min = minCropSide(image);
	let left = start.x;
	let top = start.y;
	let right = start.x + start.width;
	let bottom = start.y + start.height;
	if (handle === 'nw' || handle === 'sw') left = clamp(left + dx, 0, right - min);
	else right = clamp(right + dx, left + min, image.width);
	if (handle === 'nw' || handle === 'ne') top = clamp(top + dy, 0, bottom - min);
	else bottom = clamp(bottom + dy, top + min, image.height);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Centre de la poignée d'un coin, décalé de `inset` vers l'intérieur du cadre : sur le bord de l'image, une poignée
 * centrée sur le coin serait à moitié dehors, donc à moitié insaisissable.
 */
export function handlePoint(rect: CropRect, handle: Exclude<CropHandle, 'move'>, inset = 0): { x: number; y: number } {
	const west = handle === 'nw' || handle === 'sw';
	const north = handle === 'nw' || handle === 'ne';
	return {
		x: west ? rect.x + inset : rect.x + rect.width - inset,
		y: north ? rect.y + inset : rect.y + rect.height - inset
	};
}

/** Le cadre couvre-t-il toute l'image (rien à recadrer) ? */
export const isFullCrop = (rect: CropRect, image: CropSize): boolean =>
	rect.x <= 0 && rect.y <= 0 && rect.width >= image.width && rect.height >= image.height;
