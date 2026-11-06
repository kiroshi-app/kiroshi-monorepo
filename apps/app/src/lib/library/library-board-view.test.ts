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

	it("maps an edge to a connector, its missing sides facing each other", () => {
		expect(objectNamed("leads")).toMatchObject({
			kind: "connector",
			from: "title",
			fromSide: "right",
			to: "idea",
			toSide: "left",
			routing: "elbow",
			text: "leads to",
		})
		expect(objectNamed("sided")).toMatchObject({
			fromSide: "bottom",
			toSide: "top",
			text: "",
		})
	})

	it("leaves an arrow with a free end out of the view and keeps every other item", () => {
		const loose = {
			fromNode: "title",
			fromEnd: "none",
			toPoint: { x: 640, y: -80 },
			toEnd: "arrow",
			routing: "straight",
		} as const
		const board = {
			...EVERY_KIND_BOARD,
			edges: { ...EVERY_KIND_BOARD.edges, loose },
		}

		expect(libraryBoardViewOf(board)).toEqual(
			libraryBoardViewOf(EVERY_KIND_BOARD),
		)
	})
})
