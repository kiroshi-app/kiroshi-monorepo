import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	BOT,
	bootedHarness,
	createHarness,
	deferred,
	REPLY,
	reload,
	STEP_MS,
	spoken,
} from "./controller-fixtures"

import type { ChatController } from "../chat-controller"
import type { ChatDriver } from "../driver"
import type { FakeChatDriver } from "../fake-driver"
import type { CancelOutcome, TurnState } from "../../agent/contract"
import { createFakeTranscriptStore } from "../../conversations/fake-transcript-store"
import type { TranscriptStore } from "../../conversations/store-port"
import type { TranscriptMessage } from "../../conversations/transcript-contract"
import { botIdentity } from "../../conversations/transcript-fixtures"

const outboxOf = (controller: ChatController) =>
	controller.getState().outbox.map((entry) => entry.text)

const promptsIn = (messages: TranscriptMessage[]) =>
	spoken(messages).filter(([role]) => role === "user")

const submitting =
	(submits: string[], refusing: () => boolean = () => false) =>
	(fake: FakeChatDriver): ChatDriver => ({
		...fake,
		submitPrompt: (scope, text) => {
			submits.push(text)
			return refusing()
				? Promise.reject({ kind: "notStarted" })
				: fake.submitPrompt(scope, text)
		},
	})

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("holds a second prompt over a running turn and sends it after", async () => {
		const { controller } = await bootedHarness()
		await controller.send("first")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await controller.send("second")

		const held = controller.getState()
		expect(
			held.messages.filter((message) => message.role === "user"),
		).toHaveLength(1)
		expect(held.outbox.map((entry) => entry.text)).toEqual(["second"])
		expect(held.errors).toEqual([])

		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
		])
	})

	it("leaves stopping deterministically when cancelTurn is rejected", async () => {
		const { controller } = await bootedHarness({
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				cancelTurn: () =>
					Promise.reject({ kind: "writeFailed", detail: "pipe closed" }),
			}),
		})
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		const rejected = controller.getState()
		expect(rejected.turn).toBe("failed")
		expect(rejected.errors.at(-1)?.error.kind).toBe("writeFailed")

		await vi.runAllTimersAsync()
		expect(controller.getState().turn).not.toBe("stopping")

		await controller.send("here we go again")
		await vi.runAllTimersAsync()
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().messages.at(-1)?.completion).toBe("complete")
	})

	it.each<[string, CancelOutcome, TurnState]>([
		["cancelled", { kind: "cancelled" }, "idle"],
		["nothingToCancel", { kind: "nothingToCancel" }, "idle"],
		[
			"failed",
			{
				kind: "failed",
				failures: [
					{
						botId: BOT,
						reason: {
							source: "session",
							error: { kind: "writeFailed", detail: "pipe closed" },
						},
					},
				],
			},
			"failed",
		],
	])("leaves stopping when the stop answers %s", async (_, outcome, landed) => {
		const { controller } = await bootedHarness({
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				cancelTurn: () => Promise.resolve(outcome),
			}),
		})
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)

		await controller.stop()

		expect(controller.getState().turn).toBe(landed)
	})

	it("names the reason when the stop answers failed", async () => {
		const { controller } = await bootedHarness({
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				cancelTurn: () =>
					Promise.resolve({
						kind: "failed",
						failures: [
							{
								botId: BOT,
								reason: {
									source: "store",
									error: { kind: "unknownTurn", id: "t-1" },
								},
							},
						],
					}),
			}),
		})
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)

		await controller.stop()

		const [failure] = controller.getState().errors.slice(-1)
		expect(failure?.error.kind).toBe("writeFailed")
		expect(JSON.stringify(failure?.error)).toContain("unknownTurn")
	})
})

describe("prompts the session cannot take yet", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("holds a prompt sent before the conversation is open", async () => {
		const base = createFakeTranscriptStore()
		const reading = deferred()
		const store: TranscriptStore = {
			...base,
			mainChat: (botId) => reading.promise.then(() => base.mainChat(botId)),
		}
		const harness = createHarness({ store })
		const opening = harness.controller.open(BOT, null)
		await vi.advanceTimersByTimeAsync(0)

		await harness.controller.send("early")

		expect(outboxOf(harness.controller)).toEqual(["early"])
		expect(harness.controller.getState().messages).toEqual([])
		expect(harness.controller.getState().errors).toEqual([])

		reading.release()
		await opening
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "early", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	it("sends what it holds in the order it was sent, one turn at a time", async () => {
		const harness = await bootedHarness()

		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")

		expect(outboxOf(harness.controller)).toEqual(["second", "third"])

		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
			["user", "third", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(state.errors).toEqual([])
		expect(spoken(await reload(harness.store))).toEqual(spoken(state.messages))
		harness.detach()
	})

	it("records what it was holding when the turn is stopped, and sends none of it", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)

		await harness.controller.stop()
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(promptsIn(state.messages)).toEqual([
			["user", "first", "complete"],
			["user", "second", "complete"],
			["user", "third", "complete"],
		])
		expect(submits).toHaveLength(1)
		expect(submits.at(-1)).toContain("first")
		expect(state.turn).toBe("idle")
		expect(spoken(await reload(harness.store))).toEqual(spoken(state.messages))
		harness.detach()
	})

	it("carries the rebuilt conversation on the prompt after a stop", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })
		await harness.controller.send("first")
		await harness.controller.send("held")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await harness.controller.stop()
		await vi.runAllTimersAsync()

		await harness.controller.send("again")
		await vi.runAllTimersAsync()

		const carried = submits.at(-1) ?? ""
		expect(carried).toContain("held")
		expect(carried).toContain("again")
		expect(harness.controller.getState().outbox).toEqual([])
		harness.detach()
	})

	it("drops one held prompt and keeps the order of the rest", async () => {
		const harness = await bootedHarness()
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")

		const held = harness.controller.getState().outbox
		harness.controller.discard(held[0]?.id ?? "")

		expect(outboxOf(harness.controller)).toEqual(["third"])

		await vi.runAllTimersAsync()

		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "third", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})
})

describe("prompts the session cannot take yet", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("leaves the rest in the outbox when a submission is refused", async () => {
		let refusing = false
		const harness = await bootedHarness({
			driver: submitting([], () => refusing),
		})
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		refusing = true
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(outboxOf(harness.controller)).toEqual(["third"])
		expect(state.rejectedPromptId).toBe(state.messages.at(-1)?.id)
		expect(spoken(state.messages).at(-1)).toEqual([
			"user",
			"second",
			"complete",
		])
		harness.detach()
	})

	it("holds the words when the store refuses a prompt that could have gone out", async () => {
		const base = createFakeTranscriptStore()
		let refusing = true
		const store: TranscriptStore = {
			...base,
			sendUserMessage: (message, summoned) =>
				refusing
					? Promise.reject({ kind: "storage" })
					: base.sendUserMessage(message, summoned),
		}
		const harness = await bootedHarness({ store })

		await harness.controller.send("only")
		await vi.runAllTimersAsync()

		expect(outboxOf(harness.controller)).toEqual(["only"])
		expect(harness.controller.getState().messages).toEqual([])
		expect(harness.controller.getState().errors.at(-1)?.error.kind).toBe(
			"writeFailed",
		)

		refusing = false
		await harness.controller.open(BOT, null)
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "only", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	it("returns a held prompt the store refused to the front of the outbox", async () => {
		const base = createFakeTranscriptStore()
		let refusing = false
		const store: TranscriptStore = {
			...base,
			sendUserMessage: (message, summoned) =>
				refusing
					? Promise.reject({ kind: "storage" })
					: base.sendUserMessage(message, summoned),
		}
		const harness = await bootedHarness({ store })
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		refusing = true
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(outboxOf(harness.controller)).toEqual(["second", "third"])
		expect(promptsIn(state.messages)).toEqual([["user", "first", "complete"]])
		expect(state.errors.at(-1)?.error.kind).toBe("writeFailed")
		harness.detach()
	})

	it("keeps each companion's held prompts to itself", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("mine")
		await harness.controller.send("mine again")

		await harness.controller.open(other.id, null)
		await harness.controller.send("theirs")
		await harness.controller.send("theirs again")

		expect(
			harness.controller.stateFor(BOT).outbox.map((held) => held.text),
		).toEqual(["mine again"])
		expect(
			harness.controller.stateFor(other.id).outbox.map((held) => held.text),
		).toEqual(["theirs again"])

		await vi.runAllTimersAsync()

		const mine = await store.loadPage((await store.mainChat(BOT)).id, null)
		const theirs = await store.loadPage(
			(await store.mainChat(other.id)).id,
			null,
		)
		expect(promptsIn(mine.messages)).toEqual([
			["user", "mine", "complete"],
			["user", "mine again", "complete"],
		])
		expect(promptsIn(theirs.messages)).toEqual([
			["user", "theirs", "complete"],
			["user", "theirs again", "complete"],
		])
		harness.detach()
	})

	it("submits a held prompt naming the files it was staged with", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })

		await harness.controller.send("first")
		await harness.controller.send("read this\n/tmp/shot.png")
		await vi.runAllTimersAsync()

		expect(submits.at(-1)).toContain("/tmp/shot.png")
		expect(spoken(harness.controller.getState().messages).at(-2)).toEqual([
			"user",
			"read this\n/tmp/shot.png",
			"complete",
		])
		harness.detach()
	})
})
