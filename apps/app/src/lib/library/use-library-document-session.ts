import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useMemo, useSyncExternalStore } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { createCaretSharer } from "./library-caret-sharer"
import { createLibraryDocumentFeed } from "./library-document-feed"
import { createLibraryDocumentSession } from "./library-document-session"
import {
	applyLibraryUpdate,
	shareLibraryCaret,
} from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

import { failureReporterIn } from "../failure-report"

type SentUpdate = {
	name: string
	update: string
}

const useApplyLibraryUpdate = (spaceId: string) => {
	const queryClient = useQueryClient()
	const { mutateAsync } = useMutation({
		mutationFn: ({ name, update }: SentUpdate) =>
			applyLibraryUpdate(spaceId, name, update),
		onError: (_error, { name }) =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.documentOf(spaceId, name),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.document.save"),
			}),
			raisedIn: "use-library-document-session",
		},
	})
	return mutateAsync
}

const subscribeToNothing = () => () => undefined

const reportFailure = failureReporterIn("use-library-document-session")

const createCaretShareBurst = (spaceId: string) => {
	let hasRaisedNotice = false
	return {
		succeeded: () => {
			hasRaisedNotice = false
		},
		failed: (reason: unknown) => {
			console.error("library: the caret could not be shared", reason)
			if (hasRaisedNotice) {
				return
			}
			hasRaisedNotice = true
			void reportFailure(
				{ title: i18n.t("chat:screen.notice.failed") },
				{ space: spaceId },
			)
		},
	}
}

export const useLibraryDocumentSession = (
	spaceId: string,
	name: string | null,
) => {
	const queryClient = useQueryClient()
	const apply = useApplyLibraryUpdate(spaceId)
	const feed = useMemo(
		() => (name ? createLibraryDocumentFeed(spaceId, name) : null),
		[spaceId, name],
	)
	useEffect(() => feed?.start(), [feed])
	const opened = useQuery({
		queryKey: libraryQueryKeys.documentOf(spaceId, name ?? ""),
		queryFn:
			feed && name
				? async () => {
						await feed.whenListening()
						return openLibraryDocument(spaceId, name)
					}
				: skipToken,
		gcTime: 0,
		structuralSharing: false,
		meta: {
			raisesWhenHostOffline: true,
			failureNotice: () => ({
				title: i18n.t("common:library.failure.document.open"),
			}),
			raisedIn: "use-library-document-session",
		},
	})
	const openedState = opened.data
	const openedSession = useMemo(
		() =>
			openedState
				? createLibraryDocumentSession({
						state: openedState.update,
						send: (update) => apply({ name: openedState.name, update }),
					})
				: null,
		[openedState, apply],
	)
	const session = opened.isError ? null : openedSession
	const sharer = useMemo(() => {
		if (!openedState || !openedSession) {
			return null
		}
		const burst = createCaretShareBurst(spaceId)
		return createCaretSharer({
			caretOf: openedSession.caretOf,
			share: (caret) => {
				shareLibraryCaret(spaceId, openedState.name, caret).then(
					burst.succeeded,
					burst.failed,
				)
			},
		})
	}, [spaceId, openedState, openedSession])

	useEffect(() => {
		if (!sharer) {
			return
		}
		sharer.open()
		return sharer.close
	}, [sharer])

	useEffect(() => {
		if (!session || !feed) {
			return
		}
		const detach = feed.attach(session.receive)
		return () => {
			detach()
			void session.flush()
		}
	}, [session, feed])

	const markdown = useSyncExternalStore(
		session?.subscribe ?? subscribeToNothing,
		() => session?.markdown() ?? "",
	)

	const closeAndRelist = async () => {
		await session?.flush()
		await queryClient.invalidateQueries({
			queryKey: libraryQueryKeys.itemsOf(spaceId),
		})
	}

	return {
		document: session
			? {
					markdown,
					offsetOf: session.offsetOf,
				}
			: null,
		edit: (markdown: string) => session?.edit(markdown),
		shareCaret: (offset: number | null) => sharer?.share(offset),
		hasFailedToOpen: opened.isError,
		closeAndRelist,
	}
}
