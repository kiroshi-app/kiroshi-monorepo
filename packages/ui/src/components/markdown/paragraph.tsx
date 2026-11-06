import { Children, type ComponentPropsWithoutRef, useContext } from "react"
import type { ExtraProps } from "react-markdown"

import {
	boardNameOf,
	MarkdownBoardLinkContext,
	type MarkdownBoardLinkRenderProps,
} from "@workspace/ui/components/markdown/board-link"
import { textOf } from "@workspace/ui/components/markdown/link"

type MarkdownParagraphProps = ComponentPropsWithoutRef<"p"> & ExtraProps

type ParagraphNode = {
	type: string
	tagName?: string
	value?: string
	properties?: { href?: unknown }
	children?: ParagraphNode[]
}

const boardLinksOf = (node: ParagraphNode): MarkdownBoardLinkRenderProps[] => {
	if (node.tagName !== "a") return (node.children ?? []).flatMap(boardLinksOf)
	const { href } = node.properties ?? {}
	const name = boardNameOf(typeof href === "string" ? href : undefined)
	return name === null ? [] : [{ name, words: textOf(node) }]
}

const isBlankText = ({ type, value }: ParagraphNode) =>
	type === "text" && !value?.trim()

const isLoneLink = (node: ParagraphNode) => {
	const content = (node.children ?? []).filter((child) => !isBlankText(child))
	return content.length === 1 && content[0]?.tagName === "a"
}

export const MarkdownParagraph = ({
	node,
	children,
	...props
}: MarkdownParagraphProps) => {
	const renderBoardLink = useContext(MarkdownBoardLinkContext)
	const paragraph = (
		<p {...props}>
			<MarkdownBoardLinkContext value={null}>
				{children}
			</MarkdownBoardLinkContext>
		</p>
	)
	if (!renderBoardLink || !node) return paragraph

	const boards = boardLinksOf(node).map((link) => renderBoardLink(link))
	const [loneBoard] = boards
	if (boards.length === 1 && loneBoard != null && isLoneLink(node))
		return <>{loneBoard}</>

	return (
		<>
			{paragraph}
			{Children.toArray(boards)}
		</>
	)
}
