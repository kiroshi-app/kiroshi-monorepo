import { useMemo, useState } from "react"

import { boardPresenceOf } from "./library-board-presence"
import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import {
	useIsOwnSeat,
	useListenWhileWatched,
} from "./use-library-document-writers"

import type { LibraryDocumentPresence, LibraryWriter } from "../bindings"
import type { Bot } from "../conversations/store-contract"

type WatchedBoard = {
	spaceId: string
	name: string
}

type HeldOthers = {
	watched: WatchedBoard | null
	others: LibraryWriter[]
}

type LibraryBoardPresenceInput = {
	spaceId: string
	name: string
	isJoined: boolean
	bots: Bot[]
}

const NOBODY_ELSE: HeldOthers = { watched: null, others: [] }

export const useLibraryBoardPresence = ({
	spaceId,
	name,
	isJoined,
	bots,
}: LibraryBoardPresenceInput) => {
	const watched = useMemo(() => ({ spaceId, name }), [spaceId, name])
	const [held, setHeld] = useState<HeldOthers>(NOBODY_ELSE)
	const isOwnSeat = useIsOwnSeat(isJoined)

	useListenWhileWatched<LibraryDocumentPresence>(
		watched,
		LIBRARY_DOCUMENT_PRESENCE_EVENT,
		(board, { writers }) =>
			setHeld({
				watched: board,
				others: writers.filter((writer) => !isOwnSeat(writer)),
			}),
	)

	return boardPresenceOf(held.watched === watched ? held.others : [], bots)
}
