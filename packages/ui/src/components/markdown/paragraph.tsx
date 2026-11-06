import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import {
	isLoneBoardLink,
	useBoardCards,
} from "@workspace/ui/components/markdown/board-link"

type MarkdownParagraphProps = ComponentPropsWithoutRef<"p"> & ExtraProps

export const MarkdownParagraph = ({
	node,
	...props
}: MarkdownParagraphProps) => {
	const cards = useBoardCards(node)
	const paragraph = <p {...props} />
	if (cards.length === 0) return paragraph
	if (cards.length === 1 && node && isLoneBoardLink(node)) return cards

	return (
		<>
			{paragraph}
			{cards}
		</>
	)
}
