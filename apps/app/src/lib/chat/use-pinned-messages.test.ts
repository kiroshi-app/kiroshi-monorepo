// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	type PinnedMessagesController,
	usePinnedMessages,
} from "./use-pinned-messages"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const ANSWER = {
	id: "a-1",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: "default",
	repliedToMessageId: null,
	createdAt: 2,
}

const answeredStore = async () => {
	const store = createFakeTranscriptStore()
	await store.startTurn({
		id: "t-1",
		conversationId: FAKE_CHAT_ID,
		startedAt: 1,
	})
	await store.openAssistantMessage(ANSWER)
	await store.appendText(ANSWER.id, "One.")
	await store.finalizeMessage(ANSWER.id, "complete")
	return store
}

const controllerOver = async () => {
	const store = await answeredStore()
	const controller = {
		pins: vi.fn(() => store.pinnedMessages(FAKE_CHAT_ID)),
		pin: vi.fn((messageId: string, blockIndex: number) =>
			store.pinMessage(FAKE_CHAT_ID, messageId, blockIndex, 10),
		),
		unpin: vi.fn((messageId: string, blockIndex: number) =>
			store.unpinMessage(FAKE_CHAT_ID, messageId, blockIndex),
		),
	} satisfies PinnedMessagesController
	return { store, controller }
}

const renderPins = (
	controller: PinnedMessagesController,
	conversationId: string | null = FAKE_CHAT_ID,
) =>
	renderHook(() => usePinnedMessages(controller, conversationId), {
		wrapper: createQueryTestWrapper().wrapper,
	}).result

const pinnedIdsOf = (result: ReturnType<typeof renderPins>) =>
	result.current.bubbles.map(({ id }) => id)

it("shows the pins of the shown conversation", async () => {
	const { store, controller } = await controllerOver()
	await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)

	const result = renderPins(controller)

	await waitFor(() => expect(pinnedIdsOf(result)).toEqual([ANSWER.id]))
	expect(result.current.isPinned(ANSWER.id)).toBe(true)
	expect(result.current.hasFailed).toBe(false)
})

it("reads no pins without a conversation", async () => {
	const { controller } = await controllerOver()

	const result = renderPins(controller, null)

	await Promise.resolve()
	expect(controller.pins).not.toHaveBeenCalled()
	expect(result.current.bubbles).toEqual([])
})

it("reads the pins again once a pin settles", async () => {
	const { controller } = await controllerOver()
	const result = renderPins(controller)
	await waitFor(() => expect(controller.pins).toHaveBeenCalledOnce())

	act(() => result.current.toggle(ANSWER.id, 0))

	await waitFor(() => expect(pinnedIdsOf(result)).toEqual([ANSWER.id]))
	expect(controller.pin).toHaveBeenCalledWith(ANSWER.id, 0)
	expect(controller.pins).toHaveBeenCalledTimes(2)
})

it("reads the pins again once an unpin settles", async () => {
	const { store, controller } = await controllerOver()
	await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)
	const result = renderPins(controller)
	await waitFor(() => expect(pinnedIdsOf(result)).toEqual([ANSWER.id]))

	act(() => result.current.unpin(ANSWER.id))

	await waitFor(() => expect(pinnedIdsOf(result)).toEqual([]))
	expect(controller.unpin).toHaveBeenCalledWith(ANSWER.id, 0)
	expect(controller.pins).toHaveBeenCalledTimes(2)
})

it("reads the pins again even when a pin fails", async () => {
	const { controller } = await controllerOver()
	controller.pin.mockRejectedValueOnce(new Error("no pin"))
	const result = renderPins(controller)
	await waitFor(() => expect(controller.pins).toHaveBeenCalledOnce())

	act(() => result.current.toggle(ANSWER.id, 0))

	await waitFor(() => expect(controller.pins).toHaveBeenCalledTimes(2))
	expect(result.current.hasFailed).toBe(true)
})

it("shows a failed pins read inline, without a notice", async () => {
	const { controller } = await controllerOver()
	controller.pins.mockRejectedValueOnce(new Error("no pins"))

	const result = renderPins(controller)

	await waitFor(() => expect(result.current.hasFailed).toBe(true))
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("hides a dismissed read failure until the next failure", async () => {
	const { controller } = await controllerOver()
	controller.pins.mockRejectedValue(new Error("no pins"))
	const result = renderPins(controller)
	await waitFor(() => expect(result.current.hasFailed).toBe(true))

	act(() => result.current.dismissFailure())

	expect(result.current.hasFailed).toBe(false)

	act(() => result.current.toggle(ANSWER.id, 0))

	await waitFor(() => expect(result.current.hasFailed).toBe(true))
	expect(controller.pins).toHaveBeenCalledTimes(2)
})

it("hides a dismissed write failure until the next failure", async () => {
	const { controller } = await controllerOver()
	controller.pin.mockRejectedValue(new Error("no pin"))
	const result = renderPins(controller)
	await waitFor(() => expect(controller.pins).toHaveBeenCalledOnce())

	act(() => result.current.toggle(ANSWER.id, 0))
	await waitFor(() => expect(result.current.hasFailed).toBe(true))
	act(() => result.current.dismissFailure())

	expect(result.current.hasFailed).toBe(false)

	act(() => result.current.toggle(ANSWER.id, 0))

	await waitFor(() => expect(result.current.hasFailed).toBe(true))
	expect(controller.pin).toHaveBeenCalledTimes(2)
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})
