import * as Y from "yjs"

import {
	type Author,
	BOARD_SCHEMA,
	type BoardNode,
	isObject,
	parsedBoard,
} from "@workspace/shared/board/board"
import type { BoardIntent } from "@workspace/ui/components/board-view"

import {
	applyLibraryBoardIntent,
	describeLibraryBoardLink,
	type LibraryBoardLinkDescription,
	type LibraryBoardPlacement,
	placeLibraryBoardObject,
} from "./library-board-intents"
import { libraryBoardViewOf } from "./library-board-view"
import { base64Of, bytesOf, SEND_INTERVAL_MS } from "./library-document-session"

const REMOTE_ORIGIN = Symbol("remote")

const LOCAL_ORIGIN = Symbol("local")

const PREVIEW_ORIGIN = Symbol("preview")

const { doc: ROOTS } = BOARD_SCHEMA

const ENDPOINTS = ["fromNode", "toNode"] as const

type LibraryBoardSessionOptions = {
	state: string
	send: (update: string) => Promise<unknown>
	onRefused: (refusal: unknown) => void
	authorOf: () => Author
}

type SharedEntry = [string, unknown]

const isDanglingIn =
	(nodes: Record<string, unknown>) =>
	([, edge]: SharedEntry) =>
		isObject(edge) &&
		ENDPOINTS.some(
			(field) =>
				typeof edge[field] === "string" && !Object.hasOwn(nodes, edge[field]),
		)

const liveBoardOf = (doc: Y.Doc) => {
	const nodes = doc.getMap(ROOTS.nodes).toJSON()
	const isDangling = isDanglingIn(nodes)
	return parsedBoard({
		nodes,
		edges: Object.fromEntries(
			Object.entries(doc.getMap(ROOTS.edges).toJSON()).filter(
				(entry) => !isDangling(entry),
			),
		),
		kiroshi: doc.getMap(ROOTS.board).toJSON(),
		canvas: doc.getMap(ROOTS.canvas).toJSON(),
	})
}

export const createLibraryBoardSession = ({
	state,
	send,
	onRefused,
	authorOf,
}: LibraryBoardSessionOptions) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(state), REMOTE_ORIGIN)
	let board = liveBoardOf(doc)
	let view = libraryBoardViewOf(board)
	let isRefused = false
	let history: Y.UndoManager | null = null
	let pending: Uint8Array[] = []
	let timer: ReturnType<typeof setTimeout> | null = null
	let sent: Promise<unknown> = Promise.resolve()

	const flush = () => {
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
		if (pending.length > 0) {
			const update = base64Of(Y.mergeUpdates(pending))
			pending = []
			sent = Promise.allSettled([sent, send(update)])
		}
		return sent
	}

	const refuse = (refusal: unknown) => {
		console.error("library: the board state could not be read", refusal)
		if (!isRefused) {
			onRefused(refusal)
		}
		isRefused = true
	}

	const refreshView = () => {
		try {
			const read = liveBoardOf(doc)
			view = libraryBoardViewOf(read)
			board = read
			isRefused = false
		} catch (refusal) {
			refuse(refusal)
		}
	}

	doc.on("update", (update: Uint8Array, origin: unknown) => {
		if (origin !== REMOTE_ORIGIN) {
			pending.push(update)
			timer ??= setTimeout(flush, SEND_INTERVAL_MS)
		}
		refreshView()
	})

	const trackHistory = () => {
		const tracked = new Y.UndoManager(
			[doc.getMap(ROOTS.nodes), doc.getMap(ROOTS.edges)],
			{ trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 0 },
		)
		history = tracked
		return () => {
			tracked.destroy()
			if (history === tracked) history = null
		}
	}

	const subscribe = (onChange: () => void) => {
		doc.on("update", onChange)
		return () => doc.off("update", onChange)
	}

	const close = () => {
		const flushed = flush()
		doc.destroy()
		return flushed
	}

	return {
		view: () => view,
		nodeOf: (id: string): BoardNode | undefined => board.nodes[id],
		subscribe,
		apply: (intent: BoardIntent) =>
			applyLibraryBoardIntent(doc, intent, LOCAL_ORIGIN, authorOf),
		place: (placement: LibraryBoardPlacement) =>
			placeLibraryBoardObject(doc, placement, LOCAL_ORIGIN),
		describeLink: (id: string, description: LibraryBoardLinkDescription) =>
			describeLibraryBoardLink(doc, id, description, PREVIEW_ORIGIN),
		receive: (update: string) =>
			Y.applyUpdate(doc, bytesOf(update), REMOTE_ORIGIN),
		undo: () => {
			history?.undo()
		},
		redo: () => {
			history?.redo()
		},
		trackHistory,
		flush,
		close,
	}
}
