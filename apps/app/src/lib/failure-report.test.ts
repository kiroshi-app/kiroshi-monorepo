import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	formatFailureReport,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import {
	commands,
	type Diagnostics,
	type HostingChanged,
	type HostingState,
} from "./bindings"
import {
	buildFailureReport,
	type FailureFacts,
	failureReporterIn,
	raiseReportedFailure,
	reportLocalWhen,
} from "./failure-report"

import { createHostedSpaces } from "./host/hosted-spaces"
import { createHttpHost, raiseRefusalNotice } from "./host/http"

vi.mock("@tauri-apps/api/path", () => ({
	appLogDir: async () => "/Users/ada/Library/Logs/app.kiroshi",
	join: async (...parts: string[]) => parts.join("/"),
}))

vi.mock("./bindings", async (original) => {
	const bindings = await original<typeof import("./bindings")>()
	return {
		...bindings,
		commands: { ...bindings.commands, diagnostics: vi.fn(), logTail: vi.fn() },
	}
})

vi.mock("@workspace/ui/components/notice-surface", async (original) => ({
	...(await original<object>()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

const failureNotice = vi.mocked(raiseFailureNotice)
const diagnostics = vi.mocked(commands.diagnostics)
const logTail = vi.mocked(commands.logTail)

const RAISED_AT = "2026-10-11T09:30:00.000Z"

const HOST = "http://192.168.1.20:45367"

const HOST_TOKEN = "k1r0sh1-host-bearer-0042"

const OTHER_SPACE_REFUSAL = "this command reaches outside the shared space"

const RELAYED_ARGS = {
	spaceId: "space-garage-42",
	conversationId: "conversation-7781",
	body: "draft the launch note",
}

const THIS_MAC: Diagnostics = {
	appVersion: "0.24.1",
	gitCommit: "ad6778c",
	installKind: "installed",
	osName: "macOS",
	osBuild: "15.1 (24B83)",
	arch: "aarch64",
	ramBytes: 16 * 1024 ** 3,
	agentVersion: "2.1.4",
	provider: "anthropic",
	agentError: null,
	side: "host",
	plan: "pro",
}

const LOG_LINES = [
	"2026-10-11T09:29:58.120Z WARN webview the host answered 503",
	"2026-10-11T09:29:59.004Z ERROR webview reading /Users/ada/notes.md failed",
]

const SCRUBBED_LOG_LINES = [
	LOG_LINES[0],
	"2026-10-11T09:29:59.004Z ERROR webview reading ~/notes.md failed",
]

const BOT_ID = "0b6d8e0c-4a7f-4f1c-9a1f-2e9a7b3d4c8e"

const CONVERSATION_ID = "9a1f2b6d-8e0c-4a7f-8c8e-4f1c2e9a7b3d"

const neverAnswering = () => new Promise<never>(() => undefined)

const raisedNotice = async () => {
	await vi.waitFor(() => expect(failureNotice).toHaveBeenCalled())
	const [notice] = failureNotice.mock.lastCall ?? []
	if (!notice?.report) {
		throw new Error("no failure notice was raised with a report")
	}
	return { ...notice, report: notice.report }
}

const copiedTextOfRaisedNotice = async () =>
	formatFailureReport(await raisedNotice())

const memberHostAnswering = (fetch: typeof globalThis.fetch) =>
	createHttpHost({
		host: HOST,
		token: HOST_TOKEN,
		fetch,
		openSocket: () => ({
			onclose: null,
			onmessage: null,
			onopen: null,
			close: () => undefined,
		}),
		onDown: () => undefined,
		onUp: () => undefined,
		onReopened: () => undefined,
		onRefused: raiseRefusalNotice,
	})

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(new Date(RAISED_AT))
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {} })
	failureNotice.mockClear()
	diagnostics.mockReset().mockResolvedValue(THIS_MAC)
	logTail.mockReset().mockResolvedValue({ status: "ok", data: LOG_LINES })
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	reportLocalWhen(() => false)
})

describe("buildFailureReport", () => {
	it("fills Specs from diagnostics, Context from the facts and Log from the last 200 lines", async () => {
		expect(
			await buildFailureReport({
				raisedIn: "roster-controller",
				command: "bot_list",
				httpStatus: 500,
				botId: BOT_ID,
				botName: "Atlas",
			}),
		).toEqual({
			specs: {
				appVersion: "0.24.1",
				commit: "ad6778c",
				installKind: "installed",
				os: "macOS",
				osBuild: "15.1 (24B83)",
				arch: "aarch64",
				ram: "16 GB",
				agentVersion: "2.1.4",
				provider: "anthropic",
				side: "host",
				plan: "pro",
			},
			context: {
				raisedAt: RAISED_AT,
				raisedIn: "roster-controller",
				botId: BOT_ID,
				botName: "Atlas",
				command: "bot_list",
				httpStatus: 500,
			},
			log: {
				lines: SCRUBBED_LOG_LINES,
				path: "~/Library/Logs/app.kiroshi/kiroshi.log",
				lineCount: 2,
			},
		})
		expect(logTail).toHaveBeenCalledWith(200)
	})

	it("keeps out every fact it does not name", async () => {
		const facts = {
			raisedIn: "joined-hosts",
			token: HOST_TOKEN,
			args: RELAYED_ARGS,
		} as FailureFacts

		expect(JSON.stringify(await buildFailureReport(facts))).not.toMatch(
			/k1r0sh1|space-garage|conversation-7781/,
		)
	})

	it("leaves Specs out and keeps Context and Log when diagnostics rejects", async () => {
		diagnostics.mockRejectedValue(new Error("diagnostics unavailable"))

		const report = await buildFailureReport({ raisedIn: "use-account" })

		expect(report.specs).toBeUndefined()
		expect(report.context?.raisedIn).toBe("use-account")
		expect(report.log?.lineCount).toBe(2)
	})

	it("leaves Log out and keeps Specs and Context when logTail refuses", async () => {
		logTail.mockResolvedValue({
			status: "error",
			error: { kind: "unresolved" },
		})

		const report = await buildFailureReport({ raisedIn: "use-account" })

		expect(report.log).toBeUndefined()
		expect(report.specs?.os).toBe("macOS")
		expect(report.context?.raisedIn).toBe("use-account")
	})

	it("leaves Log out and keeps Specs and Context when logTail rejects", async () => {
		logTail.mockRejectedValue(new Error("ipc closed"))

		const report = await buildFailureReport({ raisedIn: "use-account" })

		expect(report.log).toBeUndefined()
		expect(report.specs?.os).toBe("macOS")
		expect(report.context?.raisedIn).toBe("use-account")
	})
})

describe("raiseReportedFailure", () => {
	it("copies the warning, the Specs, the Context and the Log of the failure", async () => {
		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue" },
		)

		expect((await copiedTextOfRaisedNotice()).split("\n")).toEqual([
			"Kiroshi failure report",
			"Review before sharing: may contain file names and local paths.",
			"-- Specs",
			"App version: 0.24.1",
			"Commit: ad6778c",
			"Install: installed",
			"OS: macOS",
			"OS build: 15.1 (24B83)",
			"Arch: aarch64",
			"RAM: 16 GB",
			"Agent version: 2.1.4",
			"Provider: anthropic",
			"Side: host",
			"Plan: pro",
			"-- Context",
			`Time: ${RAISED_AT}`,
			"Raised in: use-model-catalogue",
			"-- Log (last 2 lines of ~/Library/Logs/app.kiroshi/kiroshi.log)",
			...SCRUBBED_LOG_LINES,
		])
	})

	it("copies the bot and the conversation it holds with their ids unmasked", async () => {
		raiseReportedFailure(
			{ title: "Couldn’t reopen Atlas" },
			{
				raisedIn: "session-reopening",
				botId: BOT_ID,
				botName: "Atlas",
				conversation: CONVERSATION_ID,
			},
		)

		const copiedText = await copiedTextOfRaisedNotice()
		expect(copiedText).toContain(`Bot id: ${BOT_ID}`)
		expect(copiedText).toContain("Bot name: Atlas")
		expect(copiedText).toContain(`Conversation: ${CONVERSATION_ID}`)
	})

	it("copies the side, the mission and the count a reporter hands it into Context", async () => {
		failureReporterIn("mission-run-driver")(
			{ title: "Mission run failed", cause: "the mission could not be read" },
			{ side: "local", mission: "m-1", count: 3 },
		)

		const copiedText = await copiedTextOfRaisedNotice()
		const context = copiedText.slice(copiedText.indexOf("-- Context"))
		expect(context).toContain("Raised in: mission-run-driver")
		expect(context).toContain("Side: local")
		expect(context).toContain("Mission: m-1")
		expect(context).toContain("Count: 3")
		expect(failureNotice.mock.lastCall?.[0]?.cause).toBe(
			"the mission could not be read",
		)
	})

	it("scrubs the description before it reaches the notice", async () => {
		raiseReportedFailure(
			{
				title: "Couldn’t start the agent",
				description:
					"spawn /Users/ada/.kiroshi/agent failed for ada@example.com",
			},
			{ raisedIn: "onboarding-controller" },
		)

		expect((await raisedNotice()).description).toBe(
			"spawn ~/.kiroshi/agent failed for [redacted]",
		)
	})

	it("shows the toast 500 ms after the raise with the groups that answered in time", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
		diagnostics.mockImplementation(neverAnswering)

		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue" },
		)
		await vi.advanceTimersByTimeAsync(499)
		expect(failureNotice).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)

		const { report } = await raisedNotice()
		expect(report.specs).toBeUndefined()
		expect(report.log?.lineCount).toBe(2)
		expect(report.context?.raisedIn).toBe("use-model-catalogue")
	})

	it("shows the toast without waiting out the 500 ms once both groups answer", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })

		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue" },
		)
		await vi.advanceTimersByTimeAsync(0)

		expect(failureNotice).toHaveBeenCalled()
	})
})

describe("a refused joined-space request", () => {
	it("copies neither the host, the port nor the URL of a request that fails before any answer", async () => {
		const host = memberHostAnswering(async () => {
			throw new TypeError(
				"error sending request for url (http://192.168.1.20:45367/invoke/send_message)",
			)
		})

		await expect(host.invoke("send_message", RELAYED_ARGS)).rejects.toThrow(
			"error sending request",
		)

		const copiedText = await copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: send_message")
		expect(copiedText).not.toMatch(/192\.168\.1\.20|45367|http:|\/invoke\//)
	})

	it("names the command, the status, the member side, the version and the OS", async () => {
		const host = memberHostAnswering(
			async () => new Response(OTHER_SPACE_REFUSAL, { status: 403 }),
		)

		await expect(
			host.invoke("conversation_list", RELAYED_ARGS),
		).rejects.toThrow(OTHER_SPACE_REFUSAL)

		const copiedText = await copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: conversation_list")
		expect(copiedText).toContain("HTTP status: 403")
		expect(copiedText).toContain("Side: member")
		expect(copiedText).toContain("App version: 0.24.1")
		expect(copiedText).toContain("OS: macOS")
	})

	it("copies neither the host token, the url nor the args", async () => {
		const host = memberHostAnswering(
			async () => new Response(OTHER_SPACE_REFUSAL, { status: 403 }),
		)

		await expect(
			host.invoke("conversation_list", RELAYED_ARGS),
		).rejects.toThrow(OTHER_SPACE_REFUSAL)

		const copiedText = await copiedTextOfRaisedNotice()
		expect(copiedText).not.toContain(HOST_TOKEN)
		expect(copiedText).not.toContain("192.168.1.20")
		for (const value of Object.values(RELAYED_ARGS)) {
			expect(copiedText).not.toContain(value)
		}
	})

	it("names the command with no HTTP status when it fails before any answer", async () => {
		const host = memberHostAnswering(async () => {
			throw new TypeError("Failed to fetch")
		})

		await expect(
			host.invoke("conversation_list", RELAYED_ARGS),
		).rejects.toThrow("Failed to fetch")

		const copiedText = await copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: conversation_list")
		expect(copiedText).toContain("Side: member")
		expect(copiedText).not.toContain("HTTP status")
	})
})

describe("a failure raised outside the desktop app", () => {
	it("leaves Specs and Log out where there is no Mac to ask", async () => {
		vi.unstubAllGlobals()
		vi.resetModules()
		await import("./host/index")
		const { commands: commandsOutsideDesktop } = await import("./bindings")
		const unreachable = new TypeError("no desktop host")
		vi.mocked(commandsOutsideDesktop.diagnostics).mockRejectedValue(unreachable)
		vi.mocked(commandsOutsideDesktop.logTail).mockRejectedValue(unreachable)
		const { raiseReportedFailure: raiseOutsideDesktop } = await import(
			"./failure-report"
		)
		const { raiseFailureNotice: noticeOutsideDesktop } = await import(
			"@workspace/ui/components/notice-surface"
		)

		raiseOutsideDesktop(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue" },
		)

		await vi.waitFor(() =>
			expect(vi.mocked(noticeOutsideDesktop)).toHaveBeenCalled(),
		)
		const [notice] = vi.mocked(noticeOutsideDesktop).mock.lastCall ?? []
		expect(notice?.report?.context?.raisedIn).toBe("use-model-catalogue")
		expect(notice?.report?.specs).toBeUndefined()
		expect(notice?.report?.log).toBeUndefined()
	})
})

describe("the side of a failure raised on this Mac", () => {
	const SPACE_ID = "space-garage"

	const settled = () => new Promise((resolve) => setTimeout(resolve))

	let joinedSpaceId: string | null
	let announceHosting: (changed: HostingChanged) => void

	const thisMacHosting = async (seededState: HostingState) => {
		const hostedSpaces = createHostedSpaces({
			spaceIds: async () => [SPACE_ID],
			read: async () => seededState,
			onChanged: async (listener) => {
				announceHosting = listener
				return () => undefined
			},
		})
		reportLocalWhen(() => joinedSpaceId === null && hostedSpaces.isNoneHosted())
		await settled()
	}

	const sideOfRaisedFailure = async (side?: FailureFacts["side"]) => {
		failureNotice.mockClear()
		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue", side },
		)
		return (await raisedNotice()).report.specs?.side
	}

	beforeEach(() => {
		joinedSpaceId = null
	})

	it("reports local while no space is hosted and no joined space is active", async () => {
		await thisMacHosting({ kind: "off" })

		expect(await sideOfRaisedFailure()).toBe("local")
		expect(await copiedTextOfRaisedNotice()).toContain("Side: local")
	})

	it("keeps the side diagnostics reads while a space of this Mac is hosted", async () => {
		await thisMacHosting({ kind: "online" })

		expect(await sideOfRaisedFailure()).toBe("host")
	})

	it("follows the hosting of a space as it starts and stops", async () => {
		await thisMacHosting({ kind: "off" })

		announceHosting({ spaceId: SPACE_ID, state: { kind: "connecting" } })
		expect(await sideOfRaisedFailure()).toBe("host")

		announceHosting({ spaceId: SPACE_ID, state: { kind: "off" } })
		expect(await sideOfRaisedFailure()).toBe("local")
	})

	it("keeps the side diagnostics reads while a joined space is active", async () => {
		await thisMacHosting({ kind: "off" })
		joinedSpaceId = SPACE_ID

		expect(await sideOfRaisedFailure()).toBe("host")
	})

	it("keeps the side diagnostics reads while the hosted spaces could not be read", async () => {
		const unread = vi.spyOn(console, "error").mockImplementation(() => {})
		const hostedSpaces = createHostedSpaces({
			spaceIds: async () => {
				throw new Error("database unavailable")
			},
			read: async () => ({ kind: "off" }),
			onChanged: async () => () => undefined,
		})
		reportLocalWhen(() => hostedSpaces.isNoneHosted())

		await vi.waitFor(() => expect(unread).toHaveBeenCalled())
		expect(await sideOfRaisedFailure()).toBe("host")
		unread.mockRestore()
	})

	it.each([
		["nothing is shared", { kind: "off" }, null],
		["a space is hosted", { kind: "online" }, null],
		["a joined space is active", { kind: "off" }, SPACE_ID],
	] as const)(
		"keeps the side a call site names while %s",
		async (_state, seededState, joined) => {
			await thisMacHosting(seededState)
			joinedSpaceId = joined

			expect(await sideOfRaisedFailure("host")).toBe("host")
			expect(await sideOfRaisedFailure("member")).toBe("member")
		},
	)
})
