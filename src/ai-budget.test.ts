import { describe, expect, it } from 'vitest';
import { DAILY_CAP_MICROS, USER_DAILY_CAP_MICROS, costMicros, overDailyCap, overUserCap, NEW_ACCOUNTS_CAP_MICROS, overNewAccountsCap, GUEST_CREDIT_FLOOR_MICROS, GUEST_DAILY_CAP_MICROS, guestLimit } from './ai-budget';

describe('costMicros', () => {
	it('prices input and output tokens separately at the catalog rate', () => {
		// 1,000 in at $3/M + 200 out at $15/M = $0.003 + $0.003 = 6,000 micros
		expect(costMicros('vision', { prompt_tokens: 1000, completion_tokens: 200 })).toBe(6000);
	});

	it('rounds a fraction of a micro up, never down', () => {
		// 1 in token at $0.06/M = 0.06 micros
		expect(costMicros('names', { prompt_tokens: 1 })).toBe(1);
	});

	it('treats missing usage as zero instead of failing', () => {
		expect(costMicros('names', {})).toBe(0);
	});
});

describe('overDailyCap', () => {
	it('stops at the cap, not after it', () => {
		expect(overDailyCap(DAILY_CAP_MICROS - 1)).toBe(false);
		expect(overDailyCap(DAILY_CAP_MICROS)).toBe(true);
	});
});

describe('overUserCap', () => {
	it('stops one person well before they could use up the day for everyone', () => {
		expect(overUserCap(USER_DAILY_CAP_MICROS - 1)).toBe(false);
		expect(overUserCap(USER_DAILY_CAP_MICROS)).toBe(true);
		expect(USER_DAILY_CAP_MICROS * 5).toBeLessThanOrEqual(DAILY_CAP_MICROS);
	});
});

describe('overNewAccountsCap', () => {
	it('stops new accounts once their shared half is spent', () => {
		expect(overNewAccountsCap(true, NEW_ACCOUNTS_CAP_MICROS)).toBe(true);
		expect(overNewAccountsCap(true, NEW_ACCOUNTS_CAP_MICROS - 1)).toBe(false);
	});

	it('never stops an older account', () => {
		expect(overNewAccountsCap(false, NEW_ACCOUNTS_CAP_MICROS * 10)).toBe(false);
	});
});

describe('guestLimit', () => {
	it('lets guests read under both limits', () => {
		expect(guestLimit(GUEST_DAILY_CAP_MICROS - 1, GUEST_CREDIT_FLOOR_MICROS - 1)).toBeNull();
	});

	it('closes the day once the guest pool is spent', () => {
		expect(guestLimit(GUEST_DAILY_CAP_MICROS, 0)).toBe('pool');
	});

	it('stops guests for good near the end of the credits, even on a quiet day', () => {
		expect(guestLimit(0, GUEST_CREDIT_FLOOR_MICROS)).toBe('credits');
	});
});
