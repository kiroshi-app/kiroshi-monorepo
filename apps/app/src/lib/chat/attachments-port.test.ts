import { describe, expect, it } from "vitest"

import {
	type AttachmentsHosts,
	createAttachmentsPort,
} from "./attachments-port"

import type { ReplyLink } from "../bindings"
import type { ConversationController } from "../conversations/conversation-controller"

const heldHosts = () => {
	const sentToBots: { botId: string; text: string }[] = []
	const sentToRooms: {
		text: string
		replyLinks?: ReplyLink[]
		documents?: string[]
	}[] = []
	const storedByChat: string[] = []
	const storedByDriver: string[] = []
	const runtimes = new Map<string, ConversationController>()

	const runtime = {
		send: (text: string, replyLinks?: ReplyLink[], documents?: string[]) => {
			sentToRooms.push({ text, replyLinks, documents })
			return Promise.resolve(true)
		},
	} as ConversationController

	const hosts: AttachmentsHosts = {
		chat: {
			storeAttachments: (botId) => {
				storedByChat.push(botId)
				return Promise.resolve([])
			},
			sendTo: (botId, text) => {
				sentToBots.push({ botId, text })
				return Promise.resolve()
			},
		},
		driver: {
			storeAttachments: (conversationId) => {
				storedByDriver.push(conversationId)
				return Promise.resolve([])
			},
		},
		runtimes: { heldFor: (id) => runtimes.get(id) ?? null },
	}

	return {
		hosts,
		sentToBots,
		sentToRooms,
		storedByChat,
		storedByDriver,
		open: (conversationId: string) => runtimes.set(conversationId, runtime),
	}
}

describe("a draft owned by a companion", () => {
	it("goes through the companion chat", () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		expect(port.send({ kind: "bot", id: "a" }, "look")).toBe(true)
		expect(host.sentToBots).toEqual([{ botId: "a", text: "look" }])
	})

	it("is stored through the companion chat", async () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		await port.store({ kind: "bot", id: "a" }, [])

		expect(host.storedByChat).toEqual(["a"])
		expect(host.storedByDriver).toEqual([])
	})
})

describe("a draft owned by a conversation", () => {
	it("goes through the runtime of that conversation with its documents", async () => {
		const host = heldHosts()
		host.open("room")
		const port = createAttachmentsPort(host.hosts)

		const replyLinks = [{ messageId: "m1", excerpt: "the gates" }]

		await expect(
			port.send({ kind: "conversation", id: "room" }, "look", replyLinks, [
				"plan.md",
			]),
		).resolves.toBe(true)
		expect(host.sentToRooms).toEqual([
			{ text: "look", replyLinks, documents: ["plan.md"] },
		])
	})

	it("is stored against that conversation", async () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		await port.store({ kind: "conversation", id: "room" }, [])

		expect(host.storedByDriver).toEqual(["room"])
		expect(host.storedByChat).toEqual([])
	})

	it("goes nowhere when that conversation has no runtime", () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		expect(port.send({ kind: "conversation", id: "room" }, "look")).toBe(false)
		expect(host.sentToRooms).toEqual([])
		expect(host.sentToBots).toEqual([])
	})
})
