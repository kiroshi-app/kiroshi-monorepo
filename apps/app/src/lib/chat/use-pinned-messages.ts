import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import { chatQueryKeys } from "./chat-query-keys"
import { type PinnedBubble, pinnedBubblesOf } from "./pinned-bubbles"

import type { MessagePin } from "../conversations/store-contract"
import { isReadErrorShown } from "../query/last-read"

const NO_PINS: MessagePin[] = []

export type PinnedMessagesController = {
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
}

export type PinnedBubbles = {
	bubbles: PinnedBubble[]
	hasFailed: boolean
	isPinned: (bubbleId: string) => boolean
	toggle: (bubbleId: string) => void
	unpin: (bubbleId: string) => void
	dismissFailure: () => void
}

type PinWrite = {
	conversationId: string | null
	messageId: string
	heldBlockIndexes: number[]
}

type DismissedFailure = {
	readFailedAt: number
	writeSubmittedAt: number
}

const NOTHING_DISMISSED: DismissedFailure = {
	readFailedAt: 0,
	writeSubmittedAt: 0,
}

const SHOWN_INLINE = { rendersErrorInline: true } as const

const WHOLE_MESSAGE_BLOCK = 0

export const usePinnedMessages = (
	controller: PinnedMessagesController,
	conversationId: string | null,
): PinnedBubbles => {
	const queryClient = useQueryClient()
	const [dismissed, setDismissed] = useState(NOTHING_DISMISSED)

	const read = useQuery({
		queryKey: chatQueryKeys.pins(conversationId),
		queryFn: conversationId ? controller.pins : skipToken,
		meta: SHOWN_INLINE,
	})

	const write = useMutation({
		mutationFn: async ({ messageId, heldBlockIndexes }: PinWrite) => {
			if (heldBlockIndexes.length === 0) {
				return controller.pin(messageId, WHOLE_MESSAGE_BLOCK)
			}
			await Promise.all(
				heldBlockIndexes.map((blockIndex) =>
					controller.unpin(messageId, blockIndex),
				),
			)
		},
		onSettled: (_result, _error, written) =>
			queryClient.invalidateQueries({
				queryKey: chatQueryKeys.pins(written.conversationId),
			}),
		meta: SHOWN_INLINE,
	})
	const { mutate } = write

	const pins = read.data ?? NO_PINS
	const isReadFailureShown =
		read.isError &&
		isReadErrorShown(read.error) &&
		read.errorUpdatedAt > dismissed.readFailedAt
	const isWriteFailureShown =
		write.isError &&
		write.variables.conversationId === conversationId &&
		write.submittedAt > dismissed.writeSubmittedAt
	const hasFailed = isReadFailureShown || isWriteFailureShown

	const dismissFailure = useCallback(
		() =>
			setDismissed({
				readFailedAt: read.errorUpdatedAt,
				writeSubmittedAt: write.submittedAt,
			}),
		[read.errorUpdatedAt, write.submittedAt],
	)

	const bubbles = useMemo(() => pinnedBubblesOf(pins), [pins])
	const held = useMemo(
		() => new Map(bubbles.map((shown) => [shown.id, shown])),
		[bubbles],
	)

	const isPinned = useCallback((bubbleId: string) => held.has(bubbleId), [held])

	const toggle = useCallback(
		(bubbleId: string) => {
			mutate({
				conversationId,
				messageId: bubbleId,
				heldBlockIndexes: held.get(bubbleId)?.blockIndexes ?? [],
			})
		},
		[conversationId, held, mutate],
	)

	const unpin = useCallback(
		(bubbleId: string) => {
			if (held.has(bubbleId)) {
				toggle(bubbleId)
			}
		},
		[held, toggle],
	)

	return useMemo(
		() => ({
			bubbles,
			hasFailed,
			isPinned,
			toggle,
			unpin,
			dismissFailure,
		}),
		[bubbles, hasFailed, isPinned, toggle, unpin, dismissFailure],
	)
}
