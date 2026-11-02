import type {
	LibraryDocument,
	LibraryFile,
	LibraryImage,
	LibraryItem,
} from "../bindings"
import { invoke } from "../host/index"

export const readLibraryItems = (spaceId: string) =>
	invoke<LibraryItem[]>("library_list", { spaceId })

export const readLibraryDocument = (spaceId: string, name: string) =>
	invoke<LibraryDocument>("library_read_document", { spaceId, name })

export const readLibraryImage = (spaceId: string, name: string) =>
	invoke<LibraryImage>("library_read_image", { spaceId, name })

export const readLibraryFile = (spaceId: string, name: string) =>
	invoke<LibraryFile>("library_read_file", { spaceId, name })
