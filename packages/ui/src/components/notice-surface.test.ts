import { describe, expect, it } from "vitest"

import { formatFailureReport } from "@workspace/ui/components/notice-surface"

describe("formatFailureReport", () => {
	it("writes each multi-line or padded value on its own single line", () => {
		const text = formatFailureReport({
			title: "  Routine\tcould not run ",
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
				"Routine could not run",
				"The folder was not readable. Nothing was written.",
				"Command: run_routine --watch folder",
				"HTTP status: 503",
			].join("\n"),
		)
	})
})
