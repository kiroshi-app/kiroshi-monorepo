import { hashKey } from "@tanstack/react-query"

import type {
	LibraryComment,
	LibraryCommentAnchor,
	LibraryCommentParty,
	LibraryCommentThread,
	LibraryCommentThreadState,
} from "../bindings"

type SaidComment = Pick<LibraryComment, "text" | "mentions">

export type SentComment = SaidComment & { anchor: LibraryCommentAnchor }

export type SentReply = SaidComment & { threadId: string }

type CommentedItem = {
	spaceId: string
	name: string
}

const SENDING_ID = "sending:"

export const commentBy = (
	author: LibraryCommentParty,
	{ text, mentions }: SaidComment,
	createdAt: number,
): LibraryComment => ({ author, createdAt, text, mentions })

export const threadBeingSent = (
	{ spaceId, name }: CommentedItem,
	anchor: LibraryCommentAnchor,
	comment: LibraryComment,
): LibraryCommentThread => ({
	id: `${SENDING_ID}${crypto.randomUUID()}`,
	spaceId,
	itemName: name,
	anchor,
	state: "open",
	comments: [comment],
	targetMissing: false,
})

const isSameSaying = (one: LibraryComment, other: LibraryComment) =>
	one.text === other.text &&
	one.author.kind === other.author.kind &&
	one.author.id === other.author.id

const isSameComment = (one: LibraryComment, other: LibraryComment) =>
	one.createdAt === other.createdAt && isSameSaying(one, other)

const isSameAnchor = (one: LibraryCommentAnchor, other: LibraryCommentAnchor) =>
	hashKey([one]) === hashKey([other])

const isBeingSentAs = (
	thread: LibraryCommentThread,
	announced: LibraryCommentThread,
) =>
	thread.id.startsWith(SENDING_ID) &&
	isSameAnchor(thread.anchor, announced.anchor) &&
	isSameSaying(thread.comments[0], announced.comments[0])

const changedThread = (
	threads: LibraryCommentThread[],
	threadId: string,
	change: (thread: LibraryCommentThread) => LibraryCommentThread,
) => threads.map((thread) => (thread.id === threadId ? change(thread) : thread))

export const withThread = (
	threads: LibraryCommentThread[],
	thread: LibraryCommentThread,
) =>
	threads.some(({ id }) => id === thread.id)
		? changedThread(threads, thread.id, () => thread)
		: [...threads, thread]

export const withAnnouncedThread = (
	threads: LibraryCommentThread[],
	announced: LibraryCommentThread,
) => {
	const isHeld = threads.some(({ id }) => id === announced.id)
	const sending = isHeld
		? undefined
		: threads.find((thread) => isBeingSentAs(thread, announced))
	return sending
		? changedThread(threads, sending.id, () => announced)
		: withThread(threads, announced)
}

export const withoutThread = (
	threads: LibraryCommentThread[],
	threadId: string,
) => threads.filter(({ id }) => id !== threadId)

export const withComment = (
	threads: LibraryCommentThread[],
	threadId: string,
	comment: LibraryComment,
) =>
	changedThread(threads, threadId, (thread) => ({
		...thread,
		comments: [...thread.comments, comment],
	}))

export const withoutComment = (
	threads: LibraryCommentThread[],
	threadId: string,
	comment: LibraryComment,
) =>
	changedThread(threads, threadId, (thread) => ({
		...thread,
		comments: thread.comments.filter((each) => !isSameComment(each, comment)),
	}))

export const withThreadState = (
	threads: LibraryCommentThread[],
	threadId: string,
	state: LibraryCommentThreadState,
) => changedThread(threads, threadId, (thread) => ({ ...thread, state }))
