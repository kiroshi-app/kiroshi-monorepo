import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import {
	BOARD_SCHEMA,
	type Board,
	type BoardError,
	BoardRefused,
	EDGE_FIELDS,
	NODE_FIELDS,
} from "./board"
import { readBoard, writeBoard } from "./board-doc"
import { exportCanvas, importCanvas } from "./json-canvas"

const FIXTURES = join(import.meta.dirname, "fixtures")

const FIXTURE_CLIENT_ID = 1

const CASES = readdirSync(FIXTURES)

const JSON_CANVAS_NODE_FIELDS: Record<string, string[]> = {
	text: ["text"],
	file: ["file", "subpath"],
	link: ["url"],
	group: ["label", "background", "backgroundStyle"],
}

const JSON_CANVAS_GENERIC_NODE_FIELDS = [
	"id",
	"type",
	"x",
	"y",
	"width",
	"height",
	"color",
	"kiroshi",
]

const JSON_CANVAS_EDGE_FIELDS = [
	"id",
	"fromNode",
	"fromSide",
	"fromEnd",
	"toNode",
	"toSide",
	"toEnd",
	"color",
	"label",
	"kiroshi",
]

const COLOUR = /^(?:[1-6]|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6})$/

type CanvasElement = Record<string, unknown> & { kiroshi: { z?: string } }

type Canvas = { nodes: CanvasElement[]; edges: CanvasElement[] }

const fixturePath = (name: string, file: string) => join(FIXTURES, name, file)

const fixtureText = (name: string, file: string) =>
	readFileSync(fixturePath(name, file), "utf8")

const docOf = (board: Board) => {
	const doc = new Y.Doc()
	doc.clientID = FIXTURE_CLIENT_ID
	writeBoard(doc, board)
	return doc
}

const docFromUpdate = (update: Uint8Array) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, update)
	return doc
}

const refusalOf = (text: string) => {
	try {
		importCanvas(text)
	} catch (failure) {
		if (failure instanceof BoardRefused) return failure.error
		throw failure
	}
	throw new Error("the import was not refused")
}

const placed = { x: 0, y: 0, width: 10, height: 10 }

describe.each(CASES)("the %s fixture", (name) => {
	const board = JSON.parse(fixtureText(name, "board.json")) as Board

	if (process.env.UPDATE_SNAPSHOTS) {
		writeFileSync(fixturePath(name, "board.canvas"), exportCanvas(board))
		writeFileSync(
			fixturePath(name, "update.bin"),
			Y.encodeStateAsUpdate(docOf(board)),
		)
	}

	const canvasText = fixtureText(name, "board.canvas")

	it("exports to its JSON Canvas file byte for byte", () => {
		expect(exportCanvas(board)).toBe(canvasText)
	})

	it("writes its JSON Canvas file back byte for byte", () => {
		expect(exportCanvas(importCanvas(canvasText))).toBe(canvasText)
	})

	it("imports its JSON Canvas file to the same board", () => {
		expect(importCanvas(canvasText)).toEqual(board)
	})

	it("reads the board from its yjs update", () => {
		const update = readFileSync(fixturePath(name, "update.bin"))
		expect(readBoard(docFromUpdate(update))).toEqual(board)
	})

	it("reads back the board it writes", () => {
		expect(readBoard(docOf(board))).toEqual(board)
	})

	it("orders the nodes by ascending z and keeps z under kiroshi", () => {
		const { nodes } = JSON.parse(canvasText) as Canvas
		const zs = nodes.map((node) => node.kiroshi.z ?? "")
		expect(zs).toEqual([...zs].sort())
		expect(zs.sort()).toEqual(
			Object.values(board.nodes)
				.map((node) => node.z)
				.sort(),
		)
	})

	it("emits only JSON Canvas 1.0 fields at the top level, besides the ones it read there", () => {
		const { nodes, edges } = JSON.parse(canvasText) as Canvas
		const readThere = (element: { canvas?: object } | undefined) =>
			Object.keys(element?.canvas ?? {})
		for (const node of nodes) {
			const own = JSON_CANVAS_NODE_FIELDS[String(node.type)]
			if (own === undefined) continue
			const allowed = [
				...JSON_CANVAS_GENERIC_NODE_FIELDS,
				...own,
				...readThere(board.nodes[String(node.id)]),
			]
			expect(Object.keys(node).filter((key) => !allowed.includes(key))).toEqual(
				[],
			)
			if (node.color !== undefined) expect(node.color).toMatch(COLOUR)
		}
		for (const edge of edges) {
			const allowed = [
				...JSON_CANVAS_EDGE_FIELDS,
				...readThere(board.edges[String(edge.id)]),
			]
			const extra = Object.keys(edge).filter((key) => !allowed.includes(key))
			expect(extra).toEqual([])
			if (edge.color !== undefined) expect(edge.color).toMatch(COLOUR)
		}
	})

	it.runIf(existsSync(fixturePath(name, "source.canvas")))(
		"imports its source canvas to the same board",
		() => {
			expect(importCanvas(fixtureText(name, "source.canvas"))).toEqual(board)
		},
	)
})

const sourceCases = CASES.filter((name) =>
	existsSync(fixturePath(name, "source.canvas")),
)

type CanvasFile = Record<string, unknown> & Canvas

const byIdOf = (elements: CanvasElement[]) =>
	new Map(elements.map((element) => [element.id, element]))

const expectEveryFieldKept = (source: object, exported: object) => {
	for (const [field, value] of Object.entries(source)) {
		if (field === "kiroshi" && typeof value === "object" && value !== null) {
			expect(exported).toHaveProperty([field])
			expectEveryFieldKept(
				value,
				(exported as Record<string, object>)[field] ?? {},
			)
		} else expect(exported).toHaveProperty([field], value)
	}
}

describe.each(sourceCases)("the exported %s source", (name) => {
	const source = JSON.parse(fixtureText(name, "source.canvas")) as CanvasFile
	const exported = JSON.parse(
		exportCanvas(importCanvas(fixtureText(name, "source.canvas"))),
	) as CanvasFile

	it("keeps every top-level field of the root", () => {
		const { nodes, edges, ...root } = source
		expectEveryFieldKept(root, exported)
	})

	it.each(["nodes", "edges"] as const)(
		"keeps every top-level field of its %s",
		(list) => {
			const exportedById = byIdOf(exported[list])
			for (const element of source[list]) {
				expectEveryFieldKept(element, exportedById.get(element.id) ?? {})
			}
		},
	)
})

describe("a canvas with unknown fields", () => {
	it("writes the unknown node type and kiroshi fields back unchanged", () => {
		const source = fixtureText("unknown-fields", "source.canvas")
		expect(JSON.parse(exportCanvas(importCanvas(source)))).toEqual(
			JSON.parse(source),
		)
	})
})

describe("the z-order of an imported canvas", () => {
	const textNode = (id: string, z?: string) => ({
		id,
		type: "text",
		text: id,
		...placed,
		...(z === undefined ? {} : { kiroshi: { z } }),
	})

	const zsOf = (nodes: object[]) =>
		Object.fromEntries(
			Object.entries(importCanvas(JSON.stringify({ nodes })).nodes).map(
				([id, node]) => [id, node.z],
			),
		)

	it("keeps the z values that agree with the array order", () => {
		expect(zsOf([textNode("first", "Zz"), textNode("second", "a0V")])).toEqual({
			first: "Zz",
			second: "a0V",
		})
	})

	it("assigns z from the array order when one is missing or out of order", () => {
		expect(zsOf([textNode("first", "a5"), textNode("second", "a1")])).toEqual({
			first: "a0",
			second: "a1",
		})
		expect(zsOf([textNode("first", "a5"), textNode("second")])).toEqual({
			first: "a0",
			second: "a1",
		})
	})

	it("assigns z from the array order when two nodes share one", () => {
		expect(
			zsOf([
				textNode("first", "a5"),
				textNode("second", "a7"),
				textNode("third", "a7"),
			]),
		).toEqual({ first: "a0", second: "a1", third: "a2" })
	})

	it("carries the key past the first digit", () => {
		const nodes = Array.from({ length: 63 }, (_, index) =>
			textNode(`n${index}`),
		)
		const zs = zsOf(nodes)
		expect([zs.n0, zs.n61, zs.n62]).toEqual(["a0", "az", "b10"])
	})
})

describe("a canvas the import refuses", () => {
	const cases: [string, object | string, BoardError][] = [
		[
			"text that is not JSON",
			"{",
			{ kind: "notJson", reason: expect.any(String) },
		],
		[
			"a root that is not an object",
			[],
			{ kind: "invalidRoot", field: "root" },
		],
		[
			"nodes that are not a list",
			{ nodes: {} },
			{ kind: "invalidRoot", field: "nodes" },
		],
		[
			"a node with no id",
			{ nodes: [{ type: "text", text: "", ...placed }] },
			{ kind: "missingId", element: "node", index: 0 },
		],
		[
			"a node with no x",
			{
				nodes: [{ id: "a", type: "text", text: "", y: 0, width: 1, height: 1 }],
			},
			{ kind: "invalidField", element: "node", id: "a", field: "x" },
		],
		[
			"a node whose width is not an integer",
			{ nodes: [{ id: "a", type: "text", ...placed, width: 1.5 }] },
			{ kind: "invalidField", element: "node", id: "a", field: "width" },
		],
		[
			"a node whose colour is not a JSON Canvas colour",
			{ nodes: [{ id: "a", type: "text", ...placed, color: "red" }] },
			{ kind: "invalidField", element: "node", id: "a", field: "color" },
		],
		...[
			"Ichi",
			{ kind: "robot", id: "ichi" },
			{ kind: "agent", id: "" },
			{ kind: "agent" },
			{ kind: "agent", id: "ichi", name: "Ichi" },
		].map((author): [string, object, BoardError] => [
			`a sticky whose author is ${JSON.stringify(author)}`,
			{
				nodes: [
					{
						id: "a",
						type: "text",
						...placed,
						kiroshi: { kind: "sticky", author },
					},
				],
			},
			{ kind: "invalidField", element: "node", id: "a", field: "author" },
		]),
		[
			"a node whose kiroshi kind does not fit its type",
			{
				nodes: [
					{ id: "a", type: "group", ...placed, kiroshi: { kind: "sticky" } },
				],
			},
			{ kind: "invalidField", element: "node", id: "a", field: "kind" },
		],
		[
			"two nodes with one id",
			{
				nodes: [
					{ id: "a", type: "group", ...placed },
					{ id: "a", type: "group", ...placed },
				],
			},
			{ kind: "duplicateId", element: "node", id: "a" },
		],
		[
			"an edge with no id",
			{
				nodes: [{ id: "a", type: "group", ...placed }],
				edges: [{ fromNode: "a", toNode: "a" }],
			},
			{ kind: "missingId", element: "edge", index: 0 },
		],
		[
			"an edge to a node that is absent",
			{
				nodes: [{ id: "a", type: "group", ...placed }],
				edges: [{ id: "e", fromNode: "a", toNode: "gone" }],
			},
			{ kind: "danglingEdge", id: "e", field: "toNode", node: "gone" },
		],
		[
			"an edge from a node that is absent",
			{ nodes: [], edges: [{ id: "e", fromNode: "gone", toNode: "gone" }] },
			{ kind: "danglingEdge", id: "e", field: "fromNode", node: "gone" },
		],
	]

	it.each(cases)("refuses %s", (_, canvas, error) => {
		const text = typeof canvas === "string" ? canvas : JSON.stringify(canvas)
		expect(refusalOf(text)).toEqual(error)
	})
})

describe("the board schema", () => {
	it("names every v1 kind with the JSON Canvas type it exports to", () => {
		expect(
			Object.fromEntries(
				Object.entries(BOARD_SCHEMA.kinds).map(([kind, spec]) => [
					kind,
					spec.canvasType,
				]),
			),
		).toEqual({
			sticky: "text",
			text: "text",
			shape: "text",
			section: "group",
			image: "file",
			linkCard: "link",
			libraryCard: "file",
			foreign: null,
		})
	})

	it("names the geometry and connector fields with their defaults", () => {
		expect(Object.keys(NODE_FIELDS)).toEqual([
			"x",
			"y",
			"width",
			"height",
			"z",
			"canvas",
		])
		expect(EDGE_FIELDS.fromEnd?.default).toBe("none")
		expect(EDGE_FIELDS.toEnd?.default).toBe("arrow")
		expect(EDGE_FIELDS.routing?.default).toBe("straight")
		expect(BOARD_SCHEMA.kinds.sticky?.fields.fill?.default).toBe("yellow")
		expect(BOARD_SCHEMA.kinds.sticky?.fields.author?.enum).toEqual([
			"agent",
			"person",
		])
		expect(BOARD_SCHEMA.kinds.shape?.fields.shape?.default).toBe("rectangle")
	})
})
