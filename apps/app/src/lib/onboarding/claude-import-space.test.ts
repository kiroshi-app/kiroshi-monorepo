import { describe, expect, it } from "vitest"

import { importSpaceIdOf } from "./claude-import-space"

const LOCAL = ["personal", "work"]

describe("the space an import goes into", () => {
	it("is the open space when it lives on this computer", () => {
		expect(importSpaceIdOf("work", LOCAL)).toBe("work")
	})

	it("is the first local space when the open space is joined", () => {
		expect(importSpaceIdOf("joined:host-garage", LOCAL)).toBe("personal")
	})

	it("is the first local space when no space is open", () => {
		expect(importSpaceIdOf(null, LOCAL)).toBe("personal")
	})

	it("is missing when this computer holds no space", () => {
		expect(importSpaceIdOf("joined:host-garage", [])).toBeNull()
	})
})
