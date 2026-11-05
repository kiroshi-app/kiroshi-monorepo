import {
	BOARD_SCHEMA,
	type Board,
	type BoardNode,
	BoardRefused,
	type Connector,
	EDGE_FIELDS,
	type Element,
	EXTRAS,
	type Fields,
	isInZOrder,
	isObject,
	type Json,
	type JsonObject,
	KIND,
	kindSpec,
	type Located,
	NODE_FIELDS,
	parsedBoard,
	refusedField,
	Z_FIELD,
	zAt,
} from "./board"

const FOREIGN: BoardNode["kind"] = "foreign"

const ID = "id"

const TYPE = "type"

const { plainImport: PLAIN_IMPORT } = BOARD_SCHEMA

const CANVAS_TYPES = new Set(
	Object.values(BOARD_SCHEMA.kinds).flatMap(({ canvasType }) =>
		canvasType === null ? [] : [canvasType],
	),
)

type Placed = { top: JsonObject; kiroshi: JsonObject }

const place = (fields: Fields, element: object, into: Placed) => {
	const values = element as Record<string, Json | undefined>
	for (const [name, spec] of Object.entries(fields)) {
		const value = values[name]
		if (value === undefined) continue
		if (spec.in === "verbatim") Object.assign(into.top, value)
		else into[spec.in === "canvas" ? "top" : "kiroshi"][name] = value
	}
}

const compared = (left: string, right: string) => {
	if (left < right) return -1
	if (left > right) return 1
	return 0
}

type Entry<T> = [string, T]

const byZOrder = (
	[leftId, left]: Entry<BoardNode>,
	[rightId, right]: Entry<BoardNode>,
) => compared(left.z, right.z) || compared(leftId, rightId)

const byId = <T>([leftId]: Entry<T>, [rightId]: Entry<T>) =>
	compared(leftId, rightId)

const canvasNode = ([id, node]: Entry<BoardNode>) => {
	const { canvasType, fields } = BOARD_SCHEMA.kinds[node.kind]
	const placed: Placed = { top: { [ID]: id }, kiroshi: { ...node.kiroshi } }
	if (canvasType !== null) {
		placed.top[TYPE] = canvasType
		placed.kiroshi[KIND] = node.kind
	}
	place(NODE_FIELDS, node, placed)
	place(fields, node, placed)
	return { ...placed.top, [EXTRAS]: placed.kiroshi }
}

const canvasEdge = ([id, edge]: Entry<Connector>) => {
	const placed: Placed = { top: { [ID]: id }, kiroshi: { ...edge.kiroshi } }
	place(EDGE_FIELDS, edge, placed)
	return { ...placed.top, [EXTRAS]: placed.kiroshi }
}

export const exportCanvas = (board: Board) => {
	const canvas: JsonObject = {
		nodes: Object.entries(board.nodes).sort(byZOrder).map(canvasNode),
		edges: Object.entries(board.edges).sort(byId).map(canvasEdge),
	}
	if (board.kiroshi !== undefined && Object.keys(board.kiroshi).length > 0) {
		canvas[EXTRAS] = board.kiroshi
	}
	return `${JSON.stringify(canvas, null, "\t")}\n`
}

const parsedJson = (text: string): unknown => {
	try {
		return JSON.parse(text)
	} catch (failure) {
		throw new BoardRefused(
			{ kind: "notJson", reason: String(failure) },
			failure,
		)
	}
}

type RootList = "nodes" | "edges"

const listAt = (root: JsonObject, field: RootList) => {
	const list = root[field]
	if (list === undefined) return []
	if (!Array.isArray(list))
		throw new BoardRefused({ kind: "invalidRoot", field })
	return list
}

const rest = (source: JsonObject, claimed: Set<string>) =>
	Object.fromEntries(
		Object.entries(source).filter(([name]) => !claimed.has(name)),
	)

const kiroshiOf = (source: JsonObject, at: Located) => {
	const kiroshi = source[EXTRAS]
	if (kiroshi === undefined) return {}
	if (!isObject(kiroshi)) throw refusedField(at, EXTRAS)
	return kiroshi
}

type Shaping = {
	source: JsonObject
	kiroshi: JsonObject
	fields: Fields
	claimedKiroshi: string[]
}

const shaped = ({ source, kiroshi, fields, claimedKiroshi }: Shaping) => {
	const shape: JsonObject = {}
	const claimedTop = new Set([ID, EXTRAS])
	const claimedUnderKiroshi = new Set(claimedKiroshi)
	const verbatim: string[] = []
	for (const [name, spec] of Object.entries(fields)) {
		if (spec.in === "verbatim") {
			verbatim.push(name)
			continue
		}
		const isTop = spec.in === "canvas"
		;(isTop ? claimedTop : claimedUnderKiroshi).add(name)
		const from = isTop ? source : kiroshi
		if (Object.hasOwn(from, name)) shape[name] = from[name] as Json
	}
	for (const name of verbatim) shape[name] = rest(source, claimedTop)
	const extras = rest(kiroshi, claimedUnderKiroshi)
	if (Object.keys(extras).length > 0) shape[EXTRAS] = extras
	return shape
}

const extensionOf = (file: Json | undefined) => {
	if (typeof file !== "string") return ""
	const name = file.slice(file.lastIndexOf("/") + 1)
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

const plainKind = (type: string, node: JsonObject) => {
	const { image, kinds } = PLAIN_IMPORT
	if (
		type === image.canvasType &&
		image.extensions.includes(extensionOf(node.file))
	) {
		return image.kind
	}
	return kinds[type]
}

const kindOf = (node: JsonObject, kiroshi: JsonObject, at: Located) => {
	const type = node[TYPE]
	if (typeof type !== "string") throw refusedField(at, TYPE)
	if (!CANVAS_TYPES.has(type)) return FOREIGN
	const declared = kiroshi[KIND]
	if (declared === undefined) return plainKind(type, node)
	if (kindSpec(declared)?.canvasType !== type) throw refusedField(at, KIND)
	return declared as string
}

const shapedNode = (node: JsonObject, at: Located) => {
	const kiroshi = kiroshiOf(node, at)
	const kind = kindOf(node, kiroshi, at)
	const spec = BOARD_SCHEMA.kinds[kind]
	return {
		[KIND]: kind,
		...shaped({
			source: node,
			kiroshi,
			fields: { ...NODE_FIELDS, ...spec.fields },
			claimedKiroshi: spec.canvasType === null ? [] : [KIND],
		}),
	}
}

const shapedEdge = (edge: JsonObject, at: Located) =>
	shaped({
		source: edge,
		kiroshi: kiroshiOf(edge, at),
		fields: EDGE_FIELDS,
		claimedKiroshi: [],
	})

type Shape = (source: JsonObject, at: Located) => JsonObject

const shapedList = (list: unknown[], element: Element, shape: Shape) =>
	list.map((entry, index): Entry<JsonObject> => {
		const id = isObject(entry) ? entry[ID] : undefined
		if (typeof id !== "string" || id === "") {
			throw new BoardRefused({ kind: "missingId", element, index })
		}
		return [id, shape(entry as JsonObject, { element, id })]
	})

const inArrayZOrder = (nodes: Entry<JsonObject>[]) => {
	if (isInZOrder(nodes.map(([, node]) => node[Z_FIELD]))) return nodes
	return nodes.map(
		([id, node], index): Entry<JsonObject> => [
			id,
			{ ...node, [Z_FIELD]: zAt(index) },
		],
	)
}

const keyedById = (entries: Entry<JsonObject>[], element: Element) => {
	const byKey: Record<string, JsonObject> = {}
	for (const [id, value] of entries) {
		if (Object.hasOwn(byKey, id)) {
			throw new BoardRefused({ kind: "duplicateId", element, id })
		}
		byKey[id] = value
	}
	return byKey
}

export const importCanvas = (text: string): Board => {
	const root = parsedJson(text)
	if (!isObject(root))
		throw new BoardRefused({ kind: "invalidRoot", field: "root" })
	const extras = root[EXTRAS] === undefined ? {} : root[EXTRAS]
	if (!isObject(extras)) {
		throw new BoardRefused({ kind: "invalidRoot", field: "kiroshi" })
	}
	const nodes = inArrayZOrder(
		shapedList(listAt(root, "nodes"), "node", shapedNode),
	)
	const edges = shapedList(listAt(root, "edges"), "edge", shapedEdge)
	return parsedBoard({
		nodes: keyedById(nodes, "node"),
		edges: keyedById(edges, "edge"),
		kiroshi: extras,
	})
}
