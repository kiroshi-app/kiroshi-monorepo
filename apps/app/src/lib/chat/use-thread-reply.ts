import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

import type { TranscriptHandle } from "@workspace/ui/components/transcript"

import { claimsComposerFocus, type ReplyTarget } from "./screen-model"

type ThreadReplyInput = {
	composerRef: RefObject<HTMLTextAreaElement | null>
	scrollerRef: RefObject<TranscriptHandle | null>
	send: (text: string, repliedToMessageId?: string) => Promise<boolean>
}

export type ThreadReply = {
	replyTarget: ReplyTarget | null
	focusComposer: () => void
	holdReply: (target: ReplyTarget) => void
	releaseReply: () => void
	submitPrompt: (text: string) => Promise<boolean>
}

export function useThreadReply({
	composerRef,
	scrollerRef,
	send,
}: ThreadReplyInput): ThreadReply {
	const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)

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
			const sent = await send(text, replyTarget?.messageId)
			if (sent) {
				setReplyTarget(null)
			}
			focusComposer()
			return sent
		},
		[send, replyTarget, scrollerRef, focusComposer],
	)

	return {
		replyTarget,
		focusComposer,
		submitPrompt,
		holdReply: useCallback(
			(target: ReplyTarget) => {
				setReplyTarget(target)
				focusComposer()
			},
			[focusComposer],
		),
		releaseReply: useCallback(() => {
			setReplyTarget(null)
			focusComposer()
		}, [focusComposer]),
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
