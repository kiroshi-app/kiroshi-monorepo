import { boardNameOf } from "@workspace/ui/components/markdown/board-link"

const CODE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g

const INLINE_LINK = /(?<!!)\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^)\s]*))/g

const DEFINITION = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))/gm

const REFERENCE = /(?<!!)\[([^\]\n]*)\](?:\[([^\]\n]*)\])?(?![(:])/g

const BOARD_SUFFIX = /\.canvas$/i

const FOLDERS = /^.*[\\/]/

export const boardFileOf = (name: string) =>
	`${name.replace(FOLDERS, "").replace(BOARD_SUFFIX, "")}.canvas`

const labelOf = (label: string) =>
	label.trim().replace(/\s+/g, " ").toLowerCase()

const referencedLabelsOf = (prose: string) =>
	new Set(
		[...prose.replace(DEFINITION, "").matchAll(REFERENCE)].map(
			([, words, label]) => labelOf(label || words),
		),
	)

const inlineHrefsOf = (prose: string) =>
	[...prose.matchAll(INLINE_LINK)].map(
		([, bracketed, bare]) => bracketed ?? bare,
	)

const referenceHrefsOf = (prose: string) => {
	const referenced = referencedLabelsOf(prose)
	return [...prose.matchAll(DEFINITION)].flatMap(
		([, label, bracketed, bare]) =>
			referenced.has(labelOf(label)) ? [bracketed ?? bare] : [],
	)
}

export const linkedBoardFilesOf = (text: string) => {
	const prose = text.replace(CODE, "")
	return new Set(
		[...inlineHrefsOf(prose), ...referenceHrefsOf(prose)].flatMap((href) => {
			const name = boardNameOf(href)
			return name === null ? [] : [boardFileOf(name)]
		}),
	)
}
