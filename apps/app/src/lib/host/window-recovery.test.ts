// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vitest"

import {
	readWindowRecoveryToShow,
	recoveryScreenReasonOf,
	reloadRecoveredWindow,
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

it.each(DEATH_REASONS)(
	"maps a %s death the host still reloads to the screen reason of its death",
	(reason) => {
		expect(recoveryScreenReasonOf(recoveryOf({ reason }))).toBe(
			SCREEN_REASON_BY_DEATH[reason],
		)
	},
)

it.each(DEATH_REASONS)(
	"maps a %s death with the retries exhausted to gave-up",
	(reason) => {
		expect(
			recoveryScreenReasonOf(recoveryOf({ reason, exhausted: true })),
		).toBe("gave-up")
	},
)

it("maps no fact to no screen reason", () => {
	expect(recoveryScreenReasonOf(null)).toBeNull()
})

it("answers the fact the host holds on the first page load after the death", async () => {
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

it("answers nothing to show on a second page load for the same death, Continue never pressed", async () => {
	const death = recoveryOf({ occurredAtMs: 1_000 })
	hostAnswers(death)

	expect(await readWindowRecoveryToShow()).toEqual(death)
	expect(await readWindowRecoveryToShow()).toBeNull()
})

it("answers a later death after an earlier one was shown", async () => {
	const later = recoveryOf({ occurredAtMs: 2_000 })
	hostAnswers(recoveryOf({ occurredAtMs: 1_000 }))
	await readWindowRecoveryToShow()

	hostAnswers(later)

	expect(await readWindowRecoveryToShow()).toEqual(later)
})

it("answers nothing to show on the page a reload boots, the fact reset under the same death", async () => {
	const givenUp = recoveryOf({ deaths: 3, exhausted: true })
	hostAnswers(givenUp)
	await readWindowRecoveryToShow()

	hostAnswers({ ...givenUp, deaths: 0, exhausted: false })

	expect(await readWindowRecoveryToShow()).toBeNull()
})

it("asks the host once to reload the window", async () => {
	const reload = vi
		.spyOn(commands, "windowRecoveryReload")
		.mockResolvedValue({ status: "ok", data: null })

	await reloadRecoveredWindow()

	expect(reload).toHaveBeenCalledTimes(1)
})

it("throws the error the host answers a reload with", async () => {
	vi.spyOn(commands, "windowRecoveryReload").mockResolvedValue({
		status: "error",
		error: { kind: "reloadFailed" },
	})

	await expect(reloadRecoveredWindow()).rejects.toEqual({
		kind: "reloadFailed",
	})
})
