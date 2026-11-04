import { describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"

const english = i18n.getFixedT("en", "common")
const french = i18n.getFixedT("fr", "common")

describe("libraryDisplayName", () => {
	it("calls an empty name Untitled", () => {
		expect(libraryDisplayName("", english)).toBe("Untitled")
	})

	it("calls a whitespace-only name Untitled", () => {
		expect(libraryDisplayName(" \t\n ", english)).toBe("Untitled")
	})

	it("keeps a titled name as written, surrounding spaces included", () => {
		expect(libraryDisplayName(" Release notes ", english)).toBe(
			" Release notes ",
		)
	})

	it("calls an empty name Sans titre in French", () => {
		expect(libraryDisplayName("   ", french)).toBe("Sans titre")
	})
})
