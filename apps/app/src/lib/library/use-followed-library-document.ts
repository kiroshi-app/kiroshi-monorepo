import type { Event } from "@tauri-apps/api/event"
import { useCallback, useEffect, useEffectEvent, useState } from "react"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import { reportUnheard } from "./use-library-document-writers"

import type { LibraryDocumentPresence, LibraryWriter } from "../bindings"
import { listen } from "../host/index"

type FollowedLibraryDocumentInput = {
	spaceId: string | undefined
	conversationId: string | null
	workingAgentIds: string[]
}

type ClosedTurns = {
	conversationId: string | null
	agentIds: string[]
	isClosing: boolean
}

const noClosedTurnsIn = (conversationId: string | null): ClosedTurns => ({
	conversationId,
	agentIds: [],
	isClosing: false,
})

const settledClosedTurns = (
	closed: ClosedTurns,
	conversationId: string | null,
	workingAgentIds: string[],
): ClosedTurns => {
	if (closed.conversationId !== conversationId) {
		return noClosedTurnsIn(conversationId)
	}
	if (closed.isClosing) {
		return { conversationId, agentIds: workingAgentIds, isClosing: false }
	}
	const stillWorking = closed.agentIds.filter((id) =>
		workingAgentIds.includes(id),
	)
	return stillWorking.length === closed.agentIds.length
		? closed
		: { ...closed, agentIds: stillWorking }
}

const useClosedTurns = (
	conversationId: string | null,
	workingAgentIds: string[],
) => {
	const [closed, setClosed] = useState(() => noClosedTurnsIn(conversationId))
	const settled = settledClosedTurns(closed, conversationId, workingAgentIds)
	if (settled !== closed) {
		setClosed(settled)
	}
	const closeTurns = useCallback(
		() => setClosed((current) => ({ ...current, isClosing: true })),
		[],
	)
	return { closedAgentIds: settled.agentIds, closeTurns }
}

const isFollowedWriter =
	(workingAgentIds: string[], closedAgentIds: string[]) =>
	({ kind, id }: LibraryWriter) =>
		kind === "agent" &&
		workingAgentIds.includes(id) &&
		!closedAgentIds.includes(id)

const usePresenceInSpace = (
	spaceId: string | undefined,
	conversationId: string | null,
	hear: (presence: LibraryDocumentPresence) => void,
) => {
	const hearIn = useEffectEvent(hear)
	useEffect(() => {
		if (!spaceId || !conversationId) {
			return
		}
		const subscription = listen<LibraryDocumentPresence>(
			LIBRARY_DOCUMENT_PRESENCE_EVENT,
			({ payload }: Event<LibraryDocumentPresence>) => {
				if (payload.spaceId === spaceId) {
					hearIn(payload)
				}
			},
		).catch(reportUnheard(LIBRARY_DOCUMENT_PRESENCE_EVENT))
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [spaceId, conversationId])
}

export const useFollowedLibraryDocument = ({
	spaceId,
	conversationId,
	workingAgentIds,
}: FollowedLibraryDocumentInput) => {
	const [openedName, setOpenedName] = useState<string | null>(null)
	const { closedAgentIds, closeTurns } = useClosedTurns(
		conversationId,
		workingAgentIds,
	)

	usePresenceInSpace(spaceId, conversationId, ({ name, writers }) => {
		if (writers.some(isFollowedWriter(workingAgentIds, closedAgentIds))) {
			setOpenedName(name)
		}
	})

	const close = useCallback(() => {
		setOpenedName(null)
		closeTurns()
	}, [closeTurns])

	return { openedName, open: setOpenedName, close }
}
