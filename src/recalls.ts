export type Recall = { url: string; title: string; published_on: string | null; found_on: string };

// words too common to tie a notice to a product
const COMMON = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'with', 'for', 'to', 'or', 'on', 'by', 'ct', 'oz', 'lb', 'pack', 'fresh']);

// "tomatoes" and "tomato", "rolls" and "roll", "berries" and "berry" are one word here
function stem(word: string) {
	if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
	if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
	if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
	return word;
}

const wordsOf = (text: string) => (text.toLowerCase().match(/[a-z]+/g) ?? []).map(stem);
const keyWords = (product: string) => [...new Set(wordsOf(product).filter((w) => !COMMON.has(w) && w.length > 1))];

// a product is named in a headline when every one of its own words is there. O(products x words).
export function names(title: string, product: string) {
	const words = new Set(wordsOf(title));
	const mine = keyWords(product);
	return mine.length > 0 && mine.every((w) => words.has(w));
}

// each notice once, with the first of the shopper's products it names. Each title and product is split
// into words once, so O(recalls x products x words) set lookups.
export function recallsFor(recalls: Recall[], bought: string[]) {
	const products = bought.map((name) => ({ name, words: keyWords(name) })).filter((p) => p.words.length);
	return recalls.flatMap((recall) => {
		const words = new Set(wordsOf(recall.title));
		const product = products.find((p) => p.words.every((w) => words.has(w)))?.name;
		return product ? [{ ...recall, product }] : [];
	});
}

// a single recall or safety alert page, not a list of them or a medical device notice
export const isRecallNotice = (url: string) => /^https:\/\/www\.fda\.gov\/(safety\/recalls-market-withdrawals-safety-alerts|food\/alerts-advisories-safety-information)\/[a-z0-9-]+$/.test(url);

// " | FDA", " - NPR" and the like off the end
export const plainTitle = (title: string) => title.replace(/\s+[|\-–]\s+[^|\-–]{2,40}$/, '').trim().slice(0, 300);
