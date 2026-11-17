import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	BOT,
	bootedHarness,
	createHarness,
	headed,
	POISONED,
	POISONED_REFUSAL,
	reload,
	runOf,
	STEP_MS,
	STREAMING_MESSAGE,
	spoken,
} from "./controller-fixtures"

import type { FakeChatDriver } from "../fake-driver"
import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../../conversations/fake-transcript-store"

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("stores a reply the session died under as interrupted", async () => {
		const { driver, controller, store } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })
		driver.pushEvent({
			type: "messageDelta",
			id: "msg-1",
			seq: 1,
			text: "Half",
		})

		await controller.restart()
		await vi.runAllTimersAsync()

		expect(spoken(controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half", "interrupted"],
		])
		expect(spoken(await reload(store))).toEqual(
			spoken(controller.getState().messages),
		)
	})

	it("opens a session on restart and collapses concurrent calls into one", async () => {
		const { driver, controller } = await bootedHarness()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		const [first, second] = await Promise.all([
			controller.restart(),
			controller.restart(),
		])
		await vi.runAllTimersAsync()

		expect(first).toBe(second)
		expect(startSpy).toHaveBeenCalledTimes(1)
		const state = controller.getState()
		expect(state.connection).toBe("ready")
		expect(state.binaryVersion).toBe("fake-0.0.1")
		expect(state.sessionOpen).toBe(true)
		expect(state.sessionId).toBeNull()
	})

	it("starts nothing at all while there is no conversation to scope it by", async () => {
		const store = createFakeTranscriptStore()
		const { driver, controller } = createHarness({
			store: {
				...store,
				mainChat: () => Promise.reject(POISONED),
			},
		})
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		expect(await controller.open(BOT, null)).toBeNull()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).not.toHaveBeenCalled()
		expect(state.runtime).toBeNull()
		expect(state.sessionOpen).toBe(false)
		expect(state.errors.map(({ error }) => error)).toEqual([POISONED_REFUSAL])
	})

	it("starts nothing when the store cannot open the run", async () => {
		const store = createFakeTranscriptStore()
		const { driver, controller } = createHarness({
			store: {
				...store,
				openRuntimeSession: () =>
					Promise.reject({
						kind: "storage",
						failure: { kind: "poisonedConnection" },
					}),
			},
		})
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		expect(await controller.open(BOT, null)).toBeNull()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).not.toHaveBeenCalled()
		expect(state.runtime).toBeNull()
		expect(state.conversationId).toBe(FAKE_CHAT_ID)
		expect(state.errors.at(-1)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (storage, poisonedConnection)",
		})
	})

	it("reports an unavailable binary on restart without opening a session", async () => {
		const { driver, controller } = createHarness()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		vi.spyOn(driver, "check").mockResolvedValue({
			connection: "unavailable",
			binaryVersion: null,
			authenticated: false,
			error: { kind: "notAuthenticated" },
		})

		await controller.open(BOT, null)
		expect(await controller.restart()).toBeNull()
		expect(startSpy).not.toHaveBeenCalled()
		const state = controller.getState()
		expect(state.connection).toBe("unavailable")
		expect(state.sessionOpen).toBe(false)
		expect(state.errors.at(-1)?.error.kind).toBe("notAuthenticated")
	})

	it("resumes the id this launch learned under a run of its own", async () => {
		const { driver, store, controller } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const sessionId = controller.getState().sessionId
		const replaced = controller.getState().runtime
		expect(sessionId).not.toBeNull()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		const submitSpy = vi.spyOn(driver, "submitPrompt")

		await controller.restart()
		await vi.runAllTimersAsync()
		await controller.send("again")
		await vi.runAllTimersAsync()

		const live = controller.getState().runtime
		expect(startSpy).toHaveBeenCalledWith(live, sessionId)
		expect(submitSpy).toHaveBeenCalledWith(
			live,
			await headed({ store, controller }, "again"),
			{ turnId: expect.any(String), promptId: expect.any(String) },
		)
		expect(live?.runtimeSessionId).not.toBe(replaced?.runtimeSessionId)
	})
})

describe("reopening a session", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("resumes the session identifier of the companion it is given", async () => {
		const { driver, controller } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const sessionId = controller.getState().sessionId
		expect(sessionId).not.toBeNull()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.reopen(BOT)
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith(runOf(controller), sessionId)
	})

	it("answers nothing for a companion whose session it never opened", async () => {
		const { controller } = await bootedHarness()

		await expect(controller.reopen("stranger")).resolves.toBeNull()
	})

	const REFUSED_RESUME = {
		type: "failed",
		error: { kind: "resumeFailed", forgotSessionId: true },
	} as const

	const refuseResumeWhileStarting = (driver: FakeChatDriver) => {
		const start = driver.startOrResumeSession
		vi.spyOn(driver, "startOrResumeSession").mockImplementation(
			(scope, resume) => {
				driver.pushEvent(REFUSED_RESUME, scope)
				return start(scope, resume)
			},
		)
	}

	const reopenedHarness = async () => {
		const harness = await bootedHarness()
		await harness.controller.send("hello")
		await vi.runAllTimersAsync()
		return harness
	}

	it("leaves no error when the refusal reaches the front before it answers", async () => {
		const { driver, controller } = await reopenedHarness()
		refuseResumeWhileStarting(driver)

		await controller.reopen(BOT)
		await vi.runAllTimersAsync()

		expect(controller.getState().errors).toEqual([])
	})

	it("leaves no error when the refusal reaches the front after it answers", async () => {
		const { driver, controller } = await reopenedHarness()

		await controller.reopen(BOT)
		await vi.runAllTimersAsync()
		driver.pushEvent(REFUSED_RESUME)
		await vi.runAllTimersAsync()

		expect(controller.getState().errors).toEqual([])
	})

	it("spends the run of a reopen whose resume was refused", async () => {
		const { driver, controller } = await reopenedHarness()
		await controller.reopen(BOT)
		await vi.runAllTimersAsync()
		const refused = runOf(controller)

		driver.pushEvent(REFUSED_RESUME)
		await vi.runAllTimersAsync()
		await controller.send("where were we?")
		await vi.runAllTimersAsync()

		expect(runOf(controller).runtimeSessionId).not.toBe(
			refused.runtimeSessionId,
		)
	})

	it("keeps the error of a resume refused outside a reopen", async () => {
		const { driver, controller } = await reopenedHarness()
		await controller.reopen(BOT)
		await vi.runAllTimersAsync()

		await controller.restart()
		await vi.runAllTimersAsync()
		driver.pushEvent(REFUSED_RESUME)
		await vi.runAllTimersAsync()

		expect(controller.getState().errors.map((held) => held.error.kind)).toEqual(
			["resumeFailed"],
		)
	})

	it("waits for a running turn to end before it reopens", async () => {
		const { driver, controller } = await bootedHarness()
		const sent = controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 3)
		expect(controller.getState().turn).toBe("running")
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		const reopening = controller.reopen(BOT)
		await vi.advanceTimersByTimeAsync(STEP_MS)
		expect(startSpy).not.toHaveBeenCalled()

		await sent
		await vi.runAllTimersAsync()
		await reopening

		expect(startSpy).toHaveBeenCalledTimes(1)
	})
})
