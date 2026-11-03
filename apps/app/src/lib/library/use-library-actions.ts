import { useMutation, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	deleteLibraryItem,
	renameLibraryDocument,
} from "./library-document-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryFile } from "./library-reads"

import { commands, type LibraryError } from "../bindings"

type LibraryResult<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: LibraryError }

type ActionCommand = (
	spaceId: string,
	name: string,
) => Promise<LibraryResult<unknown>>

const ACTION_COMMANDS = {
	save: (spaceId: string, name: string) => commands.librarySave(spaceId, name),
	copy: (spaceId: string, name: string) => commands.libraryCopy(spaceId, name),
	reveal: (spaceId: string, name: string) =>
		commands.libraryReveal(spaceId, name),
}

const saveFromHost: ActionCommand = async (spaceId, name) => {
	const file = await readLibraryFile(spaceId, name)
	return commands.librarySaveBytes(file.name, file.content)
}

const copyFromHost: ActionCommand = async (spaceId, name) => {
	const file = await readLibraryFile(spaceId, name)
	return commands.libraryCopyBytes(file.name, file.content)
}

type LibraryAction = keyof typeof ACTION_COMMANDS

const dataOf = <Data>(result: LibraryResult<Data>): Data => {
	if (result.status === "error") {
		throw new Error(`library ${result.error.kind}`)
	}
	return result.data
}

const useLibraryMutation = (
	spaceId: string,
	action: LibraryAction,
	command: ActionCommand,
) =>
	useMutation({
		mutationFn: async (name: string) => dataOf(await command(spaceId, name)),
		meta: {
			failureNotice: () => ({
				title: i18n.t(`common:library.failure.${action}`),
			}),
			raisedIn: "use-library-actions",
		},
	})

const useLibraryAction = (
	spaceId: string,
	action: LibraryAction,
	command: ActionCommand,
) => useLibraryMutation(spaceId, action, command).mutate

const useLibraryCopy = (spaceId: string, command: ActionCommand) => {
	const { mutate, mutateAsync } = useLibraryMutation(spaceId, "copy", command)
	return {
		copy: mutate,
		copyAndWait: async (name: string) => {
			await mutateAsync(name)
		},
	}
}

type LibraryRename = { name: string; newName: string }

const useLibraryRename = (spaceId: string) => {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ name, newName }: LibraryRename) =>
			renameLibraryDocument(spaceId, name, newName),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.save"),
			}),
			raisedIn: "use-library-actions",
		},
	}).mutate
}

const useLibraryDelete = (spaceId: string) => {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (name: string) => deleteLibraryItem(spaceId, name),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.delete"),
			}),
			raisedIn: "use-library-actions",
		},
	}).mutate
}

export const useLibraryActions = (spaceId: string) => ({
	save: useLibraryAction(spaceId, "save", ACTION_COMMANDS.save),
	...useLibraryCopy(spaceId, ACTION_COMMANDS.copy),
	reveal: useLibraryAction(spaceId, "reveal", ACTION_COMMANDS.reveal),
	rename: useLibraryRename(spaceId),
	remove: useLibraryDelete(spaceId),
})

export const useJoinedLibraryActions = (spaceId: string) => ({
	save: useLibraryAction(spaceId, "save", saveFromHost),
	...useLibraryCopy(spaceId, copyFromHost),
	rename: useLibraryRename(spaceId),
	remove: useLibraryDelete(spaceId),
})
