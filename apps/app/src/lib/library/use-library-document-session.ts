import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import type { Event } from "@tauri-apps/api/event"
import { useEffect, useMemo, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { createLibraryDocumentSession } from "./library-document-session"
import { applyLibraryUpdate } from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

import {
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryDocumentUpdated,
} from "../bindings"
import { listen } from "../host/index"

type SentUpdate = {
	name: string
	update: string
}

const reportUnheardUpdates = (reason: unknown) => {
	console.error(
		`library: ${LIBRARY_DOCUMENT_UPDATED_EVENT} could not be listened to`,
		reason,
	)
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
	const opened = useQuery({
		queryKey: libraryQueryKeys.documentOf(spaceId, name ?? ""),
		queryFn: name ? () => openLibraryDocument(spaceId, name) : skipToken,
		gcTime: 0,
		structuralSharing: false,
		meta: {
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
		if (!session) {
			return
		}
		const heard = ({ payload }: Event<LibraryDocumentUpdated>) => {
			if (payload.spaceId !== spaceId || payload.name !== name) {
				return
			}
			if (session.receive(payload.update)) {
				setRemoteRevision((revision) => revision + 1)
			}
		}
		const subscription = listen<LibraryDocumentUpdated>(
			LIBRARY_DOCUMENT_UPDATED_EVENT,
			heard,
		).catch(reportUnheardUpdates)
		return () => {
			void session.flush()
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [session, spaceId, name])

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
		closeAndRelist,
		readAgain: opened.refetch,
	}
}
