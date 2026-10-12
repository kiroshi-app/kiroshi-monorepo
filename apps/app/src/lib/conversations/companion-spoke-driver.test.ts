import { describe, expect, it } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import { startCompanionSpokeDriver } from "./companion-spoke-driver"
import {
	type ConversationRuntimes,
	createConversationRuntimes,
} from "./conversation-runtimes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { createScriptedDriver, type ScriptedDriver } from "./scripted-driver"
import { createSpokenWords, type SpokenWord } from "./spoken-words"
import type { Conversation, Space } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type { CompanionSpoke } from "./transcript-contract"
import { seatBots } from "./transcript-fixtures"

import {
	createRosterController,
	type RosterController,
} from "../bots/roster-controller"

const SPACE = "personal"

const settled = async () => {
	for (let round = 0; round < 60; round += 1) {
		await Promise.resolve()
	}
}

const idOf = (conversation: Conversation, name: string) => {
	const seat = conversation.participants.find(
		(participant) => participant.name === name,
	)
	if (!seat) {
		throw new Error(`no seat for ${name}`)
	}
	return seat.botId
}

type Room = {
	driver: ScriptedDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
	roster: RosterController
	conversation: Conversation
	notices: NoticeMessage[]
	spoken: SpokenWord[]
	announce: (spoken: CompanionSpoke) => Promise<void>
	stop: () => void
}

const createRoom = async (
	store: TranscriptStore = createFakeTranscriptStore(),
	driver: ScriptedDriver = createScriptedDriver(),
): Promise<Room> => {
	const bots = await seatBots(store, SPACE, ["Ada", "Nyx", "Rex"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const runtimes = createConversationRuntimes(driver, store)
	const roster = createRosterController(store, {
		reportFailure: () => undefined,
	})
	await roster.load({
		spaces: [{ spaceRowId: SPACE, spaceId: SPACE }],
		spaceRowId: SPACE,
		lastRowId: null,
	})
	const spokenWords = createSpokenWords()
	const spoken: SpokenWord[] = []
	spokenWords.subscribe((word) => {
		spoken.push(word)
	})
	const notices: NoticeMessage[] = []
	let heard: ((spoken: CompanionSpoke) => void) | null = null
	const stop = startCompanionSpokeDriver({
		runtimes,
		roster,
		spokenWords,
		companions: {
			onCompanionSpoke: (listener) => {
				heard = listener
				return Promise.resolve(() => {
					heard = null
				})
			},
		},
		reportFailure: (notice) => {
			notices.push(notice)
		},
	})
	await settled()

	const announce = async (spoken: CompanionSpoke) => {
		heard?.(spoken)
		await settled()
	}

	return {
		driver,
		store,
		runtimes,
		roster,
		conversation,
		notices,
		spoken,
		announce,
		stop,
	}
}

const answeringFirstReadWith = (
	store: TranscriptStore,
	first: () => Promise<Space[]>,
): TranscriptStore => {
	let reads = 0
	return {
		...store,
		spaces: () => {
			reads += 1
			return reads === 1 ? first() : store.spaces()
		},
	}
}

const spokenIn = async (store: TranscriptStore, conversationId: string) => {
	const page = await store.loadPage(conversationId, null)
	return page.messages
}

const openRoom = (
	store: TranscriptStore,
	seated: Conversation,
	title: string,
) =>
	store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title,
		botIds: seated.participants.map(({ botId }) => botId),
	})

const rosteredIdsIn = (roster: RosterController) =>
	(roster.getState().conversationRosters[SPACE] ?? []).map(({ id }) => id)

const refusingRosterAfterLoad = (store: TranscriptStore): TranscriptStore => {
	let reads = 0
	return {
		...store,
		bots: (spaceId) => {
			reads += 1
			return reads === 1
				? store.bots(spaceId)
				: Promise.reject(new Error("refused"))
		},
	}
}

const summonedBy = (driver: ScriptedDriver) =>
	driver.submissions.map(({ scope }) => scope.botId)

describe("a companion speaking in a room the front never opened", () => {
	it("writes its text as an assistant message of its author", async () => {
		const { store, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		const messages = await spokenIn(store, conversation.id)
		expect(
			messages.map(({ role, content, authorBotId }) => ({
				role,
				content,
				authorBotId,
			})),
		).toEqual([
			{ role: "assistant", content: "Walls are up.", authorBotId: ada },
		])
	})

	it("leaves the turn of that message without a cause", async () => {
		const { store, runtimes, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		const [spoken] = await spokenIn(store, conversation.id)
		const held = runtimes.runtimeFor(conversation.id)

		expect(held.getState().reportedCauses.get(spoken.turnId)).toBeUndefined()
	})

	it("stores the at-name of a seated companion as its mention token", async () => {
		const { store, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up. @Nyx, read it.",
		})

		const [spoken] = await spokenIn(store, conversation.id)
		expect(spoken.content).toBe(`Walls are up. <@${nyx}>, read it.`)
	})

	it("stores an at-name nobody answers to unchanged and summons nobody", async () => {
		const { driver, store, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up. @Zoe, read it.",
		})

		const [spoken] = await spokenIn(store, conversation.id)
		expect(spoken.content).toBe("Walls are up. @Zoe, read it.")
		expect(summonedBy(driver)).toEqual([])
	})

	it("summons every seated companion the text names", async () => {
		const { driver, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const rex = idOf(conversation, "Rex")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "@Nyx and @Rex, read the walls.",
		})

		expect(summonedBy(driver)).toEqual([nyx, rex])
		expect(driver.submissions[0].prompt).toContain(`<@${nyx}>`)
	})

	it("summons nobody when the text names no seated companion", async () => {
		const { driver, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(summonedBy(driver)).toEqual([])
	})

	it("writes nothing and raises no notice for an unknown conversation", async () => {
		const { driver, store, conversation, notices, announce } =
			await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: "conversation-ghost",
			authorBotId: ada,
			text: "Walls are up. @Nyx, read it.",
		})

		expect(await spokenIn(store, conversation.id)).toEqual([])
		expect(summonedBy(driver)).toEqual([])
		expect(notices).toEqual([])
	})

	it("raises a failure and writes on redelivery when the conversation cannot be read", async () => {
		const { store, conversation, notices, announce } = await createRoom(
			answeringFirstReadWith(createFakeTranscriptStore(), () =>
				Promise.reject(new Error("refused")),
			),
		)
		const ada = idOf(conversation, "Ada")
		const spoken: CompanionSpoke = {
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		}

		await announce(spoken)

		expect(notices).toHaveLength(1)
		expect(await spokenIn(store, conversation.id)).toEqual([])

		await announce({ ...spoken })

		expect(
			(await spokenIn(store, conversation.id)).map(({ content }) => content),
		).toEqual(["Walls are up."])
	})

	it("keeps an unknown conversation deduped when it later shows up", async () => {
		const { store, conversation, notices, announce } = await createRoom(
			answeringFirstReadWith(createFakeTranscriptStore(), () =>
				Promise.resolve([]),
			),
		)
		const ada = idOf(conversation, "Ada")
		const spoken: CompanionSpoke = {
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		}

		await announce(spoken)
		await announce({ ...spoken })

		expect(await spokenIn(store, conversation.id)).toEqual([])
		expect(notices).toEqual([])
	})

	it("raises a failure when companion messages cannot be listened to", async () => {
		const notices: NoticeMessage[] = []
		const store = createFakeTranscriptStore()
		startCompanionSpokeDriver({
			runtimes: createConversationRuntimes(createScriptedDriver(), store),
			roster: createRosterController(store, { reportFailure: () => undefined }),
			spokenWords: createSpokenWords(),
			companions: {
				onCompanionSpoke: () => Promise.reject(new Error("refused")),
			},
			reportFailure: (notice) => {
				notices.push(notice)
			},
		})
		await settled()

		expect(notices).toHaveLength(1)
	})

	it("writes nothing and raises no notice for an author holding no seat", async () => {
		const { driver, store, conversation, notices, announce } =
			await createRoom()

		await announce({
			conversationId: conversation.id,
			authorBotId: "bot-ghost",
			text: "Walls are up. @Nyx, read it.",
		})

		expect(await spokenIn(store, conversation.id)).toEqual([])
		expect(summonedBy(driver)).toEqual([])
		expect(notices).toEqual([])
	})

	it("writes one message and opens one wave for a payload delivered twice", async () => {
		const { driver, store, conversation, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const spoken: CompanionSpoke = {
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up. @Nyx, read it.",
		}

		await announce(spoken)
		await announce({ ...spoken })

		expect(await spokenIn(store, conversation.id)).toHaveLength(1)
		expect(summonedBy(driver)).toEqual([nyx])
	})

	it("summons nobody and raises a failure when the message cannot be written", async () => {
		const base = createFakeTranscriptStore()
		const { driver, conversation, notices, announce } = await createRoom({
			...base,
			openAssistantMessage: () => Promise.reject(new Error("refused")),
		})
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up. @Nyx, read it.",
		})

		expect(summonedBy(driver)).toEqual([])
		expect(notices).toHaveLength(1)
	})

	it("stops listening when the mount that started it goes away", async () => {
		const { store, conversation, announce, stop } = await createRoom()
		const ada = idOf(conversation, "Ada")

		stop()
		await settled()
		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(await spokenIn(store, conversation.id)).toEqual([])
	})

	it("reloads the roster for a room it does not show yet", async () => {
		const { store, roster, conversation, announce } = await createRoom()
		const opened = await openRoom(store, conversation, "Gates")
		const ada = idOf(opened, "Ada")

		await announce({
			conversationId: opened.id,
			authorBotId: ada,
			text: "Gates are up.",
		})

		expect(rosteredIdsIn(roster)).toContain(opened.id)
		expect(
			(await spokenIn(store, opened.id)).map(({ content }) => content),
		).toEqual(["Gates are up."])
	})

	it("leaves the selected row where the reader left it", async () => {
		const { store, roster, conversation, announce } = await createRoom()
		const opened = await openRoom(store, conversation, "Gates")
		const ada = idOf(opened, "Ada")
		const { selectedBotId, selectedConversationId } = roster.getState()

		await announce({
			conversationId: opened.id,
			authorBotId: ada,
			text: "Gates are up.",
		})

		expect(roster.getState().selectedBotId).toBe(selectedBotId)
		expect(roster.getState().selectedConversationId).toBe(
			selectedConversationId,
		)
	})

	it("announces the word it wrote", async () => {
		const { conversation, spoken, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(spoken).toEqual([
			{ conversationId: conversation.id, authorBotId: ada },
		])
	})

	it("announces a payload delivered twice once", async () => {
		const { conversation, spoken, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")
		const word: CompanionSpoke = {
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		}

		await announce(word)
		await announce({ ...word })

		expect(spoken).toHaveLength(1)
	})

	it("announces nothing for an author holding no seat", async () => {
		const { conversation, spoken, announce } = await createRoom()

		await announce({
			conversationId: conversation.id,
			authorBotId: "bot-ghost",
			text: "Walls are up.",
		})

		expect(spoken).toEqual([])
	})

	it("writes the word, raises a failure and announces nothing when the roster refuses to reload", async () => {
		const { store, conversation, notices, spoken, announce } = await createRoom(
			refusingRosterAfterLoad(createFakeTranscriptStore()),
		)
		const opened = await openRoom(store, conversation, "Gates")
		const ada = idOf(opened, "Ada")

		await announce({
			conversationId: opened.id,
			authorBotId: ada,
			text: "Gates are up.",
		})

		expect(
			(await spokenIn(store, opened.id)).map(({ content }) => content),
		).toEqual(["Gates are up."])
		expect(notices).toHaveLength(1)
		expect(spoken).toEqual([])
	})
})

type MemberMac = {
	store: TranscriptStore
	driver: ScriptedDriver
	storedTurnIds: Set<string>
}

const createMemberMac = (): MemberMac => {
	const host = createFakeTranscriptStore()
	const storedTurnIds = new Set<string>()
	const store: TranscriptStore = {
		...host,
		startTurn: (turn) => {
			storedTurnIds.add(turn.id)
			return host.startTurn(turn)
		},
	}
	const scripted = createScriptedDriver()
	const driver: ScriptedDriver = {
		...scripted,
		submitPrompt: (scope, prompt, turn) =>
			turn && storedTurnIds.has(turn.turnId)
				? scripted.submitPrompt(scope, prompt, turn)
				: Promise.reject(
						new Error("this command reaches outside the shared space"),
					),
	}
	return { store, driver, storedTurnIds }
}

describe("a room a companion opens on a member Mac", () => {
	it("prompts the companion it names under a turn the host stored", async () => {
		const member = createMemberMac()
		const { driver, runtimes, conversation, notices, announce } =
			await createRoom(member.store, member.driver)
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up. @Nyx, read it.",
		})

		expect(
			driver.submissions.map(({ scope, turn }) => [
				scope.botId,
				member.storedTurnIds.has(turn?.turnId ?? ""),
			]),
		).toEqual([[nyx, true]])
		expect(runtimes.runtimeFor(conversation.id).getState().latestError).toBe(
			null,
		)
		expect(notices).toEqual([])
	})
})
