import { describe, expect, it } from "vitest"

import type { BadgeSource } from "./badge-source"
import { createBotBadgeSource } from "./bot-badge-source"
import { type ChatState, initialChatState } from "./chat-state"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import {
	type RosterLine,
	rosterLineKey,
	rosterLinesIn,
	type SoloThreads,
} from "../bots/roster-line"

const HOME = "home"

const soloThreadOf = ({ spaceId, botId }: RosterLine) =>
	`chat-${spaceId}-${botId}`

const threadsIn = (rosters: Record<string, { id: string }[]>): SoloThreads =>
	Object.fromEntries(
		rosterLinesIn(rosters).map((line) => [soloThreadOf(line), line]),
	)

const badgeIn = (source: BadgeSource, botId: string, spaceId = HOME) =>
	source.getBadges()[rosterLineKey({ spaceId, botId })]

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

const createFakeChat = (threadOf: (botId: string) => string | null) => {
	const states = new Map<string, ChatState>()
	const listeners = new Set<() => void>()

	const openOn = (botId: string): ChatState => ({
		...initialChatState,
		conversationId: threadOf(botId),
	})

	return {
		stateFor: (botId: string) => states.get(botId) ?? openOn(botId),
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		publish: (botId: string, state: Partial<ChatState> = {}) => {
			states.set(botId, { ...openOn(botId), ...state })
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = (
	rosters: Record<string, { id: string }[]>,
	selectedBotId: string | null = null,
) => {
	const state = {
		rosters,
		selectedBotId,
		spaceRowId: HOME,
		soloThreads: threadsIn(rosters),
	}
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (botId: string | null) => {
			state.selectedBotId = botId
			publish()
		},
		hold: (held: Record<string, { id: string }[]>) => {
			state.rosters = held
			state.soloThreads = threadsIn(held)
			publish()
		},
	}
}

type HarnessOptions = {
	rosters?: Record<string, { id: string }[]>
	selectedBotId?: string | null
	hasFocus?: boolean
	runningIn?: Record<string, string>
}

const start = ({
	rosters = { [HOME]: [{ id: "bot-one" }] },
	selectedBotId = null,
	hasFocus = true,
	runningIn = {},
}: HarnessOptions = {}) => {
	const threadOf = (botId: string) => {
		const spaceId =
			runningIn[botId] ??
			rosterLinesIn(rosters).find((line) => line.botId === botId)?.spaceId
		return spaceId === undefined ? null : soloThreadOf({ spaceId, botId })
	}
	const chat = createFakeChat(threadOf)
	const roster = createFakeRoster(rosters, selectedBotId)
	let tellFocus: ((isFocused: boolean) => void) | undefined

	const source = createBotBadgeSource({
		chat,
		roster,
		hasFocus: () => hasFocus,
		watchFocus: (report) => {
			tellFocus = report
			report(hasFocus)
			return Promise.resolve(() => undefined)
		},
	})

	const stop = source.start()

	return {
		chat,
		roster,
		source,
		blur: () => tellFocus?.(false),
		focus: () => tellFocus?.(true),
		stop,
	}
}

const runs = { turn: "running" } as const
const idles = { turn: "idle" } as const
const fails = { turn: "failed" } as const

describe("createBotBadgeSource", () => {
	it("reports none until a companion's chat state changes", () => {
		const { source } = start()

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("reports no attention while only a question waits", () => {
		const { chat, source } = start()

		chat.publish("bot-one", { ...runs, question: question("q-1") })

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("leaves a waiting permission to the host and reports no attention", () => {
		const { chat, source } = start()

		chat.publish("bot-one", { ...runs, permission: permission("p-1") })

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("reports none while a turn runs", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("reports done when an unselected companion ends its turn", () => {
		const { chat, source } = start({ selectedBotId: "bot-two" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(badgeIn(source, "bot-one")).toBe("done")
	})

	it("reports failed when an unselected companion's turn fails", () => {
		const { chat, source } = start({ selectedBotId: "bot-two" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", fails)

		expect(badgeIn(source, "bot-one")).toBe("failed")
	})

	it("reports none when the selected companion ends its turn under focus", () => {
		const { chat, source } = start({ selectedBotId: "bot-one" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("reports done when the selected companion ends its turn without focus", () => {
		const { chat, blur, source } = start({ selectedBotId: "bot-one" })

		blur()
		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(badgeIn(source, "bot-one")).toBe("done")
	})

	it("drops the badge of the selected companion when the window comes back", () => {
		const { chat, blur, focus, source } = start({ selectedBotId: "bot-one" })

		blur()
		chat.publish("bot-one", runs)
		chat.publish("bot-one", fails)
		focus()

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("keeps the badge of an unselected companion when the window comes back", () => {
		const { chat, blur, focus, source } = start({ selectedBotId: "bot-two" })

		blur()
		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		focus()

		expect(badgeIn(source, "bot-one")).toBe("done")
	})

	it("keeps every badge when the window loses focus", () => {
		const { chat, blur, source } = start({ selectedBotId: "bot-two" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		blur()

		expect(badgeIn(source, "bot-one")).toBe("done")
	})

	it("drops done when the companion becomes the selected companion", () => {
		const { chat, roster, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		roster.select("bot-one")

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("drops failed when the companion starts a new turn", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", fails)
		chat.publish("bot-one", runs)

		expect(badgeIn(source, "bot-one")).toBe("none")
	})

	it("badges a companion of another space", () => {
		const { chat, source } = start({
			rosters: { [HOME]: [{ id: "bot-one" }], work: [{ id: "bot-two" }] },
		})

		chat.publish("bot-two", runs)
		chat.publish("bot-two", idles)

		expect(badgeIn(source, "bot-two", "work")).toBe("done")
	})

	it("badges only the line of the space the running thread sits in", () => {
		const { chat, source } = start({
			rosters: { [HOME]: [{ id: "bot-one" }], work: [{ id: "bot-one" }] },
			runningIn: { "bot-one": "work" },
		})

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(badgeIn(source, "bot-one", "work")).toBe("done")
		expect(badgeIn(source, "bot-one")).toBeUndefined()
	})

	it("forgets a companion that leaves the roster", () => {
		const { chat, roster, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		roster.hold({ [HOME]: [] })

		expect(source.getBadges()).toEqual({})
	})

	it("holds the same badges reference until a badge changes", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)
		const held = source.getBadges()
		chat.publish("bot-one", { ...runs, messages: [] })

		expect(source.getBadges()).toBe(held)
	})

	it("tells listeners when a badge changes", () => {
		const { chat, source } = start()
		let calls = 0
		source.subscribe(() => {
			calls += 1
		})

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(calls).toBe(1)
	})

	it("stops reading chat once stopped", () => {
		const { chat, source, stop } = start()

		chat.publish("bot-one", runs)
		stop()
		chat.publish("bot-one", idles)

		expect(badgeIn(source, "bot-one")).toBe("none")
	})
})
