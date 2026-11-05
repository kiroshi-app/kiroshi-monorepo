import * as Y from "yjs"

import {
	BOARD_SCHEMA,
	type Board,
	EDGE_FIELDS,
	type Fields,
	NODE_FIELDS,
	parsedBoard,
} from "./board"

const { doc: ROOTS } = BOARD_SCHEMA

export const readBoard = (doc: Y.Doc): Board =>
	parsedBoard({
		nodes: doc.getMap(ROOTS.nodes).toJSON(),
		edges: doc.getMap(ROOTS.edges).toJSON(),
		kiroshi: doc.getMap(ROOTS.board).toJSON(),
		canvas: doc.getMap(ROOTS.canvas).toJSON(),
	})

const sharedElement = (element: object, fields: Fields) =>
	new Y.Map<unknown>(
		Object.entries(element).map(([name, value]) => [
			name,
			fields[name]?.type === "text" ? new Y.Text(String(value)) : value,
		]),
	)

const replaced = (map: Y.Map<unknown>, entries: [string, unknown][]) => {
	map.clear()
	for (const [key, value] of entries) map.set(key, value)
}

export const writeBoard = (doc: Y.Doc, board: Board) =>
	doc.transact(() => {
		replaced(
			doc.getMap(ROOTS.nodes),
			Object.entries(board.nodes).map(([id, node]) => [
				id,
				sharedElement(node, {
					...NODE_FIELDS,
					...BOARD_SCHEMA.kinds[node.kind].fields,
				}),
			]),
		)
		replaced(
			doc.getMap(ROOTS.edges),
			Object.entries(board.edges).map(([id, edge]) => [
				id,
				sharedElement(edge, EDGE_FIELDS),
			]),
		)
		replaced(doc.getMap(ROOTS.board), Object.entries(board.kiroshi ?? {}))
		replaced(doc.getMap(ROOTS.canvas), Object.entries(board.canvas ?? {}))
	})
