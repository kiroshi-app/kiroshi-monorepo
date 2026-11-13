import { describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { TransportError } from "./contract"
import { describeTransportError } from "./messages"

const t = i18n.getFixedT(null, "chat")

describe("describeTransportError", () => {
	it("names the agent, not the places it was looked for", () => {
		expect(
			describeTransportError(t, {
				kind: "binaryNotFound",
				searched: ["/usr/bin", "/opt/bin"],
			}),
		).toBe("Couldn’t find the agent. Reinstall Kiroshi.")
	})

	it("keeps a signed-out subscription apart from an unreachable agent", () => {
		expect(describeTransportError(t, { kind: "notAuthenticated" })).not.toBe(
			describeTransportError(t, { kind: "binaryNotFound", searched: [] }),
		)
	})

	it("names the exit code, and says so when the process left none", () => {
		expect(
			describeTransportError(t, { kind: "crashed", code: 1, detail: null }),
		).toBe("The agent exited (code 1). Restart the session.")
		expect(
			describeTransportError(t, { kind: "crashed", code: null, detail: null }),
		).toBe("The agent exited (code unknown). Restart the session.")
	})

	it("reads back a detail the host sent unescaped", () => {
		expect(
			describeTransportError(t, {
				kind: "writeFailed",
				detail: "pipe closed & gone",
			}),
		).toBe("Couldn’t send the message (pipe closed & gone). Retry.")
	})

	it("names the server left out and the variable it waited for", () => {
		expect(
			describeTransportError(t, {
				kind: "serverEnvRejected",
				detail:
					'the server "linear" was left out: LINEAR_KEY is defined by no scope',
			}),
		).toBe(
			'the server "linear" was left out: LINEAR_KEY is defined by no scope. The other applications still run, so fix this one and restart the session.',
		)
	})

	it("tells a silent agent apart from a stop it never answered", () => {
		expect(
			describeTransportError(t, {
				kind: "runLapsed",
				lapse: "silent",
				boundMs: 60_000,
			}),
		).toBe(
			"The agent stopped answering, so its reply ended. Send your message again.",
		)
		expect(
			describeTransportError(t, {
				kind: "runLapsed",
				lapse: "interruptUnanswered",
				boundMs: 15_000,
			}),
		).toBe(
			"The agent didn’t answer the stop, so its reply ended. Send your message again.",
		)
	})

	it("says the agent waited on its background work when that wait lapsed", () => {
		const lapsed: TransportError = {
			kind: "runLapsed",
			lapse: "tasksPending",
			boundMs: 600_000,
		}

		expect(describeTransportError(t, lapsed)).toBe(
			"The agent waited 10 minutes on its background work, so its reply ended. Send your message again.",
		)
		expect(describeTransportError(t, lapsed, "Ada")).toBe(
			"Ada waited 10 minutes on its background work, so its reply ended. Send your message again.",
		)
	})

	it("asks to update the host when it runs an older Kiroshi, named agent or not", () => {
		const outdated: TransportError = { kind: "hostOutdated" }
		const copy =
			"The computer hosting this Space runs an older Kiroshi. Update Kiroshi there, then try again."

		expect(describeTransportError(t, outdated)).toBe(copy)
		expect(describeTransportError(t, outdated, "Ada")).toBe(copy)
	})
})
