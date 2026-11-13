import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react"

import type { Author } from "@workspace/shared/board/board"
import type { BoardIntent } from "@workspace/ui/components/board-view"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	LibraryBoardLinkDescription,
	LibraryBoardPlacement,
} from "./library-board-intents"
import { createLibraryBoardSession } from "./library-board-session"
import { createLibraryDocumentFeed } from "./library-document-feed"
import { applyLibraryUpdate } from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

import type { LibraryDocumentState } from "../bindings"
import { failureReporterIn } from "../failure-report"
import { useSignedInAccountId } from "../account/use-account"
import { currentWindowLabel } from "../host/index"

const RAISED_IN = "use-library-board-session"

type LibraryBoardSession = ReturnType<typeof createLibraryBoardSession>

const reportFailure = failureReporterIn(RAISED_IN)

const subscribeToNothing = () => () => undefined

const leaveBoardUnchanged = () => undefined

const useApplyLibraryBoardUpdate = (spaceId: string, name: string) => {
	const queryClient = useQueryClient()
	const { mutateAsync } = useMutation({
		mutationFn: (update: string) => applyLibraryUpdate(spaceId, name, update),
		onError: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.documentOf(spaceId, name),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.board.save"),
			}),
			raisedIn: RAISED_IN,
		},
	})
	return mutateAsync
}

const useCurrentAuthor = () => {
	const signedInAccountId = useSignedInAccountId()
	return useCallback(
		(): Author => ({
			kind: "person",
			id: signedInAccountId() ?? currentWindowLabel(),
		}),
		[signedInAccountId],
	)
}

export const useLibraryBoardSession = (spaceId: string, name: string) => {
	const send = useApplyLibraryBoardUpdate(spaceId, name)
	const authorOf = useCurrentAuthor()
	const feed = useMemo(
		() => createLibraryDocumentFeed(spaceId, name),
		[spaceId, name],
	)
	useEffect(() => feed.start(), [feed])
	const opened = useQuery({
		queryKey: libraryQueryKeys.documentOf(spaceId, name),
		queryFn: async () => {
			await feed.whenListening()
			return openLibraryDocument(spaceId, name)
		},
		gcTime: 0,
		structuralSharing: false,
		meta: {
			raisesWhenHostOffline: true,
			failureNotice: () => ({
				title: i18n.t("common:library.failure.board.open"),
			}),
			raisedIn: RAISED_IN,
		},
	})
	const openedState = opened.data
	const [openedSession, setOpenedSession] =
		useState<LibraryBoardSession | null>(null)
	const [unreadState, setUnreadState] = useState<LibraryDocumentState | null>(
		null,
	)
	const hasFailedToRead = openedState === unreadState
	const session = opened.isError ? null : openedSession

	useEffect(() => {
		if (!openedState) {
			return
		}
		let live: LibraryBoardSession
		try {
			live = createLibraryBoardSession({
				state: openedState.update,
				send,
				authorOf,
				onRefused: (reason) => {
					void reportFailure(
						{ title: i18n.t("common:library.failure.board.refused") },
						{ space: spaceId, reason },
					)
				},
			})
		} catch (failure) {
			console.error("library: the opened board could not be read", failure)
			setUnreadState(openedState)
			void reportFailure(
				{ title: i18n.t("common:library.failure.board.open") },
				{ space: spaceId },
			)
			return
		}
		const detach = feed.attach(live.receive)
		const forgetHistory = live.trackHistory()
		setOpenedSession(live)
		return () => {
			detach()
			forgetHistory()
			void live.close()
			setOpenedSession((current) => (current === live ? null : current))
		}
	}, [openedState, send, feed, spaceId, authorOf])

	const view = useSyncExternalStore(
		session?.subscribe ?? subscribeToNothing,
		() => session?.view() ?? null,
	)

	return {
		view,
		apply: (intent: BoardIntent) => session?.apply(intent),
		nodeOf: (id: string) => session?.nodeOf(id),
		place: (placement: LibraryBoardPlacement) => session?.place(placement),
		describeLink: (id: string, description: LibraryBoardLinkDescription) =>
			session?.describeLink(id, description),
		undo: session?.undo ?? leaveBoardUnchanged,
		redo: session?.redo ?? leaveBoardUnchanged,
		hasFailedToOpen: opened.isError || hasFailedToRead,
	}
}
