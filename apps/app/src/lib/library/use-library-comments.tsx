import { useState } from "react"

import type { LibraryCommentAnchor as ShownAnchor } from "@workspace/ui/components/library-comment-author"
import {
	LibraryCommentsList,
	type LibraryCommentsTab,
} from "@workspace/ui/components/library-comments-list"
import type { LibraryBarComments } from "@workspace/ui/components/library-item-menu"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { mentionsIn, partyOf } from "./library-comment-people"
import {
	commentedThreadsOf,
	countsOf,
	resolutionOf,
	summaryOf,
} from "./library-comment-views"
import type { LibraryCommentPeople } from "./use-library-comment-people"
import { useLibraryCommentThreads } from "./use-library-comment-threads"

import type { LibraryCommentAnchor, LibraryCommentThread } from "../bindings"

type CommentDraft<Target> = {
	target: Target
	text: string
}

type CommentsState<Target> = {
	name: string | undefined
	isCommentMode: boolean
	openThreadId: string | null
	draft: CommentDraft<Target> | null
	reply: string
	tab: LibraryCommentsTab
}

type LibraryCommentsInput<Target> = {
	spaceId: string
	name: string | undefined
	people: LibraryCommentPeople
	anchorOf: (target: Target) => LibraryCommentAnchor
	anchorLineOf: (thread: LibraryCommentThread) => ShownAnchor
}

const closedOn = <Target,>(
	name: string | undefined,
): CommentsState<Target> => ({
	name,
	isCommentMode: false,
	openThreadId: null,
	draft: null,
	reply: "",
	tab: "open",
})

const ignoreMore = () => {}

export const useLibraryComments = <Target,>({
	spaceId,
	name,
	people,
	anchorOf,
	anchorLineOf,
}: LibraryCommentsInput<Target>) => {
	const [held, setHeld] = useState(() => closedOn<Target>(name))
	const state = held.name === name ? held : closedOn<Target>(name)
	const unnamed = useChatCopy()("working.name")
	const { threads, hasLoaded, send, reply, resolve, reopen } =
		useLibraryCommentThreads(spaceId, name, partyOf(people.self))

	const change = (changes: Partial<CommentsState<Target>>) =>
		setHeld((current) => ({
			...(current.name === name ? current : closedOn<Target>(name)),
			...changes,
		}))
	const changeIfStillOn = (
		after: (current: CommentsState<Target>) => CommentsState<Target>,
	) => setHeld((current) => (current.name === name ? after(current) : current))

	const now = Date.now()
	const commented = commentedThreadsOf(threads, people.authorOf, now)
	const opened = commented.find(
		({ thread }) => thread.id === state.openThreadId,
	)
	const counts = countsOf(threads)

	const openThreadById = (openThreadId: string) =>
		change({ openThreadId, reply: "", draft: null })
	const setCommentMode = (isCommentMode: boolean) =>
		change(isCommentMode ? { isCommentMode } : { isCommentMode, draft: null })

	const sendDraft = () => {
		const sent = state.draft
		if (!sent) {
			return
		}
		change({ draft: null })
		send(
			{
				anchor: anchorOf(sent.target),
				text: sent.text,
				mentions: mentionsIn(sent.text, people.participants),
			},
			() =>
				changeIfStillOn((current) =>
					current.draft ? current : { ...current, draft: sent },
				),
		)
	}

	const sendReply = () => {
		const { openThreadId: threadId, reply: text } = state
		if (!threadId) {
			return
		}
		change({ reply: "" })
		reply(
			{ threadId, text, mentions: mentionsIn(text, people.participants) },
			() =>
				changeIfStillOn((current) =>
					current.openThreadId === threadId && current.reply === ""
						? { ...current, reply: text }
						: current,
				),
		)
	}

	const bar: LibraryBarComments | undefined = hasLoaded
		? {
				counts,
				isCommentMode: state.isCommentMode,
				onCommentModeChange: setCommentMode,
				list: (
					<LibraryCommentsList
						counts={counts}
						onOpenThread={openThreadById}
						onTabChange={(tab) => change({ tab })}
						tab={state.tab}
						threads={commented
							.filter(({ thread }) => thread.state === state.tab)
							.map((each) => summaryOf(each, anchorLineOf(each.thread), now))}
					/>
				),
			}
		: undefined

	return {
		bar,
		isCommentMode: state.isCommentMode,
		participants: people.participants,
		threads: commented.filter(
			({ thread }) => thread.state === "open" || thread === opened?.thread,
		),
		openThread: opened && {
			id: opened.thread.id,
			anchor: anchorLineOf(opened.thread),
			comments: opened.comments,
			participants: people.participants,
			resolution: resolutionOf(opened.thread, unnamed),
			reply: state.reply,
			onReplyChange: (text: string) => change({ reply: text }),
			onReply: sendReply,
			onResolve: () => resolve(opened.thread.id),
			onReopen: () => reopen(opened.thread.id),
			onMore: ignoreMore,
			onClose: () => change({ openThreadId: null, reply: "" }),
		},
		draft: state.draft && {
			target: state.draft.target,
			author: people.self,
			participants: people.participants,
			value: state.draft.text,
			onValueChange: (text: string) =>
				changeIfStillOn((current) =>
					current.draft
						? { ...current, draft: { ...current.draft, text } }
						: current,
				),
			onSubmit: sendDraft,
			onClose: () => change({ draft: null }),
		},
		openThreadById,
		startComment: (target: Target) =>
			change({ draft: { target, text: "" }, openThreadId: null, reply: "" }),
		toggleCommentMode: () => setCommentMode(!state.isCommentMode),
		leaveCommentMode: () => setCommentMode(false),
	}
}
