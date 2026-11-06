import { describe, expect, it } from "vitest"

import { documentFormatOf } from "./library-items"

describe("the format of a Library document", () => {
	it("is plain for a .txt name in any case", () => {
		expect(documentFormatOf("NOTES.TXT")).toBe("plain")
	})

	it.each(["notes.md", "notes.txt.md"])("is markdown for %s", (name) => {
		expect(documentFormatOf(name)).toBe("markdown")
	})
})
