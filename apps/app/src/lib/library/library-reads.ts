import {
	commands,
	type LibraryDocument,
	type LibraryError,
	type LibraryItem,
} from "../bindings"

type LibraryResult<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: LibraryError }

const dataOf = <Data>(result: LibraryResult<Data>): Data => {
	if (result.status === "error") {
		throw new Error(`library ${result.error.kind}`)
	}
	return result.data
}

export const readLibraryItems = async (
	spaceId: string,
): Promise<LibraryItem[]> => dataOf(await commands.libraryList(spaceId))

export const readLibraryDocument = async (
	spaceId: string,
	name: string,
): Promise<LibraryDocument> =>
	dataOf(await commands.libraryReadDocument(spaceId, name))
