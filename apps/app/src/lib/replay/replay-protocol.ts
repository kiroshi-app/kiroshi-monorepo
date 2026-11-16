export const REPLAY_HTTP_PREFIX = "/__kiroshi-replay"
export const REPLAY_HEADER = "x-kiroshi-replay"
export const REPLAY_COMMAND_EVENT = "kiroshi-replay:command"
export const REPLAY_ANSWER_EVENT = "kiroshi-replay:answer"
export const MEASURED_MATCH_LIMIT = 50

export type ReplayCommand =
	| { name: "navigate"; path: string; search: Record<string, unknown> }
	| { name: "theme"; scheme: "light" | "dark" }
	| { name: "scroll"; selector: string; top: number }
	| { name: "measure"; selector: string; properties: string[] }

export type ReplayCommandName = ReplayCommand["name"]

export type ReplayOutcome =
	| { ok: true; result: unknown }
	| { ok: false; reason: string }

export type ReplayRequest = { id: string; command: ReplayCommand }

export type ReplayAnswer = { id: string; outcome: ReplayOutcome }

type ParsedReplayCommand =
	| { ok: true; command: ReplayCommand }
	| { ok: false; reason: string }

type ReplayBody = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const isSelector = (value: unknown): value is string =>
	typeof value === "string" && value.trim() !== ""

const isRoutePath = (value: unknown): value is string =>
	typeof value === "string" && /^\/[^?#]*$/.test(value)

const isPropertyList = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === "string")

const accepted = (command: ReplayCommand): ParsedReplayCommand => ({
	ok: true,
	command,
})

export const refuseReplayCommand = (reason: string): ParsedReplayCommand => ({
	ok: false,
	reason,
})

const COMMAND_PARSERS: Record<
	ReplayCommandName,
	(body: ReplayBody) => ParsedReplayCommand
> = {
	navigate: ({ path, search = {} }) =>
		isRoutePath(path) && isRecord(search)
			? accepted({ name: "navigate", path, search })
			: refuseReplayCommand(
					"path must start with / and hold no ? or #, search must be an object",
				),
	theme: ({ scheme }) =>
		scheme === "light" || scheme === "dark"
			? accepted({ name: "theme", scheme })
			: refuseReplayCommand("scheme must be light or dark"),
	scroll: ({ selector, top }) =>
		isSelector(selector) && typeof top === "number" && Number.isFinite(top)
			? accepted({ name: "scroll", selector, top })
			: refuseReplayCommand(
					"selector must be a CSS selector, top must be a number",
				),
	measure: ({ selector, properties = [] }) =>
		isSelector(selector) && isPropertyList(properties)
			? accepted({ name: "measure", selector, properties })
			: refuseReplayCommand(
					"selector must be a CSS selector, properties must be a list of CSS property names",
				),
}

export const isReplayCommandName = (name: string): name is ReplayCommandName =>
	Object.hasOwn(COMMAND_PARSERS, name)

export const parseReplayCommand = (
	name: ReplayCommandName,
	body: unknown,
): ParsedReplayCommand =>
	isRecord(body)
		? COMMAND_PARSERS[name](body)
		: refuseReplayCommand("the body must be a JSON object")

export const isReplayAnswer = (payload: unknown): payload is ReplayAnswer =>
	isRecord(payload) &&
	typeof payload.id === "string" &&
	isRecord(payload.outcome) &&
	(payload.outcome.ok === true ||
		(payload.outcome.ok === false &&
			typeof payload.outcome.reason === "string"))
