import { describe, expect, it } from "vitest"

import { BLOT_TINTS } from "@workspace/ui/components/bot-settings"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "./fake-transcript-store"
import type { Bot, NewAssistantMessage, NewUserMessage } from "./store-contract"
import { botIdentity, message, named } from "./transcript-fixtures"

import { newBotIdentity } from "../bots/bot-settings"

const TURN = { id: "t-1", conversationId: FAKE_CHAT_ID, startedAt: 1 }

const PROMPT: NewUserMessage = {
	id: "m-1",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: null,
	repliedToMessageId: null,
	content: "hello",
	createdAt: 2,
}

const REPLY: NewAssistantMessage = {
	id: "m-2",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: "default",
	repliedToMessageId: "m-1",
	createdAt: 3,
}

const contentOf = async (
	store: ReturnType<typeof createFakeTranscriptStore>,
	id: string,
) => {
	const page = await store.loadPage(FAKE_CHAT_ID, null)
	return page.messages.find((entry) => entry.id === id)
}

describe("createFakeTranscriptStore", () => {
	it("ranks the companions of a space by the rooms they still sit in", async () => {
		const store = createFakeTranscriptStore()
		const ada = await store.createBot(botIdentity({ name: "Ada" }), "personal")
		const zed = await store.createBot(botIdentity({ name: "Zed" }), "personal")
		const room = (bots: Bot[]) =>
			store.createConversation({
				spaceId: "personal",
				sectionId: null,
				title: "Walls",
				botIds: bots.map((bot) => bot.id),
			})
		await room([zed])
		const excluded = await room([zed])
		const left = await room([ada, zed])
		await store.removeConversationParticipant(left.id, zed.id)
		const elsewhere = await store.createSpace("Elsewhere")
		await store.addBotToSpace(ada.id, elsewhere.id)
		await store.createConversation({
			spaceId: elsewhere.id,
			sectionId: null,
			title: "Walls",
			botIds: [ada.id],
		})

		expect(
			(await store.botsByPresence("personal")).map((bot) => bot.name),
		).toEqual(["Zed", "Ada", "Claude"])
		expect(
			(await store.botsByPresence("personal", excluded.id)).map(
				(bot) => bot.name,
			),
		).toEqual(["Ada", "Zed", "Claude"])
	})

	it("answers a replayed write with the place it already gave the row", async () => {
		const store = createFakeTranscriptStore()

		expect(await store.startTurn(TURN)).toBe(await store.startTurn(TURN))
		expect(await store.appendUserMessage(PROMPT)).toBe(1)
		expect(await store.appendUserMessage(PROMPT)).toBe(1)
		expect(await store.openAssistantMessage(REPLY)).toBe(2)
		expect(await store.openAssistantMessage(REPLY)).toBe(2)

		const page = await store.loadPage(FAKE_CHAT_ID, null)
		expect(page.messages.map((entry) => entry.id)).toEqual(["m-1", "m-2"])
	})

	it("refuses a second row claiming one id and saying something else", async () => {
		const store = createFakeTranscriptStore()
		await store.appendUserMessage(PROMPT)

		await expect(
			store.appendUserMessage({ ...PROMPT, content: "something else" }),
		).rejects.toEqual({ kind: "conflict", id: "m-1", field: "content" })
	})

	it("streams into an open reply and stops at its ending", async () => {
		const store = createFakeTranscriptStore()
		await store.openAssistantMessage(REPLY)
		await store.appendText("m-2", "Hel")
		await store.appendText("m-2", "lo")

		expect(await contentOf(store, "m-2")).toMatchObject({
			content: "Hello",
			completion: "streaming",
		})

		await store.finalizeMessage("m-2", "complete")
		await store.appendText("m-2", " late")

		expect(await contentOf(store, "m-2")).toMatchObject({
			content: "Hello",
			completion: "complete",
		})
	})

	it("takes an ending once and refuses a different one after it", async () => {
		const store = createFakeTranscriptStore()
		await store.openAssistantMessage(REPLY)
		await store.finalizeMessage("m-2", "cancelled")
		await store.finalizeMessage("m-2", "cancelled")

		expect(await contentOf(store, "m-2")).toMatchObject({
			completion: "cancelled",
		})
		await expect(store.finalizeMessage("m-2", "complete")).rejects.toEqual({
			kind: "invalidTransition",
			id: "m-2",
			from: "cancelled",
			to: "complete",
		})
	})

	it("pages back from the newest, and says when there is more", async () => {
		const store = createFakeTranscriptStore({
			pageSize: 2,
			messages: Array.from({ length: 5 }, (_, index) =>
				message({
					id: `m-${index + 1}`,
					conversationId: FAKE_CHAT_ID,
					seq: index + 1,
				}),
			),
		})

		const tail = await store.loadPage(FAKE_CHAT_ID, null)
		expect(tail.messages.map((entry) => entry.id)).toEqual(["m-4", "m-5"])
		expect(tail.hasMore).toBe(true)

		const older = await store.loadPage(FAKE_CHAT_ID, { beforeSeq: 4 })
		expect(older.messages.map((entry) => entry.id)).toEqual(["m-2", "m-3"])
		expect(older.hasMore).toBe(true)

		const first = await store.loadPage(FAKE_CHAT_ID, { beforeSeq: 2 })
		expect(first.messages.map((entry) => entry.id)).toEqual(["m-1"])
		expect(first.hasMore).toBe(false)
	})

	it("keeps writing where a seeded transcript left off", async () => {
		const store = createFakeTranscriptStore({
			messages: [
				message({ id: "stored-1", conversationId: FAKE_CHAT_ID, seq: 7 }),
			],
		})

		expect(await store.appendUserMessage(PROMPT)).toBe(8)
	})

	it("lists the companion it ships with, then the ones it is told to make", async () => {
		const store = createFakeTranscriptStore()

		const created = await store.createBot(botIdentity())

		expect((await store.bots()).map((bot) => bot.id)).toEqual([
			"default",
			created.id,
		])
		expect(created.name).toBe("Nyx")
		expect(created.model).toBe("opus")
	})

	it("makes a companion from a trimmed draft, in the first blot its space leaves free", async () => {
		const store = createFakeTranscriptStore()
		const space = await store.createSpace("Lab")

		const first = await store.createBotFromDraft(
			{ name: " Quill ", job: " a writer ", description: " Write. " },
			space.id,
		)
		const second = await store.createBotFromDraft(
			{ name: "Scout", job: "", description: "" },
			space.id,
		)

		expect(first).toMatchObject({
			name: "Quill",
			title: "a writer",
			instructions: "Write.",
			model: "sonnet",
			avatarBlot: 42,
		})
		expect(second.avatarBlot).toBe(82)
	})

	it("dresses a draft like the sidebar dresses a new companion in an empty space", async () => {
		const store = createFakeTranscriptStore()
		const space = await store.createSpace("Lab")

		const drafted = await store.createBotFromDraft(
			{ name: "Quill", job: "", description: "" },
			space.id,
		)

		const fromTheSidebar = newBotIdentity([])
		expect(drafted.avatarBlot).toBe(fromTheSidebar.avatarBlot)
	})

	it("wraps on the crowd of the space once every blot is worn", async () => {
		const store = createFakeTranscriptStore()
		const space = await store.createSpace("Lab")
		const draft = { name: "Quill", job: "", description: "" }
		for (const tint of BLOT_TINTS) {
			await store.createBotFromDraft({ ...draft, name: tint }, space.id)
		}

		const ninth = await store.createBotFromDraft(draft, space.id)
		const tenth = await store.createBotFromDraft(draft, space.id)

		expect([ninth.avatarBlot, tenth.avatarBlot]).toEqual([42, 82])
	})

	it("refuses a draft without a name and makes no companion", async () => {
		const store = createFakeTranscriptStore()
		const [space] = await store.spaces()
		const before = await store.bots()

		await expect(
			store.createBotFromDraft(
				{ name: "  ", job: "a job", description: "A brief." },
				space.id,
			),
		).rejects.toEqual({ kind: "namelessBot" })
		expect(await store.bots()).toEqual(before)
	})

	it("makes each suggested companion from its name, job and description", async () => {
		const store = createFakeTranscriptStore()
		const [space] = await store.spaces()

		for (const suggested of await store.suggestedBots()) {
			const created = await store.createBotFromDraft(suggested, space.id)
			expect([created.name, created.title, created.instructions]).toEqual([
				suggested.name,
				suggested.job,
				suggested.description,
			])
		}
	})

	it("copies a companion under a fresh id, a name of its own and an empty transcript", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)

		const copy = await store.duplicateBot("default")

		expect(copy.id).not.toBe("default")
		expect(copy.name).toBe("Claude copy")
		expect(copy.model).toBe("sonnet")
		const chat = await store.mainChat(copy.id)
		expect((await store.loadPage(chat.id, null)).messages).toEqual([])
	})

	it("refuses a copy of a companion it does not hold", async () => {
		const store = createFakeTranscriptStore()

		await expect(store.duplicateBot("missing")).rejects.toEqual({
			kind: "unknownBot",
			id: "missing",
		})
	})

	it("seats a copy in the space the reader named", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Elsewhere")

		const copy = await store.duplicateBot("default", elsewhere.id)

		expect(copy.name).toBe("Claude copy")
		expect(await store.bots(elsewhere.id)).toEqual([copy])
	})

	it("hands a copy a name no companion in the space it lands in carries", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Elsewhere")
		await store.duplicateBot("default", elsewhere.id)

		const second = await store.duplicateBot("default", elsewhere.id)

		expect(second.name).toBe("Claude copy 2")
		expect((await store.bots("personal")).map((bot) => bot.name)).toEqual([
			"Claude",
		])
	})

	it("refuses a copy into a space it does not hold", async () => {
		const store = createFakeTranscriptStore()

		await expect(store.duplicateBot("default", "missing")).rejects.toEqual({
			kind: "unknownSpace",
			id: "missing",
		})
		expect(await store.bots(null)).toHaveLength(1)
	})

	it("replaces who a companion is and leaves its id and its moment alone", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createBot(botIdentity())

		const updated = await store.updateBot(
			created.id,
			botIdentity({ name: "Ada", model: "haiku", avatarBlot: 63 }),
		)

		expect(updated.id).toBe(created.id)
		expect(updated.createdAt).toBe(created.createdAt)
		expect(updated.name).toBe("Ada")
		expect(updated.model).toBe("haiku")
		expect(updated.avatarBlot).toBe(63)
	})

	it("refuses a write on a companion it no longer holds", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createBot(botIdentity())
		await store.deleteBot(created.id)

		await expect(store.deleteBot(created.id)).rejects.toEqual({
			kind: "unknownBot",
			id: created.id,
		})
		await expect(store.updateBot(created.id, botIdentity())).rejects.toEqual({
			kind: "unknownBot",
			id: created.id,
		})
		expect((await store.bots()).map((bot) => bot.id)).toEqual(["default"])
	})

	it("lets the last companion go and answers an empty list after it", async () => {
		const store = createFakeTranscriptStore()

		await store.deleteBot("default")

		expect(await store.bots()).toEqual([])
	})

	it("forgets what a deleted companion's sessions announced", async () => {
		const store = createFakeTranscriptStore()
		await store.recordBotCommands("default", named("review"))

		await store.deleteBot("default")

		expect(await store.botCommands("default")).toEqual([])
	})

	it("dresses a companion in an uploaded picture and answers a path for it", async () => {
		const store = createFakeTranscriptStore()

		const worn = await store.setBotAvatarImage("default", aPng())

		expect(worn.avatarImagePath).toMatch(/\.png$/)
		expect((await store.bots())[0].avatarImagePath).toBe(worn.avatarImagePath)
	})

	it("refuses bytes that are not one of the formats a picture may arrive as", async () => {
		const store = createFakeTranscriptStore()

		await expect(
			store.setBotAvatarImage("default", new Uint8Array([0x47, 0x49, 0x46])),
		).rejects.toEqual({
			kind: "rejectedAvatarImage",
			reason: { kind: "unknownFormat" },
		})
		expect((await store.bots())[0].avatarImagePath).toBeNull()
	})

	it("refuses a picture over the limit with the limit it broke", async () => {
		const store = createFakeTranscriptStore()
		const limit = 5 * 1024 * 1024

		await expect(
			store.setBotAvatarImage("default", new Uint8Array(limit + 1)),
		).rejects.toEqual({
			kind: "rejectedAvatarImage",
			reason: { kind: "tooLarge", bytes: limit + 1, limit },
		})
	})

	it("refuses a picture for a companion it no longer holds", async () => {
		const store = createFakeTranscriptStore()
		await store.deleteBot("default")

		await expect(store.setBotAvatarImage("default", aPng())).rejects.toEqual({
			kind: "unknownBot",
			id: "default",
		})
	})

	it("writes, marks and takes away a companion's skills", async () => {
		const store = createFakeTranscriptStore()
		const draft = { name: "Baking Bread", description: "How.", body: "Bake." }
		const [learn] = await store.pluginSkills({ kind: "bot", id: "default" })
		expect(learn).toMatchObject({ id: "learn", isSystem: true })

		const created = await store.createPluginSkill(
			{ kind: "bot", id: "default" },
			draft,
		)
		const beside = await store.createPluginSkill(
			{ kind: "bot", id: "default" },
			draft,
		)

		expect(created).toMatchObject({
			id: "baking-bread",
			...draft,
			isPreloaded: false,
		})
		expect(created.allowedTools).toBeNull()
		expect(beside.id).toBe("baking-bread-2")

		const marked = await store.setPluginSkillPreloaded(
			{ kind: "bot", id: "default" },
			created.id,
			true,
		)
		expect(marked.isPreloaded).toBe(true)

		const renamed = await store.updatePluginSkill(
			{ kind: "bot", id: "default" },
			created.id,
			{
				...draft,
				name: "Baking",
			},
		)
		expect(renamed).toEqual({ ...marked, name: "Baking" })

		await store.deletePluginSkill({ kind: "bot", id: "default" }, created.id)
		expect(await store.pluginSkills({ kind: "bot", id: "default" })).toEqual([
			beside,
			learn,
		])
		await expect(
			store.deletePluginSkill({ kind: "bot", id: "default" }, created.id),
		).rejects.toMatchObject({ kind: "unwritableBundle" })
		await expect(
			store.updatePluginSkill({ kind: "bot", id: "default" }, "learn", draft),
		).rejects.toMatchObject({ kind: "systemSkill", id: "learn" })
		await expect(
			store.createPluginSkill({ kind: "bot", id: "missing" }, draft),
		).rejects.toMatchObject({
			kind: "unknownBot",
			id: "missing",
		})
	})

	it("refuses a skill created on a space it never held and keeps the person's", async () => {
		const store = createFakeTranscriptStore()
		const draft = {
			name: "house-style",
			description: "How we write",
			body: "Short answers.",
		}

		await expect(
			store.createPluginSkill({ kind: "space", id: "nowhere" }, draft),
		).rejects.toMatchObject({ kind: "unknownSpace", id: "nowhere" })
		expect(await store.pluginSkills({ kind: "space", id: "nowhere" })).toEqual(
			[],
		)
		await expect(
			store.createPluginSkill({ kind: "user" }, draft),
		).resolves.toMatchObject({ id: "house-style" })
	})

	it("writes and takes away a companion's mcp servers", async () => {
		const store = createFakeTranscriptStore()
		const atlas = { command: "atlas-mcp", args: ["--stdio"] }
		const ledger = { command: "ledger-mcp" }

		await store.setPluginMcpServer(
			{ kind: "bot", id: "default" },
			"atlas",
			atlas,
		)
		await store.setPluginMcpServer(
			{ kind: "bot", id: "default" },
			"ledger",
			ledger,
		)
		expect(
			await store.pluginMcpServers({ kind: "bot", id: "default" }),
		).toEqual([
			{ name: "atlas", config: atlas },
			{ name: "ledger", config: ledger },
		])

		const replaced = { command: "atlas-mcp", args: ["--http"] }
		expect(
			await store.setPluginMcpServer(
				{ kind: "bot", id: "default" },
				"atlas",
				replaced,
			),
		).toEqual({
			name: "atlas",
			config: replaced,
		})
		expect(
			await store.pluginMcpServers({ kind: "bot", id: "default" }),
		).toEqual([
			{ name: "atlas", config: replaced },
			{ name: "ledger", config: ledger },
		])

		await store.deletePluginMcpServer({ kind: "bot", id: "default" }, "atlas")
		expect(
			await store.pluginMcpServers({ kind: "bot", id: "default" }),
		).toEqual([{ name: "ledger", config: ledger }])
		await expect(
			store.deletePluginMcpServer({ kind: "bot", id: "default" }, "atlas"),
		).rejects.toMatchObject({ kind: "unwritableBundle" })
		await expect(
			store.setPluginMcpServer({ kind: "bot", id: "default" }, "atlas", [
				"atlas-mcp",
			] as unknown as Record<string, unknown>),
		).rejects.toMatchObject({ kind: "unwritableBundle" })
		await expect(
			store.setPluginMcpServer({ kind: "bot", id: "missing" }, "atlas", atlas),
		).rejects.toMatchObject({ kind: "unknownBot", id: "missing" })
	})

	it("resolves a message to the uri and the run that produced it", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)
		const run = await store.openRuntimeSession(
			FAKE_CHAT_ID,
			"default",
			3,
			null,
			null,
		)
		await store.recordProviderSession(
			FAKE_CHAT_ID,
			"default",
			run.id,
			"claude-7b21",
		)
		await store.openAssistantMessage(REPLY)
		await store.appendText(REPLY.id, "hi there")

		const prompt = await store.messageReference(FAKE_CHAT_ID, PROMPT.id)
		const answer = await store.messageReference(FAKE_CHAT_ID, REPLY.id)

		expect(prompt).toEqual({
			uri: `kiroshi://c/${FAKE_CHAT_ID}/m/${PROMPT.id}`,
			conversationId: FAKE_CHAT_ID,
			messageId: PROMPT.id,
			role: "user",
			seq: 1,
			createdAt: PROMPT.createdAt,
			excerpt: "hello",
			runtimeSessionId: null,
			providerSessionId: null,
		})
		expect(answer).toMatchObject({
			role: "assistant",
			excerpt: "hi there",
			runtimeSessionId: run.id,
			providerSessionId: "claude-7b21",
		})
	})

	it("has nothing to resolve for a message outside the conversation", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)

		expect(await store.messageReference(FAKE_CHAT_ID, "missing")).toBeNull()
		expect(await store.messageReference("elsewhere", PROMPT.id)).toBeNull()
	})

	it("cuts a long message down to an excerpt that says it was cut", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage({ ...PROMPT, content: "é".repeat(400) })

		const reference = await store.messageReference(FAKE_CHAT_ID, PROMPT.id)
		const excerpt = reference?.excerpt ?? ""

		expect([...excerpt]).toHaveLength(280)
		expect(excerpt.endsWith("…")).toBe(true)
	})

	it("hands back the pinned bubbles, newest message first", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)
		await store.openAssistantMessage(REPLY)

		await store.pinMessage(FAKE_CHAT_ID, PROMPT.id, 0, 10)
		await store.pinMessage(FAKE_CHAT_ID, REPLY.id, 2, 20)
		await store.pinMessage(FAKE_CHAT_ID, REPLY.id, 1, 30)

		const pinned = await store.pinnedMessages(FAKE_CHAT_ID)

		expect(
			pinned.map((pin) => [pin.message.id, pin.blockIndex, pin.pinnedAt]),
		).toEqual([
			[REPLY.id, 1, 30],
			[REPLY.id, 2, 20],
			[PROMPT.id, 0, 10],
		])
	})

	it("unpins one bubble and leaves the others of its message standing", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.openAssistantMessage(REPLY)
		await store.pinMessage(FAKE_CHAT_ID, REPLY.id, 0, 10)
		await store.pinMessage(FAKE_CHAT_ID, REPLY.id, 1, 20)

		await store.unpinMessage(FAKE_CHAT_ID, REPLY.id, 0)

		expect(
			(await store.pinnedMessages(FAKE_CHAT_ID)).map((pin) => pin.blockIndex),
		).toEqual([1])
	})

	it("drops a message from the pins once the reader unpins its last bubble", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)
		await store.pinMessage(FAKE_CHAT_ID, PROMPT.id, 0, 10)

		await store.unpinMessage(FAKE_CHAT_ID, PROMPT.id, 0)

		expect(await store.pinnedMessages(FAKE_CHAT_ID)).toEqual([])
	})

	it("refuses to pin a message another conversation holds", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn(TURN)
		await store.appendUserMessage(PROMPT)

		await expect(
			store.pinMessage("elsewhere", PROMPT.id, 0, 10),
		).rejects.toEqual({
			kind: "storage",
			failure: { kind: "sqlite", detail: "no such message" },
		})
		expect(await store.pinnedMessages(FAKE_CHAT_ID)).toEqual([])
	})

	it("frees every companion a deleted section held", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		await store.moveBotToSection("default", written.id)

		await store.deleteSection(written.id)

		expect((await store.bots("personal"))[0].sectionId).toBeNull()
		expect(await store.sections("personal")).toEqual([])
	})

	it("refuses a companion the section of another space", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const written = await store.createSection(elsewhere.id, "Callers")

		await expect(store.moveBotToSection("default", written.id)).rejects.toEqual(
			{ kind: "foreignSection", id: written.id },
		)
	})

	it("leaves a copy landing in another space out of every section", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const written = await store.createSection("personal", "Writers")
		await store.moveBotToSection("default", written.id)

		const copy = await store.duplicateBot("default", elsewhere.id)

		expect(copy.sectionId).toBeNull()
	})

	it("answers a different solo thread in each space a companion belongs to", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		await store.addBotToSpace("default", elsewhere.id)

		const home = await store.mainChat("default", "personal")
		const away = await store.mainChat("default", elsewhere.id)

		expect(home.id).not.toBe(away.id)
	})

	it("refuses a solo thread whose space does not hold the companion", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")

		await expect(store.mainChat("default", elsewhere.id)).rejects.toMatchObject(
			{ kind: "foreignBot", id: "default" },
		)
	})

	it("takes the picture off a companion described again without a path", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotAvatarImage("default", aPng())

		const bare = await store.updateBot("default", botIdentity())

		expect(bare.avatarImagePath).toBeNull()
	})
})

const aPng = () =>
	new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
