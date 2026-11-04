import {
	queryOptions,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryDocument, readLibraryItems } from "./library-reads"

import type { LibraryItem } from "../bindings"

const EXCERPT_LENGTH = 1_000

const NO_ITEMS: LibraryItem[] = []

export type LibraryItemsRead = {
	items: LibraryItem[]
	isLoading: boolean
	hasLoaded: boolean
	readAt: number
	excerptOf: (item: LibraryItem) => string
}

const useRelistOnWindowFocus = (spaceId: string) => {
	const queryClient = useQueryClient()
	useEffect(() => {
		const relist = () =>
			void queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			})
		window.addEventListener("focus", relist)
		return () => window.removeEventListener("focus", relist)
	}, [queryClient, spaceId])
}

const useExcerpts = (spaceId: string, items: LibraryItem[]) => {
	const documents = items.filter((item) => item.kind === "document")
	const excerpts = useQueries({
		queries: documents.map((document) => ({
			queryKey: libraryQueryKeys.excerptOf(
				spaceId,
				document.name,
				document.modifiedAt,
			),
			queryFn: () => readLibraryDocument(spaceId, document.name),
			select: ({ content }: { content: string }) =>
				content.slice(0, EXCERPT_LENGTH),
			meta: { rendersErrorInline: true as const },
		})),
	})
	const excerptByName = new Map(
		documents.map((document, index) => [
			document.name,
			excerpts[index]?.data ?? "",
		]),
	)
	return (item: LibraryItem) => excerptByName.get(item.name) ?? ""
}

export const libraryItemsQueryOf = (spaceId: string) =>
	queryOptions({
		queryKey: libraryQueryKeys.itemsOf(spaceId),
		queryFn: () => readLibraryItems(spaceId),
		meta: {
			failureNotice: () => ({ title: i18n.t("common:library.failure.list") }),
			raisedIn: "use-library-items",
		},
	})

export const useLibraryItems = (spaceId: string): LibraryItemsRead => {
	const list = useQuery({
		...libraryItemsQueryOf(spaceId),
		refetchOnMount: "always",
	})
	useRelistOnWindowFocus(spaceId)
	const items = list.data ?? NO_ITEMS
	const excerptOf = useExcerpts(spaceId, items)

	return {
		items,
		isLoading: list.isPending,
		hasLoaded: list.data !== undefined,
		readAt: list.dataUpdatedAt,
		excerptOf,
	}
}
