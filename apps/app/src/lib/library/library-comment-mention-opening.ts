import { i18n } from "@workspace/ui/lib/i18n"

import { titleOf } from "./library-items"
import type { MentionedCommentThread } from "./mentioned-comment-thread"

import type {
	LibraryCommentMentionOpened,
	LibraryCommentThread,
} from "../bindings"
import {
	describeFailure,
	type UnreportedFailureNotice,
} from "../failure-report"
import { isHostRefused } from "../host/host-refused"
import type { LibraryOpening } from "../navigation/library-search"
import { notificationFailureTitleFor } from "../notifications/notification-words"

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
	raiseWindow: () => Promise<void>
	raiseFailure: (notice: UnreportedFailureNotice) => void
}

const isMissingItem = (cause: unknown) => {
	const refusal = isHostRefused(cause) ? cause.cause : cause
	return (
		typeof refusal === "object" &&
		refusal !== null &&
		(refusal as { kind?: unknown }).kind === "missing"
	)
}

const unreadNoticeOf = (cause: unknown): UnreportedFailureNotice =>
	isMissingItem(cause)
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

const unraisedNoticeOf = (reason: unknown): UnreportedFailureNotice => ({
	title: notificationFailureTitleFor("reveal"),
	description: describeFailure(reason),
})

export const createLibraryCommentMentionOpening =
	({
		spaceOf,
		readThreads,
		showItem,
		askForThread,
		raiseWindow,
		raiseFailure,
	}: MentionOpeningOptions) =>
	async (opened: LibraryCommentMentionOpened) => {
		const { spaceId, itemName, itemKind, threadId } = opened
		const space = spaceOf(spaceId)
		const windowRaised = async () => raiseWindow()
		const raised = windowRaised().catch((reason: unknown) =>
			raiseFailure(unraisedNoticeOf(reason)),
		)

		const showOnThread = async () => {
			await raised
			askForThread({ spaceId: space.hostSpaceId, itemName, threadId })
			showItem(space.rowId, { kind: itemKind, name: itemName })
		}

		const openAmong = (threads: LibraryCommentThread[]) =>
			threads.some(({ id }) => id === threadId)
				? showOnThread()
				: raiseFailure(threadGoneNoticeOf(opened))

		await readThreads(space, itemName).then(openAmong, (cause: unknown) =>
			raiseFailure(unreadNoticeOf(cause)),
		)
		await raised
	}
