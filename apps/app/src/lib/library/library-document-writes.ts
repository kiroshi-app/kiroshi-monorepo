import type { LibraryBoardPoint, LibraryItem } from "../bindings"
import { invoke } from "../host/index"

type NameRefusal = "alreadyExists" | "invalidName"

type CreateNamed = (name: string) => Promise<LibraryItem>

const DOCUMENT_EXTENSION = ".md"

export const createLibraryDocument = (spaceId: string, name: string) =>
	invoke<LibraryItem>("library_create_document", {
		spaceId,
		name,
		templateId: null,
	})

export const createLibraryBoard = (spaceId: string, name: string) =>
	invoke<LibraryItem>("library_create_board", { spaceId, name })

export const saveMessageAsDocument = (
	conversationId: string,
	messageId: string,
) => invoke<LibraryItem>("library_save_message", { conversationId, messageId })

export const applyLibraryUpdate = (
	spaceId: string,
	name: string,
	update: string,
) => invoke<null>("library_apply_update", { spaceId, name, update })

export const renameLibraryDocument = (
	spaceId: string,
	name: string,
	newName: string,
) => invoke<LibraryItem>("library_rename_document", { spaceId, name, newName })

export const deleteLibraryItem = (spaceId: string, name: string) =>
	invoke<null>("library_delete", { spaceId, name })

export const shareLibraryCaret = (
	spaceId: string,
	name: string,
	caret: string | null,
) =>
	invoke<null>("library_share_presence", {
		spaceId,
		name,
		at: caret === null ? null : { kind: "text", anchor: caret },
	})

export type LibraryBoardSeat = {
	point: LibraryBoardPoint
	nodeId: string | null
}

export const shareLibraryBoardSeat = (
	spaceId: string,
	name: string,
	seat: LibraryBoardSeat | null,
) =>
	invoke<null>("library_share_presence", {
		spaceId,
		name,
		at: seat === null ? null : { kind: "board", ...seat },
	})

const isRefusedAs = (reason: unknown, kind: NameRefusal) =>
	typeof reason === "object" &&
	reason !== null &&
	(reason as { kind?: unknown }).kind === kind

const freeNameOf = (base: string, copy: number, extension: string) =>
	copy === 1 ? `${base}${extension}` : `${base} ${copy}${extension}`

export const createFreelyNamed = (
	create: CreateNamed,
	title: string,
	untitled: string,
	extension = DOCUMENT_EXTENSION,
) => {
	const attempt = async (base: string, copy: number): Promise<LibraryItem> => {
		try {
			return await create(freeNameOf(base, copy, extension))
		} catch (reason) {
			if (isRefusedAs(reason, "alreadyExists")) {
				return attempt(base, copy + 1)
			}
			if (isRefusedAs(reason, "invalidName") && base !== untitled) {
				return attempt(untitled, 1)
			}
			throw reason
		}
	}
	return attempt(title.trim() || untitled, 1)
}
