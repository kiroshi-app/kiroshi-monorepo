import { describe, expect, it } from "bun:test"

import { createRouter } from "./serve"

import type {
	AgentProvider,
	EmitFrame,
	SessionFrame,
} from "./providers/provider"

const INTERVAL_MS = 20

const BEATS = 4

type Written = {
	session?: string
	frame?: SessionFrame
}

type HangingQuery = {
	provider: AgentProvider
	answer: () => void
	interrupted: () => number
}

const refuses = (name: string) => () => {
	throw new Error(`the heartbeat test does not call ${name}`)
}

const hangingQuery = (): HangingQuery => {
	let emit: EmitFrame = () => undefined
	let interrupts = 0
	const provider: AgentProvider = {
		id: "hanging",
		version: "0.0.0",
		sdkVersion: "0.0.0",
		capabilities: [],
		assertReady: refuses("assertReady"),
		authenticate: refuses("authenticate"),
		signIn: refuses("signIn"),
		enterSignInCode: refuses("enterSignInCode"),
		cancelSignIn: refuses("cancelSignIn"),
		models: refuses("models"),
		tools: refuses("tools"),
		title: refuses("title"),
		open: async (_request, emitting) => {
			emit = emitting
			return {
				prompt: () => undefined,
				interrupt: async () => {
					interrupts += 1
				},
				decide: () => undefined,
				close: async () => undefined,
			}
		},
	}
	return {
		provider,
		answer: () => emit({ type: "result", subtype: "success", is_error: false }),
		interrupted: () => interrupts,
	}
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const settled = () => pause(0)

const heartbeatsIn = (written: Written[]) =>
	written.filter(
		(line) => line.session === "k1" && line.frame?.type === "heartbeat",
	).length

describe("the heartbeat of a session", () => {
	it("beats on the interval while the query hangs, through an interrupt, and stops at its result", async () => {
		const written: Written[] = []
		const query = hangingQuery()
		const { dispatch } = createRouter(
			query.provider,
			(payload) => written.push(payload as Written),
			INTERVAL_MS,
		)

		dispatch({ type: "open", session: "k1" })
		await settled()
		expect(heartbeatsIn(written)).toBe(0)

		dispatch({ type: "prompt", session: "k1", text: "hello" })
		await settled()
		dispatch({ type: "interrupt", session: "k1" })
		await pause(INTERVAL_MS * BEATS + INTERVAL_MS / 2)
		const beaten = heartbeatsIn(written)
		expect(query.interrupted()).toBe(1)
		expect(beaten).toBeGreaterThanOrEqual(BEATS - 2)
		expect(beaten).toBeLessThanOrEqual(BEATS)

		query.answer()
		await pause(INTERVAL_MS * BEATS)
		expect(heartbeatsIn(written)).toBe(beaten)
	})

	it("stops when the session closes with its query still in flight", async () => {
		const written: Written[] = []
		const query = hangingQuery()
		const { dispatch } = createRouter(
			query.provider,
			(payload) => written.push(payload as Written),
			INTERVAL_MS,
		)

		dispatch({ type: "open", session: "k1" })
		await settled()
		dispatch({ type: "prompt", session: "k1", text: "hello" })
		await pause(INTERVAL_MS * 2 + INTERVAL_MS / 2)
		dispatch({ type: "close", session: "k1" })
		const beaten = heartbeatsIn(written)
		await pause(INTERVAL_MS * BEATS)

		expect(beaten).toBeGreaterThan(0)
		expect(heartbeatsIn(written)).toBe(beaten)
	})
})
