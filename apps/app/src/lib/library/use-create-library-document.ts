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

type Seed = {
	name: string
	body: string
}

type OpenCreated = (name: string) => void

const seedDocument = async ({ name, body }: Seed, spaceId: string) => {
	const { update } = await openLibraryDocument(spaceId, name)
	await applyLibraryUpdate(spaceId, name, seedUpdateOf(update, body))
}

const useSeedLibraryDocument = (spaceId: string) =>
	useMutation({
		mutationFn: (seed: Seed) => seedDocument(seed, spaceId),
		meta: {
			failureNotice: () => ({ title: i18n.t("common:library.failure.save") }),
			raisedIn: "use-create-library-document",
		},
	})

export const useCreateLibraryDocument = (spaceId: string) => {
	const queryClient = useQueryClient()
	const seeding = useSeedLibraryDocument(spaceId)
	const creating = useMutation({
		mutationFn: (title: string) =>
			createFreelyNamed(
				(name) => createLibraryDocument(spaceId, name),
				title,
				i18n.t("common:library.editor.untitled"),
			),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({ title: i18n.t("chat:screen.notice.failed") }),
			raisedIn: "use-create-library-document",
		},
	})

	const create = ({ title, body }: NewLibraryDocument, open: OpenCreated) =>
		creating.mutate(title, {
			onSuccess: ({ name }) => {
				if (!body) {
					open(name)
					return
				}
				seeding.mutate({ name, body }, { onSettled: () => open(name) })
			},
		})

	return { create, isCreating: creating.isPending || seeding.isPending }
}
