import {
	type QueryClient,
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	commentBy,
	type SentComment,
	type SentReply,
	threadBeingSent,
	withComment,
	withoutComment,
	withoutThread,
	withThread,
	withThreadState,
} from "./library-comment-threads"
import {
	createLibraryCommentThread,
	reopenLibraryCommentThread,
	replyToLibraryCommentThread,
	resolveLibraryCommentThread,
} from "./library-comment-writes"
import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryCommentThreads } from "./library-reads"
import { reportUnheard } from "./use-library-document-writers"

import {
	LIBRARY_COMMENT_THREAD_CHANGED_EVENT,
	type LibraryCommentParty,
	type LibraryCommentThread,
	type LibraryCommentThreadChanged,
	type LibraryCommentThreadState,
} from "../bindings"
import { listen } from "../host/index"

type CommentFailure = "list" | "send" | "reply" | "resolve" | "reopen"

type OnItem<Sent> = Sent & { name: string }

type SettledThread = { threadId: string }

type ThreadsChange = (threads: LibraryCommentThread[]) => LibraryCommentThread[]

type ThreadSettling = {
	state: LibraryCommentThreadState
	stateBefore: LibraryCommentThreadState
	write: (
		spaceId: string,
		name: string,
		threadId: string,
	) => Promise<LibraryCommentThread>
	failure: CommentFailure
}

const NO_THREADS: LibraryCommentThread[] = []

const RESOLVING: ThreadSettling = {
	state: "resolved",
	stateBefore: "open",
	write: resolveLibraryCommentThread,
	failure: "resolve",
}

const REOPENING: ThreadSettling = {
	state: "open",
	stateBefore: "resolved",
	write: reopenLibraryCommentThread,
	failure: "reopen",
}

const failureOf = (failure: CommentFailure) => ({
	failureNotice: () => ({
		title: i18n.t(`common:library.failure.comment.${failure}`),
	}),
	raisedIn: "use-library-comment-threads",
})

const heldThreadsOf = (queryClient: QueryClient, spaceId: string) => {
	const change = (name: string, after: ThreadsChange) =>
		queryClient.setQueryData<LibraryCommentThread[]>(
			libraryQueryKeys.commentThreadsOf(spaceId, name),
			(held) => held && after(held),
		)
	const changeAhead = async (name: string, after: ThreadsChange) => {
		await queryClient.cancelQueries({
			queryKey: libraryQueryKeys.commentThreadsOf(spaceId, name),
		})
		change(name, after)
	}
	return { change, changeAhead }
}

type HeldThreads = ReturnType<typeof heldThreadsOf>

const useThreadSettling = (
	spaceId: string,
	{ change, changeAhead }: HeldThreads,
	{ state, stateBefore, write, failure }: ThreadSettling,
) =>
	useMutation({
		mutationFn: ({ name, threadId }: OnItem<SettledThread>) =>
			write(spaceId, name, threadId),
		onMutate: ({ name, threadId }) =>
			changeAhead(name, (threads) => withThreadState(threads, threadId, state)),
		onSuccess: (answered, { name }) =>
			change(name, (threads) => withThread(threads, answered)),
		onError: (_refusal, { name, threadId }) =>
			change(name, (threads) =>
				withThreadState(threads, threadId, stateBefore),
			),
		meta: failureOf(failure),
	})

const useHeardThreadChanges = (
	spaceId: string,
	name: string | undefined,
	{ change }: HeldThreads,
) => {
	useEffect(() => {
		if (!name) {
			return
		}
		const subscription = listen<LibraryCommentThreadChanged>(
			LIBRARY_COMMENT_THREAD_CHANGED_EVENT,
			({ payload }) => {
				if (payload.spaceId === spaceId && payload.itemName === name) {
					change(name, (threads) => withThread(threads, payload.thread))
				}
			},
		).catch(reportUnheard(LIBRARY_COMMENT_THREAD_CHANGED_EVENT))
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [spaceId, name, change])
}

export const useLibraryCommentThreads = (
	spaceId: string,
	name: string | undefined,
	self: LibraryCommentParty,
) => {
	const queryClient = useQueryClient()
	const cache = useMemo(
		() => heldThreadsOf(queryClient, spaceId),
		[queryClient, spaceId],
	)
	const { change, changeAhead } = cache

	const { data: threads, isError } = useQuery({
		queryKey: libraryQueryKeys.commentThreadsOf(spaceId, name),
		queryFn: name ? () => readLibraryCommentThreads(spaceId, name) : skipToken,
		meta: failureOf("list"),
	})
	useHeardThreadChanges(spaceId, name, cache)

	const creation = useMutation({
		mutationFn: ({ name, anchor, text, mentions }: OnItem<SentComment>) =>
			createLibraryCommentThread(spaceId, name, anchor, text, mentions),
		onMutate: async ({ name, anchor, ...said }) => {
			const sending = threadBeingSent(
				{ spaceId, name },
				anchor,
				commentBy(self, said, Date.now()),
			)
			await changeAhead(name, (held) => [...held, sending])
			return sending
		},
		onSuccess: (answered, { name }, sending) =>
			change(name, (held) =>
				withThread(withoutThread(held, sending.id), answered),
			),
		onError: (_refusal, { name }, sending) =>
			sending && change(name, (held) => withoutThread(held, sending.id)),
		meta: failureOf("send"),
	})

	const answer = useMutation({
		mutationFn: ({ name, threadId, text, mentions }: OnItem<SentReply>) =>
			replyToLibraryCommentThread(spaceId, name, threadId, text, mentions),
		onMutate: async ({ name, threadId, ...said }) => {
			const sending = commentBy(self, said, Date.now())
			await changeAhead(name, (held) => withComment(held, threadId, sending))
			return sending
		},
		onSuccess: (answered, { name }) =>
			change(name, (held) => withThread(held, answered)),
		onError: (_refusal, { name, threadId }, sending) =>
			sending &&
			change(name, (held) => withoutComment(held, threadId, sending)),
		meta: failureOf("reply"),
	})

	const resolution = useThreadSettling(spaceId, cache, RESOLVING)
	const reopening = useThreadSettling(spaceId, cache, REOPENING)

	return {
		threads: threads ?? NO_THREADS,
		hasLoaded: threads !== undefined,
		hasFailedToLoad: isError,
		send: (sent: SentComment, onRefused: () => void) => {
			if (name) creation.mutate({ name, ...sent }, { onError: onRefused })
		},
		reply: (sent: SentReply, onRefused: () => void) => {
			if (name) answer.mutate({ name, ...sent }, { onError: onRefused })
		},
		resolve: (threadId: string) => {
			if (name) resolution.mutate({ name, threadId })
		},
		reopen: (threadId: string) => {
			if (name) reopening.mutate({ name, threadId })
		},
	}
}
