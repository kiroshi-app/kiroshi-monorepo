import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	BOT,
	bootedHarness,
	deferred,
	REPLY,
	referentialStore,
	reload,
	runOf,
	spaceElsewhere,
	spoken,
} from "./controller-fixtures"

import { questionMessageIdOf } from "../question-message"
import type { QuestionRequest, ScopedEvent } from "../../agent/contract"
import { createFakeTranscriptStore } from "../../conversations/fake-transcript-store"
import type { TranscriptStore } from "../../conversations/store-port"

const ASKED: QuestionRequest = {
	id: "ask-1",
	questions: [
		{
			header: "Framework",
			question: "Which framework should it use?",
			multiSelect: false,
			options: [{ label: "React", description: null, preview: null }],
		},
	],
}

const askedInAThreadLeftBehind = async (store: TranscriptStore) => {
	const elsewhere = await spaceElsewhere(store)
	const harness = await bootedHarness({ store })
	await harness.controller.send("pick one /question")
	await vi.runAllTimersAsync()
	const asked = harness.controller.getState().question
	await harness.controller.open(BOT, elsewhere)
	await vi.runAllTimersAsync()
	return { ...harness, asked }
}

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("pauses on a permission request and resumes on allowOnce", async () => {
		const { controller } = await bootedHarness()
		await controller.send("list the files /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		expect(paused.permission?.toolName).toBe("Bash")
		expect(paused.turn).toBe("running")

		await controller.respond(paused.permission?.id ?? "", "allowOnce")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("complete")
	})

	it("cancels the turn when the permission is denied", async () => {
		const { controller, store } = await bootedHarness()
		await controller.send("delete everything /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		await controller.respond(paused.permission?.id ?? "", "deny")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("cancelled")
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("answers a question and leaves what was asked in the transcript", async () => {
		const { controller, store, driver } = await bootedHarness()
		const answerQuestion = vi.spyOn(driver, "answerQuestion")
		await controller.send("pick one /question")
		await vi.runAllTimersAsync()

		const asked = controller.getState().question
		expect(asked?.questions[0].header).toBe("Framework")

		await controller.answer(asked?.id ?? "", {
			"Which framework should it use?": "React",
		})
		await vi.runAllTimersAsync()

		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), asked?.id, {
			"Which framework should it use?": "React",
		})
		const state = controller.getState()
		expect(state.question).toBeNull()
		const asking = state.messages.find(
			(entry) => entry.id === questionMessageIdOf(asked?.id ?? ""),
		)
		expect(asking?.role).toBe("assistant")
		expect(asking?.content).toContain("Which framework should it use?")
		const answered = state.messages.find(
			(entry) => entry.repliedToMessageId === asking?.id,
		)
		expect(answered?.role).toBe("user")
		expect(answered?.content).toBe("React")
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("answers a pending question with what the reader typed in the composer", async () => {
		const { controller, driver } = await bootedHarness()
		const answerQuestion = vi.spyOn(driver, "answerQuestion")
		await controller.send("pick one /question")
		await vi.runAllTimersAsync()

		const asked = controller.getState().question
		expect(asked).not.toBeNull()

		await controller.send("never mind, do it your way")
		await vi.runAllTimersAsync()

		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), asked?.id, {
			"Which framework should it use?": "never mind, do it your way",
		})
		const state = controller.getState()
		expect(state.question).toBeNull()
		const answered = state.messages.find(
			(entry) =>
				entry.repliedToMessageId === questionMessageIdOf(asked?.id ?? ""),
		)
		expect(answered?.role).toBe("user")
		expect(answered?.content).toBe("never mind, do it your way")
	})

	it("sends a message as a plain prompt when the question belongs to a thread left behind", async () => {
		const store = referentialStore(createFakeTranscriptStore())
		const { controller, driver, asked } = await askedInAThreadLeftBehind(store)
		expect(asked).not.toBeNull()
		const submitSpy = vi.spyOn(driver, "submitPrompt")

		await controller.send("never mind, do it your way")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.errors).toEqual([])
		expect(submitSpy.mock.lastCall?.[0].conversationId).toBe(
			state.conversationId,
		)
		expect(spoken(state.messages)).toEqual([
			["user", "never mind, do it your way", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(
			(await reload(store)).map((message) => message.content),
		).not.toContain("never mind, do it your way")
	})

	it("writes nothing when a question of a thread left behind is answered from the selector", async () => {
		const store = referentialStore(createFakeTranscriptStore())
		const { controller, driver, asked } = await askedInAThreadLeftBehind(store)
		const answerSpy = vi.spyOn(driver, "answerQuestion")
		const shown = controller.getState()
		const leftBehind = spoken(await reload(store))

		await controller.answer(asked?.id ?? "", { Framework: "React" })
		await vi.runAllTimersAsync()

		expect(answerSpy).not.toHaveBeenCalled()
		expect(controller.getState()).toBe(shown)
		expect(spoken(await reload(store))).toEqual(leftBehind)
	})
})

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("points an answer at an asking row still on its way to the store", async () => {
		const asking = deferred()
		const base = createFakeTranscriptStore()
		const store = referentialStore({
			...base,
			openAssistantMessage: (message) =>
				asking.promise.then(() => base.openAssistantMessage(message)),
		})
		const { controller } = await bootedHarness({ store })
		await controller.send("pick one /question")
		await vi.runAllTimersAsync()

		const asked = controller.getState().question
		expect(asked).not.toBeNull()

		await controller.send("never mind, do it your way")
		asking.release()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.errors).toEqual([])
		const answered = state.messages.find(
			(message) => message.content === "never mind, do it your way",
		)
		expect(answered?.repliedToMessageId).toBe(
			questionMessageIdOf(asked?.id ?? ""),
		)
	})

	it("answers a question the store never took the asking for", async () => {
		const answerQuestion = vi.fn(() => Promise.resolve())
		let listen: ((event: ScopedEvent) => void) | null = null
		let hasAsked = false
		const askWhileThePromptIsWritten = () => {
			if (hasAsked) {
				return
			}
			hasAsked = true
			listen?.({
				scope: runOf(controller),
				event: { type: "questionRequested", request: ASKED },
			})
		}
		const base = createFakeTranscriptStore()
		const asking: TranscriptStore = {
			...base,
			sendUserMessage: (message, summoned) => {
				askWhileThePromptIsWritten()
				return base.sendUserMessage(message, summoned)
			},
		}
		const store = referentialStore(asking)
		const { controller } = await bootedHarness({
			store,
			driver: (fake) => ({
				...fake,
				subscribe: (onEvent) => {
					listen = onEvent
					return fake.subscribe(onEvent)
				},
				submitPrompt: () => Promise.resolve(),
				answerQuestion,
			}),
		})

		await controller.send("pick one")
		await vi.runAllTimersAsync()
		expect(controller.getState().question?.id).toBe(ASKED.id)
		expect(
			controller.getState().messages.map((message) => message.id),
		).not.toContain(questionMessageIdOf(ASKED.id))

		await controller.send("never mind, do it your way")
		await vi.runAllTimersAsync()

		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), ASKED.id, {
			"Which framework should it use?": "never mind, do it your way",
		})
		const state = controller.getState()
		expect(state.errors).toEqual([])
		const answered = state.messages.at(-1)
		expect(answered?.role).toBe("user")
		expect(answered?.content).toBe("never mind, do it your way")
		expect(answered?.repliedToMessageId).toBeNull()
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("leaves no permission activity pending after either decision", async () => {
		for (const decision of ["allowOnce", "deny"] as const) {
			const { controller } = await bootedHarness()
			await controller.send("list the files /permission")
			await vi.runAllTimersAsync()

			const paused = controller.getState()
			expect(paused.permission).not.toBeNull()

			await controller.respond(paused.permission?.id ?? "", decision)
			await vi.runAllTimersAsync()

			const state = controller.getState()
			expect(state.permission).toBeNull()
			expect(
				state.activities.filter((entry) => entry.status === "pending"),
			).toEqual([])
			expect(
				state.activities.find((entry) => entry.id === paused.permission?.id)
					?.status,
			).toBe(decision === "allowOnce" ? "succeeded" : "failed")
		}
	})

	it("holds a question asked after the turn ended, until it is answered", async () => {
		let listen: ((event: ScopedEvent) => void) | null = null
		const answerQuestion = vi.fn((scope, id: string) => {
			listen?.({
				scope,
				event: { type: "permissionResolved", id, decision: "allowOnce" },
			})
			return Promise.resolve()
		})
		const { controller } = await bootedHarness({
			driver: (fake) => ({
				...fake,
				subscribe: (onEvent) => {
					listen = onEvent
					return fake.subscribe(onEvent)
				},
				answerQuestion,
			}),
		})
		await controller.send("hello")
		await vi.runAllTimersAsync()
		expect(controller.getState().turn).toBe("idle")
		const askLate = async () => {
			listen?.({
				scope: runOf(controller),
				turn: {
					turnId: "turn-continued",
					continuesTurnId: "turn-asked",
					conversationId: controller.getState().conversationId ?? "",
				},
				event: { type: "questionRequested", request: ASKED },
			})
			await vi.runAllTimersAsync()
		}

		await askLate()
		expect(controller.getState().question?.id).toBe(ASKED.id)

		await controller.answer(ASKED.id, {
			"Which framework should it use?": "React",
		})
		await vi.runAllTimersAsync()
		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), ASKED.id, {
			"Which framework should it use?": "React",
		})
		expect(controller.getState().question).toBeNull()

		await askLate()
		expect(controller.getState().question).toBeNull()
	})
})
