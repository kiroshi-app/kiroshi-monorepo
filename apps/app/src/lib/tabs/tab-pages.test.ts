import { describe, expect, it } from "vitest"

import { isAgentsPage, isTabHref, pageOf } from "./tab-pages"

describe("the Agents page among the tab pages", () => {
	it("is accepted as the href of a tab", () => {
		expect(isTabHref("/agents")).toBe(true)
	})

	it("is told apart from the other pages by its path", () => {
		expect(isAgentsPage(pageOf("/agents"))).toBe(true)
		expect(isAgentsPage(pageOf("/missions"))).toBe(false)
	})
})
