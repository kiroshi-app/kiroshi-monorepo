import { createContext, type ReactNode } from "react"

import {
	attachmentPathOf,
	isStoredAttachmentPath,
} from "@workspace/ui/components/markdown/attachments"

type MarkdownBoardLinkRenderProps = {
	name: string
	words: string
}

type MarkdownBoardLinkRenderer = (
	props: MarkdownBoardLinkRenderProps,
) => ReactNode

const MarkdownBoardLinkContext =
	createContext<MarkdownBoardLinkRenderer | null>(null)

const BOARD_FILE = /\.canvas$/i

const boardNameOf = (href: string | undefined) => {
	const path = attachmentPathOf(href)
	return path !== null && BOARD_FILE.test(path) && !isStoredAttachmentPath(href)
		? path
		: null
}

export {
	boardNameOf,
	MarkdownBoardLinkContext,
	type MarkdownBoardLinkRenderer,
	type MarkdownBoardLinkRenderProps,
}
