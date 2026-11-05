import type { Event } from "@tauri-apps/api/event"
import { useEffect, useEffectEvent, useMemo, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	type AgentSeat,
	agentNameOf,
	type CaretPlacedDocument,
	LIBRARY_DOCUMENT_PRESENCE_EVENT,
	LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
	peopleOf,
	seatsAfter,
	writersOf,
} from "./library-document-writers"

import type {
	LibraryDocumentPresence,
	LibraryDocumentWriterFinished,
	LibraryWriter,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { useSignedInAccountId } from "../account/use-account"
import type { Bot } from "../conversations/store-contract"
import { currentWindowLabel, listen } from "../host/index"

type WatchedDocument = {
	spaceId: string
	name: string
}

type HeldPresence = {
	watched: WatchedDocument | null
	seats: AgentSeat[]
	people: LibraryWriter[]
}

type LibraryDocumentWritersInput = {
	spaceId: string
	name: string | null
	isJoined: boolean
	document: CaretPlacedDocument | null
	bots: Bot[]
	title: string
}

const NO_PRESENCE: HeldPresence = {
	watched: null,
	seats: [],
	people: [],
}

export const reportUnheard = (event: string) => (reason: unknown) => {
	console.error(`library: ${event} could not be listened to`, reason)
}

const isIn = ({ spaceId, name }: WatchedDocument, payload: WatchedDocument) =>
	payload.spaceId === spaceId && payload.name === name

const useListenWhileWatched = <Payload extends WatchedDocument>(
	watched: WatchedDocument | null,
	event: string,
	hear: (watched: WatchedDocument, payload: Payload) => void,
) => {
	const hearIn = useEffectEvent(hear)
	useEffect(() => {
		if (!watched) {
			return
		}
		const subscription = listen<Payload>(
			event,
			({ payload }: Event<Payload>) => {
				if (isIn(watched, payload)) {
					hearIn(watched, payload)
				}
			},
		).catch(reportUnheard(event))
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [watched, event])
}

const useIsOwnSeat = (isJoined: boolean) => {
	const signedInAccountId = useSignedInAccountId()
	return ({ kind, id }: LibraryWriter) =>
		isJoined
			? kind === "member" && id === signedInAccountId()
			: kind === "person" && id === currentWindowLabel()
}

const raiseWriteFailure = (
	{ spaceId, agentId, agentName }: LibraryDocumentWriterFinished,
	bots: Bot[],
) => {
	const name = agentNameOf(agentId, agentName, bots)
	void raiseReportedFailure(
		{ title: i18n.t("common:library.failure.document.write", { name }) },
		{
			raisedIn: "use-library-document-writers",
			space: spaceId,
			botId: agentId,
			botName: name,
		},
	)
}

const useDocumentPresence = (
	spaceId: string,
	name: string | null,
	isJoined: boolean,
	bots: Bot[],
) => {
	const watched = useMemo(
		() => (name ? { spaceId, name } : null),
		[spaceId, name],
	)
	const [held, setHeld] = useState<HeldPresence>(NO_PRESENCE)
	const isOwnSeat = useIsOwnSeat(isJoined)
	const heldFor = (current: HeldPresence, document: WatchedDocument) =>
		current.watched === document
			? current
			: { ...NO_PRESENCE, watched: document }

	useListenWhileWatched<LibraryDocumentPresence>(
		watched,
		LIBRARY_DOCUMENT_PRESENCE_EVENT,
		(document, { writers }) => {
			const seenAt = Date.now()
			const people = writers.filter(
				(writer) => writer.kind !== "agent" && !isOwnSeat(writer),
			)
			setHeld((current) => {
				const previous = heldFor(current, document)
				return {
					...previous,
					seats: seatsAfter(previous.seats, writers, seenAt),
					people,
				}
			})
		},
	)

	useListenWhileWatched<LibraryDocumentWriterFinished>(
		watched,
		LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
		(_document, finished) => {
			if (finished.outcome === "failed") {
				raiseWriteFailure(finished, bots)
			}
		},
	)

	return held.watched === watched ? held : NO_PRESENCE
}

export const useLibraryDocumentWriters = ({
	spaceId,
	name,
	isJoined,
	document,
	bots,
	title,
}: LibraryDocumentWritersInput) => {
	const presence = useDocumentPresence(spaceId, name, isJoined, bots)
	return {
		writers: document
			? writersOf({ seats: presence.seats, bots, document, title })
			: [],
		people: document ? peopleOf(presence.people, document) : [],
	}
}
