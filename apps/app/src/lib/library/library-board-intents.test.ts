import { describe, expect, it, vi } from "vitest"

import type { Board } from "@workspace/shared/board/board"
import { readBoard } from "@workspace/shared/board/board-doc"
import type {
	BoardConnector,
	BoardIntent,
	BoardItem,
} from "@workspace/ui/components/board-view"

import {
	boardDocOf,
	TIED_ARROWS_BOARD,
	TWO_NOTES_BOARD,
} from "./library-board-fixtures"
import {
	applyLibraryBoardIntent,
	describeLibraryBoardLink,
	type LibraryBoardObject,
	placeLibraryBoardObject,
} from "./library-board-intents"

const LOCAL = Symbol("local")

const PERSON = { kind: "person", id: "person-a" } as const

const authorOf = () => PERSON

const zKeysBesides = (board: Board, id: string) =>
	Object.entries(board.nodes).flatMap(([key, node]) =>
		key === id ? [] : [node.z],
	)

const isAboveEvery = (board: Board, id: string) =>
	zKeysBesides(board, id).every((z) => (board.nodes[id]?.z ?? "") > z)

const isBelowEvery = (board: Board, id: string) =>
	zKeysBesides(board, id).every((z) => (board.nodes[id]?.z ?? "") < z)

const created = (kind: BoardItem["kind"], id = "made"): BoardIntent => ({
	type: "create",
	object: {
		id,
		kind,
		position: { x: 5, y: 6 },
		size: { width: 200, height: 120 },
		zOrder: 0,
		text: "",
	},
})

const arrowSet = (arrow: Partial<BoardConnector>): BoardIntent => ({
	type: "set-arrow",
	arrow: {
		id: "drawn",
		kind: "connector",
		from: "first",
		to: "second",
		routing: "straight",
		zOrder: 0,
		text: "",
		...arrow,
	},
})

const applied = (intent: BoardIntent, board = TWO_NOTES_BOARD) => {
	const doc = boardDocOf(board)
	let transactions = 0
	doc.on("afterTransaction", () => {
		transactions++
	})
	applyLibraryBoardIntent(doc, intent, LOCAL, authorOf)
	return { board: readBoard(doc), transactions }
}

describe("applyLibraryBoardIntent", () => {
	it("moves a node to whole board units in one transaction", () => {
		const { board, transactions } = applied({
			type: "move",
			id: "first",
			position: { x: 40.4, y: -12.6 },
		})

		expect(board.nodes.first).toMatchObject({ x: 40, y: -13 })
		expect(transactions).toBe(1)
	})

	it("resizes a node", () => {
		const { board } = applied({
			type: "resize",
			id: "second",
			position: { x: 10, y: 20 },
			size: { width: 320, height: 180 },
		})

		expect(board.nodes.second).toMatchObject({
			x: 10,
			y: 20,
			width: 320,
			height: 180,
		})
	})

	it("replaces the text of a node", () => {
		const { board } = applied({
			type: "edit-text",
			id: "first",
			text: "Renamed",
		})

		expect(board.nodes.first).toMatchObject({ text: "Renamed" })
	})

	it("creates a shape above every node with its style", () => {
		const { board, transactions } = applied({
			type: "create",
			object: {
				id: "made",
				kind: "shape",
				position: { x: 5, y: 6 },
				size: { width: 100, height: 80 },
				zOrder: 0,
				text: "New",
				style: { shape: "ellipse", fill: "green" },
			},
		})

		expect(board.nodes.made).toMatchObject({
			kind: "shape",
			x: 5,
			y: 6,
			text: "New",
			shape: "ellipse",
			color: "4",
		})
		expect(isAboveEvery(board, "made")).toBe(true)
		expect(transactions).toBe(1)
	})

	it("creates a sticky above every node, authored by the current person", () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const { board } = applied(created("sticky"))

		expect(board.nodes.made).toEqual({
			kind: "sticky",
			x: 5,
			y: 6,
			width: 200,
			height: 120,
			z: expect.any(String),
			text: "",
			fill: "yellow",
			author: PERSON,
		})
		expect(isAboveEvery(board, "made")).toBe(true)
		expect(logged).not.toHaveBeenCalled()
		logged.mockRestore()
	})

	it("creates a text above every node", () => {
		const { board } = applied(created("text"))

		expect(board.nodes.made).toMatchObject({
			kind: "text",
			x: 5,
			y: 6,
			text: "",
		})
		expect(isAboveEvery(board, "made")).toBe(true)
	})

	it("creates a section below every node, without a label until it has text", () => {
		const { board } = applied(created("section"))

		expect(board.nodes.made).toMatchObject({ kind: "section", x: 5, y: 6 })
		expect(board.nodes.made).not.toHaveProperty("label")
		expect(isBelowEvery(board, "made")).toBe(true)
	})

	it("creates each new section below the last one", () => {
		const doc = boardDocOf(TWO_NOTES_BOARD)
		for (const id of ["lower", "lowest"])
			applyLibraryBoardIntent(doc, created("section", id), LOCAL, authorOf)
		const board = readBoard(doc)

		expect(isBelowEvery(board, "lower")).toBe(false)
		expect(isBelowEvery(board, "lowest")).toBe(true)
		expect(board.nodes.lowest?.z < (board.nodes.lower?.z ?? "")).toBe(true)
	})

	it("styles a shape back to the surface by dropping its colour", () => {
		const doc = boardDocOf(TWO_NOTES_BOARD)
		applyLibraryBoardIntent(
			doc,
			{
				type: "create",
				object: {
					id: "made",
					kind: "shape",
					position: { x: 0, y: 0 },
					size: { width: 100, height: 80 },
					zOrder: 0,
					text: "",
					style: { shape: "ellipse", fill: "pink" },
				},
			},
			LOCAL,
			authorOf,
		)

		applyLibraryBoardIntent(
			doc,
			{
				type: "style",
				id: "made",
				style: { shape: "rounded-rectangle", fill: "surface" },
			},
			LOCAL,
			authorOf,
		)

		const made = readBoard(doc).nodes.made
		expect(made).toMatchObject({ shape: "rectangle" })
		expect(made && "color" in made).toBe(false)
	})

	it("restyles the routing of a connector", () => {
		const { board } = applied({
			type: "style",
			id: "link",
			style: { routing: "elbow" },
		})

		expect(board.edges.link?.routing).toBe("elbow")
	})

	it("connects two nodes", () => {
		const { board } = applied({
			type: "connect",
			id: "back",
			from: "second",
			fromSide: "left",
			to: "first",
			toSide: "right",
			routing: "elbow",
		})

		expect(board.edges.back).toMatchObject({
			fromNode: "second",
			fromSide: "left",
			toNode: "first",
			toSide: "right",
			routing: "elbow",
		})
	})

	it("refuses a connection to a node the board no longer holds", () => {
		const { board, transactions } = applied({
			type: "connect",
			id: "dangling",
			from: "first",
			fromSide: "right",
			to: "gone",
			toSide: "left",
			routing: "straight",
		})

		expect(board.edges.dangling).toBeUndefined()
		expect(transactions).toBe(1)
	})

	it("keeps every connector tied to a deleted node, its end loosened where it sat", () => {
		const { board } = applied({ type: "delete", id: "second" })

		expect(Object.keys(board.nodes)).toEqual(["first"])
		expect(board.edges.link).toEqual({
			fromNode: "first",
			fromEnd: "none",
			toPoint: { x: 400, y: 50 },
			toEnd: "arrow",
			routing: "straight",
		})
	})

	it("loosens a centre, a side and an anchor tie at the point each end sat", () => {
		const { board } = applied(
			{ type: "delete", id: "finish" },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).toEqual({
			fromNode: "start",
			fromAnchor: { x: 0.25, y: 0 },
			fromEnd: "none",
			toPoint: { x: 400, y: 50 },
			toEnd: "arrow",
			label: "then",
			labelPosition: 0.3,
			bend: 40,
			routing: "elbow",
			headSize: "large",
		})
		expect(board.edges.centred?.toPoint).toEqual({ x: 500, y: 50 })
	})

	it("loosens an anchor tie at its point on the board", () => {
		const { board } = applied(
			{ type: "delete", id: "start" },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).not.toHaveProperty("fromNode")
		expect(board.edges.pinned).not.toHaveProperty("fromAnchor")
		expect(board.edges.pinned?.fromPoint).toEqual({ x: 50, y: 0 })
		expect(board.edges.pinned?.toNode).toBe("finish")
	})

	it("keeps an arrow tied at both ends to a deleted node, both ends free", () => {
		const { board } = applied(
			{ type: "delete", id: "finish" },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.loop).toEqual({
			fromPoint: { x: 500, y: 0 },
			fromEnd: "none",
			toPoint: { x: 600, y: 75 },
			toEnd: "arrow",
			bend: -20,
			routing: "straight",
		})
	})

	it("keeps the ties and the bend of every arrow when a tied node moves", () => {
		const { board } = applied(
			{ type: "move", id: "finish", position: { x: 900, y: 40 } },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges).toEqual(TIED_ARROWS_BOARD.edges)
	})

	it("changes only the routing of an arrow when restyled", () => {
		const { board } = applied(
			{ type: "style", id: "pinned", style: { routing: "straight" } },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).toEqual({
			...TIED_ARROWS_BOARD.edges.pinned,
			routing: "straight",
		})
	})

	it("changes only the label of an arrow when its text is edited", () => {
		const { board } = applied(
			{ type: "edit-text", id: "pinned", text: "after" },
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).toEqual({
			...TIED_ARROWS_BOARD.edges.pinned,
			label: "after",
		})
	})

	it("draws an arrow from a side to the centre of a node", () => {
		const { board, transactions } = applied(arrowSet({ fromSide: "right" }))

		expect(board.edges.drawn).toEqual({
			fromNode: "first",
			fromSide: "right",
			fromEnd: "none",
			toNode: "second",
			toEnd: "arrow",
			routing: "straight",
		})
		expect(transactions).toBe(1)
	})

	it("draws an arrow tied to an exact point of a node", () => {
		const { board } = applied(arrowSet({ toAnchor: { x: 0.25, y: 0.5 } }))

		expect(board.edges.drawn).toMatchObject({
			toNode: "second",
			toAnchor: { x: 0.25, y: 0.5 },
		})
	})

	it("draws an arrow left untied on a board point", () => {
		const { board } = applied(arrowSet({ to: "", toPoint: { x: 640, y: 80 } }))

		expect(board.edges.drawn).toEqual({
			fromNode: "first",
			fromEnd: "none",
			toPoint: { x: 640, y: 80 },
			toEnd: "arrow",
			routing: "straight",
		})
	})

	it("rewrites the ends, bend, label and label position of an arrow, keeping its heads", () => {
		const { board, transactions } = applied(
			arrowSet({
				id: "pinned",
				from: "start",
				fromSide: "bottom",
				to: "",
				toPoint: { x: 900, y: 300 },
				routing: "straight",
				bend: -12,
				text: "next",
				labelPosition: 0.5,
			}),
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).toEqual({
			fromNode: "start",
			fromSide: "bottom",
			fromEnd: "none",
			toPoint: { x: 900, y: 300 },
			toEnd: "arrow",
			label: "next",
			labelPosition: 0.5,
			bend: -12,
			routing: "straight",
			headSize: "large",
		})
		expect(transactions).toBe(1)
	})

	it("drops the bend and the label an arrow no longer carries", () => {
		const { board } = applied(
			arrowSet({
				id: "pinned",
				from: "start",
				fromAnchor: { x: 0.25, y: 0 },
				to: "finish",
				toSide: "left",
				routing: "elbow",
			}),
			TIED_ARROWS_BOARD,
		)

		expect(board.edges.pinned).not.toHaveProperty("bend")
		expect(board.edges.pinned).not.toHaveProperty("label")
		expect(board.edges.pinned).not.toHaveProperty("labelPosition")
	})

	it("refuses an arrow tied to a node the board no longer holds", () => {
		const { board } = applied(arrowSet({ to: "gone" }))

		expect(board.edges.drawn).toBeUndefined()
	})

	it("deletes a connector alone", () => {
		const { board } = applied({ type: "delete", id: "link" })

		expect(Object.keys(board.nodes).sort()).toEqual(["first", "second"])
		expect(board.edges).toEqual({})
	})
})

const placed = (object: LibraryBoardObject) => {
	const doc = boardDocOf(TWO_NOTES_BOARD)
	placeLibraryBoardObject(
		doc,
		{ id: "added", object, centre: { x: 400, y: 300 } },
		LOCAL,
	)
	return { doc, node: readBoard(doc).nodes.added }
}

describe("placeLibraryBoardObject", () => {
	it("places a Library image centred on the point, pointing at its item", () => {
		const { node } = placed({ kind: "image", item: "cover.png" })

		expect(node).toMatchObject({
			kind: "image",
			item: "cover.png",
			file: "Library/cover.png",
			x: 290,
			y: 227,
			width: 220,
			height: 146,
		})
	})

	it("places any other Library item as a library card pointing at it", () => {
		const { node } = placed({ kind: "libraryCard", item: "Notes.md" })

		expect(node).toMatchObject({
			kind: "libraryCard",
			item: "Notes.md",
			file: "Library/Notes.md",
			width: 236,
			height: 131,
		})
	})

	it("places a link card at the size of a web card", () => {
		const { node } = placed({ kind: "linkCard", url: "https://example.com" })

		expect(node).toMatchObject({
			kind: "linkCard",
			url: "https://example.com",
			width: 300,
			height: 178,
		})
	})

	it("stacks the placed object above every node", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })
		const { nodes } = readBoard(doc)

		const topmost = Object.entries(nodes).sort(([, below], [, above]) =>
			below.z < above.z ? -1 : 1,
		)
		expect(topmost.at(-1)?.[0]).toBe("added")
	})
})

describe("describeLibraryBoardLink", () => {
	it("fills the title and preview of a link card", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })

		describeLibraryBoardLink(
			doc,
			"added",
			{ title: "Example", image: "https://example.com/og.png" },
			LOCAL,
		)

		expect(readBoard(doc).nodes.added).toMatchObject({
			kind: "linkCard",
			url: "https://example.com",
			title: "Example",
			preview: "https://example.com/og.png",
		})
	})

	it("writes the page description on a link card", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })

		describeLibraryBoardLink(
			doc,
			"added",
			{ title: "Example", description: "An example page." },
			LOCAL,
		)

		expect(readBoard(doc).nodes.added).toMatchObject({
			description: "An example page.",
		})
	})

	it("leaves the description unset when the page has none", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })

		describeLibraryBoardLink(
			doc,
			"added",
			{ title: "Example", description: "" },
			LOCAL,
		)

		expect(readBoard(doc).nodes.added).not.toHaveProperty("description")
	})

	it("keeps the link card with its URL alone on a bare preview", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })

		describeLibraryBoardLink(doc, "added", { title: "" }, LOCAL)

		const link = readBoard(doc).nodes.added
		expect(link).toMatchObject({ url: "https://example.com" })
		expect(link).not.toHaveProperty("title")
		expect(link).not.toHaveProperty("preview")
		expect(link).not.toHaveProperty("description")
	})

	it("leaves a node that is no link card unchanged", () => {
		const doc = boardDocOf(TWO_NOTES_BOARD)
		const before = readBoard(doc)

		describeLibraryBoardLink(doc, "first", { title: "Example" }, LOCAL)

		expect(readBoard(doc)).toEqual(before)
	})
})
