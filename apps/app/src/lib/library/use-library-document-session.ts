import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { createLibraryDocumentFeed } from "./library-document-feed"
import { createLibraryDocumentSession } from "./library-document-session"
import { applyLibraryUpdate } from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

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
			failureNotice: () => ({ title: i18n.t("common:library.failure.save") }),
			raisedIn: "use-library-document-session",
		},
	})
	return mutateAsync
}

export const useLibraryDocumentSession = (
	spaceId: string,
	name: string | null,
) => {
	const queryClient = useQueryClient()
	const apply = useApplyLibraryUpdate(spaceId)
	const [remoteRevision, setRemoteRevision] = useState(0)
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
				title: i18n.t("bots:skills.files.failure.read"),
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

	useEffect(() => {
		if (!session || !feed) {
			return
		}
		const detach = feed.attach((update) => {
			if (session.receive(update)) {
				setRemoteRevision((revision) => revision + 1)
			}
		})
		return () => {
			detach()
			void session.flush()
		}
	}, [session, feed])

	const closeAndRelist = async () => {
		await session?.flush()
		await queryClient.invalidateQueries({
			queryKey: libraryQueryKeys.itemsOf(spaceId),
		})
	}

	return {
		document: session
			? {
					markdown: session.markdown(),
					version: `${opened.dataUpdatedAt}:${remoteRevision}`,
				}
			: null,
		edit: (markdown: string) => session?.edit(markdown),
		hasFailedToOpen: opened.isError,
		closeAndRelist,
	}
}
