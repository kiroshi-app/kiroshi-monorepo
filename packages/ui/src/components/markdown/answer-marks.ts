import { isHttpsUrl } from "@workspace/ui/components/markdown/block-body"

type HastPoint = { offset?: number }

interface HastNode {
	type: string
	tagName?: string
	value?: string
	properties?: Record<string, unknown>
	children?: HastNode[]
	position?: { start: HastPoint; end: HastPoint }
}

type MarkedFile = { value: unknown }

interface AnswerMarksOptions {
	isWriting: boolean
}

export const CALLOUT_PROPERTY = "dataCallout"
export const PENDING_PROPERTY = "dataPending"
export const SOURCED_IMAGE_PROPERTY = "dataSourcedImage"

const CALLOUT_MARKERS = { "[!NOTE]": "note", "[!WARNING]": "warning" } as const

const SOURCE_LEAD = "Source: "

const CLOSING_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*$/

const isElement = (node: HastNode | undefined, tagName: string) =>
	node?.type === "element" && node.tagName === tagName

const isWhitespace = (node: HastNode) =>
	node.type === "text" && (node.value ?? "").trim() === ""

const contentOf = (node: HastNode) =>
	(node.children ?? []).filter((child) => !isWhitespace(child))

const eachNode = (node: HastNode, visit: (node: HastNode) => void) => {
	visit(node)
	for (const child of node.children ?? []) eachNode(child, visit)
}

const textOf = (node: HastNode): string =>
	node.type === "text"
		? (node.value ?? "")
		: (node.children ?? []).map(textOf).join("")

type CalloutMarker = keyof typeof CALLOUT_MARKERS

const calloutMarkerOf = (lead: HastNode, followers: number) =>
	(Object.keys(CALLOUT_MARKERS) as CalloutMarker[]).find(
		(marker) =>
			(lead.value === marker && followers === 0) ||
			lead.value?.startsWith(`${marker}\n`),
	)

const markCallout = (blockquote: HastNode) => {
	const content = contentOf(blockquote)
	const [paragraph] = content
	if (!isElement(paragraph, "p")) return

	const [lead, ...rest] = paragraph.children ?? []
	if (lead?.type !== "text") return
	const marker = calloutMarkerOf(lead, rest.length)
	if (!marker) return

	const remainder = (lead.value ?? "").slice(marker.length + 1)
	const kept = remainder ? [{ ...lead, value: remainder }, ...rest] : rest
	if (kept.length === 0 && content.length === 1) return

	if (kept.length > 0) {
		paragraph.children = kept
	} else {
		blockquote.children = (blockquote.children ?? []).filter(
			(child) => child !== paragraph,
		)
	}
	blockquote.properties = {
		...blockquote.properties,
		[CALLOUT_PROPERTY]: CALLOUT_MARKERS[marker],
	}
}

const loneImageOf = (paragraph: HastNode) => {
	const content = contentOf(paragraph)
	const [image] = content
	return content.length === 1 && isElement(image, "img") ? image : undefined
}

const sourceLinkOf = (paragraph: HastNode) => {
	const content = paragraph.children ?? []
	const [lead, link] = content
	const isSourceLine =
		content.length === 2 &&
		lead.type === "text" &&
		lead.value === SOURCE_LEAD &&
		isElement(link, "a")
	return isSourceLine ? link : undefined
}

const sourcedImageOf = (paragraph: HastNode, next: HastNode | undefined) => {
	if (!isElement(paragraph, "p") || !isElement(next, "p") || !next) return null

	const image = loneImageOf(paragraph)
	const link = sourceLinkOf(next)
	if (!image || !link) return null

	const src = String(image.properties?.src ?? "")
	const alt = String(image.properties?.alt ?? "").trim()
	const href = String(link.properties?.href ?? "")
	const name = textOf(link).trim()
	const holds = isHttpsUrl(src) && isHttpsUrl(href) && alt !== "" && name !== ""

	return holds
		? {
				type: "element",
				tagName: "figure",
				properties: {
					[SOURCED_IMAGE_PROPERTY]: true,
					src,
					alt,
					dataSourceName: name,
				},
				children: [],
			}
		: null
}

const markSourcedImages = (root: HastNode) => {
	const children = root.children ?? []
	const marked: HastNode[] = []

	for (let index = 0; index < children.length; index += 1) {
		const nextIndex = children.findIndex(
			(child, position) => position > index && !isWhitespace(child),
		)
		const figure = sourcedImageOf(children[index], children[nextIndex])
		if (figure) {
			marked.push(figure)
			index = nextIndex
		} else {
			marked.push(children[index])
		}
	}

	root.children = marked
}

const isClosedFence = (pre: HastNode, source: string) => {
	const start = pre.position?.start.offset
	const end = pre.position?.end.offset
	if (start === undefined || end === undefined) return true

	const lines = source.slice(start, end).split("\n")
	return lines.length > 1 && CLOSING_FENCE.test(lines.at(-1) ?? "")
}

export const rehypeAnswerMarks =
	({ isWriting }: AnswerMarksOptions) =>
	(tree: HastNode, file: MarkedFile) => {
		const source = String(file.value ?? "")

		markSourcedImages(tree)
		eachNode(tree, (node) => {
			if (isElement(node, "blockquote")) markCallout(node)
			if (isWriting && isElement(node, "pre") && !isClosedFence(node, source)) {
				node.properties = { ...node.properties, [PENDING_PROPERTY]: true }
			}
		})
	}
