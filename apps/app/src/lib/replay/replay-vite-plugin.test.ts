import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import {
	REPLAY_ANSWER_EVENT,
	REPLAY_HEADER,
	REPLAY_HTTP_PREFIX,
	type ReplayOutcome,
	type ReplayRequest,
} from "./replay-protocol"
import { createReplayMiddleware, replayPlugin } from "./replay-vite-plugin"

type FakePage = (request: ReplayRequest) => unknown

type ReplayServerOptions = {
	isEnabled?: boolean
	pages?: FakePage[]
	answerTimeoutMs?: number
}

type ReplayCall = {
	path: string
	body?: unknown
	headers?: Record<string, string>
	method?: string
}

const FELL_THROUGH_STATUS = 299
const REPLAY_HEADERS = { [REPLAY_HEADER]: "1" }

const servers: Server[] = []

const answeringWith =
	(outcome: ReplayOutcome): FakePage =>
	({ id }) => ({ id, outcome })

const startReplayServer = async ({
	isEnabled = true,
	pages = [],
	answerTimeoutMs = 1000,
}: ReplayServerOptions = {}) => {
	const answerListeners: ((payload: unknown) => void)[] = []
	const sent: ReplayRequest[] = []
	const subscribed: string[] = []
	const middleware = createReplayMiddleware({
		isEnabled,
		answerTimeoutMs,
		channel: {
			on: (event, listener) => {
				subscribed.push(event)
				answerListeners.push(listener)
			},
			send: (_event, request) => {
				sent.push(request)
				for (const page of pages) {
					const payload = page(request)
					for (const listener of answerListeners) {
						listener(payload)
					}
				}
			},
		},
	})
	const server = createServer((request, response) => {
		middleware(request, response, () => {
			response.statusCode = FELL_THROUGH_STATUS
			response.end()
		})
	})
	servers.push(server)
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve)
	})
	const { port } = server.address() as AddressInfo
	const call = async ({
		path,
		body,
		headers = REPLAY_HEADERS,
		method = "POST",
	}: ReplayCall) => {
		const response = await fetch(`http://127.0.0.1:${port}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		})
		const text = await response.text()
		return {
			status: response.status,
			body: text === "" ? undefined : JSON.parse(text),
		}
	}
	return { call, sent, subscribed }
}

const transformedTags = (isEnabled: boolean, path: string) => {
	const transform = replayPlugin({ isEnabled }).transformIndexHtml
	if (typeof transform !== "function") {
		throw new Error("the replay plugin transforms the html with a function")
	}
	return Reflect.apply(transform, undefined, ["", { path }])
}

afterEach(async () => {
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise((resolve) => {
					server.close(resolve)
				}),
		),
	)
})

describe("the replay HTTP surface when the mode is off", () => {
	it("answers 404 on every replay path and reaches no page", async () => {
		const { call, sent, subscribed } = await startReplayServer({
			isEnabled: false,
			pages: [answeringWith({ ok: true, result: {} })],
		})

		const statuses = await Promise.all(
			[
				{ path: REPLAY_HTTP_PREFIX, method: "GET" },
				{ path: `${REPLAY_HTTP_PREFIX}/theme`, body: { scheme: "dark" } },
				{ path: `${REPLAY_HTTP_PREFIX}/navigate`, body: { path: "/library" } },
				{ path: `${REPLAY_HTTP_PREFIX}/anything/else`, method: "GET" },
			].map(async (replayCall) => (await call(replayCall)).status),
		)

		expect(statuses).toEqual([404, 404, 404, 404])
		expect(sent).toEqual([])
		expect(subscribed).toEqual([])
	})

	it("injects no replay module in any page", () => {
		expect(transformedTags(false, "/index.html")).toBeUndefined()
	})
})

describe("the replay plugin", () => {
	it("applies to the dev server only", () => {
		expect(replayPlugin({ isEnabled: true }).apply).toBe("serve")
	})

	it("injects the replay module in the main window page alone", () => {
		expect(transformedTags(true, "/index.html")).toEqual([
			{
				tag: "script",
				attrs: { type: "module", src: "/src/lib/replay/replay-page.ts" },
				injectTo: "head-prepend",
			},
		])
		expect(transformedTags(true, "/drag-ghost.html")).toBeUndefined()
		expect(transformedTags(true, "/screenshot.html")).toBeUndefined()
	})
})

describe("the replay HTTP surface when the mode is on", () => {
	it("leaves every other path to the dev server", async () => {
		const { call } = await startReplayServer()

		expect((await call({ path: "/src/main.tsx", method: "GET" })).status).toBe(
			FELL_THROUGH_STATUS,
		)
	})

	it("answers 403 to a request carrying an Origin header", async () => {
		const { call, sent } = await startReplayServer()

		const { status } = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			body: { scheme: "dark" },
			headers: { ...REPLAY_HEADERS, origin: "http://127.0.0.1:1420" },
		})

		expect(status).toBe(403)
		expect(sent).toEqual([])
	})

	it("answers 403 to a request lacking the replay header", async () => {
		const { call, sent } = await startReplayServer()

		const { status } = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			body: { scheme: "dark" },
			headers: {},
		})

		expect(status).toBe(403)
		expect(sent).toEqual([])
	})

	it.each(["evaluate", "invoke", "write", ""])(
		"refuses the command %j it does not know",
		async (name) => {
			const { call, sent } = await startReplayServer()

			const { status, body } = await call({
				path: `${REPLAY_HTTP_PREFIX}/${name}`,
				body: { script: "document.title" },
			})

			expect(status).toBe(404)
			expect(body).toEqual({
				error: { command: name, reason: "unknown command" },
			})
			expect(sent).toEqual([])
		},
	)

	it("refuses another method than POST", async () => {
		const { call, sent } = await startReplayServer()

		const { status } = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			method: "GET",
		})

		expect(status).toBe(405)
		expect(sent).toEqual([])
	})

	it.each([
		["navigate", {}],
		["navigate", { path: "library" }],
		["navigate", { path: "/library?section=skills" }],
		["navigate", { path: "/library", search: "section=skills" }],
		["theme", { scheme: "system" }],
		["scroll", { selector: "main" }],
		["scroll", { selector: "", top: 10 }],
		["scroll", { selector: "main", top: "10" }],
		["measure", { properties: ["gap"] }],
		["measure", { selector: "main", properties: [1] }],
		["measure", ["main"]],
	])("answers 400 to the %s body %j", async (name, body) => {
		const { call, sent } = await startReplayServer()

		const answer = await call({ path: `${REPLAY_HTTP_PREFIX}/${name}`, body })

		expect(answer.status).toBe(400)
		expect(answer.body.error.command).toBe(name)
		expect(answer.body.error.reason).toEqual(expect.any(String))
		expect(sent).toEqual([])
	})

	it("answers 400 to a body that is not JSON", async () => {
		const { call } = await startReplayServer()

		const answer = await call({ path: `${REPLAY_HTTP_PREFIX}/theme` })

		expect(answer).toEqual({
			status: 400,
			body: { error: { command: "theme", reason: "the body is not JSON" } },
		})
	})

	it("answers 413 to a body over the limit", async () => {
		const { call, sent } = await startReplayServer()

		const { status } = await call({
			path: `${REPLAY_HTTP_PREFIX}/measure`,
			body: { selector: "a".repeat(17 * 1024) },
		})

		expect(status).toBe(413)
		expect(sent).toEqual([])
	})

	it("relays the command to the page and answers its result", async () => {
		const result = { href: "/library", pathname: "/library", search: {} }
		const { call, sent, subscribed } = await startReplayServer({
			pages: [answeringWith({ ok: true, result })],
		})

		const answer = await call({
			path: `${REPLAY_HTTP_PREFIX}/navigate`,
			body: { path: "/library" },
		})

		expect(answer).toEqual({
			status: 200,
			body: { command: "navigate", result },
		})
		expect(sent.map(({ command }) => command)).toEqual([
			{ name: "navigate", path: "/library", search: {} },
		])
		expect(subscribed).toEqual([REPLAY_ANSWER_EVENT])
	})

	it("answers a 4xx JSON error naming the command and the reason the page gives", async () => {
		const { call } = await startReplayServer({
			pages: [
				answeringWith({ ok: false, reason: "selector matches nothing: nav" }),
			],
		})

		const answer = await call({
			path: `${REPLAY_HTTP_PREFIX}/scroll`,
			body: { selector: "nav", top: 40 },
		})

		expect(answer).toEqual({
			status: 422,
			body: {
				error: { command: "scroll", reason: "selector matches nothing: nav" },
			},
		})
	})

	it("answers 504 when no page answers in time", async () => {
		const { call } = await startReplayServer({ answerTimeoutMs: 20 })

		const answer = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			body: { scheme: "light" },
		})

		expect(answer).toEqual({
			status: 504,
			body: {
				error: { command: "theme", reason: "no page answered within 20 ms" },
			},
		})
	})

	it("ignores an answer that names no pending request", async () => {
		const { call } = await startReplayServer({
			answerTimeoutMs: 20,
			pages: [
				() => ({ id: "unknown", outcome: { ok: true, result: {} } }),
				() => ({ outcome: { ok: true, result: {} } }),
				({ id }) => ({ id, outcome: { ok: "yes" } }),
			],
		})

		const { status } = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			body: { scheme: "light" },
		})

		expect(status).toBe(504)
	})

	it("keeps the first answer when a second one names the same request", async () => {
		const { call } = await startReplayServer({
			pages: [
				answeringWith({ ok: true, result: { scheme: "dark" } }),
				answeringWith({ ok: false, reason: "late" }),
			],
		})

		const answer = await call({
			path: `${REPLAY_HTTP_PREFIX}/theme`,
			body: { scheme: "dark" },
		})

		expect(answer).toEqual({
			status: 200,
			body: { command: "theme", result: { scheme: "dark" } },
		})
	})
})
