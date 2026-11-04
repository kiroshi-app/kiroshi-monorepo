import { skipToken, useQuery } from "@tanstack/react-query"

import type { DocumentCardProps } from "@workspace/ui/components/document-card"
import { i18n } from "@workspace/ui/lib/i18n"

import { detailOf } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryDocument, readLibraryItems } from "./library-reads"
import { EXCERPT_LENGTH } from "./use-library-items"

import type { LibraryDocument, LibraryItem } from "../bindings"

const RAISED_IN = "use-library-document-card"

const documentNamed = (items: LibraryItem[], name: string) =>
	items.find((item) => item.kind === "document" && item.name === name) ?? null

type DocumentCardFailure = NonNullable<DocumentCardProps["failure"]>

type CardReads = {
	isUnreadable: boolean
	isDeleted: boolean
}

const failureOf = ({
	isUnreadable,
	isDeleted,
}: CardReads): DocumentCardFailure | undefined => {
	if (isUnreadable) {
		return "unreadable"
	}
	return isDeleted ? "deleted" : undefined
}

export const useLibraryDocumentCard = (spaceId: string, name: string) => {
	const listed = useQuery({
		queryKey: libraryQueryKeys.documentsOf(spaceId),
		queryFn: () => readLibraryItems(spaceId),
		select: (items: LibraryItem[]) => documentNamed(items, name),
		meta: {
			failureNotice: () => ({ title: i18n.t("common:library.failure.list") }),
			raisedIn: RAISED_IN,
		},
	})
	const item = listed.data ?? null
	const excerpt = useQuery({
		queryKey: libraryQueryKeys.excerptOf(spaceId, name, item?.modifiedAt ?? 0),
		queryFn: item ? () => readLibraryDocument(spaceId, name) : skipToken,
		select: ({ content }: LibraryDocument) => content.slice(0, EXCERPT_LENGTH),
		meta: { rendersErrorInline: true },
	})

	return {
		detail: item ? detailOf(item, listed.dataUpdatedAt) : "",
		excerpt: excerpt.data ?? "",
		failure: failureOf({
			isUnreadable: listed.isError || excerpt.isError,
			isDeleted: listed.isSuccess && item === null,
		}),
	}
}
