import { useMutation, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	createFreelyNamed,
	createLibraryBoard,
} from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"

const EXTENSION_ADDED_BY_HOST = ""

type OpenCreated = (name: string) => void

export const useCreateLibraryBoard = (spaceId: string) => {
	const queryClient = useQueryClient()
	const creating = useMutation({
		mutationFn: () => {
			const untitled = i18n.t("common:library.editor.untitled")
			return createFreelyNamed(
				(name) => createLibraryBoard(spaceId, name),
				untitled,
				untitled,
				EXTENSION_ADDED_BY_HOST,
			)
		},
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.save"),
			}),
			raisedIn: "use-create-library-board",
		},
	})

	const create = (open: OpenCreated) => {
		if (creating.isPending) {
			return
		}
		creating.mutate(undefined, { onSuccess: ({ name }) => open(name) })
	}

	return create
}
