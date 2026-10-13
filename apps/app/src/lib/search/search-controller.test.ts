import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { createSearchController, QUIET_MS } from "./search-controller"

const openedOn = (spaceId = "personal") => {
	const controller = createSearchController()
	controller.open(spaceId)
	return controller
}

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

it("opens on the space with the empty query searched at once", () => {
	const controller = openedOn()

	expect(controller.getState()).toMatchObject({
		isOpen: true,
		spaceId: "personal",
		query: "",
		searchedQuery: "",
	})
})

it("searches a typed query only once the typing has been quiet", () => {
	const controller = openedOn()

	controller.setQuery("road")
	vi.advanceTimersByTime(QUIET_MS - 1)
	controller.setQuery("roadmap")
	vi.advanceTimersByTime(QUIET_MS - 1)

	expect(controller.getState()).toMatchObject({
		query: "roadmap",
		searchedQuery: "",
	})

	vi.advanceTimersByTime(1)

	expect(controller.getState().searchedQuery).toBe("roadmap")
})

it("searches an erased query at once", () => {
	const controller = openedOn()
	controller.setQuery("roadmap")
	vi.advanceTimersByTime(QUIET_MS)

	controller.setQuery("")

	expect(controller.getState().searchedQuery).toBe("")
})

it("searches the typed query at once when the scope switches", () => {
	const controller = openedOn()
	controller.setQuery("roadmap")

	controller.setScope(true)

	expect(controller.getState()).toMatchObject({
		isAllSpaces: true,
		searchedQuery: "roadmap",
	})
})

it("lets no pending query land once it closes", () => {
	const controller = openedOn()
	controller.setQuery("roadmap")

	controller.close()
	vi.advanceTimersByTime(QUIET_MS)

	expect(controller.getState().searchedQuery).toBe("")
})

it("forgets its query, its tab, its scope and its active result when it closes", () => {
	const controller = openedOn()
	controller.setQuery("roadmap")
	vi.advanceTimersByTime(QUIET_MS)
	controller.setTab("missions")
	controller.setScope(true)
	controller.moveActive(1, 3)

	controller.close()

	expect(controller.getState()).toEqual({
		isOpen: false,
		spaceId: null,
		query: "",
		searchedQuery: "",
		tab: "all",
		isAllSpaces: false,
		activeIndex: 0,
	})
})

it("wraps the active result at both ends of the visible order", () => {
	const controller = openedOn()

	controller.moveActive(-1, 3)

	expect(controller.getState().activeIndex).toBe(2)

	controller.moveActive(1, 3)

	expect(controller.getState().activeIndex).toBe(0)
})
