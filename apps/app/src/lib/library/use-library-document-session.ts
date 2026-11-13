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

import type { LibraryDocumentState, LibraryItem } from "../bindings"
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

type SendUpdate = (sent: SentUpdate) => Promise<unknown>

type RenameOnHost = (name: string) => Promise<LibraryItem>

type DocumentMove = {
	rename: RenameOnHost
	onMoved: (renamed: LibraryItem) => void
	onRefused: () => void
}

const createMovableSession = (
	{ name, update: state }: LibraryDocumentState,
	apply: SendUpdate,
) => {
	let destination = Promise.resolve(name)
	let isShown = false
	const session = createLibraryDocumentSession({
		state,
		send: (update) =>
			destination.then((current) => apply({ name: current, update })),
	})
	const moveTo = (rename: RenameOnHost) => {
		const flushed = session.flush()
		const previous = destination
		const moved = Promise.all([previous, flushed]).then(([current]) =>
			rename(current),
		)
		destination = moved.then(
			(renamed) => renamed.name,
			() => previous,
		)
		return moved
	}
	const show = () => {
		isShown = true
		return () => {
			isShown = false
		}
	}
	return { ...session, moveTo, show, isShown: () => isShown }
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
				{ title: i18n.t("common:library.failure.document.caret") },
				{ space: spaceId, reason },
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
		() => (openedState ? createMovableSession(openedState, apply) : null),
		[openedState, apply],
	)
	const session = opened.isError ? null : openedSession
	const sharer = useMemo(() => {
		if (!name || !openedState || !openedSession) {
			return null
		}
		const burst = createCaretShareBurst(spaceId)
		return createCaretSharer({
			caretOf: openedSession.caretOf,
			share: (caret) => {
				shareLibraryCaret(spaceId, name, caret).then(
					burst.succeeded,
					burst.failed,
				)
			},
		})
	}, [spaceId, name, openedState, openedSession])

	useEffect(() => {
		if (!sharer) {
			return
		}
		sharer.open()
		return sharer.close
	}, [sharer])

	useEffect(() => session?.show(), [session])

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

	const moveDocument = ({ rename, onMoved, onRefused }: DocumentMove) => {
		if (!session) {
			return
		}
		session.moveTo(rename).then(
			(renamed) => {
				if (!session.isShown()) {
					return
				}
				queryClient.setQueryData(
					libraryQueryKeys.documentOf(spaceId, renamed.name),
					openedState,
				)
				onMoved(renamed)
			},
			() => {
				if (session.isShown()) {
					onRefused()
				}
			},
		)
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
		moveDocument,
	}
}
