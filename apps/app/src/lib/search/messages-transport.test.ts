import { invoke } from "@tauri-apps/api/core"
import { beforeEach, expect, it, vi } from "vitest"

import { messagesTransport } from "./messages-transport"
import type { MessageHit } from "./search-contract"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const A_HIT: MessageHit = {
	messageId: "m-1",
	seq: 4,
	conversationId: "c-1",
	conversationKind: "topic",
	conversationTitle: "Roadmap review",
	authorBotId: "b-1",
	createdAt: 1,
	spaceId: "personal",
	snippet: [
		{ text: "the ", matched: false },
		{ text: "parser", matched: true },
	],
}

beforeEach(() => {
	hostInvoke.mockReset()
})

it("searches the messages of one space from the host", async () => {
	hostInvoke.mockResolvedValueOnce([A_HIT])

	await expect(
		messagesTransport.search({
			text: "parser",
			spaceId: "personal",
		}),
	).resolves.toEqual([A_HIT])

	expect(hostInvoke).toHaveBeenCalledWith("search_messages", {
		query: { text: "parser", spaceId: "personal" },
	})
})

it("lets the error of a query over the limit reach the caller", async () => {
	hostInvoke.mockRejectedValueOnce({ kind: "queryTooLong", limit: 200 })

	await expect(
		messagesTransport.search({
			text: "a".repeat(201),
			spaceId: "personal",
		}),
	).rejects.toEqual({ kind: "queryTooLong", limit: 200 })
})
