import { describe, expect, it } from "vitest"

import {
	formatFailureReport,
	formatFailureSpecs,
} from "@workspace/ui/components/notice-surface"

describe("formatFailureReport", () => {
	it("writes each multi-line or padded value on its own single line", () => {
		const text = formatFailureReport({
			description: "The folder was not readable.\n\nNothing was written.\r\n",
			report: {
				command: "run_routine\n  --watch   folder",
				httpStatus: 503,
				raisedIn: " \n ",
			},
		})

		expect(text).toBe(
			[
				"Kiroshi failure report",
				"The folder was not readable. Nothing was written.",
				"Command: run_routine --watch folder",
				"HTTP status: 503",
			].join("\n"),
		)
	})

	it("copies the heading, the description, then the fields, with a local side", () => {
		const text = formatFailureReport({
			description: "The session could not be reopened.",
			report: { command: "reopen_session", side: "local" },
		})

		expect(text).toBe(
			[
				"Kiroshi failure report",
				"The session could not be reopened.",
				"Command: reopen_session",
				"Side: local",
			].join("\n"),
		)
	})

	it("writes the warning, the description, then Specs, Context and Log in that order", () => {
		const text = formatFailureReport({
			description: "The session could not be reopened.",
			report: {
				log: {
					lines: ["  indented line", "", "error: refused\tby host"],
					path: "/tmp/kiroshi.log",
					lineCount: 3,
				},
				context: { raisedIn: "use-session", httpStatus: 502 },
				specs: { appVersion: "0.24.1", commit: "ad6778c", arch: "aarch64" },
			},
		})

		expect(text).toBe(
			[
				"Kiroshi failure report",
				"Review before sharing: may contain file names and local paths.",
				"The session could not be reopened.",
				"-- Specs",
				"App version: 0.24.1",
				"Commit: ad6778c",
				"Arch: aarch64",
				"-- Context",
				"Raised in: use-session",
				"HTTP status: 502",
				"-- Log (last 3 lines of /tmp/kiroshi.log)",
				"  indented line",
				"",
				"error: refused\tby host",
			].join("\n"),
		)
	})

	it("leaves out an absent group and an absent field, and flattens every value but the log", () => {
		const text = formatFailureReport({
			description: "The folder was not readable.",
			report: {
				command: "run_routine",
				context: { command: "run_routine\n  --watch", session: " " },
			},
		})

		expect(text).toBe(
			[
				"Kiroshi failure report",
				"Review before sharing: may contain file names and local paths.",
				"The folder was not readable.",
				"Command: run_routine",
				"-- Context",
				"Command: run_routine --watch",
			].join("\n"),
		)
	})

	it.each([
		["a Specs group with no field", { specs: {} }],
		[
			"a Context group whose only field is blank",
			{ context: { session: " " } },
		],
		[
			"a Log group with zero lines",
			{ log: { lines: [], path: "/tmp/kiroshi.log", lineCount: 0 } },
		],
	])("writes no warning and no header for %s", (_, groups) => {
		const reported = {
			description: "The session could not be reopened.",
			report: { command: "reopen_session" },
		}

		expect(
			formatFailureReport({
				...reported,
				report: { ...reported.report, ...groups },
			}),
		).toBe(formatFailureReport(reported))
		expect(formatFailureReport(reported)).toBe(
			[
				"Kiroshi failure report",
				"The session could not be reopened.",
				"Command: reopen_session",
			].join("\n"),
		)
	})

	it("names the side, the mission and the count in the Context block", () => {
		expect(
			formatFailureReport({
				description: "The mission run failed.",
				report: {
					context: {
						raisedIn: "mission-run-driver",
						side: "local",
						mission: "m-1",
						count: 3,
					},
				},
			}),
		).toBe(
			[
				"Kiroshi failure report",
				"Review before sharing: may contain file names and local paths.",
				"The mission run failed.",
				"-- Context",
				"Raised in: mission-run-driver",
				"Side: local",
				"Mission: m-1",
				"Count: 3",
			].join("\n"),
		)
	})

	it("formats the Specs block alone", () => {
		expect(
			formatFailureSpecs({
				os: "Darwin 25.0.0",
				osBuild: "25A354",
				ram: "16 GB",
				agentVersion: "2.1.4",
				provider: "subscription",
				side: "local",
				plan: "Pro",
				installKind: "dmg",
			}),
		).toBe(
			[
				"-- Specs",
				"Install: dmg",
				"OS: Darwin 25.0.0",
				"OS build: 25A354",
				"RAM: 16 GB",
				"Agent version: 2.1.4",
				"Provider: subscription",
				"Side: local",
				"Plan: Pro",
			].join("\n"),
		)
	})
})
