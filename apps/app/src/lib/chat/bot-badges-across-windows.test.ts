import { describe, expect, it } from "vitest"

import { type BadgeChannel, mirrorBadges, ownBadges } from "./badge-sharing"
import { createBotBadgeSource } from "./bot-badge-source"
import { type ChatState, initialChatState } from "./chat-state"
import { createFakeBadgeChannel, settleWindows } from "./fake-badge-channel"
import { withLineBadges } from "./sidebar-badges"

const HOME = "home"

const ROSTERS = { [HOME]: [{ id: "bot-one" }, { id: "bot-two" }] }

const SOLO_THREADS = {
	"chat-bot-one": { spaceId: HOME, botId: "bot-one" },
	"chat-bot-two": { spaceId: HOME, botId: "bot-two" },
}

const createFakeChat = () => {
	const states = new Map<string, ChatState>()
	const listeners = new Set<() => void>()
	const openOn = (botId: string): ChatState => ({
		...initialChatState,
		conversationId: `chat-${botId}`,
	})
	const publish = (botId: string, turn: ChatState["turn"]) => {
		states.set(botId, { ...openOn(botId), turn })
		for (const listener of [...listeners]) {
			listener()
		}
	}
	return {
		stateFor: (botId: string) => states.get(botId) ?? openOn(botId),
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		finishTurn: (botId: string) => {
			publish(botId, "running")
			publish(botId, "idle")
		},
	}
}

const createFakeRoster = () => {
	const state = {
		rosters: ROSTERS,
		soloThreads: SOLO_THREADS,
		spaceRowId: HOME,
		selectedBotId: null as string | null,
	}
	const listeners = new Set<() => void>()
	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (botId: string) => {
			state.selectedBotId = botId
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

type WindowOptions = {
	channel: BadgeChannel
	label: string
	isDriver: boolean
}

const openWindow = ({ channel, label, isDriver }: WindowOptions) => {
	const chat = createFakeChat()
	const roster = createFakeRoster()
	let isFocused = false
	let tellFocus: (isFocused: boolean) => void = () => undefined

	const source = createBotBadgeSource({
		chat,
		roster,
		hasFocus: () => isFocused,
		watchFocus: async (report) => {
			tellFocus = report
			return () => undefined
		},
	})
	source.start()
	const sharing = { source, channel, windowLabel: label, onError: () => {} }
	if (isDriver) {
		ownBadges(sharing)
	} else {
		mirrorBadges(sharing)
	}

	return {
		badgeOf: (botId: string) =>
			withLineBadges([{ id: botId }], source.getBadges(), HOME)[0]?.badge,
		open: roster.select,
		focus: () => {
			isFocused = true
			tellFocus(true)
		},
		finishTurn: chat.finishTurn,
	}
}

const openTwoWindows = async () => {
	const channel = createFakeBadgeChannel()
	const main = openWindow({ channel, label: "main", isDriver: true })
	const second = openWindow({ channel, label: "window-1", isDriver: false })
	await settleWindows()
	return { main, second }
}

describe("bot badges shared across windows", () => {
	it("lights the main window for a turn ending in the second window", async () => {
		const { main, second } = await openTwoWindows()

		second.finishTurn("bot-one")
		await settleWindows()

		expect(main.badgeOf("bot-one")).toBe("done")
		expect(second.badgeOf("bot-one")).toBe("done")
	})

	it("clears the second window when the main window reads", async () => {
		const { main, second } = await openTwoWindows()
		main.finishTurn("bot-one")
		await settleWindows()
		expect(second.badgeOf("bot-one")).toBe("done")

		main.focus()
		main.open("bot-one")
		await settleWindows()

		expect(second.badgeOf("bot-one")).toBeUndefined()
	})

	it("clears the main window when the second window reads", async () => {
		const { main, second } = await openTwoWindows()
		main.finishTurn("bot-one")
		await settleWindows()

		second.focus()
		second.open("bot-one")
		await settleWindows()

		expect(main.badgeOf("bot-one")).toBeUndefined()
	})

	it("raises no badge for a bot the second window shows under focus", async () => {
		const { main, second } = await openTwoWindows()
		second.focus()
		second.open("bot-one")
		await settleWindows()

		main.finishTurn("bot-one")
		await settleWindows()

		expect(main.badgeOf("bot-one")).toBeUndefined()
		expect(second.badgeOf("bot-one")).toBeUndefined()
	})
})
