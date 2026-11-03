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
export const CALLOUT_TITLE_PROPERTY = "dataCalloutTitle"
export const PENDING_PROPERTY = "dataPending"
export const SOURCED_IMAGE_PROPERTY = "dataSourcedImage"
export const LINKED_IMAGE_PROPERTY = "dataLinkedImage"

const CALLOUT_MARKER_LINE = /^\[!(NOTE|WARNING)\](?:[ \t]+([^\n]*))?(\n|$)/

const CALLOUT_TONES = { NOTE: "note", WARNING: "warning" } as const

const SOURCE_LEAD = "Source: "

const SOURCED_IMAGE_FIELD = /^(Title|Favicon|Status|Chip): (.+)$/

type SourcedImageFields = {
	title?: string
	favicon?: string
	status?: string
	chips: string[]
}

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

type CalloutTone = keyof typeof CALLOUT_TONES

const calloutMarkerOf = (lead: HastNode, followers: number) => {
	const match = CALLOUT_MARKER_LINE.exec(lead.value ?? "")
	if (!match) return null

	const [line, tone, title = "", lineEnd] = match
	return lineEnd === "" && followers > 0
		? null
		: {
				tone: CALLOUT_TONES[tone as CalloutTone],
				title: title.trim(),
				length: line.length,
			}
}

const markCallout = (blockquote: HastNode) => {
	const content = contentOf(blockquote)
	const [paragraph] = content
	if (!isElement(paragraph, "p")) return

	const [lead, ...rest] = paragraph.children ?? []
	if (lead?.type !== "text") return
	const marker = calloutMarkerOf(lead, rest.length)
	if (!marker) return

	const remainder = (lead.value ?? "").slice(marker.length)
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
		[CALLOUT_PROPERTY]: marker.tone,
		...(marker.title ? { [CALLOUT_TITLE_PROPERTY]: marker.title } : {}),
	}
}

const loneImageOf = (paragraph: HastNode) => {
	const content = contentOf(paragraph)
	const [image] = content
	return content.length === 1 && isElement(image, "img") ? image : undefined
}

const sourceLinkOf = (paragraph: HastNode) => {
	const [lead, link, ...fieldNodes] = paragraph.children ?? []
	const [firstField] = fieldNodes
	const isSourceLine =
		lead?.type === "text" &&
		lead.value === SOURCE_LEAD &&
		isElement(link, "a") &&
		(!firstField ||
			(firstField.type === "text" && firstField.value?.startsWith("\n")))
	return isSourceLine ? { link, fieldNodes } : undefined
}

const withSourcedImageField = (
	fields: SourcedImageFields,
	line: string,
): SourcedImageFields | null => {
	const match = SOURCED_IMAGE_FIELD.exec(line)
	if (!match) return null

	const [, key, rawValue] = match
	const value = rawValue.trim()
	if (key === "Chip") return { ...fields, chips: [...fields.chips, value] }

	const name =
		key === "Title" ? "title" : key === "Favicon" ? "favicon" : "status"
	const isTaken = fields[name] !== undefined
	const isUnsafe = name === "favicon" && !isHttpsUrl(value)
	return isTaken || isUnsafe ? null : { ...fields, [name]: value }
}

const sourcedImageFieldsOf = (fieldNodes: HastNode[]) =>
	fieldNodes
		.map(textOf)
		.join("")
		.split("\n")
		.slice(1)
		.reduce<SourcedImageFields | null>(
			(fields, line) => (fields ? withSourcedImageField(fields, line) : null),
			{ chips: [] },
		)

const sourcedImageOf = (paragraph: HastNode, next: HastNode | undefined) => {
	if (!isElement(paragraph, "p") || !isElement(next, "p") || !next) return null

	const image = loneImageOf(paragraph)
	const sourceLine = sourceLinkOf(next)
	if (!image || !sourceLine) return null

	const { link, fieldNodes } = sourceLine
	const fields = sourcedImageFieldsOf(fieldNodes)
	const src = String(image.properties?.src ?? "")
	const alt = String(image.properties?.alt ?? "").trim()
	const href = String(link.properties?.href ?? "")
	const name = textOf(link).trim()
	const holds =
		fields !== null &&
		isHttpsUrl(src) &&
		isHttpsUrl(href) &&
		alt !== "" &&
		name !== ""

	return holds
		? {
				type: "element",
				tagName: "figure",
				properties: {
					[SOURCED_IMAGE_PROPERTY]: true,
					src,
					alt,
					dataSourceName: name,
					dataTitle: fields.title,
					dataFavicon: fields.favicon,
					dataStatus: fields.status,
					dataChips: fields.chips,
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

const markLinkedImages = (node: HastNode, isInLink: boolean) => {
	const isLinkBelow = isInLink || isElement(node, "a")
	for (const child of node.children ?? []) {
		if (isLinkBelow && isElement(child, "img")) {
			child.properties = { ...child.properties, [LINKED_IMAGE_PROPERTY]: true }
		}
		markLinkedImages(child, isLinkBelow)
	}
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
		markLinkedImages(tree, false)
		eachNode(tree, (node) => {
			if (isElement(node, "blockquote")) markCallout(node)
			if (isWriting && isElement(node, "pre") && !isClosedFence(node, source)) {
				node.properties = { ...node.properties, [PENDING_PROPERTY]: true }
			}
		})
	}
