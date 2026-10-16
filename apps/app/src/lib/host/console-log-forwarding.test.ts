import { invoke } from "@tauri-apps/api/core"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { forwardConsoleToLogFile } from "./console-log-forwarding"

import { createMissionEventRead } from "../missions/mission-event-read"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const logInvoke = vi.mocked(invoke)

const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const

const originals = { ...console }

const printed = () =>
	Object.fromEntries(
		CONSOLE_METHODS.map((method) => {
			const print = vi.fn()
			console[method] = print
			return [method, print]
		}),
	)

beforeEach(() => {
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {} })
	logInvoke.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
	vi.unstubAllGlobals()
	for (const method of CONSOLE_METHODS) {
		console[method] = originals[method]
	}
})

it("writes a warning to the log file and still prints it", () => {
	const devtools = printed()
	forwardConsoleToLogFile()

	console.warn("the host answered", { status: 503 })

	expect(devtools.warn).toHaveBeenCalledWith("the host answered", {
		status: 503,
	})
	expect(logInvoke).toHaveBeenCalledExactlyOnceWith("plugin:log|log", {
		level: 4,
		message: 'the host answered {"status":503}',
	})
})

it("writes an error to the log file with its stack and still prints it", () => {
	const devtools = printed()
	forwardConsoleToLogFile()
	const failure = new Error("reveal failed")

	console.error("reveal at start failed", failure)

	expect(devtools.error).toHaveBeenCalledWith("reveal at start failed", failure)
	expect(logInvoke).toHaveBeenCalledExactlyOnceWith("plugin:log|log", {
		level: 5,
		message: `reveal at start failed ${failure.stack}`,
	})
})

it("writes an info line to the log file at the Info level and still prints it", () => {
	const devtools = printed()
	forwardConsoleToLogFile()

	console.info("the relay reopened")

	expect(devtools.info).toHaveBeenCalledWith("the relay reopened")
	expect(logInvoke).toHaveBeenCalledExactlyOnceWith("plugin:log|log", {
		level: 3,
		message: "the relay reopened",
	})
})

it("writes the skip of a mission its side cannot read to the log file on one line", async () => {
	printed()
	forwardConsoleToLogFile()
	const read = createMissionEventRead({
		sideOfSpace: () => "garage",
		detailOn: () => Promise.reject({ kind: "unknownMission", id: "m-gone" }),
	})

	await read({ missionId: "m-gone", spaceId: "garage-space" })

	expect(logInvoke).toHaveBeenCalledExactlyOnceWith("plugin:log|log", {
		level: 3,
		message:
			"missions: skipped the change of a mission its side cannot read | mission: m-gone | space: garage-space | side: garage",
	})
})

it.each(["log", "debug"] as const)(
	"writes nothing to the log file for console.%s and still prints it",
	(method) => {
		const devtools = printed()
		forwardConsoleToLogFile()

		console[method]("invokes during boot")

		expect(devtools[method]).toHaveBeenCalledWith("invokes during boot")
		expect(logInvoke).not.toHaveBeenCalled()
	},
)

it("prints a write the log file refused without writing it again", async () => {
	const devtools = printed()
	const refusal = new Error("log plugin missing")
	logInvoke.mockRejectedValue(refusal)
	forwardConsoleToLogFile()

	console.warn("the host answered 503")

	await vi.waitFor(() =>
		expect(devtools.warn).toHaveBeenCalledWith(
			"log file write failed",
			refusal,
		),
	)
	expect(logInvoke).toHaveBeenCalledOnce()
})
