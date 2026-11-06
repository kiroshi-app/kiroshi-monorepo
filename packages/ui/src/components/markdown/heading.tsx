import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import { MarkdownBoardLinkContext } from "@workspace/ui/components/markdown/board-link"

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

type MarkdownHeadingProps = ComponentPropsWithoutRef<HeadingTag> & ExtraProps

const headingOf =
	(Heading: HeadingTag) =>
	({ node, children, ...props }: MarkdownHeadingProps) => (
		<Heading {...props}>
			<MarkdownBoardLinkContext value={null}>
				{children}
			</MarkdownBoardLinkContext>
		</Heading>
	)

export const MARKDOWN_HEADINGS = {
	h1: headingOf("h1"),
	h2: headingOf("h2"),
	h3: headingOf("h3"),
	h4: headingOf("h4"),
	h5: headingOf("h5"),
	h6: headingOf("h6"),
}
