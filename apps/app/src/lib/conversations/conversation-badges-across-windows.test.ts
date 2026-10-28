import { describe, expect, it } from "vitest"

import type { ConversationAnswer } from "./conversation-badge"
import { createConversationBadgeSource } from "./conversation-badge-source"
import { createSpokenWords } from "./spoken-words"
import { speakingBot } from "./transcript-fixtures"

import {
	type BadgeChannel,
	mirrorBadges,
	ownBadges,
} from "../chat/badge-sharing"
import {
	createFakeBadgeChannel,
	settleWindows,
} from "../chat/fake-badge-channel"
import { toSpaceBadges, withBadges } from "../chat/sidebar-badges"

const ROSTERS = {
	home: [{ id: "room-one" }, { id: "room-two" }],
	work: [{ id: "room-three" }],
}

const answering: ConversationAnswer = {
	speakers: [speakingBot("bot-one")],
	waitingBotIds: [],
	messages: [],
}

const answered: ConversationAnswer = {
	speakers: [],
	waitingBotIds: [],
	messages: [],
}

const createFakeRuntimes = () => {
	const answers = new Map<string, ConversationAnswer>()
	const listeners = new Set<() => void>()
	return {
		heldFor: (conversationId: string) => {
			const answer = answers.get(conversationId)
			return answer ? { getState: () => answer } : null
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		publish: (conversationId: string, answer: ConversationAnswer) => {
			answers.set(conversationId, answer)
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = () => {
	const state = {
		conversationRosters: ROSTERS,
		selectedConversationId: null as string | null,
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
		select: (conversationId: string | null) => {
			state.selectedConversationId = conversationId
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
	const runtimes = createFakeRuntimes()
	const roster = createFakeRoster()
	const spokenWords = createSpokenWords()
	let isFocused = false
	let tellFocus: (isFocused: boolean) => void = () => undefined

	const source = createConversationBadgeSource({
		runtimes,
		roster,
		spokenWords,
		hasFocus: () => isFocused,
		watchFocus: async (report) => {
			tellFocus = report
			return () => undefined
		},
	})
	const stopSource = source.start()
	const sharing = { source, channel, windowLabel: label, onError: () => {} }
	let stopSharing = isDriver ? ownBadges(sharing) : mirrorBadges(sharing)

	const focusOn = (focused: boolean) => {
		isFocused = focused
		tellFocus(focused)
	}

	return {
		badgeOf: (conversationId: string) =>
			withBadges([{ id: conversationId }], source.getBadges())[0]?.badge,
		spaceBadgeOf: (spaceId: string) =>
			toSpaceBadges({
				home: withBadges(ROSTERS.home, source.getBadges()),
				work: withBadges(ROSTERS.work, source.getBadges()),
			})[spaceId],
		open: (conversationId: string) => roster.select(conversationId),
		focus: () => focusOn(true),
		blur: () => focusOn(false),
		speakIn: (conversationId: string) =>
			spokenWords.announce({ conversationId, authorBotId: "bot-one" }),
		answer: (conversationId: string) => {
			runtimes.publish(conversationId, answering)
			runtimes.publish(conversationId, answered)
		},
		takeOver: () => {
			stopSharing()
			stopSharing = ownBadges(sharing)
		},
		close: () => {
			stopSharing()
			stopSource()
		},
	}
}

const openTwoWindows = async () => {
	const channel = createFakeBadgeChannel()
	const main = openWindow({ channel, label: "main", isDriver: true })
	const second = openWindow({ channel, label: "window-1", isDriver: false })
	await settleWindows()
	return { channel, main, second }
}

describe("conversation badges shared across windows", () => {
	it("lights the badge in both windows for a room no window shows", async () => {
		const { main, second } = await openTwoWindows()
		main.open("room-two")
		second.open("room-two")
		second.focus()
		await settleWindows()

		main.speakIn("room-three")
		await settleWindows()

		expect(main.badgeOf("room-three")).toBe("done")
		expect(second.badgeOf("room-three")).toBe("done")
		expect(main.spaceBadgeOf("work")).toBe("done")
		expect(second.spaceBadgeOf("work")).toBe("done")
	})

	it("raises no badge for a room the second window shows under focus", async () => {
		const { main, second } = await openTwoWindows()
		second.open("room-one")
		second.focus()
		await settleWindows()

		main.speakIn("room-one")
		main.answer("room-one")
		await settleWindows()

		expect(main.badgeOf("room-one")).toBeUndefined()
		expect(second.badgeOf("room-one")).toBeUndefined()
	})

	it("clears the second window when the main window reads", async () => {
		const { main, second } = await openTwoWindows()
		main.speakIn("room-one")
		await settleWindows()
		expect(second.badgeOf("room-one")).toBe("done")

		main.focus()
		main.open("room-one")
		await settleWindows()

		expect(main.badgeOf("room-one")).toBeUndefined()
		expect(second.badgeOf("room-one")).toBeUndefined()
	})

	it("clears the main window when the second window reads", async () => {
		const { main, second } = await openTwoWindows()
		main.speakIn("room-one")
		await settleWindows()
		expect(main.badgeOf("room-one")).toBe("done")

		second.focus()
		second.open("room-one")
		await settleWindows()

		expect(second.badgeOf("room-one")).toBeUndefined()
		expect(main.badgeOf("room-one")).toBeUndefined()
	})

	it("lights the main window for a room answered in the second window", async () => {
		const { main, second } = await openTwoWindows()

		second.answer("room-two")
		await settleWindows()

		expect(main.badgeOf("room-two")).toBe("done")
		expect(second.badgeOf("room-two")).toBe("done")
	})

	it("shows the lit badges to a window opened afterwards", async () => {
		const { channel, main } = await openTwoWindows()
		main.speakIn("room-one")
		await settleWindows()

		const third = openWindow({ channel, label: "window-2", isDriver: false })
		await settleWindows()

		expect(third.badgeOf("room-one")).toBe("done")
	})

	it("keeps lighting and clearing badges once the second window takes over", async () => {
		const { channel, main, second } = await openTwoWindows()
		const third = openWindow({ channel, label: "window-2", isDriver: false })
		main.speakIn("room-one")
		await settleWindows()

		main.close()
		second.takeOver()
		await settleWindows()
		expect(second.badgeOf("room-one")).toBe("done")
		expect(third.badgeOf("room-one")).toBe("done")

		second.speakIn("room-two")
		await settleWindows()
		expect(third.badgeOf("room-two")).toBe("done")

		third.focus()
		third.open("room-one")
		await settleWindows()
		expect(second.badgeOf("room-one")).toBeUndefined()
		expect(second.badgeOf("room-two")).toBe("done")
	})
})
