import { describe, expect, it } from "vitest"

import {
	LONG_DOCUMENT_NAME,
	MOODBOARD,
	QUARTERLY_REPORT,
} from "@workspace/ui/components/app-title-bar.fixtures"

describe("a title bar tab descriptor", () => {
	it.each([QUARTERLY_REPORT, MOODBOARD, LONG_DOCUMENT_NAME])(
		"survives a JSON round trip unchanged: $name",
		(descriptor) => {
			expect(JSON.parse(JSON.stringify(descriptor))).toStrictEqual(descriptor)
		},
	)
})
