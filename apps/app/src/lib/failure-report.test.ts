import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	formatFailureReport,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import type { HostingChanged, HostingState } from "./bindings"
import {
	buildFailureReport,
	type FailureFacts,
	raiseReportedFailure,
	reportLocalWhen,
} from "./failure-report"

import { createHostedSpaces } from "./host/hosted-spaces"
import { createHttpHost, raiseRefusalNotice } from "./host/http"

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }))

vi.mock("@workspace/ui/components/notice-surface", async (original) => ({
	...(await original<object>()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

const failureNotice = vi.mocked(raiseFailureNotice)

const RAISED_AT = "2026-10-11T09:30:00.000Z"

const HOST = "http://192.168.1.20:45367"

const HOST_TOKEN = "k1r0sh1-host-bearer-0042"

const OTHER_SPACE_REFUSAL = "this command reaches outside the shared space"

const RELAYED_ARGS = {
	spaceId: "space-garage-42",
	conversationId: "conversation-7781",
	body: "draft the launch note",
}

const copiedTextOfRaisedNotice = () => {
	const [notice] = failureNotice.mock.lastCall ?? []
	if (!notice?.report) {
		throw new Error("no failure notice was raised with a report")
	}
	return formatFailureReport({ ...notice, report: notice.report })
}

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
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	reportLocalWhen(() => false)
})

describe("buildFailureReport", () => {
	it("builds a full report from the named facts", () => {
		expect(
			buildFailureReport({
				raisedIn: "roster-controller",
				command: "bot_list",
				httpStatus: 500,
				side: "host",
			}),
		).toEqual({
			appVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
			platform: "macos",
			raisedAt: RAISED_AT,
			command: "bot_list",
			httpStatus: 500,
			side: "host",
			raisedIn: "roster-controller",
		})
	})

	it("keeps out every fact it does not name", () => {
		const facts = {
			raisedIn: "joined-hosts",
			token: HOST_TOKEN,
			args: RELAYED_ARGS,
		} as FailureFacts

		expect(JSON.stringify(buildFailureReport(facts))).not.toMatch(
			/k1r0sh1|space-garage|conversation-7781/,
		)
	})
})

describe("raiseReportedFailure", () => {
	it("copies a report with no description line when the notice has none", () => {
		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue" },
		)

		expect(copiedTextOfRaisedNotice().split("\n")).toEqual([
			"Kiroshi failure report",
			expect.stringMatching(/^App version: \d+\.\d+\.\d+/),
			"Platform: macos",
			`Time: ${RAISED_AT}`,
			"Raised in: use-model-catalogue",
		])
	})

	it("scrubs the description before it reaches the notice", () => {
		raiseReportedFailure(
			{
				title: "Couldn’t start the agent",
				description:
					"spawn /Users/ada/.kiroshi/agent failed for ada@example.com",
			},
			{ raisedIn: "onboarding-controller" },
		)

		expect(failureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				description: "spawn ~/.kiroshi/agent failed for [redacted]",
			}),
		)
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

		const copiedText = copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: send_message")
		expect(copiedText).not.toMatch(/192\.168\.1\.20|45367|http:|\/invoke\//)
	})

	it("names the command, the status, the member side, the version and the platform", async () => {
		const host = memberHostAnswering(
			async () => new Response(OTHER_SPACE_REFUSAL, { status: 403 }),
		)

		await expect(
			host.invoke("conversation_list", RELAYED_ARGS),
		).rejects.toThrow(OTHER_SPACE_REFUSAL)

		const copiedText = copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: conversation_list")
		expect(copiedText).toContain("HTTP status: 403")
		expect(copiedText).toContain("Side: member")
		expect(copiedText).toMatch(/App version: \d+\.\d+\.\d+/)
		expect(copiedText).toContain("Platform: macos")
	})

	it("copies neither the host token, the url nor the args", async () => {
		const host = memberHostAnswering(
			async () => new Response(OTHER_SPACE_REFUSAL, { status: 403 }),
		)

		await expect(
			host.invoke("conversation_list", RELAYED_ARGS),
		).rejects.toThrow(OTHER_SPACE_REFUSAL)

		const copiedText = copiedTextOfRaisedNotice()
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

		const copiedText = copiedTextOfRaisedNotice()
		expect(copiedText).toContain("Command: conversation_list")
		expect(copiedText).toContain("Side: member")
		expect(copiedText).not.toContain("HTTP status")
	})
})

describe("the side of a failure raised outside the desktop app", () => {
	it("leaves the side unset where there is no Mac", async () => {
		vi.unstubAllGlobals()
		vi.resetModules()
		await import("./host/index")
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

		const [notice] = vi.mocked(noticeOutsideDesktop).mock.lastCall ?? []
		expect(notice?.report).toBeDefined()
		expect(notice?.report?.side).toBeUndefined()
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

	const sideOfRaisedFailure = (side?: FailureFacts["side"]) => {
		raiseReportedFailure(
			{ title: "Couldn’t read the models this machine offers." },
			{ raisedIn: "use-model-catalogue", side },
		)
		return failureNotice.mock.lastCall?.[0].report?.side
	}

	beforeEach(() => {
		joinedSpaceId = null
	})

	it("reports local while no space is hosted and no joined space is active", async () => {
		await thisMacHosting({ kind: "off" })

		expect(sideOfRaisedFailure()).toBe("local")
		expect(copiedTextOfRaisedNotice()).toContain("Side: local")
	})

	it("leaves the side unset while a space of this Mac is hosted", async () => {
		await thisMacHosting({ kind: "online" })

		expect(sideOfRaisedFailure()).toBeUndefined()
	})

	it("follows the hosting of a space as it starts and stops", async () => {
		await thisMacHosting({ kind: "off" })

		announceHosting({ spaceId: SPACE_ID, state: { kind: "connecting" } })
		expect(sideOfRaisedFailure()).toBeUndefined()

		announceHosting({ spaceId: SPACE_ID, state: { kind: "off" } })
		expect(sideOfRaisedFailure()).toBe("local")
	})

	it("leaves the side unset while a joined space is active", async () => {
		await thisMacHosting({ kind: "off" })
		joinedSpaceId = SPACE_ID

		expect(sideOfRaisedFailure()).toBeUndefined()
	})

	it("leaves the side unset while the hosted spaces could not be read", async () => {
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
		expect(sideOfRaisedFailure()).toBeUndefined()
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

			expect(sideOfRaisedFailure("host")).toBe("host")
			expect(sideOfRaisedFailure("member")).toBe("member")
		},
	)
})
