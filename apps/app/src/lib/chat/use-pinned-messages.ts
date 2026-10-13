import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import { chatQueryKeys } from "./chat-query-keys"
import { type PinnedBubble, pinnedBubblesOf } from "./pinned-bubbles"
import { bubbleIdOf } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

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
	anchorOf: (bubbleId: string) => string
	toggle: (messageId: string, blockIndex: number) => void
	unpin: (bubbleId: string) => void
	dismissFailure: () => void
}

type PinWrite = {
	conversationId: string | null
	messageId: string
	blockIndex: number
	isPinned: boolean
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
		mutationFn: ({ messageId, blockIndex, isPinned }: PinWrite) =>
			isPinned
				? controller.unpin(messageId, blockIndex)
				: controller.pin(messageId, blockIndex),
		onSettled: (_result, _error, written) =>
			queryClient.invalidateQueries({
				queryKey: chatQueryKeys.pins(written.conversationId),
			}),
		meta: SHOWN_INLINE,
	})
	const { mutate } = write

	const pins = read.data ?? NO_PINS
	const isReadFailureShown =
		read.isError && read.errorUpdatedAt > dismissed.readFailedAt
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

	const anchorOf = useCallback(
		(bubbleId: string) => held.get(bubbleId)?.anchor ?? bubbleId,
		[held],
	)

	const toggle = useCallback(
		(messageId: string, blockIndex: number) => {
			mutate({
				conversationId,
				messageId,
				blockIndex,
				isPinned: isPinned(bubbleIdOf(messageId, blockIndex)),
			})
		},
		[conversationId, isPinned, mutate],
	)

	const unpin = useCallback(
		(bubbleId: string) => {
			const shown = held.get(bubbleId)
			if (!shown) {
				return
			}
			mutate({
				conversationId,
				messageId: shown.pin.message.id,
				blockIndex: shown.pin.blockIndex,
				isPinned: true,
			})
		},
		[conversationId, held, mutate],
	)

	return useMemo(
		() => ({
			bubbles,
			hasFailed,
			isPinned,
			anchorOf,
			toggle,
			unpin,
			dismissFailure,
		}),
		[bubbles, hasFailed, isPinned, anchorOf, toggle, unpin, dismissFailure],
	)
}
