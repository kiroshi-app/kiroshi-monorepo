import { describe, expect, it } from "vitest"

import { formatFailureReport } from "@workspace/ui/components/notice-surface"

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
})
