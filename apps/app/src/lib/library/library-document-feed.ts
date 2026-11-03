import type { Event } from "@tauri-apps/api/event"

import {
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryDocumentUpdated,
} from "../bindings"
import { listen } from "../host/index"

type Receive = (update: string) => void

type ListenFailure = { failure: unknown } | null

export const createLibraryDocumentFeed = (spaceId: string, name: string) => {
	const buffered: string[] = []
	let receive: Receive | null = null
	let settleListening: (outcome: ListenFailure) => void = () => undefined
	const listening = new Promise<ListenFailure>((settle) => {
		settleListening = settle
	})

	const hear = ({ payload }: Event<LibraryDocumentUpdated>) => {
		if (payload.spaceId !== spaceId || payload.name !== name) {
			return
		}
		if (receive) {
			receive(payload.update)
			return
		}
		buffered.push(payload.update)
	}

	const start = () => {
		const attaching = listen<LibraryDocumentUpdated>(
			LIBRARY_DOCUMENT_UPDATED_EVENT,
			hear,
		).then(
			(unlisten) => {
				settleListening(null)
				return unlisten
			},
			(failure: unknown) => {
				settleListening({ failure })
				return null
			},
		)
		return () => {
			void attaching.then((unlisten) => unlisten?.())
		}
	}

	const whenListening = async () => {
		const outcome = await listening
		if (outcome) {
			throw outcome.failure
		}
	}

	const attach = (next: Receive) => {
		receive = next
		for (const update of buffered.splice(0)) {
			next(update)
		}
		return () => {
			receive = null
		}
	}

	return { start, whenListening, attach }
}
