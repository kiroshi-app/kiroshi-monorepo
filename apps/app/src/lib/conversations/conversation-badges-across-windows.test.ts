import { describe, expect, it } from "vitest"

import type { ConversationAnswer } from "./conversation-badge"
import { createConversationBadgeSource } from "./conversation-badge-source"
import { createSpokenWords } from "./spoken-words"
import { speakingBot } from "./transcript-fixtures"

import {
	type BadgeChannel,
	mirrorBadges,
	ownBadges,
	type SharedBadges,
	type WindowBadgeReport,
} from "../chat/badge-sharing"
import {
	createFakeBadgeChannel,
	createHeldBadgeChannel,
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
	onError?: (reason: unknown) => void
}

const openWindow = ({
	channel,
	label,
	isDriver,
	onError = () => {},
}: WindowOptions) => {
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
	const sharing = { source, channel, windowLabel: label, onError }
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

const spyOn =
	<Sent>(send: (sent: Sent) => Promise<void>, sents: Sent[]) =>
	(sent: Sent) => {
		sents.push(sent)
		return send(sent)
	}

const watchHeldChannel = () => {
	const held = createHeldBadgeChannel()
	const shares: SharedBadges[] = []
	const reports: WindowBadgeReport[] = []
	const channel = {
		...held.channel,
		share: spyOn(held.channel.share, shares),
		report: spyOn(held.channel.report, reports),
	}
	return { ...held, channel, shares, reports }
}

const openOwnerAndReader = async () => {
	const watched = watchHeldChannel()
	const main = openWindow({
		channel: watched.channel,
		label: "main",
		isDriver: true,
	})
	const second = openWindow({
		channel: watched.channel,
		label: "window-1",
		isDriver: false,
	})
	second.focus()
	second.open("room-one")
	watched.releaseReportListening()
	await settleWindows()
	return { ...watched, main, second }
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

	it("clears the space of the main window when the second window reads its room", async () => {
		const { main, second } = await openTwoWindows()
		main.open("room-two")
		second.open("room-two")
		await settleWindows()

		main.speakIn("room-three")
		await settleWindows()
		expect(main.spaceBadgeOf("work")).toBe("done")
		expect(second.spaceBadgeOf("work")).toBe("done")

		second.focus()
		second.open("room-three")
		await settleWindows()

		expect(main.spaceBadgeOf("work")).toBeUndefined()
		expect(second.spaceBadgeOf("work")).toBeUndefined()
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

	it("keeps the room a third window reads unlit after the takeover", async () => {
		const { channel, main, second } = await openTwoWindows()
		const third = openWindow({ channel, label: "window-2", isDriver: false })
		third.focus()
		third.open("room-one")
		await settleWindows()

		main.close()
		second.takeOver()
		await settleWindows()
		second.speakIn("room-one")
		await settleWindows()

		expect(second.badgeOf("room-one")).toBeUndefined()
		expect(third.badgeOf("room-one")).toBeUndefined()
	})

	it("hands the new owner the read of every other window in one report round", async () => {
		const channel = createFakeBadgeChannel()
		const reports: WindowBadgeReport[] = []
		const watched = { ...channel, report: spyOn(channel.report, reports) }
		const main = openWindow({ channel: watched, label: "main", isDriver: true })
		const second = openWindow({
			channel: watched,
			label: "window-1",
			isDriver: false,
		})
		const third = openWindow({
			channel: watched,
			label: "window-2",
			isDriver: false,
		})
		third.focus()
		third.open("room-one")
		await settleWindows()

		main.close()
		reports.length = 0
		second.takeOver()
		await settleWindows()

		expect(reports).toContainEqual({
			windowLabel: "window-2",
			readId: "room-one",
			changed: {},
		})
	})
})

describe("conversation badges across an owner reload and a late report listener", () => {
	it("names a reloaded owner apart from the owner it replaces", async () => {
		const { channel, shares, releaseReportListening } = watchHeldChannel()
		const main = openWindow({ channel, label: "main", isDriver: true })
		releaseReportListening()
		await settleWindows()

		main.close()
		openWindow({ channel, label: "main", isDriver: true })
		releaseReportListening()
		await settleWindows()

		expect(shares).toHaveLength(2)
		expect(new Set(shares.map(({ ownerId }) => ownerId)).size).toBe(2)
	})

	it("resends the read of the second window to a reloaded owner", async () => {
		const { channel, main, reports, releaseReportListening } =
			await openOwnerAndReader()
		reports.length = 0

		main.close()
		openWindow({ channel, label: "main", isDriver: true })
		releaseReportListening()
		await settleWindows()

		expect(reports).toContainEqual({
			windowLabel: "window-1",
			readId: "room-one",
			changed: {},
		})
	})

	it("sends no read for a further share of the owner it knows", async () => {
		const { main, second, reports } = await openOwnerAndReader()
		reports.length = 0

		main.speakIn("room-two")
		await settleWindows()

		expect(second.badgeOf("room-two")).toBe("done")
		expect(reports).toEqual([])
	})

	it("raises no badge for the room the second window reads after the owner reloads", async () => {
		const { channel, main, second, releaseReportListening } =
			await openOwnerAndReader()

		main.close()
		const reloaded = openWindow({ channel, label: "main", isDriver: true })
		releaseReportListening()
		await settleWindows()
		reloaded.speakIn("room-one")
		reloaded.answer("room-one")
		await settleWindows()

		expect(reloaded.badgeOf("room-one")).toBeUndefined()
		expect(second.badgeOf("room-one")).toBeUndefined()
	})

	it("shares nothing before the report listener is registered", async () => {
		const { channel, shares, releaseReportListening } = watchHeldChannel()
		const main = openWindow({ channel, label: "main", isDriver: true })
		const second = openWindow({ channel, label: "window-1", isDriver: false })
		main.speakIn("room-one")
		await settleWindows()
		expect(shares).toEqual([])

		releaseReportListening()
		await settleWindows()

		expect(second.badgeOf("room-one")).toBe("done")
	})

	it("clears in every window the read the second window sends on the first share", async () => {
		const { channel, releaseReportListening } = watchHeldChannel()
		const main = openWindow({ channel, label: "main", isDriver: true })
		const second = openWindow({ channel, label: "window-1", isDriver: false })
		second.focus()
		second.open("room-one")
		main.speakIn("room-one")
		await settleWindows()
		expect(main.badgeOf("room-one")).toBe("done")

		releaseReportListening()
		await settleWindows()

		expect(main.badgeOf("room-one")).toBeUndefined()
		expect(second.badgeOf("room-one")).toBeUndefined()
	})

	it("still shares the owner badges when the report listener is refused", async () => {
		const { channel, refuseReportListening } = watchHeldChannel()
		const errors: unknown[] = []
		const refusal = new Error("listen refused")
		const main = openWindow({
			channel,
			label: "main",
			isDriver: true,
			onError: (reason) => errors.push(reason),
		})
		const second = openWindow({ channel, label: "window-1", isDriver: false })
		refuseReportListening(refusal)
		await settleWindows()

		main.speakIn("room-one")
		await settleWindows()

		expect(errors).toEqual([refusal])
		expect(second.badgeOf("room-one")).toBe("done")
	})

	it("shares nothing and hears no read once stopped before the listener is registered", async () => {
		const { channel, shares, reports, releaseReportListening } =
			watchHeldChannel()
		const main = openWindow({ channel, label: "main", isDriver: true })
		main.close()
		releaseReportListening()
		await settleWindows()

		const second = openWindow({ channel, label: "window-1", isDriver: false })
		second.focus()
		second.open("room-one")
		await settleWindows()

		expect(reports).toContainEqual({
			windowLabel: "window-1",
			readId: "room-one",
			changed: {},
		})
		expect(shares).toEqual([])
	})
})
