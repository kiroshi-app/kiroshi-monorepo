import type { MarkdownRun } from "@workspace/ui/components/markdown/runs"

import { titleOf } from "@/lib/library/library-items"

const OUTSIDE_PROSE =
	/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|<[^>\s]+>/g

const ENDS_IN_LINK = /(?:\]\([^)\n]*\)|<[^>\s]+>|(?:https?:\/\/|www\.)\S+)\s*$/

const PATTERN_SYNTAX = /[.*+?^${}()|[\]\\]/g

const blankedOutsideProse = (text: string) =>
	text.replace(OUTSIDE_PROSE, (skipped) => " ".repeat(skipped.length))

const literally = (value: string) => value.replace(PATTERN_SYNTAX, "\\$&")

const mentionPatternOf = (name: string) => {
	const spellings = [name, titleOf({ kind: "document", name })]
		.map(literally)
		.join("|")
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(?:${spellings})(?![\\p{L}\\p{N}])`,
		"u",
	)
}

const mentionRunOf = (prose: string, name: string): MarkdownRun => {
	const mention = mentionPatternOf(name).exec(prose)
	if (!mention) {
		return { id: name, start: prose.length, end: prose.length }
	}
	return {
		id: name,
		start: mention.index,
		end: mention.index + mention[0].length,
	}
}

const isNamedIn = (prose: string, name: string) =>
	mentionPatternOf(name).test(prose)

export const textCarryingDocuments = (text: string, names: string[]) => {
	if (text.trim() !== "" && !ENDS_IN_LINK.test(text)) {
		return text
	}
	const prose = blankedOutsideProse(text)
	const unnamed = names.filter((name) => !isNamedIn(prose, name))
	return [text.trimEnd(), ...unnamed].filter(Boolean).join(" ")
}

export const isTrailingRun = ({ start, end }: MarkdownRun) => start === end

export const documentRunsOf = (text: string, names: string[]) => {
	const prose = blankedOutsideProse(text)
	return names.map((name) => mentionRunOf(prose, name))
}
