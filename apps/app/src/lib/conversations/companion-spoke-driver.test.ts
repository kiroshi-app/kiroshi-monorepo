// @vitest-environment happy-dom

import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { startCompanionSpokeDriver } from "./companion-spoke-driver"
import {
	type ConversationRuntimes,
	createConversationRuntimes,
} from "./conversation-runtimes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { readConversationInEverySpace } from "./read-conversation"
import { RefusedWrite } from "./refused-write"
import { createScriptedDriver, type ScriptedDriver } from "./scripted-driver"
import { createSpokenWords, type SpokenWord } from "./spoken-words"
import type { Conversation, Space } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type { CompanionSpoke } from "./transcript-contract"
import { seatBots } from "./transcript-fixtures"

import type { ReporterFacts, UnreportedFailureNotice } from "../failure-report"
import { mountRoster } from "../bots/mounted-roster"
import type { RosterController } from "../bots/roster-controller"
import type { ConversationSource } from "../host/conversation-provenance"

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

const SPACE = "personal"

const THIS_COMPUTER = null

const JOINED_HOST = "garage"

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
	notices: UnreportedFailureNotice[]
	facts: (ReporterFacts | undefined)[]
	spoken: SpokenWord[]
	announce: (spoken: CompanionSpoke) => Promise<void>
	stop: () => void
}

type Front = {
	runtimes: ConversationRuntimes
	roster: RosterController
	notices: UnreportedFailureNotice[]
	facts: (ReporterFacts | undefined)[]
	spoken: SpokenWord[]
	hear: (spoken: CompanionSpoke, side?: ConversationSource) => void
	stop: () => void
}

const startFront = async (
	store: TranscriptStore,
	driver: ScriptedDriver,
	onThisComputer: TranscriptStore = store,
): Promise<Front> => {
	const runtimes = createConversationRuntimes(driver, store)
	const roster = mountRoster(store, { reportFailure: () => undefined })
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
	const notices: UnreportedFailureNotice[] = []
	const facts: (ReporterFacts | undefined)[] = []
	let heard:
		| ((spoken: CompanionSpoke, side: ConversationSource) => void)
		| null = null
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
		thisComputer: {
			conversation: (conversationId) =>
				readConversationInEverySpace(onThisComputer, conversationId),
			writes: () => onThisComputer,
		},
		reportFailure: (notice, reported) => {
			notices.push(notice)
			facts.push(reported)
		},
	})
	await settled()

	const hear = (
		spoken: CompanionSpoke,
		side: ConversationSource = THIS_COMPUTER,
	) => {
		heard?.(spoken, side)
	}

	return { runtimes, roster, notices, facts, spoken, hear, stop }
}

const createRoom = async (
	store: TranscriptStore = createFakeTranscriptStore(),
): Promise<Room> => {
	const bots = await seatBots(store, SPACE, ["Ada", "Nyx", "Rex"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const driver = createScriptedDriver()
	const front = await startFront(store, driver)

	const announce = async (spoken: CompanionSpoke) => {
		front.hear(spoken)
		await settled()
	}

	return { ...front, driver, store, conversation, announce }
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
		const notices: UnreportedFailureNotice[] = []
		const store = createFakeTranscriptStore()
		startCompanionSpokeDriver({
			runtimes: createConversationRuntimes(createScriptedDriver(), store),
			roster: mountRoster(store, { reportFailure: () => undefined }),
			spokenWords: createSpokenWords(),
			companions: {
				onCompanionSpoke: () => Promise.reject(new Error("refused")),
			},
			thisComputer: {
				conversation: () => Promise.resolve(null),
				writes: () => store,
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

type SharedSpace = {
	store: TranscriptStore
	driver: ScriptedDriver
	member: Front
	ada: string
	nyx: string
	open: (title: string) => Promise<Conversation>
	hear: (spoken: CompanionSpoke) => Promise<void>
}

const createSharedSpace = async (): Promise<SharedSpace> => {
	const store = createFakeTranscriptStore()
	const driver = createScriptedDriver()
	const [ada, nyx, rex] = await seatBots(store, SPACE, ["Ada", "Nyx", "Rex"])
	const host = await startFront(store, driver)
	const member = await startFront(store, driver)

	const open = (title: string) =>
		store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title,
			botIds: [ada.id, nyx.id, rex.id],
		})

	const hear = async (spoken: CompanionSpoke) => {
		host.hear(spoken, THIS_COMPUTER)
		member.hear(spoken, JOINED_HOST)
		await settled()
	}

	return { store, driver, member, ada: ada.id, nyx: nyx.id, open, hear }
}

describe("a room a companion opens, heard by the host and by a member Mac", () => {
	it("starts one turn for the companion its opening message names", async () => {
		const { driver, ada, nyx, open, hear } = await createSharedSpace()
		const room = await open("Walls")

		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "@Nyx, read it.",
		})

		expect(summonedBy(driver)).toEqual([nyx])
	})

	it("stores its opening message once", async () => {
		const { store, ada, open, hear } = await createSharedSpace()
		const room = await open("Walls")

		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "@Nyx, read it.",
		})

		expect(
			(await spokenIn(store, room.id)).map(({ authorBotId }) => authorBotId),
		).toEqual([ada])
	})

	it("starts no turn when its opening message names nobody", async () => {
		const { driver, ada, open, hear } = await createSharedSpace()
		const room = await open("Walls")

		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(summonedBy(driver)).toEqual([])
	})

	it("starts one turn for the companion a later word names", async () => {
		const { driver, ada, nyx, open, hear } = await createSharedSpace()
		const room = await open("Walls")
		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "@Nyx, read it.",
		})

		expect(summonedBy(driver)).toEqual([nyx])
	})

	it("starts one turn per room for two rooms opened with the same words", async () => {
		const { driver, ada, nyx, open, hear } = await createSharedSpace()
		const first = await open("Walls")
		const second = await open("Walls")

		for (const room of [first, second]) {
			await hear({
				conversationId: room.id,
				authorBotId: ada,
				text: "@Nyx, read it.",
			})
		}

		expect(
			driver.submissions.map(({ scope }) => [
				scope.conversationId,
				scope.botId,
			]),
		).toEqual([
			[first.id, nyx],
			[second.id, nyx],
		])
	})

	it("still announces the word on the member Mac", async () => {
		const { member, ada, open, hear } = await createSharedSpace()
		const room = await open("Walls")

		await hear({
			conversationId: room.id,
			authorBotId: ada,
			text: "@Nyx, read it.",
		})

		expect(member.spoken).toEqual([
			{ conversationId: room.id, authorBotId: ada },
		])
		expect(member.notices).toEqual([])
	})
})

const FOREIGN_KEY_REFUSAL = {
	kind: "storage",
	failure: { kind: "sqlite", detail: "FOREIGN KEY constraint failed" },
}

const writesElsewhere = (store: TranscriptStore) => {
	const sent: string[] = []
	const refuse = (command: string) => () => {
		sent.push(command)
		return Promise.reject(FOREIGN_KEY_REFUSAL)
	}
	return {
		sent,
		store: {
			...store,
			startTurn: refuse("startTurn"),
			openAssistantMessage: refuse("openAssistantMessage"),
			appendText: refuse("appendText"),
			finalizeMessage: refuse("finalizeMessage"),
			completeTurn: refuse("completeTurn"),
		},
	}
}

const startOnThisComputer = async (onThisComputer: TranscriptStore) => {
	const [ada, nyx, rex] = await seatBots(onThisComputer, SPACE, [
		"Ada",
		"Nyx",
		"Rex",
	])
	const room = await onThisComputer.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [ada.id, nyx.id, rex.id],
	})
	return { ada: ada.id, room }
}

const infoLines = () => {
	const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
	return () => info.mock.calls.map(([line]) => String(line))
}

describe("a word heard on this computer while a joined space is active", () => {
	it("writes all five writes on this computer, never on the active space", async () => {
		const local = createFakeTranscriptStore()
		const { ada, room } = await startOnThisComputer(local)
		const active = writesElsewhere(local)
		const front = await startFront(active.store, createScriptedDriver(), local)

		front.hear({ conversationId: room.id, authorBotId: ada, text: "Up." })
		await settled()

		expect(
			(await spokenIn(local, room.id)).map(({ content }) => content),
		).toEqual(["Up."])
		expect(active.sent).toEqual([])
		expect(front.notices).toEqual([])
	})
})

describe("a word of a conversation gone from its side", () => {
	it("writes nothing, raises no card and logs one line naming the conversation and the bot", async () => {
		const lines = infoLines()
		const { store, conversation, notices, announce } = await createRoom()
		const ada = idOf(conversation, "Ada")
		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})
		await store.deleteConversation(conversation.id)

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Gates are up.",
		})

		expect(notices).toEqual([])
		expect(lines()).toHaveLength(1)
		expect(lines()[0]).toContain(`conversation: ${conversation.id}`)
		expect(lines()[0]).toContain(`bot: ${ada}`)
		expect(lines()[0]).toContain("reason: ")
	})

	it("takes the same path when a write answers that the conversation is unknown", async () => {
		const lines = infoLines()
		const base = createFakeTranscriptStore()
		const { spoken, conversation, notices, announce } = await createRoom({
			...base,
			startTurn: (turn) =>
				Promise.reject(
					new RefusedWrite("conversation_start_turn", turn.id, {
						kind: "unknownConversation",
						id: turn.conversationId,
					}),
				),
		})
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(notices).toEqual([])
		expect(spoken).toEqual([])
		expect(lines()).toHaveLength(1)
		expect(lines()[0]).toContain("conversation_start_turn")
	})
})

describe("a write of a spoken word that fails", () => {
	it("raises one card naming the command, the conversation, the bot and the turn", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const base = createFakeTranscriptStore()
		const { conversation, notices, facts, announce } = await createRoom({
			...base,
			openAssistantMessage: (message) =>
				Promise.reject(
					new RefusedWrite(
						"conversation_open_assistant_message",
						message.turnId,
						FOREIGN_KEY_REFUSAL,
					),
				),
		})
		const ada = idOf(conversation, "Ada")

		await announce({
			conversationId: conversation.id,
			authorBotId: ada,
			text: "Walls are up.",
		})

		expect(notices).toHaveLength(1)
		expect(facts[0]).toEqual({
			conversation: conversation.id,
			botId: ada,
			command: "conversation_open_assistant_message",
			turn: expect.any(String),
		})
	})

	it("shows the readable detail of the refusal, never [object Object]", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const base = createFakeTranscriptStore()
		const { conversation, notices, announce } = await createRoom({
			...base,
			startTurn: () => Promise.reject(FOREIGN_KEY_REFUSAL),
		})

		await announce({
			conversationId: conversation.id,
			authorBotId: idOf(conversation, "Ada"),
			text: "Walls are up.",
		})

		expect(notices.map(({ title }) => title)).toEqual([
			"Couldn’t send the message (storage: FOREIGN KEY constraint failed). Retry.",
		])
	})
})
