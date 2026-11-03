import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

import type { TranscriptHandle } from "@workspace/ui/components/transcript"

import { claimsComposerFocus, type ReplyTarget } from "./screen-model"

type ThreadReplyInput = {
	threadId: string
	composerRef: RefObject<HTMLTextAreaElement | null>
	scrollerRef: RefObject<TranscriptHandle | null>
	send: (text: string, repliedToMessageIds: string[]) => Promise<boolean>
}

export type ThreadReply = {
	replyTargets: ReplyTarget[]
	focusComposer: () => void
	holdReply: (target: ReplyTarget) => void
	releaseReply: (messageId: string) => void
	submitPrompt: (text: string) => Promise<boolean>
}

type HeldReplies = Readonly<Record<string, ReplyTarget[]>>

const NO_TARGETS: ReplyTarget[] = []

const withTarget = (held: ReplyTarget[], target: ReplyTarget) =>
	held.some(({ messageId }) => messageId === target.messageId)
		? held
		: [...held, target]

const withoutTarget = (held: ReplyTarget[], messageId: string) =>
	held.filter((target) => target.messageId !== messageId)

export function useThreadReply({
	threadId,
	composerRef,
	scrollerRef,
	send,
}: ThreadReplyInput): ThreadReply {
	const [heldReplies, setHeldReplies] = useState<HeldReplies>({})
	const replyTargets = heldReplies[threadId] ?? NO_TARGETS

	const updateTargets = useCallback(
		(update: (held: ReplyTarget[]) => ReplyTarget[]) =>
			setHeldReplies((replies) => ({
				...replies,
				[threadId]: update(replies[threadId] ?? NO_TARGETS),
			})),
		[threadId],
	)

	const focusComposer = useCallback(() => {
		const composer = composerRef.current
		if (!composer || composer.disabled) {
			return
		}
		const caret = composer.value.length
		composer.focus({ preventScroll: true })
		composer.setSelectionRange(caret, caret)
	}, [composerRef])

	const submitPrompt = useCallback(
		async (text: string) => {
			scrollerRef.current?.scrollToEnd("auto")
			const sent = await send(
				text,
				replyTargets.map(({ messageId }) => messageId),
			)
			if (sent) {
				updateTargets(() => NO_TARGETS)
			}
			focusComposer()
			return sent
		},
		[send, replyTargets, updateTargets, scrollerRef, focusComposer],
	)

	return {
		replyTargets,
		focusComposer,
		submitPrompt,
		holdReply: useCallback(
			(target: ReplyTarget) => {
				updateTargets((held) => withTarget(held, target))
				focusComposer()
			},
			[updateTargets, focusComposer],
		),
		releaseReply: useCallback(
			(messageId: string) => {
				updateTargets((held) => withoutTarget(held, messageId))
				focusComposer()
			},
			[updateTargets, focusComposer],
		),
	}
}

export function useComposerRequest(
	request: object | null,
	focusComposer: () => void,
): void {
	useEffect(() => {
		if (request) {
			focusComposer()
		}
	}, [request, focusComposer])
}

type ComposerFocusInput = {
	threadId: string | null
	isPromptPending: boolean
	isOverlayOpen: boolean
	focusComposer: () => void
}

export function useComposerFocus({
	threadId,
	isPromptPending,
	isOverlayOpen,
	focusComposer,
}: ComposerFocusInput): void {
	const focusedThreadId = useRef<string | null>(null)

	useEffect(() => {
		if (!threadId) {
			return
		}
		const claimed = claimsComposerFocus({
			threadId,
			focusedThreadId: focusedThreadId.current,
			isPromptPending,
			isOverlayOpen,
		})
		if (!claimed) {
			return
		}
		focusedThreadId.current = threadId
		focusComposer()
	}, [threadId, isPromptPending, isOverlayOpen, focusComposer])
}
