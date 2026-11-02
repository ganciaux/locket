/**
 * Préparation des images dans le navigateur (canvas) : image principale ≤ 1600 px, miniature ≤ 640 px.
 * WebP si le navigateur sait l'encoder, sinon JPEG (Safari renvoie du PNG pour un type non supporté).
 */
import type { Bytes } from '$lib/crypto/encoding';
import { encodeUnderLimit, fitWithin } from './model';
import type { PreparedImage } from './repository';

const IMAGE_MAX_PX = 1600;
// Carte L sur téléphone : toute la largeur, soit environ 1000 pixels physiques sur un écran 3x.
const THUMB_MAX_PX = 640;
const THUMB_QUALITY = 0.75;

let supportsWebp: Promise<boolean> | undefined;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encodage impossible.'))), type, quality)
	);
}

function outputType(): Promise<string> {
	supportsWebp ??= canvasToBlob(Object.assign(document.createElement('canvas'), { width: 1, height: 1 }), 'image/webp', 0.8)
		.then((blob) => blob.type === 'image/webp')
		.catch(() => false);
	return supportsWebp.then((webp) => (webp ? 'image/webp' : 'image/jpeg'));
}

async function encode(source: ImageBitmap, maxPx: number, type: string, quality: number): Promise<Bytes> {
	const { width, height } = fitWithin(source.width, source.height, maxPx);
	const canvas = Object.assign(document.createElement('canvas'), { width, height });
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas indisponible.');
	if (type === 'image/jpeg') {
		// Le JPEG n'a pas de transparence : fond blanc plutôt que noir.
		context.fillStyle = '#fff';
		context.fillRect(0, 0, width, height);
	}
	context.drawImage(source, 0, 0, width, height);
	return new Uint8Array(await (await canvasToBlob(canvas, type, quality)).arrayBuffer());
}

export async function prepareImage(file: File): Promise<PreparedImage> {
	let source: ImageBitmap;
	try {
		// L'orientation EXIF des photos est appliquée par défaut.
		source = await createImageBitmap(file);
	} catch {
		throw new Error('Ce fichier n’est pas une image lisible.');
	}
	try {
		const type = await outputType();
		const image = await encodeUnderLimit((quality, scale) =>
			encode(source, Math.round(IMAGE_MAX_PX * scale), type, quality)
		);
		const thumb = await encode(source, THUMB_MAX_PX, type, THUMB_QUALITY);
		return { type, image, thumb };
	} finally {
		source.close();
	}
}

/** Une miniature déjà à la taille maximale n'a rien à gagner à être refaite. */
export async function isFullSizeThumb(thumb: Bytes, type: string): Promise<boolean> {
	const source = await createImageBitmap(new Blob([thumb], { type }));
	const fullSize = Math.max(source.width, source.height) >= THUMB_MAX_PX;
	source.close();
	return fullSize;
}

/** Refait une miniature depuis l'image stockée ; null si ce navigateur n'encode pas le format de la fiche (WebP sur Safari). */
export async function rebuildThumb(image: Bytes, type: string): Promise<Bytes | null> {
	if (type === 'image/webp' && (await outputType()) !== type) return null;
	const source = await createImageBitmap(new Blob([image], { type }));
	try {
		return await encode(source, THUMB_MAX_PX, type, THUMB_QUALITY);
	} finally {
		source.close();
	}
}

/** Couleurs d'une version 8 × 8 de l'image (RVB), pour comparer deux images : voir similar.ts. */
export async function imageFingerprint(image: Bytes, type: string): Promise<Uint8ClampedArray> {
	const source = await createImageBitmap(new Blob([image], { type }));
	try {
		const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Canvas indisponible.');
		context.drawImage(source, 0, 0, 8, 8);
		return context.getImageData(0, 0, 8, 8).data.filter((_, i) => i % 4 !== 3);
	} finally {
		source.close();
	}
}

/** URL affichable pour des octets déchiffrés ; à libérer avec URL.revokeObjectURL. */
export const bytesToUrl = (bytes: Bytes, type: string): string => URL.createObjectURL(new Blob([bytes], { type }));
