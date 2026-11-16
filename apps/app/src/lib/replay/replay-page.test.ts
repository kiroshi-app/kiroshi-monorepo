// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"

import { answerReplayCommands } from "./replay-page"
import {
	REPLAY_ANSWER_EVENT,
	REPLAY_COMMAND_EVENT,
	type ReplayAnswer,
	type ReplayRequest,
} from "./replay-protocol"

const createFakeHot = () => {
	const listeners = new Map<string, (request: ReplayRequest) => void>()
	const sent: { event: string; answer: ReplayAnswer }[] = []
	return {
		listeners,
		sent,
		hot: {
			on: (event: string, listener: (request: ReplayRequest) => void) => {
				listeners.set(event, listener)
			},
			send: (event: string, answer: ReplayAnswer) => {
				sent.push({ event, answer })
			},
		},
	}
}

afterEach(() => {
	document.documentElement.className = ""
	Reflect.deleteProperty(window, "__TSR_ROUTER__")
})

describe("the page answering replay commands", () => {
	it("executes and answers in the main window", async () => {
		const { hot, listeners, sent } = createFakeHot()
		answerReplayCommands(hot, "main")

		listeners.get(REPLAY_COMMAND_EVENT)?.({
			id: "request-1",
			command: { name: "theme", scheme: "dark" },
		})

		await vi.waitFor(() => expect(sent).toHaveLength(1))
		expect(sent).toEqual([
			{
				event: REPLAY_ANSWER_EVENT,
				answer: {
					id: "request-1",
					outcome: { ok: true, result: { scheme: "dark", rootClass: "dark" } },
				},
			},
		])
	})

	it.each(["workspace-2", "drag-ghost", undefined])(
		"listens to nothing in the window labelled %s",
		(windowLabel) => {
			const { hot, listeners } = createFakeHot()

			answerReplayCommands(hot, windowLabel)

			expect([...listeners.keys()]).toEqual([])
			expect(Object.hasOwn(window, "__TSR_ROUTER__")).toBe(false)
		},
	)
})
