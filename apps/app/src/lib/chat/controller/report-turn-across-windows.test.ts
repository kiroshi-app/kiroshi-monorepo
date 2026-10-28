import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BOT, createHarness } from "./controller-fixtures"

import type { ChatController } from "../chat-controller"
import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../../conversations/fake-transcript-store"
import { createFakeWindowEvents } from "../../conversations/fake-window-events"

const REPORT = "Two tickets closed."

const countOf = (controller: ChatController, content: string) =>
	controller.getState().messages.filter((shown) => shown.content === content)
		.length

describe("a run report written in the main chat of another window", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("shows the report once in both windows", async () => {
		const store = createFakeTranscriptStore()
		const events = createFakeWindowEvents()
		const openWindow = async () => {
			const { controller } = createHarness({
				store,
				onMessageStored: events.onMessageStored,
				announceReportTurn: events.deliver,
			})
			await controller.open(BOT, null)
			await vi.runAllTimersAsync()
			return controller
		}
		const driving = await openWindow()
		const watching = await openWindow()

		await driving.reportRun({
			conversationId: FAKE_CHAT_ID,
			botId: BOT,
			runtimeSessionId: "rs-1",
			text: REPORT,
			routineTitle: "OPE-1469",
			triggerSourceId: "mission",
		})
		await vi.runAllTimersAsync()

		expect(countOf(driving, REPORT)).toBe(1)
		expect(countOf(watching, REPORT)).toBe(1)
	})
})
