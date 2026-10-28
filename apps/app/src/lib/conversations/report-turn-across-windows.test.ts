import { describe, expect, it } from "vitest"

import {
	type ConversationController,
	createConversationController,
} from "./conversation-controller"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { createFakeWindowEvents } from "./fake-window-events"
import { createScriptedDriver } from "./scripted-driver"
import { seatBots } from "./transcript-fixtures"

import { writeReportTurn } from "../routines/run-report"

const SPACE = "personal"

const REPORT = "Two tickets closed."

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

const createTwoWindows = async () => {
	const store = createFakeTranscriptStore()
	const [ada] = await seatBots(store, SPACE, ["Ada"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [ada.id],
	})
	const events = createFakeWindowEvents()
	const openWindow = async (label: string) => {
		let minted = 0
		const controller = createConversationController(
			withFakeHostWrites(createScriptedDriver(), store),
			store,
			{
				newId: () => {
					minted += 1
					return `${label}-${minted}`
				},
				now: () => minted,
				onMessageStored: events.onMessageStored,
				announceReportTurn: events.deliver,
			},
		)
		controller.attach()
		await controller.open(conversation)
		return controller
	}
	const driving = await openWindow("main")
	const watching = await openWindow("window-1")
	await settled()
	return { store, ada, conversation, events, driving, watching }
}

const countOf = (controller: ConversationController, content: string) =>
	controller.getState().messages.filter((shown) => shown.content === content)
		.length

describe("a report turn written in another window", () => {
	it("shows a stored message once in a window that did not write it", async () => {
		const { store, ada, conversation, events, watching } =
			await createTwoWindows()
		let minted = 0
		const reported = await writeReportTurn({
			store,
			draft: {
				conversationId: conversation.id,
				botId: ada.id,
				text: REPORT,
				runtimeSessionId: null,
			},
			newId: () => {
				minted += 1
				return `elsewhere-${minted}`
			},
			now: () => minted,
		})

		events.deliver(reported)
		await settled()

		expect(countOf(watching, REPORT)).toBe(1)
	})

	it("shows a run report once in both windows", async () => {
		const { ada, conversation, driving, watching } = await createTwoWindows()

		await driving.reportRun({
			conversationId: conversation.id,
			botId: ada.id,
			runtimeSessionId: "rs-1",
			text: REPORT,
			routineTitle: "OPE-1469",
			triggerSourceId: "mission",
		})
		await settled()

		expect(countOf(driving, REPORT)).toBe(1)
		expect(countOf(watching, REPORT)).toBe(1)
	})

	it("shows what a companion spoke once in both windows", async () => {
		const { store, ada, conversation, driving, watching } =
			await createTwoWindows()

		await driving.relaySpoken(
			{ conversationId: conversation.id, authorBotId: ada.id, text: REPORT },
			{ conversation, writes: store },
		)
		await settled()

		expect(countOf(driving, REPORT)).toBe(1)
		expect(countOf(watching, REPORT)).toBe(1)
	})
})
