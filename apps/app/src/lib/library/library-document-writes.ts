import type { LibraryItem } from "../bindings"
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
) => invoke<null>("library_share_caret", { spaceId, name, caret })

const isRefusedAs = (reason: unknown, kind: NameRefusal) =>
	typeof reason === "object" &&
	reason !== null &&
	(reason as { kind?: unknown }).kind === kind

const documentNameOf = (base: string, copy: number) =>
	copy === 1
		? `${base}${DOCUMENT_EXTENSION}`
		: `${base} ${copy}${DOCUMENT_EXTENSION}`

export const createFreelyNamed = (
	create: CreateNamed,
	title: string,
	untitled: string,
) => {
	const attempt = async (base: string, copy: number): Promise<LibraryItem> => {
		try {
			return await create(documentNameOf(base, copy))
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
