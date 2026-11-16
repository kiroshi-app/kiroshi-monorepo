// @vitest-environment happy-dom
import {
	type AnyRouter,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router"
import { act, cleanup, render } from "@testing-library/react"
import { createElement, StrictMode, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runReplayCommand } from "./replay-commands"
import type { ReplayCommand, ReplayOutcome } from "./replay-protocol"
import { recordAnnouncedRouters } from "./replay-router"

const createScreenRouter = () => {
	const rootRoute = createRootRoute()
	const routeTree = rootRoute.addChildren([
		createRoute({
			getParentRoute: () => rootRoute,
			path: "/",
			component: () => "conversations screen",
		}),
		createRoute({
			getParentRoute: () => rootRoute,
			path: "/library",
			validateSearch: (search: Record<string, unknown>) => ({
				section: typeof search.section === "string" ? search.section : "all",
			}),
			component: () => "library screen",
		}),
	])
	return createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	})
}

const AppHoldingItsRouter = () => {
	const [router] = useState(createScreenRouter)
	return createElement(RouterProvider, { router })
}

const mountAppInStrictMode = async () => {
	await act(async () => {
		render(createElement(StrictMode, null, createElement(AppHoldingItsRouter)))
	})
}

const screenText = () => document.body.textContent

let findRenderedRouter: () => AnyRouter | undefined

const run = async (command: ReplayCommand) => {
	let outcome: ReplayOutcome | undefined
	await act(async () => {
		outcome = await runReplayCommand(command, findRenderedRouter)
	})
	return outcome
}

const transitionOf = (element: Element) =>
	getComputedStyle(element).getPropertyValue("transition")

const holdAnimationFrames = () => {
	const held: FrameRequestCallback[] = []
	vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
		held.push(frame),
	)
	return () => {
		for (const frame of held.splice(0)) {
			frame(performance.now())
		}
	}
}

const untilTimersRan = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0)
	})

const addElement = (tag: string, style = "") => {
	const element = document.createElement(tag)
	element.setAttribute("style", style)
	document.body.appendChild(element)
	return element
}

beforeEach(() => {
	findRenderedRouter = recordAnnouncedRouters()
})

afterEach(() => {
	cleanup()
	document.head.replaceChildren()
	document.body.replaceChildren()
	document.documentElement.className = ""
	Reflect.deleteProperty(window, "__TSR_ROUTER__")
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("the navigate command", () => {
	it("brings the named route on screen and answers the resolved location", async () => {
		await mountAppInStrictMode()
		expect(screenText()).toBe("conversations screen")

		const outcome = await run({
			name: "navigate",
			path: "/library",
			search: { section: "skills" },
		})

		expect(outcome).toEqual({
			ok: true,
			result: {
				href: "/library?section=skills",
				pathname: "/library",
				search: { section: "skills" },
			},
		})
		expect(screenText()).toBe("library screen")
	})

	it("drives the router on screen, not the twin StrictMode builds and discards", async () => {
		await mountAppInStrictMode()

		expect(findRenderedRouter()).toBeDefined()
		expect(findRenderedRouter()).not.toBe(window.__TSR_ROUTER__)
	})

	it("answers the search the route resolves when the command names none", async () => {
		await mountAppInStrictMode()

		const outcome = await run({
			name: "navigate",
			path: "/library",
			search: {},
		})

		expect(outcome).toMatchObject({
			ok: true,
			result: { pathname: "/library", search: { section: "all" } },
		})
	})

	it.each(["/nowhere", "/library/nowhere"])(
		"refuses the unknown route %s and stays where it is",
		async (path) => {
			await mountAppInStrictMode()

			const outcome = await run({ name: "navigate", path, search: {} })

			expect(outcome).toEqual({ ok: false, reason: `unknown route ${path}` })
			expect(screenText()).toBe("conversations screen")
		},
	)

	it("fails while no router is on screen", async () => {
		createScreenRouter()

		const outcome = await run({
			name: "navigate",
			path: "/library",
			search: {},
		})

		expect(outcome).toEqual({
			ok: false,
			reason: "the workspace router is not ready",
		})
	})
})

describe("the theme command", () => {
	it("sets the named class on the root element and writes no preference", async () => {
		document.documentElement.classList.add("light", "platform-macos")

		const outcome = await run({ name: "theme", scheme: "dark" })

		expect(outcome).toEqual({
			ok: true,
			result: { scheme: "dark", rootClass: "platform-macos dark" },
		})
		expect([...document.documentElement.classList]).toEqual([
			"platform-macos",
			"dark",
		])
		expect(window.localStorage.length).toBe(0)
	})

	it("switches back to light", async () => {
		document.documentElement.classList.add("dark")

		await run({ name: "theme", scheme: "light" })

		expect([...document.documentElement.classList]).toEqual(["light"])
	})

	it("swaps the class while every transition is suppressed", async () => {
		const animated = addElement("p", "transition: color 1s")
		const transitionsAtSwap: string[] = []
		const rootClasses = document.documentElement.classList
		const addClass = rootClasses.add.bind(rootClasses)
		vi.spyOn(rootClasses, "add").mockImplementation((...classes) => {
			transitionsAtSwap.push(transitionOf(animated))
			addClass(...classes)
		})
		expect(transitionOf(animated)).toBe("color 1s")

		await run({ name: "theme", scheme: "dark" })

		expect(transitionsAtSwap).toEqual(["none"])
	})

	it("answers once the next animation frame has passed", async () => {
		const passNextFrame = holdAnimationFrames()
		let outcome: ReplayOutcome | undefined
		const answering = runReplayCommand(
			{ name: "theme", scheme: "dark" },
			findRenderedRouter,
		).then((answered) => {
			outcome = answered
		})

		await untilTimersRan()
		expect([...document.documentElement.classList]).toEqual(["dark"])
		expect(outcome).toBeUndefined()

		passNextFrame()
		await answering
		expect(outcome).toEqual({
			ok: true,
			result: { scheme: "dark", rootClass: "dark" },
		})
	})
})

describe("the scroll command", () => {
	it("sets scrollTop of the first match and answers the value read back", async () => {
		const first = addElement("section")
		const second = addElement("section")

		const outcome = await run({ name: "scroll", selector: "section", top: 120 })

		expect(outcome).toEqual({ ok: true, result: { scrollTop: 120 } })
		expect(first.scrollTop).toBe(120)
		expect(second.scrollTop).toBe(0)
	})

	it("fails when the selector matches nothing", async () => {
		const outcome = await run({ name: "scroll", selector: "nav", top: 120 })

		expect(outcome).toEqual({
			ok: false,
			reason: "selector matches nothing: nav",
		})
	})

	it("fails on a selector the page cannot parse", async () => {
		const outcome = await run({ name: "scroll", selector: "[", top: 120 })

		expect(outcome).toMatchObject({ ok: false })
	})
})

describe("the measure command", () => {
	it("answers the layout measures and the listed computed values of each match", async () => {
		addElement("article", "padding-top: 12px; display: flex")
		addElement("article", "padding-top: 4px")

		const outcome = await run({
			name: "measure",
			selector: "article",
			properties: ["padding-top", "display"],
		})

		const rect = {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		}
		expect(outcome).toEqual({
			ok: true,
			result: {
				matchCount: 2,
				elements: [
					{
						rect,
						scrollTop: 0,
						scrollHeight: 0,
						clientHeight: 0,
						computed: { "padding-top": "12px", display: "flex" },
					},
					{
						rect,
						scrollTop: 0,
						scrollHeight: 0,
						clientHeight: 0,
						computed: { "padding-top": "4px", display: "block" },
					},
				],
			},
		})
	})

	it("measures the first 50 matches and counts them all", async () => {
		for (let index = 0; index < 60; index += 1) {
			addElement("li")
		}

		const outcome = await run({
			name: "measure",
			selector: "li",
			properties: [],
		})

		expect(outcome).toMatchObject({ ok: true, result: { matchCount: 60 } })
		expect(outcome).toHaveProperty("result.elements.length", 50)
	})

	it("fails when the selector matches nothing", async () => {
		const outcome = await run({
			name: "measure",
			selector: "aside",
			properties: [],
		})

		expect(outcome).toEqual({
			ok: false,
			reason: "selector matches nothing: aside",
		})
	})
})

describe("a payload naming another command", () => {
	it("is refused without running anything", async () => {
		const outcome = await run({
			name: "evaluate",
			script: "document.title = 'replayed'",
		} as unknown as ReplayCommand)

		expect(outcome).toEqual({ ok: false, reason: "unknown command" })
		expect(document.title).not.toBe("replayed")
	})
})
