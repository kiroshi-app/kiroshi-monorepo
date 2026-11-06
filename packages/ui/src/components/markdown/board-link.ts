import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	type ReactNode,
	useContext,
} from "react"

import {
	attachmentPathOf,
	isStoredAttachmentPath,
} from "@workspace/ui/components/markdown/attachments"
import { textOf } from "@workspace/ui/components/markdown/link"

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

type BoardLinkNode = {
	type: string
	tagName?: string
	value?: string
	properties?: { href?: unknown }
	children?: BoardLinkNode[]
}

const NESTED_LISTS = new Set(["ul", "ol"])

const OWNERS_OF_THEIR_LINKS = new Set([
	...NESTED_LISTS,
	"p",
	"table",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
])

const boardLinksIn = (node: BoardLinkNode): MarkdownBoardLinkRenderProps[] => {
	if (node.tagName && OWNERS_OF_THEIR_LINKS.has(node.tagName)) return []
	if (node.tagName !== "a") return boardLinksOf(node)
	const { href } = node.properties ?? {}
	const name = boardNameOf(typeof href === "string" ? href : undefined)
	return name === null ? [] : [{ name, words: textOf(node) }]
}

const boardLinksOf = (node: BoardLinkNode) =>
	(node.children ?? []).flatMap(boardLinksIn)

const isBlankText = ({ type, value }: BoardLinkNode) =>
	type === "text" && !value?.trim()

const isLoneBoardLink = (node: BoardLinkNode) => {
	const content = (node.children ?? []).filter(
		(child) => !isBlankText(child) && !NESTED_LISTS.has(child.tagName ?? ""),
	)
	return content.length === 1 && content[0]?.tagName === "a"
}

const useBoardCards = (node: BoardLinkNode | undefined) => {
	const renderBoardLink = useContext(MarkdownBoardLinkContext)
	if (!renderBoardLink || !node) return []
	return Children.toArray(
		boardLinksOf(node).map((link, index) => {
			const card = renderBoardLink(link)
			// biome-ignore lint/suspicious/noArrayIndexKey: a card is the link at its position, two links may name the same board
			return isValidElement(card) ? cloneElement(card, { key: index }) : card
		}),
	)
}

export {
	boardNameOf,
	isLoneBoardLink,
	MarkdownBoardLinkContext,
	type MarkdownBoardLinkRenderer,
	type MarkdownBoardLinkRenderProps,
	useBoardCards,
}
