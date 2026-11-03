// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import type { ReplyTarget } from "./screen-model"
import { useComposerFocus, useThreadReply } from "./use-thread-reply"

type FocusProps = {
	threadId: string | null
}

const mountComposer = (): HTMLTextAreaElement => {
	const composer = document.createElement("textarea")
	document.body.append(composer)
	return composer
}

const renderThread = (
	composer: HTMLTextAreaElement,
	initialProps: FocusProps,
) =>
	renderHook(
		({ threadId }: FocusProps) => {
			const { focusComposer } = useThreadReply({
				threadId: "thread-1",
				composerRef: { current: composer },
				scrollerRef: { current: null },
				send: async () => true,
			})
			useComposerFocus({
				threadId,
				isPromptPending: false,
				isOverlayOpen: false,
				focusComposer,
			})
		},
		{ initialProps },
	)

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
})

it("focuses the input on a conversation, then on a mission thread of the same companion, and never steals it back", () => {
	const composer = mountComposer()
	const elsewhere = mountComposer()
	const { rerender } = renderThread(composer, {
		threadId: "conversation-1",
	})

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "mission-1" })

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "mission-1" })

	expect(document.activeElement).toBe(elsewhere)
})

it("focuses the input again when a shared companion's solo thread switches to another space", () => {
	const composer = mountComposer()
	const elsewhere = mountComposer()
	const { rerender } = renderThread(composer, { threadId: null })

	expect(document.activeElement).not.toBe(composer)

	rerender({ threadId: "solo-in-space-1" })

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "solo-in-space-2" })

	expect(document.activeElement).toBe(composer)
})

it("takes no focus on a closed mission whose input is disabled", () => {
	const composer = mountComposer()
	composer.disabled = true

	expect(() => renderThread(composer, { threadId: "mission-1" })).not.toThrow()
	expect(document.activeElement).not.toBe(composer)
})

const targetOf = (messageId: string): ReplyTarget => ({
	messageId,
	role: "assistant",
	excerpt: `said in ${messageId}`,
	authorBotId: "bot-1",
	authorAccountId: null,
	authorName: null,
	writtenFrom: null,
})

type ReplyProps = {
	threadId: string
}

const renderReplies = (sends: boolean, threadId = "thread-1") => {
	const send = vi.fn(async (_text: string, _repliedTo: string[]) => sends)
	const rendered = renderHook(
		(props: ReplyProps) =>
			useThreadReply({
				threadId: props.threadId,
				composerRef: { current: null },
				scrollerRef: { current: null },
				send,
			}),
		{ initialProps: { threadId } },
	)
	return { ...rendered, send }
}

const heldIds = (reply: ReturnType<typeof useThreadReply>) =>
	reply.replyTargets.map(({ messageId }) => messageId)

const holdAll = (
	reply: () => ReturnType<typeof useThreadReply>,
	messageIds: string[],
) => {
	for (const messageId of messageIds) {
		act(() => reply().holdReply(targetOf(messageId)))
	}
}

it("holds every message the person replies to, once each, in the order picked", () => {
	const { result } = renderReplies(true)

	holdAll(() => result.current, ["m-1", "m-2", "m-1", "m-3"])

	expect(heldIds(result.current)).toEqual(["m-1", "m-2", "m-3"])
})

it("drops only the reply the person removes", () => {
	const { result } = renderReplies(true)
	holdAll(() => result.current, ["m-1", "m-2", "m-3"])

	act(() => result.current.releaseReply("m-2"))

	expect(heldIds(result.current)).toEqual(["m-1", "m-3"])
})

it("sends every held reply in the order picked, then holds none", async () => {
	const { result, send } = renderReplies(true)
	holdAll(() => result.current, ["m-2", "m-1"])

	await act(() => result.current.submitPrompt("both of these"))

	expect(send).toHaveBeenCalledWith("both of these", ["m-2", "m-1"])
	expect(heldIds(result.current)).toEqual([])
})

it("keeps every held reply when the message does not send", async () => {
	const { result } = renderReplies(false)
	holdAll(() => result.current, ["m-1", "m-2"])

	await act(() => result.current.submitPrompt("lost"))

	expect(heldIds(result.current)).toEqual(["m-1", "m-2"])
})

it("shows only the replies held for the thread on screen", () => {
	const { result, rerender } = renderReplies(true, "thread-1")
	holdAll(() => result.current, ["m-1"])

	rerender({ threadId: "thread-2" })
	expect(heldIds(result.current)).toEqual([])
	holdAll(() => result.current, ["m-9"])

	rerender({ threadId: "thread-1" })
	expect(heldIds(result.current)).toEqual(["m-1"])
})
