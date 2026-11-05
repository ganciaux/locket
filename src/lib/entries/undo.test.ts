import { describe, expect, it } from 'vitest';
import { revertTo } from './undo';

type Item = { id: string; name: string; tagIds?: string[]; hidden?: boolean; deletedAt?: number; thumbUrl?: string };

describe('annulation d’une action groupée', () => {
	it('remet les champs changés, retire ceux ajoutés, ignore ceux de l’affichage', () => {
		const before: Item = { id: 'a', name: 'Akira', tagIds: ['x'], thumbUrl: 'blob:1' };
		const after: Item = { id: 'a', name: 'Akira', tagIds: ['x', 'y'], hidden: true, deletedAt: 5, thumbUrl: 'blob:2' };
		const patch = revertTo(after, before);
		expect(patch).toEqual({ name: 'Akira', tagIds: ['x'], hidden: undefined, deletedAt: undefined });
		expect('hidden' in patch && 'deletedAt' in patch).toBe(true);
		expect('id' in patch || 'thumbUrl' in patch).toBe(false);
	});

	it('rend un champ retiré par l’action', () => {
		const before: Item = { id: 'a', name: 'Akira', tagIds: ['x'] };
		const after: Item = { id: 'a', name: 'Akira' };
		expect(revertTo(after, before)).toEqual({ name: 'Akira', tagIds: ['x'] });
	});
});
