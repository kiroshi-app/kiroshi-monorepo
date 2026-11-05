import schema from "./board.schema.json" with { type: "json" }

export type Json = null | boolean | number | string | Json[] | JsonObject

export type JsonObject = { [key: string]: Json }

type Placed = {
	x: number
	y: number
	width: number
	height: number
	z: string
	kiroshi?: JsonObject
	canvas?: JsonObject
}

export type StickyFill = "yellow" | "green" | "pink" | "blue" | "orange"

export type Author = { kind: "agent" | "person"; id: string }

export type StickyNode = Placed & {
	kind: "sticky"
	text: string
	color?: string
	fill: StickyFill
	author: Author
}

export type TextNode = Placed & { kind: "text"; text: string; color?: string }

export type ShapeNode = Placed & {
	kind: "shape"
	text: string
	color?: string
	shape: "rectangle" | "ellipse" | "diamond"
}

export type SectionNode = Placed & {
	kind: "section"
	label?: string
	color?: string
	background?: string
	backgroundStyle?: "cover" | "ratio" | "repeat"
}

type FileFields = {
	file: string
	subpath?: string
	color?: string
	item?: string
}

export type ImageNode = Placed & FileFields & { kind: "image"; alt?: string }

export type LibraryCardNode = Placed & FileFields & { kind: "libraryCard" }

export type LinkCardNode = Placed & {
	kind: "linkCard"
	url: string
	color?: string
	title?: string
	description?: string
	preview?: string
}

export type ForeignNode = Placed & { kind: "foreign"; canvas: JsonObject }

export type BoardNode =
	| StickyNode
	| TextNode
	| ShapeNode
	| SectionNode
	| ImageNode
	| LibraryCardNode
	| LinkCardNode
	| ForeignNode

type Side = "top" | "right" | "bottom" | "left"

type End = "none" | "arrow"

export type Connector = {
	fromNode: string
	fromSide?: Side
	fromEnd: End
	toNode: string
	toSide?: Side
	toEnd: End
	color?: string
	label?: string
	routing: "straight" | "elbow"
	kiroshi?: JsonObject
	canvas?: JsonObject
}

export type Board = {
	nodes: Record<string, BoardNode>
	edges: Record<string, Connector>
	kiroshi?: JsonObject
	canvas?: JsonObject
}

export type Element = "node" | "edge"

export type BoardError =
	| { kind: "notJson"; reason: string }
	| { kind: "invalidRoot"; field: "root" | "nodes" | "edges" | "kiroshi" }
	| { kind: "missingId"; element: Element; index: number }
	| { kind: "duplicateId"; element: Element; id: string }
	| { kind: "invalidField"; element: Element; id: string; field: string }
	| {
			kind: "danglingEdge"
			id: string
			field: "fromNode" | "toNode"
			node: string
	  }

export class BoardRefused extends Error {
	readonly error: BoardError

	constructor(error: BoardError, cause?: unknown) {
		super(`the board was refused: ${JSON.stringify(error)}`, { cause })
		this.error = error
	}
}

type Placement = "canvas" | "kiroshi" | "verbatim"

type FieldSpec = {
	type: string
	in: Placement
	enum?: string[]
	default?: Json
	optional?: boolean
}

export type Fields = Record<string, FieldSpec>

type FillPairing = {
	field: string
	colour: string
	presets: Record<string, string>
	fromColour: Record<string, string>
}

type KindSpec = {
	canvasType: string | null
	fields: Fields
	fill?: FillPairing
}

type BoardSchema = {
	doc: { nodes: string; edges: string; board: string; canvas: string }
	extras: string
	verbatim: string
	zOrder: { field: string; digits: string }
	node: { kind: { field: string }; fields: Fields }
	kinds: Record<string, KindSpec>
	plainImport: {
		kinds: Record<string, string>
		image: { kind: string; canvasType: string; extensions: string[] }
	}
	edge: { fields: Fields }
}

export const BOARD_SCHEMA = schema as unknown as BoardSchema

export const EXTRAS = BOARD_SCHEMA.extras

export const KIND = BOARD_SCHEMA.node.kind.field

export const NODE_FIELDS = BOARD_SCHEMA.node.fields

export const EDGE_FIELDS = BOARD_SCHEMA.edge.fields

export const Z_FIELD = BOARD_SCHEMA.zOrder.field

const Z_DIGITS = BOARD_SCHEMA.zOrder.digits

const COLOUR = /^(?:[1-6]|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6})$/

const FIRST_Z_HEAD = "a".charCodeAt(0)

export const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value)

export const isEmptyObject = (value: unknown) =>
	isObject(value) && Object.keys(value).length === 0

export const kindSpec = (kind: unknown) =>
	typeof kind === "string" && Object.hasOwn(BOARD_SCHEMA.kinds, kind)
		? BOARD_SCHEMA.kinds[kind]
		: undefined

const isZ = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length > 0 &&
	[...value].every((digit) => Z_DIGITS.includes(digit))

export const zAt = (index: number) => {
	const base = Z_DIGITS.length
	let digits = Z_DIGITS.charAt(index % base)
	for (
		let rest = Math.floor(index / base);
		rest > 0;
		rest = Math.floor(rest / base)
	) {
		digits = Z_DIGITS.charAt(rest % base) + digits
	}
	return String.fromCharCode(FIRST_Z_HEAD + digits.length - 1) + digits
}

export const isInZOrder = (keys: unknown[]) =>
	keys.every(
		(key, index) =>
			isZ(key) && (index === 0 || (keys[index - 1] as string) < key),
	)

const IDENTITY_KEYS = ["id", "kind"]

const isIdentity = (spec: FieldSpec, value: unknown) =>
	isObject(value) &&
	Object.keys(value).sort().join() === IDENTITY_KEYS.join() &&
	typeof value.kind === "string" &&
	(spec.enum ?? []).includes(value.kind) &&
	typeof value.id === "string" &&
	value.id.length > 0

export const presetOf = (pairing: FillPairing, fill: unknown) =>
	typeof fill === "string" && Object.hasOwn(pairing.presets, fill)
		? pairing.presets[fill]
		: undefined

const derivedFill = (pairing: FillPairing, spec: KindSpec, colour: unknown) =>
	typeof colour === "string" && Object.hasOwn(pairing.fromColour, colour)
		? pairing.fromColour[colour]
		: spec.fields[pairing.field]?.default

const withPairedFill = (node: JsonObject, spec: KindSpec): JsonObject => {
	const pairing = spec.fill
	if (pairing === undefined) return node
	const colour = node[pairing.colour]
	const fill = Object.hasOwn(node, pairing.field)
		? node[pairing.field]
		: derivedFill(pairing, spec, colour)
	const isPresetColour =
		colour !== undefined && colour === presetOf(pairing, fill)
	return Object.fromEntries([
		...Object.entries(node).filter(
			([name]) => !(isPresetColour && name === pairing.colour),
		),
		...(fill === undefined ? [] : [[pairing.field, fill]]),
	])
}

const fits = (spec: FieldSpec, value: unknown) => {
	switch (spec.type) {
		case "integer":
			return Number.isSafeInteger(value)
		case "colour":
			return typeof value === "string" && COLOUR.test(value)
		case "zOrder":
			return isZ(value)
		case "json":
			return isObject(value)
		case "identity":
			return isIdentity(spec, value)
		default:
			return (
				typeof value === "string" &&
				(spec.enum === undefined || spec.enum.includes(value))
			)
	}
}

export type Located = { element: Element; id: string }

export const refusedField = (at: Located, field: string) =>
	new BoardRefused({ kind: "invalidField", ...at, field })

const parsedFields = (fields: Fields, source: JsonObject, at: Located) => {
	const parsed: JsonObject = {}
	for (const [name, spec] of Object.entries(fields)) {
		const value = Object.hasOwn(source, name) ? source[name] : spec.default
		if (value === undefined && spec.optional) continue
		if (spec.in === "verbatim" && isEmptyObject(value)) continue
		if (!fits(spec, value)) throw refusedField(at, name)
		parsed[name] = value as Json
	}
	return parsed
}

const parsedExtras = (source: JsonObject, at: Located) => {
	const extras = source[EXTRAS]
	if (extras === undefined) return {}
	if (!isObject(extras)) throw refusedField(at, EXTRAS)
	return isEmptyObject(extras) ? {} : { [EXTRAS]: extras }
}

const parsedNode = (id: string, value: unknown) => {
	const at: Located = { element: "node", id }
	const node = isObject(value) ? value : {}
	const spec = kindSpec(node[KIND])
	if (spec === undefined) throw refusedField(at, KIND)
	const paired = withPairedFill(node, spec)
	return {
		[KIND]: node[KIND],
		...parsedFields(NODE_FIELDS, paired, at),
		...parsedFields(spec.fields, paired, at),
		...parsedExtras(paired, at),
	} as BoardNode
}

const ENDPOINTS = ["fromNode", "toNode"] as const

const parsedEdge = (id: string, value: unknown, nodes: Board["nodes"]) => {
	const at: Located = { element: "edge", id }
	const edge = isObject(value) ? value : {}
	const parsed = {
		...parsedFields(EDGE_FIELDS, edge, at),
		...parsedExtras(edge, at),
	} as Connector
	for (const field of ENDPOINTS) {
		const node = parsed[field]
		if (!Object.hasOwn(nodes, node)) {
			throw new BoardRefused({ kind: "danglingEdge", id, field, node })
		}
	}
	return parsed
}

const mappedValues = <T>(
	source: Record<string, unknown>,
	map: (id: string, value: unknown) => T,
) =>
	Object.fromEntries(
		Object.entries(source).map(([id, value]) => [id, map(id, value)]),
	)

type BoardShape = {
	nodes: Record<string, unknown>
	edges: Record<string, unknown>
	kiroshi: Record<string, unknown>
	canvas: Record<string, unknown>
}

export const parsedBoard = (shape: BoardShape): Board => {
	const nodes = mappedValues(shape.nodes, parsedNode)
	const edges = mappedValues(shape.edges, (id, value) =>
		parsedEdge(id, value, nodes),
	)
	const board: Board = { nodes, edges }
	if (!isEmptyObject(shape.kiroshi)) board.kiroshi = shape.kiroshi as JsonObject
	if (!isEmptyObject(shape.canvas)) board.canvas = shape.canvas as JsonObject
	return board
}
