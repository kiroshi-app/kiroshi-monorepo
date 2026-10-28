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
import {
	botPlugin,
	spacePlugin,
	USER_PLUGIN,
} from "../conversations/plugin-scope"

const scopeOf = (botId: string): RuntimeScope => ({
	conversationId: "chat-1",
	botId,
	runtimeSessionId: "run-1",
	epoch: 1,
})

const unrecorded = (bundle: EvolvedBundle): ScopedEvent["event"] => ({
	type: "botEvolutionFailed",
	bundle,
	detail: "index.lock exists",
})

const createFakeDriver = () => {
	const listeners = new Set<(event: ScopedEvent) => void>()

	const emit = (event: ScopedEvent) => {
		for (const listener of listeners) {
			listener(event)
		}
	}

	return {
		subscribe: (onEvent: (event: ScopedEvent) => void) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},
		evolve: (botId: string, bundle: EvolvedBundle) =>
			emit({
				scope: scopeOf(botId),
				event: {
					type: "botEvolved",
					bundle,
					commitId: "c-1",
					title: "learned to count",
				},
			}),
		failToRecord: (botId: string, bundle: EvolvedBundle) =>
			emit({ scope: scopeOf(botId), event: unrecorded(bundle) }),
		failUnscoped: () => emit({ scope: null, event: unrecorded("bot") }),
	}
}

type Panels = Pick<EvolutionSourceOptions, "roster" | "rereadPlugin">

const createPanels = () => {
	const panels = {
		roster: {
			spaceOfConversation: (id: string) =>
				id === "chat-1" ? "space-1" : undefined,
			hostSpaceIdOf: (spaceRowId: string) => `host-${spaceRowId}`,
			reload: vi.fn(() => Promise.resolve()),
		},
		rereadPlugin: vi.fn(),
	} satisfies Panels
	return panels
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const start = (panels: Panels) => {
	const driver = createFakeDriver()
	const reportFailure = vi.fn()
	const stop = startEvolutionSource({ driver, reportFailure, ...panels })
	return { driver, stop, reportFailure }
}

describe("evolution source", () => {
	it("re-reads the companion's plugin and the roster", () => {
		const panels = createPanels()
		const { driver } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(panels.rereadPlugin).toHaveBeenCalledExactlyOnceWith(
			botPlugin("bot-1"),
		)
		expect(panels.roster.reload).toHaveBeenCalledTimes(1)
	})

	it("re-reads the person's plugin", () => {
		const panels = createPanels()
		const { driver } = start(panels)

		driver.evolve("bot-1", "user")

		expect(panels.rereadPlugin).toHaveBeenCalledExactlyOnceWith(USER_PLUGIN)
	})

	it("re-reads the plugin of the space hosting the conversation", () => {
		const panels = createPanels()
		const { driver } = start(panels)

		driver.evolve("bot-1", "space")

		expect(panels.rereadPlugin).toHaveBeenCalledExactlyOnceWith(
			spacePlugin("host-space-1"),
		)
	})

	it("raises no notice when a change is recorded", () => {
		const panels = createPanels()
		const { driver, reportFailure } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it.each([
		["bot", "Couldn’t add an agent’s change to History"],
		["user", "Couldn’t add a change to your profile to History"],
		["space", "Couldn’t add a change to the space to History"],
	] as const)(
		"reports a %s change that couldn't be recorded",
		(bundle, title) => {
			const panels = createPanels()
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
		const panels = createPanels()
		const { driver } = start(panels)

		driver.failToRecord("bot-1", "bot")
		driver.failToRecord("bot-1", "user")
		driver.failToRecord("bot-1", "space")

		expect(panels.roster.reload).not.toHaveBeenCalled()
		expect(panels.rereadPlugin).not.toHaveBeenCalled()
	})

	it("ignores an unrecorded change without a runtime scope", () => {
		const panels = createPanels()
		const { driver, reportFailure } = start(panels)

		driver.failUnscoped()

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("stops reading once detached", async () => {
		const panels = createPanels()
		const { driver, stop } = start(panels)

		stop()
		await flush()
		driver.evolve("bot-1", "bot")

		expect(panels.roster.reload).not.toHaveBeenCalled()
	})
})
