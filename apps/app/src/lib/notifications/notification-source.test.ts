import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	createFakeNotificationPort,
	type FakeNotificationPort,
} from "./fake-notification-port"
import type { ConversationRound } from "./notification-policy"
import {
	type NotificationSourceOptions,
	type NotificationSourceSwitches,
	startNotificationSource,
} from "./notification-source"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import { type ChatState, initialChatState } from "../chat/chat-state"
import { createSpokenWords } from "../conversations/spoken-words"
import type { Conversation, Participant } from "../conversations/store-contract"
import { speakingBot } from "../conversations/transcript-fixtures"
import { hostOfflineOf } from "../host/host-offline"
import {
	createFakeMissions,
	type FakeMissions,
} from "../missions/fake-missions"
import type { MissionState } from "../missions/mission-contract"
import { aMission } from "../missions/mission-fixtures"

const BOT = { kind: "bot", id: "bot-one" } as const

const OTHER_BOT = { kind: "bot", id: "bot-two" } as const

const ROOM = { kind: "conversation", id: "room-one" } as const

const MISSION = { kind: "mission", id: "mission-1" } as const

const SPACE = "space-one"

const JOINED_SPACE = "garage-space"

const JOINED_HOST = "garage"

const HEARD_ON_THE_JOINED_HOST = { spaceId: JOINED_SPACE, hostId: JOINED_HOST }

const OTHER_SPACE = "space-two"

const ALL_ON: NotificationSourceSwitches = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const question = (id: string): QuestionRequest => ({
	id,
	questions: [
		{
			header: "Pick one",
			question: "Which branch?",
			options: [],
			multiSelect: false,
		},
	],
})

const permission = (id: string): PermissionRequest => ({
	id,
	toolName: "Bash",
	title: "Run npm test",
	detail: null,
})

const soloThreadOf = (botId: string) => `chat-${botId}`

const soloStateOf = (botId: string): ChatState => ({
	...initialChatState,
	conversationId: soloThreadOf(botId),
})

const createFakeChat = () => {
	const states = new Map<string, ChatState>()
	const listeners = new Set<() => void>()

	return {
		stateFor: (botId: string) => states.get(botId) ?? soloStateOf(botId),
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		listenerCount: () => listeners.size,
		publish: (botId: string, state: Partial<ChatState> = {}) => {
			states.set(botId, { ...soloStateOf(botId), ...state })
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const seatOf = (botId: string, name: string): Participant => ({
	botId,
	role: "assistant",
	joinedAt: 0,
	leftAt: null,
	name,
	avatarBlot: null,
	avatarImagePath: null,
	isDeleted: false,
})

const conversation = (
	id: string,
	title: string,
	participants: Participant[] = [],
): Conversation => ({
	id,
	spaceId: "space-one",
	sectionId: null,
	pinPosition: null,
	title,
	instructions: "",
	icon: null,
	color: null,
	createdAt: 0,
	updatedAt: 0,
	participants,
})

const createFakeRuntimes = () => {
	const rounds = new Map<string, ConversationRound>()
	const listeners = new Set<() => void>()

	return {
		heldFor: (conversationId: string) => {
			const round = rounds.get(conversationId)
			return round ? { getState: () => round } : null
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		listenerCount: () => listeners.size,
		release: (conversationId: string) => {
			rounds.delete(conversationId)
		},
		publish: (
			conversationId: string,
			round: Partial<ConversationRound> = {},
		) => {
			rounds.set(conversationId, {
				speakers: [],
				waitingBotIds: [],
				pendingPrompt: null,
				...round,
			})
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = (
	bots: { id: string; name: string }[],
	conversations: Conversation[] = [],
) => {
	const state = {
		bots,
		conversations,
		away: [] as { id: string; name: string }[],
	}

	return {
		getState: () => ({
			rosters: { [SPACE]: state.bots, [OTHER_SPACE]: state.away },
			conversations: state.conversations,
			conversationRosters: { [SPACE]: state.conversations },
		}),
		spaceOfConversation: (conversationId: string) =>
			state.bots.some((bot) => soloThreadOf(bot.id) === conversationId) ||
			state.conversations.some(
				(conversation) => conversation.id === conversationId,
			)
				? SPACE
				: undefined,
		subscribe: () => () => undefined,
		hostSpaceIdOf: (spaceRowId: string) => spaceRowId,
		select: vi.fn(),
		selectConversation: vi.fn(),
		hold: (held: { id: string; name: string }[]) => {
			state.bots = held
		},
		holdElsewhere: (held: { id: string; name: string }[]) => {
			state.away = held
		},
		holdConversations: (held: Conversation[]) => {
			state.conversations = held
		},
	}
}

const createFakeJoinedSpaces = () => ({
	getState: () => ({ joinedSpaces: [{ id: JOINED_HOST }] }),
	selectSpace: vi.fn(),
})

const createFakeWindowFocus = () => {
	let report: ((isFocused: boolean) => void) | undefined

	return {
		watch: (listener: (isFocused: boolean) => void) => {
			report = listener
			return Promise.resolve(() => {
				report = undefined
			})
		},
		isWatched: () => report !== undefined,
		tell: (isFocused: boolean) => report?.(isFocused),
	}
}

type Harness = {
	chat: ReturnType<typeof createFakeChat>
	runtimes: ReturnType<typeof createFakeRuntimes>
	roster: ReturnType<typeof createFakeRoster>
	spaces: { select: ReturnType<typeof vi.fn> }
	joinedSpaces: ReturnType<typeof createFakeJoinedSpaces>
	missions: FakeMissions
	notifications: FakeNotificationPort
	spokenWords: ReturnType<typeof createSpokenWords>
	windowFocus: ReturnType<typeof createFakeWindowFocus>
	playChime: ReturnType<typeof vi.fn>
	reportFailure: ReturnType<typeof vi.fn>
	stop: () => void
}

const start = async (
	options: Partial<NotificationSourceOptions> = {},
	bots = [{ id: "bot-one", name: "Nyx" }],
	conversations = [
		conversation("room-one", "Release", [seatOf("bot-one", "Nyx")]),
	],
): Promise<Harness> => {
	const chat = createFakeChat()
	const runtimes = createFakeRuntimes()
	const roster = createFakeRoster(bots, conversations)
	const spaces = { select: vi.fn() }
	const joinedSpaces = createFakeJoinedSpaces()
	const missions = createFakeMissions()
	const notifications = createFakeNotificationPort()
	const spokenWords = createSpokenWords()
	const windowFocus = createFakeWindowFocus()
	const playChime = vi.fn()
	const reportFailure = vi.fn()

	const stop = startNotificationSource({
		chat,
		runtimes,
		roster,
		spaces,
		joinedSpaces,
		missions,
		spokenWords,
		notifications,
		switches: () => ALL_ON,
		hasFocus: () => false,
		watchFocus: windowFocus.watch,
		raiseWindow: async () => undefined,
		playChime,
		reportFailure,
		...options,
	})
	await Promise.resolve()

	return {
		chat,
		runtimes,
		roster,
		spaces,
		joinedSpaces,
		missions,
		notifications,
		spokenWords,
		windowFocus,
		playChime,
		reportFailure,
		stop,
	}
}

type Heard = { spaceId: string | null; hostId: string | null }

const HEARD_HERE: Heard = { spaceId: null, hostId: null }

const escalate = async (
	harness: Harness,
	state: MissionState,
	{ spaceId, hostId }: Heard = HEARD_HERE,
) => {
	const mission = aMission({
		botId: "bot-one",
		originConversationId: soloThreadOf("bot-one"),
		state,
		spaceId,
	})
	harness.missions.hold({ mission, events: [] })
	harness.missions.change(
		{
			missionId: mission.id,
			spaceId,
			state,
			stateSeq: 2,
			isAgentRunning: false,
			lastActivityAt: null,
		},
		hostId,
	)
	await Promise.resolve()
	await Promise.resolve()
}

const seed = (harness: Harness, botId: string) => {
	harness.chat.publish(botId)
	harness.notifications.sent.length = 0
}

const seedRound = (
	harness: Harness,
	conversationId: string,
	round: Partial<ConversationRound> = {},
) => {
	harness.runtimes.publish(conversationId, round)
	harness.notifications.sent.length = 0
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("startNotificationSource", () => {
	it("sends the companion's name and what happened", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("compares every companion on the roster, not only the one being read", async () => {
		const harness = await start({}, [
			{ id: "bot-one", name: "Nyx" },
			{ id: "bot-two", name: "Ora" },
		])
		seed(harness, "bot-one")

		harness.chat.publish("bot-two", { permission: permission("p-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: OTHER_BOT, title: "Ora", body: "Wants your approval" },
		])
	})

	it("sends nothing for a companion the roster has never held", async () => {
		const harness = await start({}, [])
		harness.chat.publish("bot-ghost", { question: question("q-1") })
		harness.chat.publish("bot-ghost", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing on the first sight of a companion", async () => {
		const harness = await start()

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends on the window's focus rather than the document's", async () => {
		const harness = await start({ hasFocus: () => true })
		harness.windowFocus.tell(false)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("decides on the focus the window reported last", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		harness.windowFocus.tell(false)
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("decides on the document until the window has reported", async () => {
		const harness = await start({ hasFocus: () => true })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("reads the switches at each publish", async () => {
		const switches = { ...ALL_ON, notifyOnQuestion: false }
		const harness = await start({ switches: () => switches })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		switches.notifyOnQuestion = true
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("plays the chime once for a publish that told the reader anything", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", {
			question: question("q-1"),
			permission: permission("p-1"),
		})

		expect(harness.notifications.sent).toHaveLength(2)
		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("plays nothing for a publish that told the reader nothing", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one")

		expect(harness.playChime).not.toHaveBeenCalled()
	})

	it("notifies without the chime while the sound switch is off, and reads it at each publish", async () => {
		const switches = { ...ALL_ON, notifyWithSound: false }
		const harness = await start({ switches: () => switches })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		switches.notifyWithSound = true
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toHaveLength(2)
		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("shows the window and opens the companion the click carries", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })

		harness.notifications.activate(BOT)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
	})

	it("opens the companion the click carries even when the window stays behind", async () => {
		const raiseWindow = vi.fn(() => Promise.reject(new Error("window is gone")))
		const harness = await start({ raiseWindow })

		harness.notifications.activate(BOT)

		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
		expect(harness.spaces.select).toHaveBeenCalledWith("space-one")
	})

	it("opens the companion the click carries even when the reveal throws on the spot", async () => {
		const raiseWindow = vi.fn((): Promise<void> => {
			throw new Error("window is gone")
		})
		const harness = await start({ raiseWindow })

		harness.notifications.activate(BOT)

		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
		expect(harness.spaces.select).toHaveBeenCalledWith("space-one")
	})

	it("selects nothing when no space answers for the companion's thread", async () => {
		const harness = await start()
		harness.roster.hold([])

		harness.notifications.activate(BOT)

		expect(harness.roster.select).not.toHaveBeenCalled()
		expect(harness.spaces.select).not.toHaveBeenCalled()
	})

	it("selects the companion line before entering the space its thread sits in", async () => {
		const harness = await start()

		harness.notifications.activate(BOT)

		expect(harness.roster.select.mock.invocationCallOrder[0]).toBeLessThan(
			harness.spaces.select.mock.invocationCallOrder[0],
		)
	})

	it("shows the window and leaves the selection alone for a companion that is gone", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })
		harness.roster.hold([])

		harness.notifications.activate(BOT)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.select).not.toHaveBeenCalled()
	})

	it("names a companion running in a space that is not the one on screen", async () => {
		const harness = await start()
		harness.roster.hold([])
		harness.roster.holdElsewhere([{ id: "bot-away", name: "Vega" }])
		seed(harness, "bot-away")

		harness.chat.publish("bot-away", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([
			{
				target: { kind: "bot", id: "bot-away" },
				title: "Vega",
				body: "Asked you a question",
			},
		])
	})

	it("forgets the state of a companion the roster let go of", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.roster.hold([])
		harness.chat.publish("bot-one")
		harness.roster.hold([{ id: "bot-one", name: "Nyx" }])
		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("stops listening to the controller, the window and the click once disposed", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.stop()
		await Promise.resolve()
		harness.chat.publish("bot-one", { question: question("q-1") })
		harness.notifications.activate(BOT)

		expect(harness.chat.listenerCount()).toBe(0)
		expect(harness.runtimes.listenerCount()).toBe(0)
		expect(harness.windowFocus.isWatched()).toBe(false)
		expect(harness.notifications.sent).toEqual([])
		expect(harness.roster.select).not.toHaveBeenCalled()
	})
})

const askedIn = (harness: Harness, requestId: string) => {
	harness.runtimes.publish("thread-1", {
		pendingPrompt: {
			kind: "question",
			botId: "bot-one",
			request: question(requestId),
		},
	})
}

describe("startNotificationSource on a mission thread", () => {
	it("names the mission whose thread companion asks a question", async () => {
		const harness = await start()
		await escalate(harness, "working")
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Asked you a question on OPE-32" },
		])
	})

	it("names a mission the board carried before the first change", async () => {
		const missions = createFakeMissions()
		missions.place([aMission({ botId: "bot-one" })])
		const harness = await start({ missions })
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Asked you a question on OPE-32" },
		])
	})

	it("sends nothing while the window holds the focus", async () => {
		const harness = await start()
		await escalate(harness, "working")
		harness.windowFocus.tell(true)
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the question switch is off", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnQuestion: false }),
		})
		await escalate(harness, "working")
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends one notification while the same question stands", async () => {
		const harness = await start()
		await escalate(harness, "working")
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")
		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toHaveLength(1)
	})

	it("sends nothing once the mission is closed", async () => {
		const harness = await start()
		await escalate(harness, "working")
		harness.missions.hold({
			mission: aMission({ botId: "bot-one", state: "done", closedAt: 9 }),
			events: [],
		})
		harness.missions.change({
			missionId: "mission-1",
			spaceId: null,
			state: "done",
			stateSeq: 3,
			isAgentRunning: false,
			lastActivityAt: null,
		})
		await Promise.resolve()
		await Promise.resolve()
		seedRound(harness, "thread-1")

		askedIn(harness, "q-1")

		expect(harness.notifications.sent).toEqual([])
	})

	it("lands on the mission thread when the notification is clicked", async () => {
		const harness = await start()
		await escalate(harness, "working")
		seedRound(harness, "thread-1")
		askedIn(harness, "q-1")

		harness.notifications.activate(MISSION)

		await vi.waitFor(() =>
			expect(harness.missions.opened).toEqual([
				{ missionId: "mission-1", rowId: "bot-one", spaceId: "space-one" },
			]),
		)
	})
})

describe("startNotificationSource on a conversation", () => {
	it("names the conversation whose round has finished", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([
			{ target: ROOM, title: "Release", body: "Finished its turn" },
		])
	})

	it("sends nothing while a companion of the conversation is still speaking", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one", { speakers: [speakingBot("bot-two")] })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends one notification for a round several companions answered in turn", async () => {
		const harness = await start()
		seedRound(harness, "room-one", {
			speakers: [speakingBot("bot-one")],
			waitingBotIds: ["bot-two"],
		})

		harness.runtimes.publish("room-one", { waitingBotIds: ["bot-two"] })
		harness.runtimes.publish("room-one", { speakers: [speakingBot("bot-two")] })
		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([
			{ target: ROOM, title: "Release", body: "Finished its turn" },
		])
	})

	it("sends nothing for a conversation holding no runtime", async () => {
		const harness = await start()

		harness.chat.publish("bot-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing on the first sight of a conversation", async () => {
		const harness = await start()

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the finished turn switch is off", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnFinishedTurn: false }),
		})
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("plays the chime the sound switch asks for", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("shows the window and opens the conversation the click carries", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })

		harness.notifications.activate(ROOM)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.selectConversation).toHaveBeenCalledWith("room-one")
		expect(harness.roster.select).not.toHaveBeenCalled()
	})

	it("shows the window and leaves the selection alone for a conversation that is gone", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })
		harness.roster.holdConversations([])

		harness.notifications.activate(ROOM)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.selectConversation).not.toHaveBeenCalled()
	})

	it("forgets the round of a conversation whose runtime was let go", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.release("room-one")
		harness.runtimes.publish("room-two")
		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})
})

const REFUSAL = "no notification centre"

const aRefusedSend = (): FakeNotificationPort => {
	const notifications = createFakeNotificationPort()
	notifications.send = () => Promise.reject(new Error(REFUSAL))
	return notifications
}

describe("startNotificationSource when a subscription breaks", () => {
	it("raises a notice when the click subscription is refused", async () => {
		const notifications = createFakeNotificationPort()
		notifications.onActivate = () => Promise.reject(new Error("no listener"))

		const harness = await start({ notifications })

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title:
				"Notifications won’t open their conversation. Restart Kiroshi to fix it.",
			description: "no listener",
		})
	})

	it("raises a notice when the focus watch is refused", async () => {
		const harness = await start({
			watchFocus: () => Promise.reject(new Error("no window")),
		})

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title:
				"Notifications may show while you’re in Kiroshi. Restart Kiroshi to fix it.",
			description: "no window",
		})
	})

	it("raises a notice when the host refuses to show a notification", async () => {
		const harness = await start({ notifications: aRefusedSend() })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title:
				"Couldn’t show a notification. Check Kiroshi’s notification permission.",
			description: REFUSAL,
		})
	})

	it("raises one notice however many notifications the host refuses", async () => {
		const harness = await start({ notifications: aRefusedSend() })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()
		harness.chat.publish("bot-one", { permission: permission("p-1") })
		await Promise.resolve()

		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
	})

	it("raises no notice of its own when the host of the space is offline", async () => {
		const missions = createFakeMissions()
		const harness = await start({
			missions: {
				...missions,
				board: () =>
					Promise.reject(hostOfflineOf("the host of this space is offline")),
			},
		})
		await Promise.resolve()

		expect(harness.reportFailure).not.toHaveBeenCalled()
	})

	it("stays quiet while every subscription holds and every notification shows", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()

		expect(harness.reportFailure).not.toHaveBeenCalled()
	})
})

describe("startNotificationSource on missions", () => {
	it("names the companion and the ticket when a mission waits for a human", async () => {
		const harness = await start()

		await escalate(harness, "waiting_human")

		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Needs you on OPE-32" },
		])
	})

	it("names the companion and the ticket when a mission is ready to merge", async () => {
		const harness = await start()

		await escalate(harness, "ready_to_merge")

		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "OPE-32 is ready to merge" },
		])
	})

	it("raises one notification when the mission stays in that state", async () => {
		const harness = await start()

		await escalate(harness, "waiting_human")
		await escalate(harness, "waiting_human")

		expect(harness.notifications.sent).toHaveLength(1)
	})

	it("stays quiet while the window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)

		await escalate(harness, "waiting_human")

		expect(harness.notifications.sent).toEqual([])
		expect(harness.playChime).not.toHaveBeenCalled()
	})

	it("stays quiet on an escalation while the question switch is off", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnQuestion: false }),
		})

		await escalate(harness, "waiting_human")

		expect(harness.notifications.sent).toEqual([])
	})

	it("stays quiet on finished work while the finished turn switch is off", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnFinishedTurn: false }),
		})

		await escalate(harness, "ready_to_merge")

		expect(harness.notifications.sent).toEqual([])
	})

	it("stays quiet when a withheld state arrives again", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)

		await escalate(harness, "waiting_human")
		harness.windowFocus.tell(false)
		await escalate(harness, "waiting_human")

		expect(harness.notifications.sent).toEqual([])
	})

	it("stays quiet on the states the reader is not called for", async () => {
		const harness = await start()

		await escalate(harness, "waiting_bot")
		await escalate(harness, "working")
		await escalate(harness, "done")

		expect(harness.notifications.sent).toEqual([])
	})

	it("raises a failure notice when the mission cannot be read", async () => {
		const harness = await start()
		harness.missions.refuse("mission-1")

		harness.missions.change({
			missionId: "mission-1",
			spaceId: null,
			state: "waiting_human",
			stateSeq: 2,
			isAgentRunning: false,
			lastActivityAt: null,
		})

		await vi.waitFor(() =>
			expect(harness.reportFailure).toHaveBeenCalledTimes(1),
		)
		expect(harness.notifications.sent).toEqual([])
	})

	it("reads a mission heard on a joined host through the link of that host", async () => {
		const harness = await start()

		await escalate(harness, "waiting_human", HEARD_ON_THE_JOINED_HOST)

		expect(harness.missions.readSides).toEqual([["mission-1", JOINED_HOST]])
		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Needs you on OPE-32" },
		])
	})

	it("reads a mission heard on this computer on this computer and notifies it, whatever Space id a joined host shares", async () => {
		const harness = await start()

		await escalate(harness, "waiting_human", {
			spaceId: JOINED_SPACE,
			hostId: null,
		})

		expect(harness.missions.readSides).toEqual([["mission-1", null]])
		expect(harness.reportFailure).not.toHaveBeenCalled()
		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Needs you on OPE-32" },
		])
	})

	it("reads a mission of a local Space on this computer and notifies it, whichever Space is on screen", async () => {
		const harness = await start()

		await escalate(harness, "waiting_human", {
			spaceId: "workshop",
			hostId: null,
		})

		expect(harness.missions.readSides).toEqual([["mission-1", null]])
		expect(harness.notifications.sent).toEqual([
			{ target: MISSION, title: "Nyx", body: "Needs you on OPE-32" },
		])
	})

	it("skips a mission its side cannot read with one info line and no notice", async () => {
		const informed = vi
			.spyOn(console, "info")
			.mockImplementation(() => undefined)
		const harness = await start()
		vi.spyOn(harness.missions, "detail").mockRejectedValue({
			kind: "unknownMission",
			id: "mission-1",
		})

		await escalate(harness, "waiting_human", HEARD_ON_THE_JOINED_HOST)
		await Promise.resolve()

		expect(informed.mock.calls).toEqual([
			[
				`missions: skipped the change of a mission its side cannot read | mission: mission-1 | space: ${JOINED_SPACE} | side: ${JOINED_HOST}`,
			],
		])
		expect(harness.reportFailure).not.toHaveBeenCalled()
		expect(harness.notifications.sent).toEqual([])
		informed.mockRestore()
	})

	it("lands on a mission heard on a joined host by reading it through the link of that host", async () => {
		const harness = await start()
		await escalate(harness, "waiting_human", HEARD_ON_THE_JOINED_HOST)

		harness.notifications.activate(MISSION)
		await vi.waitFor(() =>
			expect(harness.joinedSpaces.selectSpace).toHaveBeenCalledWith(
				`joined:${JOINED_HOST}`,
			),
		)

		expect(harness.missions.readSides).toEqual([
			["mission-1", JOINED_HOST],
			["mission-1", JOINED_HOST],
		])
	})

	it("lands on a mission heard on this computer by reading it on this computer, whatever Space id a joined host shares", async () => {
		const harness = await start()
		await escalate(harness, "waiting_human", {
			spaceId: JOINED_SPACE,
			hostId: null,
		})

		harness.notifications.activate(MISSION)
		await vi.waitFor(() => expect(harness.missions.opened).toHaveLength(1))

		expect(harness.missions.readSides).toEqual([
			["mission-1", null],
			["mission-1", null],
		])
		expect(harness.reportFailure).not.toHaveBeenCalled()
	})

	it("names the room and the companion that spoke in it", async () => {
		const harness = await start()

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toEqual([
			{ target: ROOM, title: "Release", body: "Nyx said something" },
		])
	})

	it("sends one notification for one spoken word", async () => {
		const harness = await start()

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toHaveLength(1)
	})

	it("stays quiet on a spoken word while the host window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends a spoken word the host window is away from, whatever the document says", async () => {
		const harness = await start({ hasFocus: () => true })
		harness.windowFocus.tell(false)

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toHaveLength(1)
	})

	it("stays quiet on a spoken word when finished turns are not notified", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnFinishedTurn: false }),
		})

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toEqual([])
	})

	it("stays quiet on a spoken word from a room no roster shows", async () => {
		const harness = await start()

		harness.spokenWords.announce({
			conversationId: "room-ghost",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toEqual([])
	})

	it("stops reading spoken words when the mount goes away", async () => {
		const harness = await start()
		harness.stop()

		harness.spokenWords.announce({
			conversationId: "room-one",
			authorBotId: "bot-one",
		})

		expect(harness.notifications.sent).toEqual([])
	})
})
