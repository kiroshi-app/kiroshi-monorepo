import { useMutation } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { commands, type LibraryError } from "../bindings"

type LibraryResult<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: LibraryError }

const ACTION_COMMANDS = {
	save: (spaceId: string, name: string) => commands.librarySave(spaceId, name),
	copy: (spaceId: string, name: string) => commands.libraryCopy(spaceId, name),
	reveal: (spaceId: string, name: string) =>
		commands.libraryReveal(spaceId, name),
}

type LibraryAction = keyof typeof ACTION_COMMANDS

const dataOf = <Data>(result: LibraryResult<Data>): Data => {
	if (result.status === "error") {
		throw new Error(`library ${result.error.kind}`)
	}
	return result.data
}

const useLibraryAction = (spaceId: string, action: LibraryAction) => {
	const { mutate } = useMutation({
		mutationFn: async (name: string) =>
			dataOf(await ACTION_COMMANDS[action](spaceId, name)),
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
	save: useLibraryAction(spaceId, "save"),
	copy: useLibraryAction(spaceId, "copy"),
	reveal: useLibraryAction(spaceId, "reveal"),
})
