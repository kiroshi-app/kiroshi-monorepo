import * as Y from "yjs"

import {
	BOARD_SCHEMA,
	type BoardNode,
	type ImageNode,
	type LibraryCardNode,
	type LinkCardNode,
	zAt,
} from "@workspace/shared/board/board"
import { sharedEdge, sharedNode } from "@workspace/shared/board/board-doc"
import type {
	BoardConnector,
	BoardConnectorStyle,
	BoardIntent,
	BoardItem,
	BoardPoint,
	BoardShapeFill,
	BoardShapeStyle,
	BoardShapeType,
	BoardSize,
} from "@workspace/ui/components/board-view"

type SharedElement = Y.Map<unknown>

export type LibraryBoardObject =
	| { kind: "image"; item: string }
	| { kind: "libraryCard"; item: string }
	| { kind: "linkCard"; url: string }

export type LibraryBoardPlacement = {
	id: string
	object: LibraryBoardObject
	centre: BoardPoint
}

export type LibraryBoardLinkDescription = {
	title: string
	image?: string
}

type Link = Pick<
	BoardConnector,
	"from" | "fromSide" | "to" | "toSide" | "routing"
>

const { doc: ROOTS, zOrder: Z_ORDER } = BOARD_SCHEMA

const LIBRARY_FOLDER = "Library"

const SIZE_OF_LIBRARY_OBJECT: Record<LibraryBoardObject["kind"], BoardSize> = {
	image: { width: 240, height: 180 },
	libraryCard: { width: 236, height: 160 },
	linkCard: { width: 300, height: 180 },
}

const PRESET_OF_FILL = BOARD_SCHEMA.kinds.sticky?.fill?.presets ?? {}

const nodesOf = (doc: Y.Doc) => doc.getMap<SharedElement>(ROOTS.nodes)

const edgesOf = (doc: Y.Doc) => doc.getMap<SharedElement>(ROOTS.edges)

const colourOfFill = (fill: BoardShapeFill) =>
	fill === "surface" ? undefined : PRESET_OF_FILL[fill]

const schemaShapeOf = (shape: BoardShapeType | undefined) =>
	shape === "ellipse" ? "ellipse" : "rectangle"

const setOrDelete = (
	element: SharedElement,
	field: string,
	value: string | undefined,
) => {
	if (value === undefined) {
		element.delete(field)
		return
	}
	element.set(field, value)
}

const placeAt = (element: SharedElement, { x, y }: BoardPoint) => {
	element.set("x", Math.round(x))
	element.set("y", Math.round(y))
}

const sizeTo = (element: SharedElement, { width, height }: BoardSize) => {
	element.set("width", Math.round(width))
	element.set("height", Math.round(height))
}

const replaceText = (text: Y.Text, next: string) => {
	text.delete(0, text.length)
	text.insert(0, next)
}

const editText = (doc: Y.Doc, id: string, text: string) => {
	const node = nodesOf(doc).get(id)
	if (!node) {
		edgesOf(doc).get(id)?.set("label", text)
		return
	}
	const field = node.get("text")
	if (field instanceof Y.Text) {
		replaceText(field, text)
		return
	}
	if (node.get("kind") === "section") {
		node.set("label", text)
	}
}

const styleNode = (node: SharedElement, { shape, fill }: BoardShapeStyle) => {
	const kind = node.get("kind")
	if (kind === "sticky") {
		if (fill !== "surface") node.set("fill", fill)
		return
	}
	if (kind === "shape") {
		node.set("shape", schemaShapeOf(shape))
	}
	if (kind !== "foreign") {
		setOrDelete(node, "color", colourOfFill(fill))
	}
}

const style = (
	doc: Y.Doc,
	id: string,
	picked: BoardShapeStyle | BoardConnectorStyle,
) => {
	if ("routing" in picked) {
		edgesOf(doc).get(id)?.set("routing", picked.routing)
		return
	}
	const node = nodesOf(doc).get(id)
	if (node) styleNode(node, picked)
}

const connect = (
	doc: Y.Doc,
	id: string,
	{ from, fromSide, to, toSide, routing }: Link,
) => {
	const nodes = nodesOf(doc)
	if (!nodes.has(from) || !nodes.has(to)) return
	edgesOf(doc).set(
		id,
		sharedEdge({
			fromNode: from,
			fromSide,
			fromEnd: "none",
			toNode: to,
			toSide,
			toEnd: "arrow",
			routing,
		}),
	)
}

const zAbove = (doc: Y.Doc) => {
	const keys = [...nodesOf(doc).values()].map((node) =>
		String(node.get(Z_ORDER.field)),
	)
	const top = keys.sort().at(-1)
	const next = zAt(keys.length)
	return top === undefined || next > top ? next : `${top}${Z_ORDER.digits[0]}`
}

const nodeOf = (item: BoardItem, z: string): BoardNode | null => {
	const placed = {
		x: Math.round(item.position.x),
		y: Math.round(item.position.y),
		width: Math.round(item.size.width),
		height: Math.round(item.size.height),
		z,
	}
	switch (item.kind) {
		case "text":
			return { ...placed, kind: "text", text: item.text }
		case "shape": {
			const colour = item.style && colourOfFill(item.style.fill)
			return {
				...placed,
				kind: "shape",
				text: item.text,
				shape: schemaShapeOf(item.style?.shape),
				...(colour ? { color: colour } : {}),
			}
		}
		default:
			return null
	}
}

const createItem = (doc: Y.Doc, item: BoardItem) => {
	const node = nodeOf(item, zAbove(doc))
	if (!node) {
		console.error(
			`library: a board ${item.kind} cannot be created without its source`,
		)
		return
	}
	nodesOf(doc).set(item.id, sharedNode(node))
}

type LibraryNodeFields =
	| Pick<ImageNode, "kind" | "file" | "item">
	| Pick<LibraryCardNode, "kind" | "file" | "item">
	| Pick<LinkCardNode, "kind" | "url">

const fieldsOf = (object: LibraryBoardObject): LibraryNodeFields =>
	object.kind === "linkCard"
		? object
		: { ...object, file: `${LIBRARY_FOLDER}/${object.item}` }

const libraryNodeOf = (
	{ object, centre }: LibraryBoardPlacement,
	z: string,
): BoardNode => {
	const { width, height } = SIZE_OF_LIBRARY_OBJECT[object.kind]
	return {
		...fieldsOf(object),
		x: Math.round(centre.x - width / 2),
		y: Math.round(centre.y - height / 2),
		width,
		height,
		z,
	}
}

const remove = (doc: Y.Doc, id: string) => {
	const nodes = nodesOf(doc)
	const edges = edgesOf(doc)
	if (!nodes.has(id)) {
		edges.delete(id)
		return
	}
	nodes.delete(id)
	const attached = [...edges.entries()].filter(
		([, edge]) => edge.get("fromNode") === id || edge.get("toNode") === id,
	)
	for (const [edgeId] of attached) edges.delete(edgeId)
}

const writeIntent = (doc: Y.Doc, intent: BoardIntent) => {
	switch (intent.type) {
		case "create":
			if (intent.object.kind === "connector") {
				connect(doc, intent.object.id, intent.object)
				return
			}
			createItem(doc, intent.object)
			return
		case "move": {
			const node = nodesOf(doc).get(intent.id)
			if (node) placeAt(node, intent.position)
			return
		}
		case "resize": {
			const node = nodesOf(doc).get(intent.id)
			if (!node) return
			placeAt(node, intent.position)
			sizeTo(node, intent.size)
			return
		}
		case "edit-text":
			editText(doc, intent.id, intent.text)
			return
		case "style":
			style(doc, intent.id, intent.style)
			return
		case "connect":
			connect(doc, intent.id, intent)
			return
		case "delete":
			remove(doc, intent.id)
	}
}

export const applyLibraryBoardIntent = (
	doc: Y.Doc,
	intent: BoardIntent,
	origin: unknown,
) => doc.transact(() => writeIntent(doc, intent), origin)

export const placeLibraryBoardObject = (
	doc: Y.Doc,
	placement: LibraryBoardPlacement,
	origin: unknown,
) =>
	doc.transact(
		() =>
			nodesOf(doc).set(
				placement.id,
				sharedNode(libraryNodeOf(placement, zAbove(doc))),
			),
		origin,
	)

const describeLink = (
	link: SharedElement,
	{ title, image }: LibraryBoardLinkDescription,
) => {
	if (title) link.set("title", title)
	if (image) link.set("preview", image)
}

export const describeLibraryBoardLink = (
	doc: Y.Doc,
	id: string,
	description: LibraryBoardLinkDescription,
	origin: unknown,
) =>
	doc.transact(() => {
		const link = nodesOf(doc).get(id)
		if (link?.get("kind") === "linkCard") describeLink(link, description)
	}, origin)
