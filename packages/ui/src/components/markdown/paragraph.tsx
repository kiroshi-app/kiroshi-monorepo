import {
	Children,
	type ComponentPropsWithoutRef,
	Fragment,
	isValidElement,
	type ReactNode,
} from "react"
import type { ExtraProps } from "react-markdown"

import {
	type MarkdownAttachments,
	MarkdownInParagraphContext,
	useMarkdownAttachments,
} from "@workspace/ui/components/markdown/attachments"
import {
	isLoneBoardLink,
	useBoardCards,
} from "@workspace/ui/components/markdown/board-link"
import {
	attachmentStandInOf,
	type MarkdownLinkProps,
} from "@workspace/ui/components/markdown/link"

type MarkdownParagraphProps = ComponentPropsWithoutRef<"p"> & ExtraProps

type ParagraphSplit = {
	runs: ReactNode[][]
	standIns: ReactNode[]
}

const splitAtStandIns = (
	children: ReactNode,
	attachments: MarkdownAttachments,
): ParagraphSplit => {
	const runs: ReactNode[][] = [[]]
	const standIns: ReactNode[] = []
	for (const child of Children.toArray(children)) {
		const standIn = isValidElement<MarkdownLinkProps>(child)
			? attachmentStandInOf(attachments, child.props)
			: null
		if (standIn === null) {
			runs.at(-1)?.push(child)
		} else {
			standIns.push(standIn)
			runs.push([])
		}
	}
	return { runs, standIns }
}

const trimEdges = (run: ReactNode[]) =>
	run
		.map((piece, index) =>
			typeof piece === "string" && index === 0 ? piece.trimStart() : piece,
		)
		.map((piece, index) =>
			typeof piece === "string" && index === run.length - 1
				? piece.trimEnd()
				: piece,
		)
		.filter((piece) => piece !== "")

export const MarkdownParagraph = ({
	node,
	children,
	...props
}: MarkdownParagraphProps) => {
	const cards = useBoardCards(node)
	const { runs, standIns } = splitAtStandIns(children, useMarkdownAttachments())
	const textParagraph = (run: ReactNode) => (
		<MarkdownInParagraphContext value>
			<p {...props}>{run}</p>
		</MarkdownInParagraphContext>
	)
	const paragraph =
		standIns.length === 0
			? textParagraph(children)
			: runs.map((run, index) => {
					const text = trimEdges(run)
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: a run is the text between two stand-ins, at its position
						<Fragment key={index}>
							{text.length > 0 ? textParagraph(text) : null}
							{standIns[index]}
						</Fragment>
					)
				})
	if (cards.length === 0) return paragraph
	if (cards.length === 1 && node && isLoneBoardLink(node)) return cards

	return (
		<>
			{paragraph}
			{cards}
		</>
	)
}
