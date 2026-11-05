import { skipToken, useQuery } from "@tanstack/react-query"

import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import type { LibraryPickerDocument } from "@workspace/ui/components/prompt-library-picker"
import { i18n } from "@workspace/ui/lib/i18n"

import { detailOf, titleOf } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryItems } from "./library-reads"

import type { LibraryItem } from "../bindings"

export type ComposerLibrary = {
	documents: LibraryPickerDocument[]
	onPick: (document: LibraryPickerDocument) => void
}

const NO_DOCUMENTS: LibraryItem[] = []

const isPickable = ({ kind }: LibraryItem) => {
	switch (kind) {
		case "document":
			return true
		case "image":
		case "board":
			return false
	}
}

const documentsIn = (items: LibraryItem[]) => items.filter(isPickable)

const toPickerDocument = (
	item: LibraryItem,
	readAt: number,
): LibraryPickerDocument => ({
	id: item.name,
	name: titleOf(item),
	detail: detailOf(item, readAt),
})

const toDocumentChip = (item: LibraryItem): PromptAttachment => ({
	id: item.name,
	name: titleOf(item),
	size: item.bytes,
})

export const useComposerLibrary = (
	spaceId: string | null,
	stage: (document: PromptAttachment) => void,
): ComposerLibrary | undefined => {
	const listed = useQuery({
		queryKey: libraryQueryKeys.documentsOf(spaceId ?? ""),
		queryFn: spaceId ? () => readLibraryItems(spaceId) : skipToken,
		select: documentsIn,
		meta: {
			failureNotice: () => ({ title: i18n.t("common:library.failure.list") }),
			raisedIn: "use-composer-library",
		},
	})
	if (!spaceId) {
		return undefined
	}
	const documents = listed.data ?? NO_DOCUMENTS

	return {
		documents: documents.map((item) =>
			toPickerDocument(item, listed.dataUpdatedAt),
		),
		onPick: ({ id }) => {
			const picked = documents.find(({ name }) => name === id)
			if (picked) {
				stage(toDocumentChip(picked))
			}
		},
	}
}
