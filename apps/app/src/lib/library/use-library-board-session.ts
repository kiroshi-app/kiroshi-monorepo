import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useSyncExternalStore } from "react"

import type { BoardIntent } from "@workspace/ui/components/board-view"
import { i18n } from "@workspace/ui/lib/i18n"

import { createLibraryBoardSession } from "./library-board-session"
import { createLibraryDocumentFeed } from "./library-document-feed"
import { applyLibraryUpdate } from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

const RAISED_IN = "use-library-board-session"

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

export const useLibraryBoardSession = (spaceId: string, name: string) => {
	const send = useApplyLibraryBoardUpdate(spaceId, name)
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
	const openedSession = useMemo(
		() =>
			openedState
				? createLibraryBoardSession({ state: openedState.update, send })
				: null,
		[openedState, send],
	)
	const session = opened.isError ? null : openedSession

	useEffect(() => {
		if (!session) {
			return
		}
		const detach = feed.attach(session.receive)
		const forgetHistory = session.trackHistory()
		return () => {
			detach()
			forgetHistory()
			void session.flush()
		}
	}, [session, feed])

	const view = useSyncExternalStore(
		session?.subscribe ?? subscribeToNothing,
		() => session?.view() ?? null,
	)

	return {
		view,
		apply: (intent: BoardIntent) => session?.apply(intent),
		undo: session?.undo ?? leaveBoardUnchanged,
		redo: session?.redo ?? leaveBoardUnchanged,
		hasFailedToOpen: opened.isError,
	}
}
