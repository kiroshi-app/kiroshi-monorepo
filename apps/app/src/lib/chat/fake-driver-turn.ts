import { completionForOutcome, turnForOutcome } from "./chat-state"
import { createFakeAsks } from "./fake-driver-asks"
import type { EmitFor, FakeRun } from "./fake-driver-runs"

import type { ChatMessage, TurnOutcome } from "../agent/contract"

type FinishTurn = (run: FakeRun, outcome: TurnOutcome) => void

type TurnStepsOptions = {
	emitFor: EmitFor
	finishTurn: FinishTurn
	replyFor: (prompt: string) => string
}

const FAIL_DIRECTIVE = "/fail"

const PERMISSION_DIRECTIVE = "/permission"

const QUESTION_DIRECTIVE = "/question"

export function defaultReply(prompt: string): string {
	return `Simulated reply to "${prompt}".\n\nThe fake driver streams this text piece by piece to reproduce a whole turn of the agent.\n\nEach paragraph lands in the thread as soon as it is finished.`
}

function toChunks(reply: string): string[] {
	const words = reply.split(" ")
	const chunks: string[] = []
	for (let index = 0; index < words.length; index += 3) {
		const chunk = words.slice(index, index + 3).join(" ")
		chunks.push(index === 0 ? chunk : ` ${chunk}`)
	}
	return chunks
}

export const createFinishTurn =
	(emitFor: EmitFor): FinishTurn =>
	(run, outcome) => {
		if (run.streaming) {
			emitFor(run, {
				type: "messageCompleted",
				message: {
					...run.streaming,
					text: outcome === "completed" ? run.streaming.text : "",
					completion: completionForOutcome(outcome),
				},
			})
			run.streaming = null
		}
		run.turnActive = false
		run.waiting = false
		run.pendingPermissionId = null
		emitFor(run, {
			type: "turnEnded",
			ended: { sessionId: run.sessionId, outcome },
		})
		emitFor(run, { type: "turnChanged", state: turnForOutcome(outcome) })
	}

export const createTurnSteps = ({
	emitFor,
	finishTurn,
	replyFor,
}: TurnStepsOptions) => {
	let messageSeq = 0
	const { requestPermission, requestQuestion } = createFakeAsks(emitFor)

	const appendDelta = (run: FakeRun, id: string, text: string) => {
		if (!run.streaming || run.streaming.id !== id) {
			return
		}
		run.streaming = { ...run.streaming, text: run.streaming.text + text }
		run.deltaSeq += 1
		emitFor(run, { type: "messageDelta", id, seq: run.deltaSeq, text })
	}

	return (run: FakeRun, prompt: string): Array<() => void> => {
		messageSeq += 1
		const message: ChatMessage = {
			id: `fake-msg-${messageSeq}`,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: Date.now(),
		}
		const failing = prompt.includes(FAIL_DIRECTIVE)
		const chunks = toChunks(replyFor(prompt))
		const streamed = failing ? chunks.slice(0, 2) : chunks
		const activityId = `fake-act-${messageSeq}`

		const steps: Array<() => void> = [
			() => emitFor(run, { type: "turnChanged", state: "submitting" }),
			() => emitFor(run, { type: "turnChanged", state: "running" }),
			() =>
				emitFor(run, {
					type: "activity",
					activity: {
						id: activityId,
						title: "Thinking",
						kind: "tool",
						status: "running",
					},
				}),
			() => {
				run.streaming = message
				emitFor(run, { type: "messageStarted", message })
			},
		]
		if (prompt.includes(PERMISSION_DIRECTIVE)) {
			steps.push(() => requestPermission(run))
		}
		if (prompt.includes(QUESTION_DIRECTIVE)) {
			steps.push(() => requestQuestion(run))
		}
		for (const chunk of streamed) {
			steps.push(() => appendDelta(run, message.id, chunk))
		}
		steps.push(() =>
			emitFor(run, {
				type: "activity",
				activity: {
					id: activityId,
					title: "Thinking",
					kind: "tool",
					status: failing ? "failed" : "succeeded",
				},
			}),
		)
		if (failing) {
			steps.push(() => {
				emitFor(run, {
					type: "failed",
					error: {
						kind: "crashed",
						code: 1,
						detail: "Simulated fake driver crash",
					},
				})
				finishTurn(run, "failed")
			})
		} else {
			steps.push(() => finishTurn(run, "completed"))
		}
		return steps
	}
}
