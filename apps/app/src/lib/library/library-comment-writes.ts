import type {
	LibraryCommentAnchor,
	LibraryCommentParty,
	LibraryCommentThread,
} from "../bindings"
import { invoke } from "../host/index"

export const createLibraryCommentThread = (
	spaceId: string,
	name: string,
	anchor: LibraryCommentAnchor,
	text: string,
	mentions: LibraryCommentParty[],
) =>
	invoke<LibraryCommentThread>("library_comment_create", {
		spaceId,
		name,
		anchor,
		text,
		mentions,
	})

export const replyToLibraryCommentThread = (
	spaceId: string,
	name: string,
	threadId: string,
	text: string,
	mentions: LibraryCommentParty[],
) =>
	invoke<LibraryCommentThread>("library_comment_reply", {
		spaceId,
		name,
		threadId,
		text,
		mentions,
	})

export const resolveLibraryCommentThread = (
	spaceId: string,
	name: string,
	threadId: string,
) =>
	invoke<LibraryCommentThread>("library_comment_resolve", {
		spaceId,
		name,
		threadId,
	})

export const reopenLibraryCommentThread = (
	spaceId: string,
	name: string,
	threadId: string,
) =>
	invoke<LibraryCommentThread>("library_comment_reopen", {
		spaceId,
		name,
		threadId,
	})
