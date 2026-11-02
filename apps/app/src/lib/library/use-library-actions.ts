import { useMutation } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

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

const useLibraryAction = (
	spaceId: string,
	action: LibraryAction,
	command: ActionCommand,
) => {
	const { mutate } = useMutation({
		mutationFn: async (name: string) => dataOf(await command(spaceId, name)),
		meta: {
			failureNotice: () => ({
				title: i18n.t(`common:library.failure.${action}`),
			}),
			raisedIn: "use-library-actions",
		},
	})
	return mutate
}

export const useLibraryActions = (spaceId: string) => ({
	save: useLibraryAction(spaceId, "save", ACTION_COMMANDS.save),
	copy: useLibraryAction(spaceId, "copy", ACTION_COMMANDS.copy),
	reveal: useLibraryAction(spaceId, "reveal", ACTION_COMMANDS.reveal),
})

export const useJoinedLibraryActions = (spaceId: string) => ({
	save: useLibraryAction(spaceId, "save", saveFromHost),
	copy: useLibraryAction(spaceId, "copy", copyFromHost),
})
