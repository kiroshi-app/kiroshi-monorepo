import type { SnippetPart } from "@/lib/bindings"

const MATCH_OPENS = "\u0002"
const MATCH_CLOSES = "\u0003"

const CITATION_REDUCTIONS = [
	[/!?\[([^\]]*)\]\(<[^>]*>\)/g, "$1"],
	[/^…([^[\]]*)\]\(<[^>]*>\)/, "…$1"],
	[/^…[^<>[\]]*>\)/, "…"],
	[/!?\[([^\]]*)\]\(<[^>]*…$/, "$1…"],
	[/!?\[([^\]]*…)$/, "$1"],
] as const satisfies readonly (readonly [RegExp, string])[]

const markedText = (snippet: SnippetPart[]): string =>
	snippet
		.map(({ text, matched }) =>
			matched ? `${MATCH_OPENS}${text}${MATCH_CLOSES}` : text,
		)
		.join("")

const runParts = (run: string): SnippetPart[] => {
	const close = run.indexOf(MATCH_CLOSES)
	if (close === -1) {
		return [{ text: run, matched: false }]
	}
	return [
		{ text: run.slice(0, close), matched: true },
		{ text: run.slice(close + MATCH_CLOSES.length), matched: false },
	]
}

const partsOf = (text: string): SnippetPart[] =>
	text
		.split(MATCH_OPENS)
		.flatMap(runParts)
		.filter((part) => part.text !== "")

export const withCitedFileLabels = (snippet: SnippetPart[]): SnippetPart[] =>
	partsOf(
		CITATION_REDUCTIONS.reduce(
			(text, [citation, label]) => text.replace(citation, label),
			markedText(snippet),
		),
	)
