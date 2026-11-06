import { boardNameOf } from "@workspace/ui/components/markdown/board-link"

const CODE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g

const INLINE_LINK = /(?<!!)\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^)\s]*))/g

const BOARD_SUFFIX = /\.canvas$/i

const FOLDERS = /^.*[\\/]/

export const boardFileOf = (name: string) =>
	`${name.replace(FOLDERS, "").replace(BOARD_SUFFIX, "")}.canvas`

export const linkedBoardFilesOf = (text: string) =>
	new Set(
		[...text.replace(CODE, "").matchAll(INLINE_LINK)].flatMap(
			([, bracketed, bare]) => {
				const name = boardNameOf(bracketed ?? bare)
				return name === null ? [] : [boardFileOf(name)]
			},
		),
	)
