import { describe, expect, it } from "vitest"

import type { OnboardingFlowState } from "./onboarding-flow-controller"
import {
	connectAccountOf,
	connectStepOf,
	onboardingScreenStepOf,
} from "./onboarding-screen"

const AWAY_FROM_SHOTO: OnboardingFlowState = {
	connection: null,
	round: 0,
	isBusy: false,
	isWithShoto: false,
	isAtAccount: false,
	shotoId: null,
	firstCompanion: null,
}

const WITH_SHOTO: OnboardingFlowState = {
	...AWAY_FROM_SHOTO,
	isWithShoto: true,
	shotoId: "bot-shoto",
}

describe("the onboarding screen shown", () => {
	it.each(["welcome", "connect", "import", "account"] as const)(
		"shows the %s step in place of the workspace",
		(step) => {
			expect(onboardingScreenStepOf(step, AWAY_FROM_SHOTO)).toBe(step)
		},
	)

	it("shows the workspace once the onboarding is done", () => {
		expect(onboardingScreenStepOf("done", AWAY_FROM_SHOTO)).toBeNull()
	})

	it("holds Account once Shoto marked the first run done, whatever the host read says", () => {
		expect(
			onboardingScreenStepOf("done", { ...AWAY_FROM_SHOTO, isAtAccount: true }),
		).toBe("account")
	})

	it("shows the workspace while the person talks to Shoto", () => {
		expect(onboardingScreenStepOf("connect", WITH_SHOTO)).toBeNull()
	})
})

describe("the connect step drawn", () => {
	it("offers the login found in Claude Code", () => {
		const found = {
			state: "detected",
			email: "reader@example.com",
			plan: "Max",
		} as const

		expect(connectStepOf(found, false)).toBe("loginFound")
		expect(connectAccountOf(found)).toEqual({
			email: "reader@example.com",
			initials: "R",
			plan: "Max",
		})
	})

	it("draws no account card for a login with no plan", () => {
		expect(
			connectAccountOf({ state: "detected", email: "a@b.c", plan: null }),
		).toBeUndefined()
	})

	it("asks for the code, then shows it checked while it is sent", () => {
		const waiting = {
			state: "waiting",
			signInUrl: "https://claude.ai",
		} as const

		expect(connectStepOf(waiting, false)).toBe("waitingForCode")
		expect(connectStepOf(waiting, true)).toBe("connecting")
	})

	it("names the failure of a sign-in and of a key", () => {
		expect(
			connectStepOf(
				{ state: "signInFailed", exitDetail: "", failure: "linkRefused" },
				false,
			),
		).toBe("linkRefused")
		expect(
			connectStepOf({ state: "apiKeyFailed", exitDetail: "" }, false),
		).toBe("keyRefused")
	})

	it("offers the two ways in when nothing is found, and the key field", () => {
		expect(connectStepOf({ state: "offer" }, false)).toBe("nothingFound")
		expect(connectStepOf({ state: "apiKey" }, false)).toBe("keyField")
	})
})
