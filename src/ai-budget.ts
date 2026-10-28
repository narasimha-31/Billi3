// Exact Token Factory ids, catalog prices (USD per 1M tokens) and a hard limit on each answer.
// Measured Oct 13-16: Qwen's slowest good read of a real receipt took 7 seconds (36 reads),
// Nemotron VL's slowest eval read 3.1, Super's slowest naming 3.7. Ten seconds without an answer means down.
export const MODELS = {
	// Oct 16 bake-off of all 9 image models on three real crumpled receipts, three runs each: Kimi K2.7
	// Code read 129 of 129 lines with every total adding up (median 4.5 s, slowest 9.0 s). Kimi K3
	// was faster but five times the price and glued weight lines into names; Qwen added 23 lines.
	vision: { id: 'moonshotai/Kimi-K2.7-Code', input: 0.95, output: 4, seconds: 10 },
	// Nemotron 3.5 Super VL as the backup: 114 of 129 in the same bake-off at under a third of the price
	visionBackup: { id: 'nvidia/Nemotron-3.5-Super-VL', input: 0.3, output: 0.9, seconds: 10 },
	// Super over Lightning: in a side-by-side on real receipt lines Lightning merged shampoo and chicken
	// thighs into "Chicken breast"; Super kept them apart. A wrong merge corrupts price comparisons.
	names: { id: 'nvidia/nemotron-3-super-120b-a12b', input: 0.3, output: 0.9, seconds: 10 },
	// Qwen judges whether two product names are one product. Oct 16, 83 shopper-checked pairs,
	// 30 of them held out from tuning, three runs: no wrong merge, 2 of 31 true pairs missed. Super
	// made two wrong merges on the same pairs, and every model went wrong when a high embedding
	// score alone was allowed to merge.
	judge: { id: 'Qwen/Qwen3.8-27B', input: 0.45, output: 3, seconds: 10 },
	// product names become vectors so the same product groups together however it was worded
	embed: { id: 'Qwen/Qwen3-Embedding-8B', input: 0.01, output: 0, seconds: 10 }
} as const;

export type ModelRole = keyof typeof MODELS;

// 75 cents a day across everyone: about 68 receipts at the Oct 16 cost of 1.1 cents each (read,
// names, product match), and a hard ceiling on the credits: under $10 if hit every day to Oct 29
export const DAILY_CAP_MICROS = 750_000;

// a price per 1M tokens times tokens is exactly millionths of a dollar; round up so we never undercount
export function costMicros(role: ModelRole, usage: { prompt_tokens?: number; completion_tokens?: number }) {
	const { input, output } = MODELS[role];
	return Math.ceil((usage.prompt_tokens ?? 0) * input + (usage.completion_tokens ?? 0) * output);
}

// 15 cents a day per person, enough for the 10 receipts a day the database allows at 1.1 cents each.
// Counted from the call log, which people cannot touch, so deleting receipts and adding them
// again never buys more reads.
export const USER_DAILY_CAP_MICROS = 150_000;

export function overDailyCap(spentTodayMicros: number) {
	return spentTodayMicros >= DAILY_CAP_MICROS;
}

// Accounts under three days old share half the day's budget between them. Fresh accounts made by
// the thousand then use up that half, never the half that keeps earlier shoppers reading.
export const NEW_ACCOUNTS_CAP_MICROS = DAILY_CAP_MICROS / 2;

export function overNewAccountsCap(isNew: boolean, newSpentTodayMicros: number) {
	return isNew && newSpentTodayMicros >= NEW_ACCOUNTS_CAP_MICROS;
}

export function overUserCap(userSpentTodayMicros: number) {
	return userSpentTodayMicros >= USER_DAILY_CAP_MICROS;
}

// Guests share $1.50 a day of their own, about 135 reads, and stop for good once $22 of the $25 in
// credits is gone, so shoppers keep reading after the judging ends.
export const GUEST_DAILY_CAP_MICROS = 1_500_000;
export const GUEST_CREDIT_FLOOR_MICROS = 22_000_000;

export function guestLimit(guestSpentTodayMicros: number, everSpentMicros: number): 'pool' | 'credits' | null {
	if (everSpentMicros >= GUEST_CREDIT_FLOOR_MICROS) return 'credits';
	if (guestSpentTodayMicros >= GUEST_DAILY_CAP_MICROS) return 'pool';
	return null;
}

export const GUEST_LIMIT_NOTES = {
	pool: 'Guest reads are used up for today. More open up tomorrow. You can still explore the sample receipts.',
	credits: 'Guest reading has ended for this event. You can still explore the sample receipts.'
};

// the names people know the reading models by
const READER_NAMES: Record<string, string> = {
	[MODELS.vision.id]: 'Kimi K2.7',
	[MODELS.visionBackup.id]: 'NVIDIA Nemotron 3.5 Super VL'
};
export const readerName = (id: string) => READER_NAMES[id] ?? id;
