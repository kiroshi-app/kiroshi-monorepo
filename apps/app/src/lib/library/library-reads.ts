import type {
	LibraryBoardSummary,
	LibraryCommentThread,
	LibraryDocument,
	LibraryDocumentState,
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

export const readLibraryBoardSummary = (spaceId: string, name: string) =>
	invoke<LibraryBoardSummary>("library_board_summary", { spaceId, name })

export const readLibraryCommentThreads = (spaceId: string, name: string) =>
	invoke<LibraryCommentThread[]>("library_comment_threads", { spaceId, name })

export const readLibraryFile = (spaceId: string, name: string) =>
	invoke<LibraryFile>("library_read_file", { spaceId, name })

export const openLibraryDocument = (spaceId: string, name: string) =>
	invoke<LibraryDocumentState>("library_open_document", { spaceId, name })

export const importLibraryFile = (
	spaceId: string,
	name: string,
	content: string,
) => invoke<LibraryItem>("library_import", { spaceId, name, content })

export const importLibraryUrl = (spaceId: string, url: string) =>
	invoke<LibraryItem>("library_import_url", { spaceId, url })
