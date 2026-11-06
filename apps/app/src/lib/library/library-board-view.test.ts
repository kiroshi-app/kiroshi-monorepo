import { describe, expect, it } from "vitest"

import { EVERY_KIND_BOARD } from "./library-board-fixtures"
import { libraryBoardViewOf } from "./library-board-view"

const objectNamed = (id: string) =>
	libraryBoardViewOf(EVERY_KIND_BOARD).objects.find(
		(object) => object.id === id,
	)

describe("libraryBoardViewOf", () => {
	it("maps an empty board to an empty view", () => {
		expect(libraryBoardViewOf({ nodes: {}, edges: {} })).toEqual({
			objects: [],
		})
	})

	it("maps every node and every edge to one object of the view", () => {
		const ids = libraryBoardViewOf(EVERY_KIND_BOARD).objects.map(
			(object) => object.id,
		)

		expect(new Set(ids)).toEqual(
			new Set([
				...Object.keys(EVERY_KIND_BOARD.nodes),
				...Object.keys(EVERY_KIND_BOARD.edges),
			]),
		)
	})

	it("stacks the items by their z key", () => {
		expect(objectNamed("title")?.zOrder).toBeLessThan(
			objectNamed("idea")?.zOrder ?? 0,
		)
		expect(objectNamed("idea")?.zOrder).toBeLessThan(
			objectNamed("box")?.zOrder ?? 0,
		)
	})

	it("maps a sticky to a sticky with its fill and text", () => {
		expect(objectNamed("idea")).toMatchObject({
			kind: "sticky",
			position: { x: 0, y: 0 },
			size: { width: 200, height: 100 },
			text: "Idea",
			style: { shape: "rounded-rectangle", fill: "pink" },
		})
	})

	it("maps a shape to its outline and the fill of its colour", () => {
		expect(objectNamed("box")).toMatchObject({
			kind: "shape",
			text: "Box",
			style: { shape: "ellipse", fill: "blue" },
		})
	})

	it.each([
		["title", "text", "Title"],
		["group", "shape", "Group"],
		["cat", "image", "A cat"],
		["plan", "link", "plan.md"],
		["site", "link", "Example"],
		["alien", "shape", ""],
	])("maps the %s node to a %s item reading %j", (id, kind, text) => {
		expect(objectNamed(id)).toMatchObject({ kind, text })
	})

	it("maps an edge to a connector and leaves its missing sides missing", () => {
		const leads = objectNamed("leads")
		expect(leads).toMatchObject({
			kind: "connector",
			from: "title",
			to: "idea",
			routing: "elbow",
			text: "leads to",
		})
		expect(leads).not.toHaveProperty("fromSide", expect.anything())
		expect(leads).not.toHaveProperty("toSide", expect.anything())
		expect(objectNamed("sided")).toMatchObject({
			fromSide: "bottom",
			toSide: "top",
			text: "",
		})
	})

	it("carries the anchors, the bend, the label position and the head size unchanged", () => {
		const shaped = {
			fromNode: "title",
			fromAnchor: { x: 0.25, y: 0.75 },
			fromEnd: "none",
			toNode: "idea",
			toAnchor: { x: 1, y: 0.5 },
			toEnd: "arrow",
			routing: "straight",
			bend: -40,
			labelPosition: 0.3,
			headSize: "large",
		} as const
		const view = libraryBoardViewOf({
			...EVERY_KIND_BOARD,
			edges: { shaped },
		})

		expect(view.objects.find(({ id }) => id === "shaped")).toMatchObject({
			from: "title",
			fromAnchor: { x: 0.25, y: 0.75 },
			to: "idea",
			toAnchor: { x: 1, y: 0.5 },
			bend: -40,
			labelPosition: 0.3,
			headSize: "large",
		})
	})

	it("maps a free end to its board point", () => {
		const loose = {
			fromNode: "title",
			fromEnd: "none",
			toPoint: { x: 640, y: -80 },
			toEnd: "arrow",
			routing: "straight",
		} as const
		const view = libraryBoardViewOf({
			...EVERY_KIND_BOARD,
			edges: { ...EVERY_KIND_BOARD.edges, loose },
		})

		expect(view.objects.find(({ id }) => id === "loose")).toMatchObject({
			kind: "connector",
			from: "title",
			toPoint: { x: 640, y: -80 },
			routing: "straight",
		})
		expect(view.objects).toHaveLength(
			libraryBoardViewOf(EVERY_KIND_BOARD).objects.length + 1,
		)
	})

	it("leaves out an arrow whose end has neither a node nor a point", () => {
		const broken = {
			fromNode: "title",
			fromEnd: "none",
			toEnd: "arrow",
			routing: "straight",
		} as const
		expect(
			libraryBoardViewOf({
				...EVERY_KIND_BOARD,
				edges: { ...EVERY_KIND_BOARD.edges, broken },
			}),
		).toEqual(libraryBoardViewOf(EVERY_KIND_BOARD))
	})
})
