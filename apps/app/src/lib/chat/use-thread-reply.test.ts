// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
	createDraftsController,
	type DraftsController,
} from "./drafts-controller"
import type { ReplyTarget } from "./screen-model"
import { useComposerFocus, useThreadReply } from "./use-thread-reply"

import type { ReplyLink } from "../bindings"

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
				composerRef: { current: composer },
				scrollerRef: { current: null },
				readReplies: () => [],
				rememberReplies: () => undefined,
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

type ReplyFixture = {
	isSent: boolean
	threadId?: string
	drafts?: DraftsController
}

const renderReplies = ({
	isSent,
	threadId = "thread-1",
	drafts = createDraftsController(),
}: ReplyFixture) => {
	const send = vi.fn(async (_text: string, _replyLinks: ReplyLink[]) => isSent)
	const rendered = renderHook(() =>
		useThreadReply({
			composerRef: { current: null },
			scrollerRef: { current: null },
			readReplies: () => drafts.readReplies(threadId),
			rememberReplies: (targets) => drafts.rememberReplies(threadId, targets),
			send,
		}),
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

const selectionOf = (messageId: string, excerpt: string): ReplyTarget => ({
	...targetOf(messageId),
	excerpt,
	isExcerpt: true,
})

it("holds every message the person replies to, once each, in the order picked", () => {
	const { result } = renderReplies({ isSent: true })

	holdAll(() => result.current, ["m-1", "m-2", "m-1", "m-3"])

	expect(heldIds(result.current)).toEqual(["m-1", "m-2", "m-3"])
})

it("replaces the held chip of a message replied to again, in place", () => {
	const { result } = renderReplies({ isSent: true })
	holdAll(() => result.current, ["m-1", "m-2"])

	act(() => result.current.holdReply(selectionOf("m-1", "the gates")))

	expect(result.current.replyTargets).toEqual([
		selectionOf("m-1", "the gates"),
		targetOf("m-2"),
	])

	act(() => result.current.holdReply(targetOf("m-1")))

	expect(result.current.replyTargets).toEqual([
		targetOf("m-1"),
		targetOf("m-2"),
	])
})

it("drops only the reply the person removes", () => {
	const { result } = renderReplies({ isSent: true })
	holdAll(() => result.current, ["m-1", "m-2", "m-3"])

	act(() => result.current.releaseReply("m-2"))

	expect(heldIds(result.current)).toEqual(["m-1", "m-3"])
})

it("sends every held reply in the order picked, then holds none", async () => {
	const { result, send } = renderReplies({ isSent: true })
	holdAll(() => result.current, ["m-2", "m-1"])

	await act(() => result.current.submitPrompt("both of these"))

	expect(send).toHaveBeenCalledWith("both of these", [
		{ messageId: "m-2", excerpt: null },
		{ messageId: "m-1", excerpt: null },
	])
	expect(heldIds(result.current)).toEqual([])
})

it("sends a selection with its excerpt and a whole message with none, in held order", async () => {
	const { result, send } = renderReplies({ isSent: true })
	act(() => result.current.holdReply(selectionOf("m-2", "the gates")))
	holdAll(() => result.current, ["m-1"])

	await act(() => result.current.submitPrompt("why?"))

	expect(send).toHaveBeenCalledWith("why?", [
		{ messageId: "m-2", excerpt: "the gates" },
		{ messageId: "m-1", excerpt: null },
	])
})

it("keeps every held reply when the message does not send", async () => {
	const { result } = renderReplies({ isSent: false })
	holdAll(() => result.current, ["m-1", "m-2"])

	await act(() => result.current.submitPrompt("lost"))

	expect(heldIds(result.current)).toEqual(["m-1", "m-2"])
})

it("brings back the replies of a thread mounted again, and none of another thread", () => {
	const drafts = createDraftsController()
	const first = renderReplies({ isSent: true, threadId: "thread-1", drafts })
	holdAll(() => first.result.current, ["m-2", "m-1"])
	first.unmount()

	const second = renderReplies({ isSent: true, threadId: "thread-2", drafts })
	expect(heldIds(second.result.current)).toEqual([])
	holdAll(() => second.result.current, ["m-9"])
	second.unmount()

	const back = renderReplies({ isSent: true, threadId: "thread-1", drafts })
	expect(heldIds(back.result.current)).toEqual(["m-2", "m-1"])
})

it("brings back a held selection with its excerpt on a thread mounted again", () => {
	const drafts = createDraftsController()
	const first = renderReplies({ isSent: true, threadId: "thread-1", drafts })
	act(() => first.result.current.holdReply(selectionOf("m-2", "the gates")))
	first.unmount()

	const back = renderReplies({ isSent: true, threadId: "thread-1", drafts })

	expect(back.result.current.replyTargets).toEqual([
		selectionOf("m-2", "the gates"),
	])
})

it("clears the replies of the thread that sent only", async () => {
	const drafts = createDraftsController()
	const other = renderReplies({ isSent: true, threadId: "thread-2", drafts })
	holdAll(() => other.result.current, ["m-9"])
	other.unmount()
	const { result } = renderReplies({
		isSent: true,
		threadId: "thread-1",
		drafts,
	})
	holdAll(() => result.current, ["m-1"])

	await act(() => result.current.submitPrompt("sent"))

	expect(drafts.readReplies("thread-1")).toEqual([])
	expect(
		drafts.readReplies("thread-2").map(({ messageId }) => messageId),
	).toEqual(["m-9"])
})
