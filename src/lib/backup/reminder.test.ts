import { describe, expect, it } from 'vitest';
import { REMIND_AFTER_DAYS, daysSince, isReminderDue } from './reminder';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 29);

describe('rappel de sauvegarde', () => {
	it('rappelle si aucune sauvegarde ou si la dernière est trop ancienne', () => {
		expect(isReminderDue({}, now)).toBe(true);
		expect(isReminderDue({ lastAt: now - REMIND_AFTER_DAYS * DAY }, now)).toBe(true);
		expect(isReminderDue({ lastAt: now - (REMIND_AFTER_DAYS - 1) * DAY }, now)).toBe(false);
	});

	it('se tait pendant la période « Plus tard »', () => {
		expect(isReminderDue({ snoozedUntil: now + DAY }, now)).toBe(false);
		expect(isReminderDue({ snoozedUntil: now - 1 }, now)).toBe(true);
	});

	it('compte les jours entiers écoulés', () => {
		expect(daysSince(now - 45 * DAY - 1000, now)).toBe(45);
	});
});
