import { describe, expect, it } from 'vitest';
import { storeName, timeLeft } from './format';

describe('storeName', () => {
	it('turns a printed all-caps name into title case', () => {
		expect(storeName('PARIVAR GROCERS')).toBe('Parivar Grocers');
		expect(storeName("SAM'S CLUB")).toBe("Sam's Club");
	});

	it('keeps initials and names someone already typed', () => {
		expect(storeName('H-E-B')).toBe('H-E-B');
		expect(storeName('IGA')).toBe('IGA');
		expect(storeName('Trader Joe’s')).toBe('Trader Joe’s');
		expect(storeName('McAllen HEB')).toBe('McAllen HEB');
		expect(storeName(null)).toBeNull();
	});
});

describe('timeLeft', () => {
	it('reads like a clock, not a timer', () => {
		expect(timeLeft(3 * 3600_000)).toBe('3 hours');
		expect(timeLeft(65 * 60_000 - 1000)).toBe('1 hour 5 min');
		expect(timeLeft(61 * 60_000)).toBe('1 hour 5 min');
		expect(timeLeft(40 * 60_000)).toBe('40 min');
		expect(timeLeft(3 * 60_000 - 1000)).toBe('3 min');
		expect(timeLeft(30_000)).toBe('less than a minute');
	});
});
