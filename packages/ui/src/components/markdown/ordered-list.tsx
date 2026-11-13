import type { ComponentPropsWithoutRef, CSSProperties } from "react"
import type { ExtraProps } from "react-markdown"

type MarkdownOrderedListProps = ComponentPropsWithoutRef<"ol"> & ExtraProps

type ListNode = NonNullable<ExtraProps["node"]>

const itemCountOf = (node: ListNode) =>
	node.children.filter(
		(child) => child.type === "element" && child.tagName === "li",
	).length

const widestMarkerDigitsOf = (start: number, itemCount: number) =>
	String(start + Math.max(itemCount, 1) - 1).length

export const MarkdownOrderedList = ({
	node,
	style,
	...props
}: MarkdownOrderedListProps) => (
	<ol
		{...props}
		style={
			{
				"--typeset-marker-digits": widestMarkerDigitsOf(
					props.start ?? 1,
					node ? itemCountOf(node) : 1,
				),
				...style,
			} as CSSProperties
		}
	/>
)
