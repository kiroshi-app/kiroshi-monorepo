import { describe, expect, it } from "vitest"

import { pinnedBubblesOf } from "./pinned-bubbles"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"

const TURN = { id: "t-1", conversationId: FAKE_CHAT_ID, startedAt: 1 }

const ANSWER = {
	id: "a-1",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: "default",
	repliedToMessageId: null,
	createdAt: 2,
}

const STALE_BLOCK = 7

const withTwoBlocks = async () => {
	const store = createFakeTranscriptStore()
	await store.startTurn(TURN)
	await store.openAssistantMessage(ANSWER)
	await store.appendText(ANSWER.id, "One.\n\nTwo.")
	await store.finalizeMessage(ANSWER.id, "complete")
	return store
}

const rowsOf = async (store: ReturnType<typeof createFakeTranscriptStore>) =>
	pinnedBubblesOf(await store.pinnedMessages(FAKE_CHAT_ID))

describe("pinnedBubblesOf", () => {
	it("shows a pin on the whole message under the message id", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)

		const [pinned] = await rowsOf(store)

		expect(pinned.id).toBe("a-1")
		expect(pinned.bubble.text).toBe("One.\n\nTwo.")
	})

	it("shows the whole message for a stale pin on a later block", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, STALE_BLOCK, 20)

		const [stale] = await rowsOf(store)

		expect(stale.id).toBe("a-1")
		expect(stale.bubble.text).toBe("One.\n\nTwo.")
		expect(stale.blockIndexes).toEqual([STALE_BLOCK])
	})

	it("shows a message pinned on two blocks once, holding both pins", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, STALE_BLOCK, 20)

		const rows = await rowsOf(store)

		expect(rows.map((row) => row.id)).toEqual(["a-1"])
		expect(rows[0].blockIndexes).toEqual([0, STALE_BLOCK])
	})
})
