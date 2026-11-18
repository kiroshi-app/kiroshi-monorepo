import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { TurnEnded } from "./contract"
import { createTurnEndHearing, hearTurnEnd, type TurnPlace } from "./turn-end"

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseTransientNotice: vi.fn(() => "notice"),
}))

const ON_SCREEN: TurnPlace = {
	heardIn: "a-path",
	conversationId: "a-conversation",
	isOnScreen: true,
}

const OFF_SCREEN: TurnPlace = { ...ON_SCREEN, isOnScreen: false }

const COMPLETED: TurnEnded = { sessionId: null, outcome: "completed" }

const CONNECTION_LOST: TurnEnded = {
	sessionId: null,
	outcome: "failed",
	failure: "noConnection",
}

const hearing = () => {
	const showConnectionLost = vi.fn()
	return { hear: createTurnEndHearing(showConnectionLost), showConnectionLost }
}

describe("createTurnEndHearing", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("shows the connection notice for a turn on screen that failed for no connection", () => {
		const { hear, showConnectionLost } = hearing()

		expect(hear(CONNECTION_LOST, ON_SCREEN)).toBe("connectionLost")
		expect(showConnectionLost).toHaveBeenCalledTimes(1)
	})

	it("shows one notice for several turns lost before any turn completes", () => {
		const { hear, showConnectionLost } = hearing()

		hear(CONNECTION_LOST, ON_SCREEN)
		hear(CONNECTION_LOST, { ...ON_SCREEN, heardIn: "another-path" })
		hear({ sessionId: null, outcome: "cancelled" }, ON_SCREEN)
		hear(CONNECTION_LOST, ON_SCREEN)

		expect(showConnectionLost).toHaveBeenCalledTimes(1)
	})

	it("shows nothing when a turn completes, then the notice again for the next lost turn", () => {
		const { hear, showConnectionLost } = hearing()

		hear(CONNECTION_LOST, ON_SCREEN)
		expect(hear(COMPLETED, ON_SCREEN)).toBe("completed")
		expect(showConnectionLost).toHaveBeenCalledTimes(1)

		hear(CONNECTION_LOST, ON_SCREEN)
		expect(showConnectionLost).toHaveBeenCalledTimes(2)
	})

	it("logs and shows nothing for a lost turn whose Space is not on screen", () => {
		const logged = vi.spyOn(console, "info").mockImplementation(() => undefined)
		const { hear, showConnectionLost } = hearing()

		expect(hear(CONNECTION_LOST, OFF_SCREEN)).toBe("connectionLost")

		expect(showConnectionLost).not.toHaveBeenCalled()
		expect(logged).toHaveBeenCalledWith(
			"a-path: a turn of conversation a-conversation ended for no connection in a Space that is not on screen",
		)
	})

	it("still shows the notice on screen after a lost turn off screen", () => {
		vi.spyOn(console, "info").mockImplementation(() => undefined)
		const { hear, showConnectionLost } = hearing()

		hear(CONNECTION_LOST, OFF_SCREEN)
		hear(CONNECTION_LOST, ON_SCREEN)

		expect(showConnectionLost).toHaveBeenCalledTimes(1)
	})

	it.each([
		["another failure", { failure: "providerError" }],
		["a null failure", { failure: null }],
		["no failure field", {}],
	] as const)("leaves a turn failed with %s to its path", (_name, failure) => {
		const { hear, showConnectionLost } = hearing()

		expect(
			hear({ sessionId: null, outcome: "failed", ...failure }, ON_SCREEN),
		).toBe("failed")
		expect(showConnectionLost).not.toHaveBeenCalled()
	})
})

describe("hearTurnEnd", () => {
	it("raises the Connection lost notice once per outage, and nothing when the replay completes", () => {
		hearTurnEnd(CONNECTION_LOST, ON_SCREEN)
		hearTurnEnd(CONNECTION_LOST, { ...ON_SCREEN, heardIn: "another-path" })
		hearTurnEnd(COMPLETED, ON_SCREEN)

		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
		expect(raiseTransientNotice).toHaveBeenCalledWith({
			type: "warning",
			title: i18n.t("chat:screen.notice.noConnection.title"),
			description: i18n.t("chat:screen.notice.noConnection.description"),
		})

		hearTurnEnd(CONNECTION_LOST, ON_SCREEN)

		expect(raiseTransientNotice).toHaveBeenCalledTimes(2)
	})
})
