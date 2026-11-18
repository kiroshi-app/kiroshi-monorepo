import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

import type { Plugin } from "vite"

import {
	isReplayAnswer,
	isReplayCommandName,
	parseReplayCommand,
	REPLAY_ANSWER_EVENT,
	REPLAY_COMMAND_EVENT,
	REPLAY_HEADER,
	REPLAY_HTTP_PREFIX,
	type ReplayCommand,
	type ReplayCommandName,
	type ReplayOutcome,
	type ReplayRequest,
	refuseReplayCommand,
} from "./replay-protocol"

const REPLAY_PAGE_MODULE = "/src/lib/replay/replay-page.ts"
const MAIN_WINDOW_HTML = "/index.html"
const REPLAY_ANSWER_TIMEOUT_MS = 5000
const REPLAY_BODY_LIMIT_BYTES = 16 * 1024

type ReplayChannel = {
	send: (event: string, request: ReplayRequest) => void
	on: (event: string, listener: (payload: unknown) => void) => void
}

type ReplayMiddlewareOptions = {
	isEnabled: boolean
	channel: ReplayChannel
	answerTimeoutMs: number
}

type ReplayPluginOptions = {
	isEnabled: boolean
}

type Relayed =
	| { answeredBy: "page"; outcome: ReplayOutcome }
	| { answeredBy: "nobody" }

type ReplayError = {
	command?: string
	reason: string
}

type Reply = {
	status: number
	body: unknown
}

type Refused = { hasPassed: false; reply: Reply }

type Stage<Value> = { hasPassed: true; value: Value } | Refused

const passed = <Value>(value: Value): Stage<Value> => ({
	hasPassed: true,
	value,
})

const refusal = (status: number, error: ReplayError): Reply => ({
	status,
	body: { error },
})

const refused = (status: number, error: ReplayError): Refused => ({
	hasPassed: false,
	reply: refusal(status, error),
})

const send = (response: ServerResponse, { status, body }: Reply) => {
	response.statusCode = status
	response.setHeader("content-type", "application/json")
	response.end(JSON.stringify(body))
}

const readBody = async (
	request: IncomingMessage,
	name: ReplayCommandName,
): Promise<Stage<string>> => {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		size += chunk.length
		if (size > REPLAY_BODY_LIMIT_BYTES) {
			return refused(413, {
				command: name,
				reason: `the body exceeds ${REPLAY_BODY_LIMIT_BYTES} bytes`,
			})
		}
		chunks.push(chunk)
	}
	return passed(Buffer.concat(chunks).toString("utf8"))
}

const pathOf = (request: IncomingMessage) => request.url?.split("?")[0] ?? ""

const isReplayPath = (path: string) =>
	path === REPLAY_HTTP_PREFIX || path.startsWith(`${REPLAY_HTTP_PREFIX}/`)

const commandNameOf = (path: string) =>
	path.slice(REPLAY_HTTP_PREFIX.length + 1)

const parseBody = (name: ReplayCommandName, text: string) => {
	try {
		return parseReplayCommand(name, JSON.parse(text))
	} catch (error) {
		if (error instanceof SyntaxError) {
			return refuseReplayCommand("the body is not JSON")
		}
		throw error
	}
}

const admit = (
	request: IncomingMessage,
	isEnabled: boolean,
): Stage<ReplayCommandName> => {
	if (!isEnabled) {
		return refused(404, {
			reason: "replay mode is off, start the app with dev:replay",
		})
	}
	if (
		request.headers.origin !== undefined ||
		request.headers[REPLAY_HEADER] === undefined
	) {
		return refused(403, {
			reason: `send the ${REPLAY_HEADER} header and no Origin header`,
		})
	}
	const name = commandNameOf(pathOf(request))
	if (!isReplayCommandName(name)) {
		return refused(404, { command: name, reason: "unknown command" })
	}
	if (request.method !== "POST") {
		return refused(405, { command: name, reason: "use POST" })
	}
	return passed(name)
}

const readCommand = async (
	request: IncomingMessage,
	name: ReplayCommandName,
): Promise<Stage<ReplayCommand>> => {
	const body = await readBody(request, name)
	if (!body.hasPassed) {
		return body
	}
	const parsed = parseBody(name, body.value)
	return parsed.ok
		? passed(parsed.command)
		: refused(400, { command: name, reason: parsed.reason })
}

export const createReplayMiddleware = ({
	isEnabled,
	channel,
	answerTimeoutMs,
}: ReplayMiddlewareOptions) => {
	const pending = new Map<string, (outcome: ReplayOutcome) => void>()

	if (isEnabled) {
		channel.on(REPLAY_ANSWER_EVENT, (payload) => {
			if (isReplayAnswer(payload)) {
				pending.get(payload.id)?.(payload.outcome)
			}
		})
	}

	const relay = (command: ReplayCommand) =>
		new Promise<Relayed>((resolve) => {
			const id = randomUUID()
			const settle = (relayed: Relayed) => {
				clearTimeout(timeout)
				pending.delete(id)
				resolve(relayed)
			}
			const timeout = setTimeout(
				() => settle({ answeredBy: "nobody" }),
				answerTimeoutMs,
			)
			pending.set(id, (outcome) => settle({ answeredBy: "page", outcome }))
			channel.send(REPLAY_COMMAND_EVENT, { id, command })
		})

	const replyTo = async (command: ReplayCommand): Promise<Reply> => {
		const { name } = command
		const relayed = await relay(command)
		if (relayed.answeredBy === "nobody") {
			return refusal(504, {
				command: name,
				reason: `no page answered within ${answerTimeoutMs} ms`,
			})
		}
		return relayed.outcome.ok
			? { status: 200, body: { command: name, result: relayed.outcome.result } }
			: refusal(422, { command: name, reason: relayed.outcome.reason })
	}

	const run = async (request: IncomingMessage): Promise<Reply> => {
		const admitted = admit(request, isEnabled)
		if (!admitted.hasPassed) {
			return admitted.reply
		}
		const read = await readCommand(request, admitted.value)
		return read.hasPassed ? replyTo(read.value) : read.reply
	}

	return (
		request: IncomingMessage,
		response: ServerResponse,
		next: (error?: unknown) => void,
	) => {
		if (!isReplayPath(pathOf(request))) {
			next()
			return
		}
		run(request)
			.then((reply) => send(response, reply))
			.catch(next)
	}
}

export const replayPlugin = ({ isEnabled }: ReplayPluginOptions): Plugin => ({
	name: "kiroshi-replay",
	apply: "serve",
	configureServer: (server) => {
		server.middlewares.use(
			createReplayMiddleware({
				isEnabled,
				channel: server.hot,
				answerTimeoutMs: REPLAY_ANSWER_TIMEOUT_MS,
			}),
		)
	},
	transformIndexHtml: (_html, { path }) =>
		isEnabled && path === MAIN_WINDOW_HTML
			? [
					{
						tag: "script",
						attrs: { type: "module", src: REPLAY_PAGE_MODULE },
						injectTo: "head-prepend",
					},
				]
			: undefined,
})
