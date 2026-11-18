import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	BOT,
	bootedHarness,
	createHarness,
	REPLY,
	reload,
	runOf,
	STEP_MS,
	STREAMING_MESSAGE,
	spoken,
} from "./controller-fixtures"

import type { AgentEvent, ScopedEvent } from "../../agent/contract"
import { createFakeReconnections } from "../../conversations/fake-reconnections"
import { createFakeTranscriptStore } from "../../conversations/fake-transcript-store"
import { seatBots } from "../../conversations/transcript-fixtures"

const STALE_TURN: AgentEvent[] = [
	{ type: "turnChanged", state: "running" },
	{ type: "sessionReady", sessionId: "dead", resumed: false },
	{
		type: "messageStarted",
		message: { ...STREAMING_MESSAGE, id: "ghost" },
	},
	{ type: "messageDelta", id: "ghost", seq: 1, text: "phantom" },
	{
		type: "activity",
		activity: {
			id: "ghost-act",
			title: "Read",
			kind: "tool",
			status: "running",
		},
	},
	{ type: "turnEnded", ended: { sessionId: "dead", outcome: "failed" } },
]

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("lets nothing from a replaced run touch the transcript or the screen", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const replaced = controller.getState().runtime

		await controller.restart()
		await vi.runAllTimersAsync()
		const live = controller.getState().runtime
		const restarted = controller.getState().messages
		expect(replaced).not.toBeNull()
		expect(live?.runtimeSessionId).not.toBe(replaced?.runtimeSessionId)
		expect(live?.epoch).toBe((replaced?.epoch ?? 0) + 1)

		for (const late of STALE_TURN) {
			driver.pushEvent(late, replaced)
		}
		await vi.runAllTimersAsync()

		expect(controller.getState().messages).toEqual(restarted)
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().activities).toEqual([])
		expect(controller.getState().sessionId).not.toBe("dead")
		expect(spoken(await reload(store))).toEqual(spoken(restarted))

		await controller.send("and now?")
		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(spoken(state.messages).slice(-2)).toEqual([
			["user", "and now?", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("lets a replaced run end nothing of the turn running in its place", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const replaced = runOf(controller)

		await controller.restart()
		await vi.runAllTimersAsync()
		await controller.send("again")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		const streaming = controller.getState().messages.at(-1)
		expect(streaming?.completion).toBe("streaming")

		driver.pushEvent(
			{
				type: "messageDelta",
				id: streaming?.id ?? "",
				seq: 99,
				text: " phantom",
			},
			replaced,
		)
		driver.pushEvent(
			{ type: "turnEnded", ended: { sessionId: "dead", outcome: "failed" } },
			replaced,
		)
		await vi.advanceTimersByTimeAsync(0)

		const interfered = controller.getState()
		expect(interfered.turn).toBe("running")
		expect(interfered.messages.at(-1)?.content).not.toContain("phantom")
		expect(interfered.messages.at(-1)?.completion).toBe("streaming")

		await vi.runAllTimersAsync()
		const settled = controller.getState()
		expect(settled.turn).toBe("idle")
		expect(spoken(settled.messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
		expect(spoken(await reload(store))).toEqual(spoken(settled.messages))
	})

	it("still takes the same frames when they come from the run it holds", async () => {
		const { driver, controller } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		const live = controller.getState().runtime

		for (const event of STALE_TURN) {
			driver.pushEvent(event, live)
		}
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.sessionId).toBe("dead")
		expect(spoken(state.messages).at(-1)).toEqual([
			"assistant",
			"phantom",
			"failed",
		])
	})

	it("logs a turn of its run that failed for no connection when the open Space does not list the agent", async () => {
		const logged = vi.spyOn(console, "info").mockImplementation(() => undefined)
		const { driver, controller } = await bootedHarness({
			isListedInOpenSpace: () => false,
		})
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		const live = controller.getState().runtime

		driver.pushEvent(
			{
				type: "turnEnded",
				ended: { sessionId: null, outcome: "failed", failure: "noConnection" },
			},
			live,
		)
		await vi.runAllTimersAsync()

		expect(controller.getState().turn).toBe("failed")
		expect(logged).toHaveBeenCalledWith(
			`chat-controller: a turn of conversation ${live?.conversationId} ended for no connection in a Space that is not on screen`,
		)
		logged.mockRestore()
	})

	it("offers no retry of a prompt whose turn failed for no connection, then follows its replay to a completed turn", async () => {
		const { driver, controller } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		const live = controller.getState().runtime

		driver.pushEvent(
			{
				type: "turnEnded",
				ended: { sessionId: null, outcome: "failed", failure: "noConnection" },
			},
			live,
		)
		await vi.runAllTimersAsync()

		expect(controller.getState().rejectedPromptId).toBeNull()

		const replay: AgentEvent[] = [
			{ type: "turnChanged", state: "submitting" },
			{ type: "turnChanged", state: "running" },
			{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
		]
		for (const event of replay) {
			driver.pushEvent(event, live)
		}
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.rejectedPromptId).toBeNull()
		expect(state.errors).toEqual([])
	})

	it("waits for the subscription before starting, so startup events are not lost", async () => {
		let listener: ((event: ScopedEvent) => void) | null = null
		const { controller } = createHarness({
			driver: (fake) => ({
				...fake,
				startOrResumeSession: (scope) => {
					listener?.({
						scope,
						event: { type: "sessionReady", sessionId: "s-1", resumed: false },
					})
					return Promise.resolve({ resumed: false })
				},
				subscribe: (onEvent) =>
					Promise.resolve()
						.then(() => undefined)
						.then(() => {
							listener = onEvent
							return () => {
								listener = null
							}
						}),
			}),
		})

		await controller.open(BOT, null)

		expect(controller.getState().sessionId).toBe("s-1")
	})
})

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps a stop and a shutdown from reaching the run that replaced them", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		await vi.runAllTimersAsync()
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().messages.at(-1)?.completion).toBe("cancelled")
		const replaced = runOf(controller)

		await controller.restart()
		await vi.runAllTimersAsync()
		const live = runOf(controller)

		const staleStop = driver.cancelTurn(replaced)
		const staleShutdown = driver.shutdown(replaced)

		await expect(staleStop).rejects.toEqual({
			kind: "staleRuntimeSession",
			runtimeSessionId: replaced.runtimeSessionId,
		})
		await expect(staleShutdown).rejects.toEqual({
			kind: "staleRuntimeSession",
			runtimeSessionId: replaced.runtimeSessionId,
		})

		await controller.send("still there?")
		await vi.runAllTimersAsync()
		expect(runOf(controller)).toEqual(live)
		expect(controller.getState().turn).toBe("idle")
		expect(spoken(controller.getState().messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])

		await controller.shutdown()
		await controller.shutdown()

		expect(
			controller.getState().errors.map((entry) => entry.error.kind),
		).toEqual([])
		expect(spoken(await reload(store))).toEqual(
			spoken(controller.getState().messages),
		)
	})
})

describe("createChatController on a reconnection", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("rereads the main chat of the companions the open Space lists and of no other", async () => {
		const store = createFakeTranscriptStore()
		const [unshared] = await seatBots(store, "personal", ["Nyx"])
		const loadPage = vi.spyOn(store, "loadPage")
		const relay = createFakeReconnections()
		const listedBotIds = new Set([BOT, unshared.id])
		const { controller } = await bootedHarness({
			store,
			onReconnected: relay.onReconnected,
			isListedInOpenSpace: (botId) => listedBotIds.has(botId),
		})
		await controller.openAside(unshared.id, null)
		await vi.runAllTimersAsync()
		const listedChatId = controller.stateFor(BOT).conversationId
		expect(controller.stateFor(unshared.id).conversationId).not.toBeNull()

		listedBotIds.delete(unshared.id)
		loadPage.mockClear()
		relay.reconnect()
		await vi.runAllTimersAsync()

		expect(loadPage.mock.calls.map(([id]) => id)).toEqual([listedChatId])
	})
})
