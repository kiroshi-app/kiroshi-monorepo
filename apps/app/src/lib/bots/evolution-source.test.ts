import { describe, expect, it, vi } from "vitest"

import {
	type EvolutionSourceOptions,
	startEvolutionSource,
} from "./evolution-source"

import type {
	EvolvedBundle,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"
import { botPlugin, spacePlugin } from "../conversations/plugin-scope"

const scopeOf = (botId: string): RuntimeScope => ({
	conversationId: "chat-1",
	botId,
	runtimeSessionId: "run-1",
	epoch: 1,
})

const createFakeDriver = () => {
	const listeners = new Set<(event: ScopedEvent) => void>()

	return {
		subscribe: (onEvent: (event: ScopedEvent) => void) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},
		evolve: (botId: string, bundle: EvolvedBundle) => {
			for (const listener of listeners) {
				listener({
					scope: scopeOf(botId),
					event: {
						type: "botEvolved",
						bundle,
						commitId: "c-1",
						title: "learned to count",
					},
				})
			}
		},
		failToRecord: (botId: string, bundle: EvolvedBundle) => {
			for (const listener of listeners) {
				listener({
					scope: scopeOf(botId),
					event: {
						type: "botEvolutionFailed",
						bundle,
						detail: "index.lock exists",
					},
				})
			}
		},
		failUnscoped: () => {
			for (const listener of listeners) {
				listener({
					scope: null,
					event: {
						type: "botEvolutionFailed",
						bundle: "bot",
						detail: "index.lock exists",
					},
				})
			}
		},
	}
}

type Panels = Pick<
	EvolutionSourceOptions,
	"roster" | "companionPlugin" | "userPlugin" | "spacePlugin"
>

type OpenPanels = {
	botId: string | null
	spaceId?: string | null
}

const createPanels = ({ botId, spaceId = null }: OpenPanels) => {
	const panels: Panels = {
		roster: {
			spaceOfConversation: (id: string) =>
				id === "chat-1" ? "space-1" : undefined,
			hostSpaceIdOf: (spaceRowId: string) => spaceRowId,
			reload: vi.fn(() => Promise.resolve()),
		},
		companionPlugin: {
			getState: () => ({ scope: botId ? botPlugin(botId) : null }),
			reload: vi.fn(),
		},
		userPlugin: { reload: vi.fn() },
		spacePlugin: {
			getState: () => ({ scope: spaceId ? spacePlugin(spaceId) : null }),
			reload: vi.fn(),
		},
	}
	return panels
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const start = (panels: Panels) => {
	const driver = createFakeDriver()
	const reportFailure = vi.fn()
	const stop = startEvolutionSource({ driver, reportFailure, ...panels })
	return { driver, stop, reportFailure }
}

const expectNoReload = (panels: Panels) => {
	expect(panels.roster.reload).not.toHaveBeenCalled()
	expect(panels.companionPlugin.reload).not.toHaveBeenCalled()
	expect(panels.userPlugin.reload).not.toHaveBeenCalled()
	expect(panels.spacePlugin.reload).not.toHaveBeenCalled()
}

describe("evolution source", () => {
	it("re-reads the open companion's plugin and the roster", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(panels.companionPlugin.reload).toHaveBeenCalledTimes(1)
		expect(panels.roster.reload).toHaveBeenCalledTimes(1)
	})

	it("leaves the panels of another companion untouched", () => {
		const panels = createPanels({ botId: "bot-2" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(panels.companionPlugin.reload).not.toHaveBeenCalled()
	})

	it("re-reads the person's plugin", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "user")

		expect(panels.userPlugin.reload).toHaveBeenCalledTimes(1)
		expect(panels.companionPlugin.reload).not.toHaveBeenCalled()
	})

	it("re-reads the plugin of the open space", () => {
		const panels = createPanels({ botId: "bot-1", spaceId: "space-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "space")

		expect(panels.spacePlugin.reload).toHaveBeenCalledTimes(1)
	})

	it("leaves the plugin of another space untouched", () => {
		const panels = createPanels({ botId: "bot-1", spaceId: "space-2" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "space")

		expect(panels.spacePlugin.reload).not.toHaveBeenCalled()
	})

	it("raises no notice when a change is recorded", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver, reportFailure } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it.each([
		["bot", "Couldn’t add a companion’s change to History"],
		["user", "Couldn’t add a change to your profile to History"],
		["space", "Couldn’t add a change to the space to History"],
	] as const)(
		"reports a %s change that couldn't be recorded",
		(bundle, title) => {
			const panels = createPanels({ botId: "bot-1", spaceId: "space-1" })
			const { driver, reportFailure } = start(panels)

			driver.failToRecord("bot-1", bundle)

			expect(reportFailure).toHaveBeenCalledTimes(1)
			expect(reportFailure).toHaveBeenCalledWith({
				title,
				description:
					"The change is still saved, but you can’t undo it from History (index.lock exists). Open settings to review it.",
			})
		},
	)

	it("reloads nothing when a change couldn't be recorded", () => {
		const panels = createPanels({ botId: "bot-1", spaceId: "space-1" })
		const { driver } = start(panels)

		driver.failToRecord("bot-1", "bot")
		driver.failToRecord("bot-1", "user")
		driver.failToRecord("bot-1", "space")

		expectNoReload(panels)
	})

	it("ignores an unrecorded change without a runtime scope", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver, reportFailure } = start(panels)

		driver.failUnscoped()

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("stops reading once detached", async () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver, stop } = start(panels)

		stop()
		await flush()
		driver.evolve("bot-1", "bot")

		expect(panels.roster.reload).not.toHaveBeenCalled()
	})
})
