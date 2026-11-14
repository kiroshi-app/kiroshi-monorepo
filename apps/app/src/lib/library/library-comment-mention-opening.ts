import { i18n } from "@workspace/ui/lib/i18n"

import { titleOf } from "./library-items"
import type { MentionedCommentThread } from "./mentioned-comment-thread"

import type {
	LibraryCommentMentionOpened,
	LibraryCommentThread,
} from "../bindings"
import type { UnreportedFailureNotice } from "../failure-report"
import { isHostRefused } from "../host/host-refused"
import type { LibraryOpening } from "../navigation/library-search"

export type MentionedSpace = {
	rowId: string
	hostId: string | null
	hostSpaceId: string
}

type MentionOpeningOptions = {
	spaceOf: (spaceId: string) => MentionedSpace
	readThreads: (
		space: MentionedSpace,
		itemName: string,
	) => Promise<LibraryCommentThread[]>
	showItem: (rowId: string, opening: LibraryOpening) => void
	askForThread: (asked: MentionedCommentThread) => void
	raiseFailure: (notice: UnreportedFailureNotice) => void
}

const MISSING_ITEM = "missing"

const refusalKindOf = (cause: unknown) => {
	const refusal = isHostRefused(cause) ? cause.cause : cause
	return typeof refusal === "object" && refusal !== null
		? (refusal as { kind?: unknown }).kind
		: undefined
}

const unreadNoticeOf = (cause: unknown): UnreportedFailureNotice =>
	refusalKindOf(cause) === MISSING_ITEM
		? { title: i18n.t("common:library.tab.unavailable.missing.title") }
		: { title: i18n.t("common:library.failure.comment.list") }

const threadGoneNoticeOf = ({
	itemKind,
	itemName,
}: LibraryCommentMentionOpened): UnreportedFailureNotice => ({
	title: i18n.t("common:library.failure.comment.mentionedThreadGone", {
		name: titleOf({ kind: itemKind, name: itemName }),
	}),
})

export const createLibraryCommentMentionOpening =
	({
		spaceOf,
		readThreads,
		showItem,
		askForThread,
		raiseFailure,
	}: MentionOpeningOptions) =>
	(opened: LibraryCommentMentionOpened) => {
		const { spaceId, itemName, itemKind, threadId } = opened
		const space = spaceOf(spaceId)

		const openAmong = (threads: LibraryCommentThread[]) => {
			if (!threads.some(({ id }) => id === threadId)) {
				raiseFailure(threadGoneNoticeOf(opened))
				return
			}
			askForThread({ spaceId: space.hostSpaceId, itemName, threadId })
			showItem(space.rowId, { kind: itemKind, name: itemName })
		}

		return readThreads(space, itemName).then(openAmong, (cause: unknown) =>
			raiseFailure(unreadNoticeOf(cause)),
		)
	}
