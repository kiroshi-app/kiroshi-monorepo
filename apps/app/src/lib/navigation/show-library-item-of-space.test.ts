// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest"

import { showLibraryItemOfSpace } from "./use-open-library-document"

import { createWorkspaceRouter } from "../../workspace-router"
import {
	createWorkspaceTabs,
	shownTabsOf,
	type WorkspaceTabs,
} from "../tabs/workspace-tabs"

const SPACE = "space-home"

const OTHER_SPACE = "space-away"

const PLAN_HREF = "/library?item=plan.md&kind=document"

const PREVIOUS = "/?conversation=previous"

const PINNED = "/?conversation=pinned"

const AWAY = "/?conversation=away"

const showPlanOf = (tabs: WorkspaceTabs, spaceId = SPACE) =>
	showLibraryItemOfSpace(createWorkspaceRouter(tabs), spaceId, {
		kind: "document",
		name: "plan.md",
	})

const stripOf = (tabs: WorkspaceTabs) => shownTabsOf(tabs.getState())

const hrefsOf = (tabs: WorkspaceTabs) =>
	stripOf(tabs).tabs.map((tab) => tab.entries[tab.index]?.href)

const activeHref = (tabs: WorkspaceTabs) => tabs.history.location.href

const tabsShowing = (...hrefs: string[]) => {
	const tabs = createWorkspaceTabs()
	tabs.showSpace(SPACE)
	const [first = PREVIOUS, ...others] = hrefs
	tabs.history.push(first)
	for (const href of others) {
		tabs.openEmptyTab()
		tabs.history.push(href)
	}
	return tabs
}

const pinnedFirstOf = (tabs: WorkspaceTabs) => {
	const [pinned] = stripOf(tabs).tabs
	tabs.pin(pinned?.id ?? "")
	tabs.select(pinned?.id ?? "")
	return pinned?.id
}

afterEach(() => {
	localStorage.clear()
})

describe("showLibraryItemOfSpace", () => {
	it("shows the item in the unpinned active tab and keeps the previous page as its Back entry", () => {
		const tabs = tabsShowing(PREVIOUS)

		showPlanOf(tabs)

		expect(hrefsOf(tabs)).toEqual([PLAN_HREF])
		expect(activeHref(tabs)).toBe(PLAN_HREF)
		tabs.history.back()
		expect(activeHref(tabs)).toBe(PREVIOUS)
	})

	it("opens one new active tab on the item and leaves the pinned tab on its page", () => {
		const tabs = tabsShowing(PINNED, PREVIOUS)
		const pinnedId = pinnedFirstOf(tabs)

		showPlanOf(tabs)

		expect(hrefsOf(tabs)).toEqual([PINNED, PLAN_HREF, PREVIOUS])
		expect(stripOf(tabs).activeId).not.toBe(pinnedId)
		expect(activeHref(tabs)).toBe(PLAN_HREF)
	})

	it("selects the tab already showing the item when the active tab is pinned", () => {
		const tabs = tabsShowing(PINNED, PLAN_HREF)
		const [, shown] = stripOf(tabs).tabs
		pinnedFirstOf(tabs)
		const before = stripOf(tabs).tabs

		showPlanOf(tabs)

		expect(stripOf(tabs).tabs).toEqual(before)
		expect(stripOf(tabs).activeId).toBe(shown?.id)
		expect(activeHref(tabs)).toBe(PLAN_HREF)
	})

	it("leaves tabs and history untouched when the active tab already shows the item", () => {
		const tabs = tabsShowing(PLAN_HREF, PREVIOUS)
		const [shown] = stripOf(tabs).tabs
		tabs.select(shown?.id ?? "")
		const before = stripOf(tabs)

		showPlanOf(tabs)

		expect(stripOf(tabs)).toEqual(before)
	})

	it("lands in the active tab of another Space before that Space is shown", () => {
		const tabs = tabsShowing(PREVIOUS)
		tabs.showSpace(OTHER_SPACE)
		tabs.history.push(AWAY)
		tabs.showSpace(SPACE)

		showPlanOf(tabs, OTHER_SPACE)

		expect(hrefsOf(tabs)).toEqual([PREVIOUS])
		tabs.showSpace(OTHER_SPACE)
		expect(hrefsOf(tabs)).toEqual([PLAN_HREF])
		tabs.history.back()
		expect(activeHref(tabs)).toBe(AWAY)
	})
})
