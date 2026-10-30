import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
	it('explique un échec de déchiffrement, dont le message est vide sous Chrome', () => {
		expect(errorMessage(new DOMException('', 'OperationError'))).toMatch(/illisibles/);
	});

	it('ne renvoie jamais de message vide : les pages en déduisent qu’il n’y a pas d’erreur', () => {
		expect(errorMessage(new Error(''))).toBe('Erreur inattendue.');
	});

	it('garde nos propres messages', () => {
		expect(errorMessage(new Error('Session verrouillée.'))).toBe('Session verrouillée.');
	});
});
