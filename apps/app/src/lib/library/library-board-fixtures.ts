import * as Y from "yjs"

import type { Board } from "@workspace/shared/board/board"
import { writeBoard } from "@workspace/shared/board/board-doc"

import { base64Of } from "./library-document-session"

const placed = (x: number, z: string) => ({
	x,
	y: 0,
	width: 200,
	height: 100,
	z,
})

export const EVERY_KIND_BOARD: Board = {
	nodes: {
		idea: {
			...placed(0, "a1"),
			kind: "sticky",
			text: "Idea",
			fill: "pink",
			author: { kind: "person", id: "person-a" },
		},
		title: { ...placed(300, "a0"), kind: "text", text: "Title" },
		box: {
			...placed(600, "a2"),
			kind: "shape",
			text: "Box",
			shape: "ellipse",
			color: "5",
		},
		group: { ...placed(900, "a3"), kind: "section", label: "Group" },
		cat: {
			...placed(1200, "a4"),
			kind: "image",
			file: "cat.png",
			alt: "A cat",
		},
		plan: {
			...placed(1500, "a5"),
			kind: "libraryCard",
			file: "plan.md",
			item: "plan.md",
		},
		site: {
			...placed(1800, "a6"),
			kind: "linkCard",
			url: "https://example.com",
			title: "Example",
		},
		alien: { ...placed(2100, "a7"), kind: "foreign", canvas: { type: "x" } },
	},
	edges: {
		leads: {
			fromNode: "title",
			fromEnd: "none",
			toNode: "idea",
			toEnd: "arrow",
			routing: "elbow",
			label: "leads to",
		},
		sided: {
			fromNode: "idea",
			fromSide: "bottom",
			fromEnd: "none",
			toNode: "box",
			toSide: "top",
			toEnd: "arrow",
			routing: "straight",
		},
	},
}

export const TWO_NOTES_BOARD: Board = {
	nodes: {
		first: { ...placed(0, "a0"), kind: "text", text: "First" },
		second: { ...placed(300, "a1"), kind: "text", text: "Second" },
	},
	edges: {
		link: {
			fromNode: "first",
			fromEnd: "none",
			toNode: "second",
			toEnd: "arrow",
			routing: "straight",
		},
	},
}

export const boardDocOf = (board: Board) => {
	const doc = new Y.Doc()
	writeBoard(doc, board)
	return doc
}

export const boardStateOf = (board: Board) =>
	base64Of(Y.encodeStateAsUpdate(boardDocOf(board)))
