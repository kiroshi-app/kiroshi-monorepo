// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vitest"

import {
	dismissWindowRecovery,
	readWindowRecoveryToShow,
	recoveryScreenReasonOf,
} from "./window-recovery"

import {
	commands,
	type WindowDeathReason,
	type WindowRecovery,
} from "@/lib/bindings"

const SCREEN_REASON_BY_DEATH = {
	outOfMemory: "out-of-memory",
	crashed: "crash",
	killed: "crash",
	unresponsive: "crash",
	unknown: "crash",
} satisfies Record<WindowDeathReason, string>

const DEATH_REASONS = Object.keys(SCREEN_REASON_BY_DEATH) as WindowDeathReason[]

const EVERY_DEATH = DEATH_REASONS.flatMap((reason) =>
	[false, true].map((exhausted) => ({ reason, exhausted })),
)

const recoveryOf = (fact: Partial<WindowRecovery> = {}): WindowRecovery => ({
	reason: "crashed",
	deaths: 1,
	exhausted: false,
	occurredAtMs: 1_000,
	...fact,
})

const hostAnswers = (recovery: WindowRecovery | null) =>
	vi.spyOn(commands, "windowRecoveryRead").mockResolvedValue(recovery)

afterEach(() => {
	vi.restoreAllMocks()
	localStorage.clear()
})

it.each(EVERY_DEATH)(
	"maps a $reason death, exhausted $exhausted, to the screen reason of its death and never to gave-up",
	({ reason, exhausted }) => {
		expect(recoveryScreenReasonOf(recoveryOf({ reason, exhausted }))).toBe(
			SCREEN_REASON_BY_DEATH[reason],
		)
	},
)

it("maps no fact to no screen reason", () => {
	expect(recoveryScreenReasonOf(null)).toBeNull()
})

it("answers the fact the host holds when it was never dismissed", async () => {
	const recovery = recoveryOf()
	hostAnswers(recovery)

	expect(await readWindowRecoveryToShow()).toEqual(recovery)
})

it("answers nothing to show when the host holds no fact", async () => {
	hostAnswers(null)

	expect(await readWindowRecoveryToShow()).toBeNull()
})

it("logs a read the host rejects and answers nothing to show", async () => {
	const failure = new Error("host gone")
	vi.spyOn(commands, "windowRecoveryRead").mockRejectedValue(failure)
	const logged = vi.spyOn(console, "error").mockImplementation(() => {})

	expect(await readWindowRecoveryToShow()).toBeNull()
	expect(logged).toHaveBeenCalledWith(
		"window recovery read at start failed",
		failure,
	)
})

it("answers nothing to show for a dismissed fact read again, and shows the death that follows it", async () => {
	const dismissed = recoveryOf({ occurredAtMs: 1_000 })
	const next = recoveryOf({ occurredAtMs: 2_000 })
	dismissWindowRecovery(dismissed)

	hostAnswers(dismissed)
	expect(await readWindowRecoveryToShow()).toBeNull()

	hostAnswers(next)
	expect(await readWindowRecoveryToShow()).toEqual(next)
})
