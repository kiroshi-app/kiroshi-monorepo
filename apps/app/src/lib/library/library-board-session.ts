import * as Y from "yjs"

import { BOARD_SCHEMA } from "@workspace/shared/board/board"
import { readBoard } from "@workspace/shared/board/board-doc"
import type { BoardIntent } from "@workspace/ui/components/board-view"

import { applyLibraryBoardIntent } from "./library-board-intents"
import { libraryBoardViewOf } from "./library-board-view"
import { base64Of, bytesOf, SEND_INTERVAL_MS } from "./library-document-session"

const REMOTE_ORIGIN = Symbol("remote")

const LOCAL_ORIGIN = Symbol("local")

const { doc: ROOTS } = BOARD_SCHEMA

type LibraryBoardSessionOptions = {
	state: string
	send: (update: string) => Promise<unknown>
}

const viewOf = (doc: Y.Doc) => libraryBoardViewOf(readBoard(doc))

export const createLibraryBoardSession = ({
	state,
	send,
}: LibraryBoardSessionOptions) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(state), REMOTE_ORIGIN)
	let view = viewOf(doc)
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

	doc.on("update", (update: Uint8Array, origin: unknown) => {
		view = viewOf(doc)
		if (origin === REMOTE_ORIGIN) {
			return
		}
		pending.push(update)
		timer ??= setTimeout(flush, SEND_INTERVAL_MS)
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

	return {
		view: () => view,
		subscribe,
		apply: (intent: BoardIntent) =>
			applyLibraryBoardIntent(doc, intent, LOCAL_ORIGIN),
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
	}
}
