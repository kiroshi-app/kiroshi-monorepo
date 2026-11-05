import { describe, expect, it } from "vitest"

import { readBoard } from "@workspace/shared/board/board-doc"
import type { BoardIntent } from "@workspace/ui/components/board-view"

import { boardDocOf, TWO_NOTES_BOARD } from "./library-board-fixtures"
import {
	applyLibraryBoardIntent,
	describeLibraryBoardLink,
	type LibraryBoardObject,
	placeLibraryBoardObject,
} from "./library-board-intents"

const LOCAL = Symbol("local")

const applied = (intent: BoardIntent) => {
	const doc = boardDocOf(TWO_NOTES_BOARD)
	let transactions = 0
	doc.on("afterTransaction", () => {
		transactions++
	})
	applyLibraryBoardIntent(doc, intent, LOCAL)
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
		expect(board.nodes.made?.z > (board.nodes.second?.z ?? "")).toBe(true)
		expect(transactions).toBe(1)
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
		)

		applyLibraryBoardIntent(
			doc,
			{
				type: "style",
				id: "made",
				style: { shape: "rounded-rectangle", fill: "surface" },
			},
			LOCAL,
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

	it("deletes a node with every connector attached to it", () => {
		const { board } = applied({ type: "delete", id: "second" })

		expect(Object.keys(board.nodes)).toEqual(["first"])
		expect(board.edges).toEqual({})
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
			x: 280,
			y: 210,
			width: 240,
			height: 180,
		})
	})

	it("places any other Library item as a library card pointing at it", () => {
		const { node } = placed({ kind: "libraryCard", item: "Notes.md" })

		expect(node).toMatchObject({
			kind: "libraryCard",
			item: "Notes.md",
			file: "Library/Notes.md",
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

	it("keeps the link card with its URL alone on a bare preview", () => {
		const { doc } = placed({ kind: "linkCard", url: "https://example.com" })

		describeLibraryBoardLink(doc, "added", { title: "" }, LOCAL)

		const link = readBoard(doc).nodes.added
		expect(link).toMatchObject({ url: "https://example.com" })
		expect(link).not.toHaveProperty("title")
		expect(link).not.toHaveProperty("preview")
	})

	it("leaves a node that is no link card unchanged", () => {
		const doc = boardDocOf(TWO_NOTES_BOARD)
		const before = readBoard(doc)

		describeLibraryBoardLink(doc, "first", { title: "Example" }, LOCAL)

		expect(readBoard(doc)).toEqual(before)
	})
})
