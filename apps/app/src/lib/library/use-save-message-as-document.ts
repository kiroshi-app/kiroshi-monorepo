import { useMutation, useQueryClient } from "@tanstack/react-query"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { saveMessageAsDocument } from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"

import type { LibraryItem } from "../bindings"

type SavedMessage = {
	conversationId: string
	messageId: string
}

export const useSaveMessageAsDocument = (
	spaceId: string | undefined,
	onOpen: (saved: LibraryItem) => void,
) => {
	const queryClient = useQueryClient()
	const { mutate } = useMutation({
		mutationFn: ({ conversationId, messageId }: SavedMessage) =>
			saveMessageAsDocument(conversationId, messageId),
		onSuccess: (saved) =>
			raiseTransientNotice({
				title: i18n.t("common:library.saved.title"),
				action: {
					label: i18n.t("common:library.saved.open"),
					onPress: () => onOpen(saved),
				},
			}),
		onSettled: () =>
			spaceId &&
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.save"),
			}),
			raisedIn: "use-save-message-as-document",
		},
	})
	return mutate
}
