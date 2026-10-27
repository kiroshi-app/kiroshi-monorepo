// @vitest-environment happy-dom

import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BotSettingsValue } from "@workspace/ui/components/bot-settings"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	BOT_NAMES,
	newBotIdentity,
	toIdentity,
	toRosterBots,
	toSettingsValue,
} from "./bot-settings"
import { mountRoster } from "./mounted-roster"
import type { RosterController } from "./roster-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	leadOf,
	presentParticipants,
	unseatedBots,
} from "../conversations/roster-conversations"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const anEmptyStore = async (): Promise<TranscriptStore> => {
	const store = createFakeTranscriptStore()
	await store.deleteBot("default")
	return store
}

const opening = (
	lastRowId: string | null = null,
	spaceId = "personal",
	spaceIds: string[] = [spaceId],
) => ({
	spaces: spaceIds.map((id) => ({ spaceRowId: id, spaceId: id })),
	spaceRowId: spaceId,
	lastRowId,
})

const loaded = async (store: TranscriptStore) => {
	const controller = mountRoster(store)
	await controller.load(opening())
	return controller
}

const names = (bots: Bot[]) => bots.map((bot) => bot.name)

const edited = (
	value: BotSettingsValue,
	fields: Partial<BotSettingsValue>,
): BotSettingsValue => ({ ...value, ...fields })

const held = (controller: { getState: () => { bots: Bot[] } }, id: string) => {
	const bot = controller.getState().bots.find((entry) => entry.id === id)
	if (!bot) {
		throw new Error(`the roster does not hold ${id}`)
	}
	return bot
}

const reloaded = async (store: TranscriptStore) =>
	(await loaded(store)).getState()

const countingBots = (store: TranscriptStore) => {
	let count = 0
	const read = store.bots
	store.bots = (spaceId?: string | null) => {
		count += 1
		return read(spaceId)
	}
	return { count: () => count }
}

const seatedConversation = async (
	controller: RosterController,
	botIds: string[],
) => {
	const created = await controller.createConversation()
	for (const botId of botIds) {
		await controller.recruitToConversation(created?.id ?? "", botId)
	}
	return created
}

const leadIn = (conversation: Conversation) => leadOf(conversation)

const seatedIn = (conversation: Conversation) =>
	presentParticipants(conversation).map((seat) => seat.botId)

const faceIn = (conversation: Conversation, botId: string) => {
	const seat = conversation.participants.find(
		(participant) => participant.botId === botId,
	)
	if (!seat) {
		throw new Error(`no seat is held by ${botId}`)
	}
	return seat
}

let spoken = 0

const saidIn = async (
	store: TranscriptStore,
	conversationId: string,
	content: string,
) => {
	spoken += 1
	const turn = `turn-${spoken}`
	await store.startTurn({
		id: turn,
		conversationId,
		startedAt: spoken,
	})
	await store.appendUserMessage({
		id: `said-${spoken}`,
		conversationId,
		turnId: turn,
		authorBotId: null,
		repliedToMessageId: null,
		content,
		createdAt: spoken,
	})
	return { chatId: conversationId, turnId: turn, createdAt: spoken }
}

const saidTo = async (store: TranscriptStore, botId: string, content: string) =>
	saidIn(store, (await store.mainChat(botId)).id, content)

const answering = async (store: TranscriptStore, botId: string) => {
	const { chatId, turnId } = await saidTo(store, botId, "And?")
	await store.openAssistantMessage({
		id: `answer-${spoken}`,
		conversationId: chatId,
		turnId,
		authorBotId: botId,
		repliedToMessageId: null,
		createdAt: spoken,
	})
	await store.appendText(`answer-${spoken}`, "Still wri")
}

describe("createRosterController", () => {
	it("opens on the roster it finds and creates nothing", async () => {
		const store = createFakeTranscriptStore()
		const listed = vi.spyOn(store, "createBot")
		const controller = await loaded(store)

		const state = controller.getState()
		expect(names(state.bots)).toEqual(["Claude"])
		expect(state.selectedBotId).toBe("default")
		expect(listed).not.toHaveBeenCalled()
	})

	it("seats a drafted companion without moving the reader to it", async () => {
		const controller = await loaded(createFakeTranscriptStore())

		const written = await controller.createFromDraft({
			name: "Scout",
			job: "a research assistant",
			description: "Dig into the questions I bring.",
		})

		expect(names(controller.getState().bots)).toEqual(["Claude", "Scout"])
		expect(controller.getState().selectedBotId).toBe("default")
		expect(written.title).toBe("a research assistant")
	})

	it("refuses a drafted companion while the roster is in no space", async () => {
		const controller = mountRoster(createFakeTranscriptStore())

		await expect(
			controller.createFromDraft({
				name: "Scout",
				job: "a research assistant",
				description: "Dig into the questions I bring.",
			}),
		).rejects.toEqual({ kind: "unknownSpace", id: "" })
	})

	it("refuses a drafted companion the store turns down", async () => {
		const controller = await loaded(createFakeTranscriptStore())

		await expect(
			controller.createFromDraft({ name: " ", job: "", description: "" }),
		).rejects.toEqual({ kind: "namelessBot" })
	})

	it("opens on nothing when the record holds no companion", async () => {
		const controller = await loaded(await anEmptyStore())

		expect(controller.getState().bots).toEqual([])
		expect(controller.getState().selectedBotId).toBeNull()
	})

	it("opens on the companion it was left on when the roster still holds it", async () => {
		const store = createFakeTranscriptStore()
		const opened = await loaded(store)
		await opened.create()
		const left = opened.getState().selectedBotId

		const reopened = mountRoster(store)
		await reopened.load(opening(left))

		expect(left).not.toBe("default")
		expect(reopened.getState().selectedBotId).toBe(left)
	})

	it("opens on the first companion when the roster no longer holds that one", async () => {
		const store = createFakeTranscriptStore()
		const controller = mountRoster(store)

		await controller.load(opening("gone"))

		expect(controller.getState().selectedBotId).toBe("default")
	})

	it("says nothing has been read until the rows land", async () => {
		const controller = mountRoster(await anEmptyStore())

		expect(controller.getState().hasLoaded).toBe(false)

		await controller.load(opening())

		expect(controller.getState().hasLoaded).toBe(true)
	})

	it("waits on a refused read until a retry reads the roster", async () => {
		const store = createFakeTranscriptStore()
		const refusal = vi
			.spyOn(store, "bots")
			.mockRejectedValue(new Error("no record"))
		const controller = mountRoster(store)
		await controller.load(opening())
		expect(controller.getState().hasLoaded).toBe(false)

		refusal.mockRestore()
		await controller.retryLoad()

		expect(controller.getState().hasLoaded).toBe(true)
	})

	it("reports a roster it could not read instead of an empty sidebar", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "bots").mockRejectedValue(new Error("no record"))
		const controller = mountRoster(store)

		await controller.load(opening())

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the roster reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "bots").mockRejectedValueOnce(new Error("no record"))
		const controller = mountRoster(store)
		await controller.load(opening())

		await controller.load(opening())

		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("waits on the first read of the open space while it holds no roster", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "bots").mockReturnValue(new Promise(() => undefined))
		const controller = mountRoster(store)

		void controller.load(opening())
		await Promise.resolve()

		expect(controller.getState().isRosterPending).toBe(true)
	})

	it("keeps the roster it holds while it reads it again", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const reread = vi
			.spyOn(store, "bots")
			.mockReturnValue(new Promise(() => undefined))

		void controller.reload()

		await vi.waitFor(() => expect(reread).toHaveBeenCalled())
		expect(controller.getState().isRosterPending).toBe(false)
		expect(controller.getState().bots).not.toHaveLength(0)
	})

	it("stops waiting on the roster once its read fails", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "bots").mockRejectedValue(new Error("no record"))
		const controller = mountRoster(store)

		await controller.load(opening())

		expect(controller.getState().isRosterPending).toBe(false)
	})

	it("creates a companion immediately, selects it and leaves the settings closed", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.create()

		const state = controller.getState()
		expect(state.bots).toHaveLength(2)
		expect(state.selectedBotId).toBe(state.bots[1].id)
		expect(BOT_NAMES).toContain(state.bots[1].name)
		expect((await reloaded(store)).bots).toHaveLength(2)
	})

	it("appends the copy the store answers with and selects it", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.duplicate("default")

		const state = controller.getState()
		expect(state.bots).toHaveLength(2)
		expect(state.bots[1].name).toBe("Claude copy")
		expect(state.selectedBotId).toBe(state.bots[1].id)
		expect((await reloaded(store)).bots).toHaveLength(2)
	})

	it("leaves the roster as it was when the copy is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		vi.spyOn(store, "duplicateBot").mockRejectedValue(new Error("no room"))

		await controller.duplicate("default")

		const state = controller.getState()
		expect(state.bots.map((bot) => bot.id)).toEqual(["default"])
		expect(state.selectedBotId).toBe("default")
	})

	it("gives every companion it creates a tint no other companion is marked with", async () => {
		const controller = await loaded(await anEmptyStore())

		await controller.create()
		await controller.create()
		await controller.create()

		const worn = controller.getState().bots.map((bot) => bot.avatarBlot)
		expect(new Set(worn).size).toBe(worn.length)
	})

	it("writes what is typed and survives a reload", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = "default"
		const value = toSettingsValue(held(controller, id))

		controller.describe(
			id,
			edited(value, {
				name: "Nyx",
				title: "Reviewer",
				instructions: "Answer briefly.",
				model: "haiku",
				identity: { blot: "blue" },
			}),
		)
		expect(held(controller, id).name).toBe("Nyx")

		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0]).toMatchObject({
				name: "Nyx",
				title: "Reviewer",
				instructions: "Answer briefly.",
				model: "haiku",
				avatarBlot: 257,
			}),
		)
	})

	it("keeps a hue outside the presets when a companion is saved with its colour left alone", async () => {
		const store = createFakeTranscriptStore()
		const id = "default"
		const stored = held(await loaded(store), id)
		await store.updateBot(id, {
			...toIdentity(toSettingsValue(stored), stored),
			avatarBlot: 210,
		})
		const controller = await loaded(store)

		controller.describe(
			id,
			edited(toSettingsValue(held(controller, id)), { name: "Nyx" }),
		)

		expect(held(controller, id).avatarBlot).toBe(210)
		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0]).toMatchObject({
				name: "Nyx",
				avatarBlot: 210,
			}),
		)
	})

	it("coalesces a burst of edits into the write of the last value", async () => {
		const store = createFakeTranscriptStore()
		const written = vi.spyOn(store, "updateBot")
		const controller = await loaded(store)
		const value = toSettingsValue(held(controller, "default"))

		for (const name of ["N", "Ny", "Nyx"]) {
			controller.describe("default", edited(value, { name }))
		}

		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].name).toBe("Nyx"),
		)
		expect(written.mock.calls.length).toBeLessThan(3)
	})

	it("writes the style the reader picked without losing what was typed", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = "default"

		controller.describe(
			id,
			edited(toSettingsValue(held(controller, id)), { name: "Nyx" }),
		)
		controller.restyle(id, "default")
		expect(held(controller, id).outputStyle).toBe("default")

		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0]).toMatchObject({
				name: "Nyx",
				outputStyle: "default",
			}),
		)
	})

	it("takes the picture off when it is removed and keeps it when it is not", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

		await controller.uploadAvatar("default", {
			arrayBuffer: () => Promise.resolve(png.buffer),
		} as File)
		const worn = held(controller, "default").avatarImagePath
		expect(worn).not.toBeNull()

		controller.describe(
			"default",
			edited(toSettingsValue(held(controller, "default")), { name: "Nyx" }),
		)
		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].avatarImagePath).toBe(worn),
		)

		const value = toSettingsValue(held(controller, "default"))
		controller.describe("default", {
			...value,
			identity: { blot: "yellow" },
		})
		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].avatarImagePath).toBeNull(),
		)
	})

	it("holds the open thread once a companion is deleted", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		await controller.create()
		await controller.create()
		const [first, second, third] = controller.getState().bots
		controller.select(first.id)

		await controller.remove(second.id)

		const state = controller.getState()
		expect(state.bots.map((bot) => bot.id)).toEqual([first.id, third.id])
		expect(state.selectedBotId).toBe(first.id)
	})

	it("leaves nothing selected once the last companion is deleted", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		const [only] = controller.getState().bots

		await controller.remove(only.id)

		const state = controller.getState()
		expect(state.bots).toEqual([])
		expect(state.selectedBotId).toBeNull()
	})

	it("takes the transcript of the companion it deletes", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const chat = await store.mainChat("default")
		await store.startTurn({ id: "t1", conversationId: chat.id, startedAt: 1 })
		await store.appendUserMessage({
			id: "m1",
			conversationId: chat.id,
			turnId: "t1",
			authorBotId: null,
			repliedToMessageId: null,
			content: "hello",
			createdAt: 2,
		})

		await controller.remove("default")

		const page = await store.loadPage(chat.id, null)
		expect(page.messages).toEqual([])
	})

	it("holds the memory the command hands back and clears it through the same call", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.remember("default", "They bake on Sundays.")
		expect(held(controller, "default").memory).toBe("They bake on Sundays.")

		await controller.remember("default", "")
		expect(held(controller, "default").memory).toBe("")
	})

	it("keeps the memory a companion already had when the command refuses", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMemory("default", "They bake on Sundays.")
		const controller = await loaded({
			...store,
			setBotMemory: () => Promise.reject({ kind: "storage" }),
		})

		await controller.remember("default", "They ski.")

		expect(held(controller, "default").memory).toBe("They bake on Sundays.")
	})

	it("puts the reader back on what the store holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded({
			...store,
			updateBot: () =>
				Promise.reject({ kind: "storage", failure: { kind: "staleWrite" } }),
		})
		const value = toSettingsValue(held(controller, "default"))

		controller.describe("default", edited(value, { name: "Nyx" }))
		expect(held(controller, "default").name).toBe("Nyx")

		await vi.waitFor(() =>
			expect(held(controller, "default").name).toBe("Claude"),
		)
	})
})

describe("createRosterController on a space", () => {
	it("reads the roster of every space at launch", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const away = await store.createBot(newBotIdentity([]), elsewhere.id)
		const controller = mountRoster(store)

		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		const { rosters, bots } = controller.getState()
		expect(rosters.personal.map((bot) => bot.id)).toEqual(["default"])
		expect(rosters[elsewhere.id].map((bot) => bot.id)).toEqual([away.id])
		expect(bots.map((bot) => bot.id)).toEqual(["default"])
	})

	it("shows the roster it already holds when the reader lands on another space", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const away = await store.createBot(newBotIdentity([]), elsewhere.id)
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		controller.enter({
			spaceRowId: elsewhere.id,
			spaceId: elsewhere.id,
			lastRowId: null,
		})

		const state = controller.getState()
		expect(state.bots.map((bot) => bot.id)).toEqual([away.id])
		expect(state.selectedBotId).toBe(away.id)
		expect(state.isRosterPending).toBe(false)
	})

	it("selects nothing when the space it lands on holds no companion", async () => {
		const store = createFakeTranscriptStore()
		const empty = await store.createSpace("Vacances")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", empty.id]))

		controller.enter({
			spaceRowId: empty.id,
			spaceId: empty.id,
			lastRowId: null,
		})

		expect(controller.getState().bots).toEqual([])
		expect(controller.getState().selectedBotId).toBeNull()
	})

	it("holds an empty roster for a space it has never read", async () => {
		const store = createFakeTranscriptStore()
		const controller = mountRoster(store)
		await controller.load(opening())

		controller.enter({
			spaceRowId: "vacances",
			spaceId: "vacances",
			lastRowId: null,
		})

		expect(controller.getState().rosters.vacances).toEqual([])
	})

	it("drops the roster of a space that is no longer listed", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		await controller.load(opening(null, "personal"))

		expect(Object.keys(controller.getState().rosters)).toEqual(["personal"])
	})

	it("creates a companion in the space the reader is in and nowhere else", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(
			opening(null, elsewhere.id, ["personal", elsewhere.id]),
		)

		await controller.create()

		const { rosters, bots } = controller.getState()
		expect(bots).toHaveLength(1)
		expect(rosters[elsewhere.id]).toEqual(bots)
		expect(rosters.personal.map((bot) => bot.id)).toEqual(["default"])
		expect(await store.bots(elsewhere.id)).toEqual(bots)
	})

	it("lands the copy in the space it was sent to and opens that space on it", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		const copy = await controller.duplicate("default", elsewhere.id)

		const state = controller.getState()
		expect(copy?.name).toBe("Claude copy")
		expect(state.spaceRowId).toBe(elsewhere.id)
		expect(state.selectedBotId).toBe(copy?.id)
		expect(state.rosters[elsewhere.id].map((bot) => bot.id)).toEqual([copy?.id])
		expect(state.rosters.personal.map((bot) => bot.id)).toEqual(["default"])
	})

	it("stays where it is when the copy the other space was sent is refused", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))
		vi.spyOn(store, "duplicateBot").mockRejectedValue(new Error("no room"))

		const copy = await controller.duplicate("default", elsewhere.id)

		const state = controller.getState()
		expect(copy).toBeNull()
		expect(state.spaceRowId).toBe("personal")
		expect(state.selectedBotId).toBe("default")
		expect(state.rosters[elsewhere.id]).toEqual([])
		expect(state.rosters.personal.map((bot) => bot.id)).toEqual(["default"])
	})

	it("hands the companion over to the space it is moved to and opens that space on it", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const section = await store.createSection("personal", "Writers")
		await store.moveBotToSection("default", section.id)
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		const moved = await controller.moveToSpace("default", elsewhere.id)

		const state = controller.getState()
		expect(moved?.id).toBe("default")
		expect(state.spaceRowId).toBe(elsewhere.id)
		expect(state.selectedBotId).toBe("default")
		expect(state.rosters.personal).toEqual([])
		expect(state.rosters[elsewhere.id].map((bot) => bot.id)).toEqual([
			"default",
		])
		expect(state.rosters[elsewhere.id][0].sectionId).toBeNull()
		expect((await store.bots(elsewhere.id)).map((bot) => bot.id)).toEqual([
			"default",
		])
	})

	it("reads the rosters again when the move to another space is refused", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))
		vi.spyOn(store, "moveBotToSpace").mockRejectedValue(new Error("no room"))

		const moved = await controller.moveToSpace("default", elsewhere.id)

		const state = controller.getState()
		expect(moved).toBeNull()
		expect(state.spaceRowId).toBe("personal")
		expect(state.rosters.personal.map((bot) => bot.id)).toEqual(["default"])
		expect(state.rosters[elsewhere.id]).toEqual([])
	})

	it("writes nothing when the companion is already in the space it is moved to", async () => {
		const store = createFakeTranscriptStore()
		const controller = mountRoster(store)
		await controller.load(opening())
		const write = vi.spyOn(store, "moveBotToSpace")

		const moved = await controller.moveToSpace("default", "personal")

		expect(moved).toBeNull()
		expect(write).not.toHaveBeenCalled()
	})

	it("empties the seats a moved companion held in the space it leaves", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const room = await store.createConversation({
			spaceId: "personal",
			sectionId: null,
			title: "Launch",
			botIds: ["default"],
		})
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		await controller.moveToSpace("default", elsewhere.id)

		const left = controller.getState().conversationRosters.personal[0]
		expect(seatedIn(left)).toEqual([])
		expect(left.participants.map((seat) => seat.botId)).toContain("default")
		expect(seatedIn((await store.conversations("personal"))[0])).toEqual([])
		expect(room.id).toBe(left.id)
	})

	it("leaves the roster of the other spaces untouched when a companion is deleted", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const away = await store.createBot(newBotIdentity([]), elsewhere.id)
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		await controller.remove("default")

		const { rosters } = controller.getState()
		expect(rosters.personal).toEqual([])
		expect(rosters[elsewhere.id].map((bot) => bot.id)).toEqual([away.id])
	})
})

describe("createRosterController on memberships", () => {
	const acrossTwoSpaces = async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		await store.addBotToSpace("default", elsewhere.id)
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))
		return { store, elsewhere, controller }
	}

	it("lists a companion of several spaces in the roster of each", async () => {
		const { elsewhere, controller } = await acrossTwoSpaces()

		const { rosters } = controller.getState()

		expect(rosters.personal.map((bot) => bot.id)).toEqual(["default"])
		expect(rosters[elsewhere.id].map((bot) => bot.id)).toEqual(["default"])
	})

	it("answers the spaces a companion belongs to from the rosters it holds", async () => {
		const { elsewhere, controller } = await acrossTwoSpaces()

		expect(controller.spacesOfBot("default")).toEqual([
			"personal",
			elsewhere.id,
		])
	})

	it("previews the solo thread of the space each line sits in", async () => {
		const { store, elsewhere } = await acrossTwoSpaces()
		await saidIn(
			store,
			(await store.mainChat("default", "personal")).id,
			"Home",
		)
		await saidIn(
			store,
			(await store.mainChat("default", elsewhere.id)).id,
			"Away",
		)

		const listed = mountRoster(store)
		await listed.load(opening(null, "personal", ["personal", elsewhere.id]))

		const { previews } = listed.getState()
		expect(previews.personal?.default).toMatchObject({ text: "Home" })
		expect(previews[elsewhere.id]?.default).toMatchObject({ text: "Away" })
	})

	it("shows a companion in the space it is added to without reading every roster", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))
		const reads = countingBots(store)

		await controller.addToSpace("default", elsewhere.id)

		expect(
			controller.getState().rosters[elsewhere.id].map((bot) => bot.id),
		).toEqual(["default"])
		expect(reads.count()).toBe(0)
	})

	it("drops a companion from the space it is removed from without reading every roster", async () => {
		const { store, elsewhere, controller } = await acrossTwoSpaces()
		const reads = countingBots(store)

		await controller.removeFromSpace("default", elsewhere.id)

		expect(controller.getState().rosters[elsewhere.id]).toEqual([])
		expect(controller.getState().rosters.personal.map((bot) => bot.id)).toEqual(
			["default"],
		)
		expect(reads.count()).toBe(0)
	})

	it("says a companion has to stay in one space when its last one is refused", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const reportFailure = vi.fn()
		const controller = mountRoster(store, { reportFailure })
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		await controller.removeFromSpace("default", "personal")

		expect(controller.getState().rosters.personal.map((bot) => bot.id)).toEqual(
			["default"],
		)
		expect(reportFailure).toHaveBeenCalledWith({
			title: "A companion needs at least one space.",
		})
	})

	it("says nothing changed when a removal fails for another reason", async () => {
		const { store, elsewhere } = await acrossTwoSpaces()
		const reportFailure = vi.fn()
		const refusing = mountRoster(
			{
				...store,
				removeBotFromSpace: () => Promise.reject({ kind: "storage" }),
			},
			{ reportFailure },
		)
		await refusing.load(opening(null, "personal", ["personal", elsewhere.id]))

		await refusing.removeFromSpace("default", elsewhere.id)

		expect(
			refusing.getState().rosters[elsewhere.id].map((bot) => bot.id),
		).toEqual(["default"])
		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn’t remove this companion from the space. Retry.",
		})
	})
})

describe("createRosterController previews", () => {
	it("reads the last word of a companion outside the space it opens on", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const quiet = await store.createBot(newBotIdentity([]), elsewhere.id)
		const loud = await store.createBot(newBotIdentity([quiet]), elsewhere.id)
		await saidTo(store, quiet.id, "Pulled the three papers.")
		await saidTo(store, loud.id, "Rebuilding the bundle.")
		const controller = mountRoster(store)

		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		const { rosters, previews } = controller.getState()
		expect(previews[elsewhere.id]?.[loud.id]).toMatchObject({
			text: "Rebuilding the bundle.",
		})
		expect(
			toRosterBots(
				rosters[elsewhere.id],
				{ working: {}, previews: previews[elsewhere.id] ?? {} },
				0,
			).map((bot) => bot.id),
		).toEqual([loud.id, quiet.id])
	})

	it("reads the last word of every companion's conversation, not only the open one", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const [first, second] = controller.getState().bots
		await saidTo(store, first.id, "Pulled the three papers.")
		await saidTo(store, second.id, "Rebuilding the bundle.")

		const state = (await loaded(store)).getState()

		expect(state.previews.personal?.[first.id]).toMatchObject({
			text: "Pulled the three papers.",
		})
		expect(state.previews.personal?.[second.id]).toMatchObject({
			text: "Rebuilding the bundle.",
		})
	})

	it("reads when the last word was said", async () => {
		const store = createFakeTranscriptStore()
		const said = await saidTo(store, "default", "Pulled the three papers.")

		const state = (await loaded(store)).getState()

		expect(state.previews.personal?.default?.at).toBe(said.createdAt)
	})

	it("previews nothing for a companion nothing has been said to", async () => {
		const state = (await loaded(createFakeTranscriptStore())).getState()

		expect(state.previews.personal?.default).toBeUndefined()
	})

	it("holds the last settled message while the next one streams", async () => {
		const store = createFakeTranscriptStore()
		await saidTo(store, "default", "Pulled the three papers.")
		await answering(store, "default")

		const state = (await loaded(store)).getState()

		expect(state.previews.personal?.default).toMatchObject({ text: "And?" })
	})

	it("drops the preview of the companion it deletes and keeps every other", async () => {
		const store = createFakeTranscriptStore()
		const seeded = await loaded(store)
		await seeded.create()
		const [first, second] = seeded.getState().bots
		await saidTo(store, first.id, "Pulled the three papers.")
		await saidTo(store, second.id, "Rebuilding the bundle.")
		const controller = await loaded(store)

		await controller.remove(second.id)

		const { previews } = controller.getState()
		expect(previews.personal).not.toHaveProperty(second.id)
		expect(previews.personal?.[first.id]).toMatchObject({
			text: "Pulled the three papers.",
		})
	})

	it("reads every last word from the roster without opening a transcript", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const [first, second] = controller.getState().bots
		await saidTo(store, first.id, "Pulled the three papers.")
		await saidTo(store, second.id, "Rebuilding the bundle.")
		const transcriptReads = vi.spyOn(store, "loadPage")

		const state = (await loaded(store)).getState()

		expect(state.previews.personal?.[second.id]).toMatchObject({
			text: "Rebuilding the bundle.",
		})
		expect(transcriptReads).not.toHaveBeenCalled()
	})
	it("carries the section a companion is moved into", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		controller.moveToSection("default", "n-1")

		expect(held(controller, "default").sectionId).toBe("n-1")
	})

	it("carries no section for every companion a dropped section held", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const [first, second] = controller.getState().bots
		controller.moveToSection(first.id, "n-1")
		controller.moveToSection(second.id, "n-2")

		controller.clearSection("n-1")

		expect(held(controller, first.id).sectionId).toBeNull()
		expect(held(controller, second.id).sectionId).toBe("n-2")
	})
})

describe("createRosterController conversation previews", () => {
	const opened = async (store: TranscriptStore, title = "Launch") =>
		store.createConversation({
			spaceId: "personal",
			sectionId: null,
			title,
			botIds: ["default"],
		})

	it("reads the last word of every conversation it opens on", async () => {
		const store = createFakeTranscriptStore()
		const room = await opened(store)
		const quiet = await opened(store, "Idle")
		await saidIn(store, room.id, "Menu is set.")

		const state = (await loaded(store)).getState()

		expect(state.conversationPreviews[room.id]).toMatchObject({
			text: "Menu is set.",
		})
		expect(state.conversationPreviews[quiet.id]).toBeUndefined()
	})

	it("reads when the last word of a conversation was said", async () => {
		const store = createFakeTranscriptStore()
		const room = await opened(store)
		const said = await saidIn(store, room.id, "Menu is set.")

		const state = (await loaded(store)).getState()

		expect(state.conversationPreviews[room.id]?.at).toBe(said.createdAt)
	})

	it("reads the conversation again once the reader leaves it", async () => {
		const store = createFakeTranscriptStore()
		const room = await opened(store)
		const controller = await loaded(store)
		controller.selectConversation(room.id)
		await saidIn(store, room.id, "Menu is set.")

		controller.select("default")

		await vi.waitFor(() => {
			expect(controller.getState().conversationPreviews[room.id]).toMatchObject(
				{
					text: "Menu is set.",
				},
			)
		})
	})

	it("forgets the last word of the conversation it deletes", async () => {
		const store = createFakeTranscriptStore()
		const room = await opened(store)
		const other = await opened(store, "Dinner")
		await saidIn(store, room.id, "Menu is set.")
		await saidIn(store, other.id, "Table is booked.")
		const controller = await loaded(store)

		await controller.removeConversation(room.id)

		const { conversationPreviews } = controller.getState()
		expect(conversationPreviews).not.toHaveProperty(room.id)
		expect(conversationPreviews[other.id]).toMatchObject({
			text: "Table is booked.",
		})
	})

	it("reads the last word of every conversation without opening its transcript", async () => {
		const store = createFakeTranscriptStore()
		const room = await opened(store)
		await saidIn(store, room.id, "Menu is set.")
		const transcriptReads = vi.spyOn(store, "loadPage")

		const state = (await loaded(store)).getState()

		expect(state.conversationPreviews[room.id]).toMatchObject({
			text: "Menu is set.",
		})
		expect(transcriptReads).not.toHaveBeenCalled()
	})
})

describe("createRosterController on conversations", () => {
	it("hands the conversations of the space it opens, participants and all", async () => {
		const store = createFakeTranscriptStore()
		const talker = await store.createBot(newBotIdentity([]), "personal")
		const room = await store.createConversation({
			spaceId: "personal",
			sectionId: null,
			title: "Launch",
			botIds: ["default", talker.id],
		})
		const controller = mountRoster(store)

		await controller.load(opening())

		const { conversations } = controller.getState()
		expect(conversations.map((held) => held.id)).toEqual([room.id])
		expect(conversations[0].participants.map((held) => held.botId)).toEqual([
			"default",
			talker.id,
		])
	})

	it("holds the conversations of every space apart", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const away = await store.createBot(newBotIdentity([]), elsewhere.id)
		const room = await store.createConversation({
			spaceId: elsewhere.id,
			sectionId: null,
			title: "Launch",
			botIds: [away.id],
		})
		const controller = mountRoster(store)

		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		const { conversationRosters, conversations } = controller.getState()
		expect(conversations).toEqual([])
		expect(conversationRosters[elsewhere.id].map((held) => held.id)).toEqual([
			room.id,
		])
	})

	it("shows a created conversation in the roster and selects it", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		const created = await controller.createConversation()

		const state = controller.getState()
		expect(created?.title).toBe("")
		expect(created ? seatedIn(created) : null).toEqual([])
		expect(state.conversations.map((held) => held.id)).toEqual([created?.id])
		expect(state.selectedConversationId).toBe(created?.id)
		expect(state.selectedBotId).toBeNull()
	})

	it("seats the companions it is handed in the conversation it creates and selects", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		controller.select("default")

		const created = await controller.createConversation(["default"])

		const state = controller.getState()
		expect(created ? seatedIn(created) : null).toEqual(["default"])
		expect(state.selectedConversationId).toBe(created?.id)
		expect(state.selectedBotId).toBeNull()
	})

	it("keeps a created conversation after a reload", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		const state = await reloaded(store)

		expect(state.conversations.map((held) => held.id)).toEqual([created?.id])
	})

	it("leaves no companion selected while a conversation is selected", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		controller.select("default")
		expect(controller.getState().selectedConversationId).toBeNull()

		controller.selectConversation(created?.id ?? "")
		expect(controller.getState().selectedBotId).toBeNull()
	})

	it("carries the section a conversation is moved into", async () => {
		const store = createFakeTranscriptStore()
		const section = await store.createSection("personal", "Rooms")
		const controller = await loaded(store)
		const created = await controller.createConversation()

		await controller.moveConversationToSection(created?.id ?? "", section.id)

		expect(controller.getState().conversations[0].sectionId).toBe(section.id)
		expect((await store.conversations("personal"))[0].sectionId).toBe(
			section.id,
		)
	})

	it("carries no section for every conversation a dropped section held", async () => {
		const store = createFakeTranscriptStore()
		const section = await store.createSection("personal", "Rooms")
		const controller = await loaded(store)
		const created = await controller.createConversation()
		await controller.moveConversationToSection(created?.id ?? "", section.id)

		controller.clearSection(section.id)

		expect(controller.getState().conversations[0].sectionId).toBeNull()
	})

	it("opens the settings of the conversation it is asked about", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		controller.editConversation(created?.id ?? "")

		const state = controller.getState()
		expect(state.isEditingConversation).toBe(true)
		expect(state.settingsConversationId).toBe(created?.id)
	})

	it("holds the open thread when it opens the settings of a conversation", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()
		controller.select("default")

		controller.editConversation(created?.id ?? "")

		expect(controller.getState()).toMatchObject({
			selectedBotId: "default",
			selectedConversationId: null,
			settingsConversationId: created?.id,
			isEditingConversation: true,
		})
	})

	it("stores the name and the instructions that are written", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		controller.describeConversation(created?.id ?? "", {
			name: "Menu",
			instructions: "Stay short.",
		})
		expect(controller.getState().conversations[0].title).toBe("Menu")

		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0].title).toBe("Menu")
			expect(state.conversations[0].instructions).toBe("Stay short.")
		})
	})

	it("keeps the icon and the colour a conversation wears when it is renamed or moved", async () => {
		const store = createFakeTranscriptStore()
		const section = await store.createSection("personal", "Rooms")
		const created = await (await loaded(store)).createConversation()
		const id = created?.id ?? ""
		await store.updateConversation(id, {
			title: "Launch",
			instructions: "",
			sectionId: null,
			icon: "Message",
			color: 186,
		})
		const controller = await loaded(store)
		const sent = vi.spyOn(store, "updateConversation")

		controller.describeConversation(id, { name: "Menu", instructions: "" })
		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0].title).toBe("Menu")
		})
		await controller.moveConversationToSection(id, section.id)

		expect(sent.mock.calls.map(([, edit]) => [edit.icon, edit.color])).toEqual([
			["Message", 186],
			["Message", 186],
		])
		expect((await store.conversations("personal"))[0]).toMatchObject({
			title: "Menu",
			sectionId: section.id,
			icon: "Message",
			color: 186,
		})
	})

	it("shows at once and stores the icon and the colour picked, beside the name and the instructions", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = (await controller.createConversation())?.id ?? ""
		controller.describeConversation(id, {
			name: "Menu",
			instructions: "Stay short.",
		})

		controller.styleConversation(id, { icon: "Rocket" })
		controller.styleConversation(id, { color: 186 })

		expect(controller.getState().conversations[0]).toMatchObject({
			icon: "Rocket",
			color: 186,
		})
		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0]).toMatchObject({
				title: "Menu",
				instructions: "Stay short.",
				icon: "Rocket",
				color: 186,
			})
		})
	})

	it("stores a hue outside the presets unchanged and reads it back after a reload", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = (await controller.createConversation())?.id ?? ""

		controller.styleConversation(id, { color: 210 })

		expect(controller.getState().conversations[0].color).toBe(210)
		await vi.waitFor(async () =>
			expect((await reloaded(store)).conversations[0].color).toBe(210),
		)
	})

	it("stores no colour when none is picked", async () => {
		const store = createFakeTranscriptStore()
		const id = (await (await loaded(store)).createConversation())?.id ?? ""
		await store.updateConversation(id, {
			title: "Launch",
			instructions: "",
			sectionId: null,
			icon: "Message",
			color: 186,
		})
		const controller = await loaded(store)

		controller.styleConversation(id, { color: null })

		expect(controller.getState().conversations[0].color).toBeNull()
		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0]).toMatchObject({
				icon: "Message",
				color: null,
			})
		})
	})

	it("raises one notice and puts back the icon the store holds when the write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded({
			...store,
			updateConversation: () =>
				Promise.reject({ kind: "storage", failure: { kind: "staleWrite" } }),
		})
		const id = (await controller.createConversation())?.id ?? ""

		controller.styleConversation(id, { icon: "Rocket" })
		expect(controller.getState().conversations[0].icon).toBe("Rocket")

		await vi.waitFor(() => {
			expect(controller.getState().conversations[0].icon).toBeNull()
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title:
						"Couldn’t save your change to this conversation. Make it again to retry.",
				}),
			)
		})
		expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
	})

	it("stores the icon a naming carries with the title, in one write", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = (await controller.createConversation())?.id ?? ""
		const sent = vi.spyOn(store, "updateConversation")

		controller.nameConversation(id, { title: "Menu", icon: "Rocket" })

		expect(controller.getState().conversations[0]).toMatchObject({
			title: "Menu",
			icon: "Rocket",
		})
		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0]).toMatchObject({
				title: "Menu",
				icon: "Rocket",
			})
		})
		expect(sent).toHaveBeenCalledTimes(1)
	})

	it("keeps the icon a conversation wears when a naming brings another", async () => {
		const store = createFakeTranscriptStore()
		const id = (await (await loaded(store)).createConversation())?.id ?? ""
		await store.updateConversation(id, {
			title: "",
			instructions: "",
			sectionId: null,
			icon: "Message",
			color: null,
		})
		const controller = await loaded(store)

		controller.nameConversation(id, { title: "Menu", icon: "Rocket" })

		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0]).toMatchObject({
				title: "Menu",
				icon: "Message",
			})
		})
	})

	it("stores no icon when a naming brings none", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = (await controller.createConversation())?.id ?? ""

		controller.nameConversation(id, { title: "Menu", icon: null })

		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0]).toMatchObject({
				title: "Menu",
				icon: null,
			})
		})
	})

	it("stores the name a nameless conversation is given", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		controller.nameConversation(created?.id ?? "", {
			title: "Menu",
			icon: null,
		})
		expect(controller.getState().conversations[0].title).toBe("Menu")

		await vi.waitFor(async () => {
			const state = await reloaded(store)
			expect(state.conversations[0].title).toBe("Menu")
		})
	})

	it("leaves alone the name of a conversation that has one", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()
		controller.nameConversation(created?.id ?? "", {
			title: "Launch",
			icon: null,
		})

		controller.nameConversation(created?.id ?? "", {
			title: "Menu",
			icon: null,
		})

		expect(controller.getState().conversations[0].title).toBe("Launch")
	})

	it("moves the crown onto the participant it is given to", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		const created = await seatedConversation(controller, ["default", second.id])

		await controller.setConversationLead(created?.id ?? "", second.id)

		expect(leadIn(controller.getState().conversations[0])).toBe(second.id)
		expect(leadIn((await store.conversations("personal"))[0])).toBe(second.id)
	})

	it("carries a written name and avatar onto every seat the companion holds", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		await seatedConversation(controller, ["default", second.id])
		const value = toSettingsValue(held(controller, "default"))

		controller.describe(
			"default",
			edited(value, {
				name: "Nyx",
				identity: { blot: "blue" },
			}),
		)

		expect(
			faceIn(controller.getState().conversations[0], "default"),
		).toMatchObject({ name: "Nyx", avatarBlot: 257 })
		expect(faceIn(controller.getState().conversations[0], second.id).name).toBe(
			second.name,
		)
		await vi.waitFor(async () =>
			expect(
				faceIn((await store.conversations("personal"))[0], "default").name,
			).toBe("Nyx"),
		)
	})

	it("puts back on every seat the face the store holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded({
			...store,
			updateBot: () =>
				Promise.reject({ kind: "storage", failure: { kind: "staleWrite" } }),
		})
		await seatedConversation(controller, ["default"])
		const value = toSettingsValue(held(controller, "default"))

		controller.describe("default", edited(value, { name: "Nyx" }))
		expect(faceIn(controller.getState().conversations[0], "default").name).toBe(
			"Nyx",
		)

		await vi.waitFor(() =>
			expect(
				faceIn(controller.getState().conversations[0], "default").name,
			).toBe("Claude"),
		)
	})

	it("seats a recruited companion last and offers it no more", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		const created = await seatedConversation(controller, ["default"])

		await controller.recruitToConversation(created?.id ?? "", second.id)

		const room = controller.getState().conversations[0]
		expect(seatedIn(room)).toEqual(["default", second.id])
		expect(unseatedBots(controller.getState().bots, room)).toEqual([])
	})

	it("crowns the first companion seated in a conversation nobody is in", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		const created = await controller.createConversation()

		await controller.recruitToConversation(created?.id ?? "", second.id)
		await controller.recruitToConversation(created?.id ?? "", "default")

		const room = controller.getState().conversations[0]
		expect(seatedIn(room)).toEqual([second.id, "default"])
		expect(leadIn(room)).toBe(second.id)
	})

	it("seats nobody and names the refused companion when a seating fails", async () => {
		const store = createFakeTranscriptStore()
		const reportFailure = vi.fn()
		const refusing = mountRoster(
			{
				...store,
				addConversationParticipant: () => Promise.reject({ kind: "storage" }),
			},
			{ reportFailure },
		)
		await refusing.load(opening())
		const created = await refusing.createConversation()

		const seated = await refusing.recruitToConversation(
			created?.id ?? "",
			"default",
		)

		expect(seated).toBeNull()
		expect(reportFailure).toHaveBeenCalledWith({
			title: `Couldn’t bring ${refusing.getState().bots[0].name} into this conversation. Retry.`,
		})
		expect(seatedIn(refusing.getState().conversations[0])).toEqual([])
	})

	it("keeps a dismissed participant readable and out of the seats", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		const created = await seatedConversation(controller, ["default", second.id])

		await controller.dismissFromConversation(created?.id ?? "", second.id)

		const room = controller.getState().conversations[0]
		expect(seatedIn(room)).toEqual(["default"])
		expect(room.participants.map((seat) => seat.botId)).toContain(second.id)
	})

	it("empties the seats a deleted companion held and keeps it readable", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		await seatedConversation(controller, ["default", second.id])

		await controller.remove(second.id)

		const room = controller.getState().conversations[0]
		expect(seatedIn(room)).toEqual(["default"])
		expect(room.participants.map((seat) => seat.botId)).toContain(second.id)
		expect(seatedIn((await store.conversations("personal"))[0])).toEqual([
			"default",
		])
	})

	it("crowns the first companion still seated when the lead is dismissed", async () => {
		const store = createFakeTranscriptStore()
		const second = await store.createBot(newBotIdentity([]), "personal")
		const controller = await loaded(store)
		const created = await seatedConversation(controller, ["default", second.id])

		await controller.dismissFromConversation(created?.id ?? "", "default")

		expect(leadIn(controller.getState().conversations[0])).toBe(second.id)
	})

	it("shows what is stored when a settings command is refused", async () => {
		const store = createFakeTranscriptStore()
		await store.createConversation({
			spaceId: "personal",
			sectionId: null,
			title: "Launch",
			botIds: ["default"],
		})
		const controller = await loaded(store)

		await controller.setConversationLead(
			controller.getState().conversations[0].id,
			"stranger",
		)

		expect(controller.getState().conversations[0].title).toBe("Launch")
		expect(leadIn(controller.getState().conversations[0])).toBe("default")
	})

	it("closes the settings when the conversation it showed is gone", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()
		controller.editConversation(created?.id ?? "")

		await controller.removeConversation(created?.id ?? "")

		expect(controller.getState().isEditingConversation).toBe(false)
	})

	it("drops a deleted conversation and lands on the first row of the roster", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const created = await controller.createConversation()

		await controller.removeConversation(created?.id ?? "")

		const state = controller.getState()
		expect(state.conversations).toEqual([])
		expect(state.selectedConversationId).toBeNull()
		expect(state.selectedBotId).toBe("default")
		expect(await store.conversations("personal")).toEqual([])
	})

	it("selects the first row of the roster when the remembered conversation is gone", async () => {
		const store = createFakeTranscriptStore()
		const controller = mountRoster(store)

		await controller.load(opening("conversation-404"))

		expect(controller.getState().selectedBotId).toBe("default")
		expect(controller.getState().selectedConversationId).toBeNull()
	})

	it("selects again the conversation a space was left on", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const away = await store.createBot(newBotIdentity([]), elsewhere.id)
		const room = await store.createConversation({
			spaceId: elsewhere.id,
			sectionId: null,
			title: "Launch",
			botIds: [away.id],
		})
		const controller = mountRoster(store)
		await controller.load(opening(null, "personal", ["personal", elsewhere.id]))

		controller.enter({
			spaceRowId: elsewhere.id,
			spaceId: elsewhere.id,
			lastRowId: room.id,
		})

		expect(controller.getState().selectedConversationId).toBe(room.id)
		expect(controller.getState().selectedBotId).toBeNull()
	})
})
