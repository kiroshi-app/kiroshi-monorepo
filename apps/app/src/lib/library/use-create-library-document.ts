import { useMutation, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { seedUpdateOf } from "./library-document-session"
import {
	applyLibraryUpdate,
	createFreelyNamed,
	createLibraryDocument,
} from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { openLibraryDocument } from "./library-reads"

type NewLibraryDocument = {
	title: string
	body: string
}

const seedDocument = async (spaceId: string, name: string, body: string) => {
	const { update } = await openLibraryDocument(spaceId, name)
	await applyLibraryUpdate(spaceId, name, seedUpdateOf(update, body))
}

export const useCreateLibraryDocument = (spaceId: string) => {
	const queryClient = useQueryClient()
	const { mutate, isPending } = useMutation({
		mutationFn: async ({ title, body }: NewLibraryDocument) => {
			const item = await createFreelyNamed(
				(name) => createLibraryDocument(spaceId, name),
				title,
				i18n.t("common:library.editor.untitled"),
			)
			if (body) {
				await seedDocument(spaceId, item.name, body)
			}
			return item
		},
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({ title: i18n.t("chat:screen.notice.failed") }),
			raisedIn: "use-create-library-document",
		},
	})
	return { create: mutate, isCreating: isPending }
}
