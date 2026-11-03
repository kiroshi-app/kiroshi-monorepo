import type { Event } from "@tauri-apps/api/event"
import { useEffect, useMemo, useState } from "react"

import {
	type AgentSeat,
	type CaretPlacedDocument,
	LIBRARY_DOCUMENT_PRESENCE_EVENT,
	seatsAfter,
	writersOf,
} from "./library-document-writers"

import type { LibraryDocumentPresence } from "../bindings"
import type { Bot } from "../conversations/store-contract"
import { listen } from "../host/index"

type WatchedDocument = {
	spaceId: string
	name: string
}

type HeldSeats = {
	watched: WatchedDocument | null
	seats: AgentSeat[]
}

type LibraryDocumentWritersInput = {
	spaceId: string
	name: string | null
	document: CaretPlacedDocument | null
	bots: Bot[]
	title: string
}

const reportUnheardPresence = (reason: unknown) => {
	console.error("library: document presence could not be listened to", reason)
}

const isPresenceIn = (
	{ spaceId, name }: WatchedDocument,
	presence: LibraryDocumentPresence,
) => presence.spaceId === spaceId && presence.name === name

const useAgentSeats = (spaceId: string, name: string | null) => {
	const watched = useMemo(
		() => (name ? { spaceId, name } : null),
		[spaceId, name],
	)
	const [held, setHeld] = useState<HeldSeats>({ watched: null, seats: [] })

	useEffect(() => {
		if (!watched) {
			return
		}
		const hear = ({ payload }: Event<LibraryDocumentPresence>) => {
			if (!isPresenceIn(watched, payload)) {
				return
			}
			const seenAt = Date.now()
			setHeld((current) => ({
				watched,
				seats: seatsAfter(
					current.watched === watched ? current.seats : [],
					payload.writers,
					seenAt,
				),
			}))
		}
		const subscription = listen<LibraryDocumentPresence>(
			LIBRARY_DOCUMENT_PRESENCE_EVENT,
			hear,
		).catch(reportUnheardPresence)
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [watched])

	return held.watched === watched ? held.seats : []
}

export const useLibraryDocumentWriters = ({
	spaceId,
	name,
	document,
	bots,
	title,
}: LibraryDocumentWritersInput) => {
	const seats = useAgentSeats(spaceId, name)
	return document ? writersOf({ seats, bots, document, title }) : []
}
