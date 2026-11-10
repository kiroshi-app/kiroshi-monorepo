import { homedir } from "node:os"

import {
	type HookCallback,
	type Options,
	type PermissionMode,
	query,
	type SlashCommand,
} from "@anthropic-ai/claude-agent-sdk"

import { agentStderr } from "./agent-stderr"
import {
	readBotSettings,
	type SettingsOptions,
	withAllows,
} from "./bot-settings"
import type { BundleScope } from "./bundle-writes"
import { derivedAllows } from "./derived-allows"
import { resolveExecutable } from "./executable"
import { KIROSHI_SERVER, kiroshiServer } from "./kiroshi-server"
import {
	type McpConfigPaths,
	mcpConfigFileFor,
	readPathsOf,
} from "./mcp-config-file"
import { createMissionStatusReminder } from "./mission-status-reminder"
import { createPermissionGate } from "./permissions"
import { createPromptStream } from "./prompt-stream"
import { type FloorScope, securityFloor } from "./security-floor"
import {
	type ConnectPass,
	delay,
	heldSecrets,
	type ReportedLine,
	renewedBeforeTurn,
	renewsBeforeTurn,
	unconnectedServers,
} from "./server-connect"
import {
	boundEnv,
	type ResolvedServers,
	requestedServers,
	resolvedServers,
	resolveServers,
	type Servers,
	serverNamed,
} from "./server-env"
import { declaringGrants, renewGrant } from "./server-renewal"
import { recordStanding } from "./server-standing"
import { EMIT_SESSION_STATE_EVENTS, sessionEnv } from "./session-env"
import {
	layerFor,
	type ServerLine,
	unavailableServersSection,
} from "./system-layer"

import type {
	AgentCommand,
	AgentSession,
	EmitFrame,
	SessionFrame,
	SessionRequest,
	TasksPendingFrame,
	TurnSettledFrame,
} from "../provider"
import { describeError } from "../../describe-error"

const ABANDONED = "The session ended before this was answered."
const ENDED = "the agent ended"
const SLASH_COMMAND = /^\/[^\s/]+(\s|$)/

const described = (commands: SlashCommand[]): AgentCommand[] =>
	commands.map(({ name, description }) => ({
		name,
		...(description ? { description } : {}),
	}))

const definedPaths = (paths: (string | undefined)[]): string[] =>
	paths.filter((path): path is string => Boolean(path))

const pluginPaths = (request: SessionRequest): string[] =>
	definedPaths([
		request.pluginPath,
		request.systemPluginPath,
		request.userPluginPath,
		request.spacePluginPath,
	])

const writeScope = (request: SessionRequest): BundleScope =>
	request.pluginPath
		? {
				botPath: request.pluginPath,
				userPath: request.userPluginPath,
				spacePath: request.spacePluginPath,
			}
		: {}

const writablePaths = ({
	botPath,
	userPath,
	spacePath,
}: BundleScope): string[] => definedPaths([botPath, userPath, spacePath])

const handsServers = (request: SessionRequest): boolean =>
	Boolean(request.pluginPath && request.agent)

const localPlugins = (paths: string[]): NonNullable<Options["plugins"]> =>
	paths.map((path) => ({ type: "local" as const, path }))

export const buildOptions = (
	request: SessionRequest,
	canUseTool: Options["canUseTool"],
	settings: SettingsOptions = readBotSettings(request).options,
	resolved: ResolvedServers = resolvedServers(request),
	stop?: HookCallback,
	mcpConfig?: McpConfigPaths,
): Options => {
	const floor: FloorScope = {
		appDataDir: request.appDataDir,
		conversationId: request.conversationId,
		home: homedir(),
		mcpConfigPaths: readPathsOf(mcpConfig),
		platform: process.platform,
		pluginPaths: pluginPaths(request),
		writablePaths: writablePaths(writeScope(request)),
	}
	const managedSettings = securityFloor(floor)
	return {
		cwd: request.cwd,
		resume: request.resume,
		includePartialMessages: request.partialMessages,
		canUseTool,
		...withAllows(
			settings,
			derivedAllows({
				pluginPath: request.pluginPath,
				servers: Object.keys(resolved.servers),
			}),
		),
		...(request.permissionMode
			? { permissionMode: request.permissionMode as PermissionMode }
			: {}),
		...(request.deniedTools ? { disallowedTools: request.deniedTools } : {}),
		...(handsServers(request)
			? {
					plugins: localPlugins(pluginPaths(request)),
					agent: request.agent,
					mcpServers: kiroshiServer({
						cwd: request.cwd,
						env: sessionEnv(request.connection),
						floor,
						managedSettings,
						session: request.session,
					}),
					...(mcpConfig ? { extraArgs: { "mcp-config": mcpConfig.path } } : {}),
				}
			: {}),
		...(request.outputSchema
			? {
					outputFormat: {
						type: "json_schema" as const,
						schema: request.outputSchema,
					},
				}
			: {}),
		...(request.missionThread && stop
			? { hooks: { Stop: [{ hooks: [stop] }] } }
			: {}),
		systemPrompt: {
			type: "preset",
			preset: "claude_code",
			append: layerFor(request, resolved.rejections),
		},
		env: {
			...sessionEnv(request.connection),
			[EMIT_SESSION_STATE_EVENTS]: "1",
		},
		managedSettings,
		settingSources: [],
		strictMcpConfig: true,
		pathToClaudeCodeExecutable: resolveExecutable(),
		stderr: agentStderr(
			request.session ? `session ${request.session}` : "session",
		),
	}
}

export const declaredServers = (
	options: Options,
	resolved: Servers,
): Servers => (options.mcpServers ? { ...resolved, ...options.mcpServers } : {})

export const dialledServers = (declared: Servers): string[] =>
	Object.keys(declared).filter((name) => name !== KIROSHI_SERVER)

export type StopRequest = {
	dropped: boolean
	emit: EmitFrame
	interrupt: () => Promise<unknown>
}

const CANCELLED: TurnSettledFrame = {
	type: "turn_settled",
	subtype: "interrupted",
	is_error: false,
}

export const stopTurn = async ({ dropped, emit, interrupt }: StopRequest) => {
	if (dropped) {
		emit(CANCELLED)
		return
	}
	await interrupt()
}

export const SETTLE_GRACE_MS = 3_000

type BackgroundTask = { ambient?: boolean }

type StopPhase = "none" | "requested" | "settled"

const isSystem = (message: SessionFrame, subtype: string): boolean =>
	message.type === "system" && message.subtype === subtype

const answersAPrompt = (result: SessionFrame): boolean =>
	typeof result.user_message_uuid === "string"

const promptAnsweredBy = (message: SessionFrame): string | undefined =>
	(message.type === "assistant" || message.type === "stream_event") &&
	typeof message.user_message_uuid === "string"
		? message.user_message_uuid
		: undefined

const stampedWith = (
	result: SessionFrame,
	answered: string | undefined,
): SessionFrame => {
	const { user_message_uuid: _sdkStamp, ...unstamped } = result
	return answered ? { ...unstamped, user_message_uuid: answered } : unstamped
}

const liveTasks = (message: SessionFrame): number =>
	((message.tasks as BackgroundTask[] | undefined) ?? []).filter(
		(task) => !task.ambient,
	).length

export const createTurnSettler = (
	emit: EmitFrame,
	graceMs = SETTLE_GRACE_MS,
) => {
	let held: SessionFrame | undefined
	let answered: string | undefined
	let pending = 0
	let busy = false
	let stop: StopPhase = "none"
	let grace: ReturnType<typeof setTimeout> | undefined

	const cancelGrace = () => {
		clearTimeout(grace)
		grace = undefined
	}

	const settle = (result: SessionFrame) => {
		cancelGrace()
		held = undefined
		const settled: TurnSettledFrame = { ...result, type: "turn_settled" }
		emit(settled)
	}

	const tellPending = () => {
		const frame: TasksPendingFrame = { type: "tasks_pending", count: pending }
		emit(frame)
	}

	const onResult = (result: SessionFrame) => {
		if (stop === "settled") {
			return
		}
		if (stop === "requested") {
			stop = "settled"
			settle(result)
			return
		}
		const followsUpASettledTurn = !held && !answersAPrompt(result)
		if (pending === 0 && (!busy || followsUpASettledTurn)) {
			settle(result)
			return
		}
		held = result
		if (pending > 0) {
			tellPending()
		}
	}

	const onTasks = (count: number) => {
		if (count === pending) {
			return
		}
		pending = count
		if (!held) {
			return
		}
		tellPending()
		if (pending > 0) {
			cancelGrace()
			return
		}
		if (!busy) {
			const result = held
			grace = setTimeout(() => settle(result), graceMs)
		}
	}

	const onState = (state: unknown) => {
		busy = state !== "idle"
		if (busy) {
			cancelGrace()
			return
		}
		if (held && pending === 0) {
			settle(held)
		}
	}

	const stamp = (message: SessionFrame): SessionFrame => {
		if (message.type !== "result") {
			answered = promptAnsweredBy(message) ?? answered
			return message
		}
		const result = stampedWith(message, answered)
		answered = undefined
		return result
	}

	const observe = (message: SessionFrame) => {
		if (message.type === "result") {
			onResult(message)
		} else if (isSystem(message, "background_tasks_changed")) {
			onTasks(liveTasks(message))
		} else if (isSystem(message, "session_state_changed")) {
			onState(message.state)
		}
	}

	return {
		relay: (message: SessionFrame) => {
			const relayed = stamp(message)
			if (stop !== "settled") {
				emit(relayed)
			}
			observe(relayed)
		},
		prompted: () => {
			stop = "none"
		},
		stopped: () => {
			if (!held) {
				stop = "requested"
				return
			}
			stop = "settled"
			settle(held)
		},
		forget: cancelGrace,
	}
}

type WaitingLine = ServerLine & {
	owing: boolean
}

type HeldPrompt = {
	text: string
	uuid?: string
}

export type ConnectionReport = {
	emit: EmitFrame
	push: (text: string, uuid?: string) => void
	pass: ConnectPass
	record?: (line: ServerLine) => void
	secrets?: string[]
}

const latest = (lines: WaitingLine[]): WaitingLine[] => {
	const named = new Map<string, WaitingLine>()
	for (const line of lines) {
		const key = serverNamed(line.detail) ?? line.detail
		named.delete(key)
		named.set(key, line)
	}
	return [...named.values()]
}

export const reportConnections = ({
	emit,
	push,
	pass,
	record,
	secrets = heldSecrets(pass.env),
}: ConnectionReport) => {
	const abandoning = new AbortController()
	const { signal } = abandoning
	const held: HeldPrompt[] = []
	const waiting: WaitingLine[] = []
	let holding = pass.names.length > 0

	const framed = (detail: string) => {
		emit({ type: "server_env_rejected", detail })
	}

	const reported = ({ detail, state, notice }: ReportedLine) => {
		if (signal.aborted) {
			return
		}
		if (notice) {
			framed(detail)
		}
		record?.({ detail, state })
		waiting.push({ detail, state, owing: false })
	}

	const hand = ({ text, uuid }: HeldPrompt) => {
		const carried = latest(waiting)
		waiting.splice(0, waiting.length, ...carried)
		for (const line of carried) {
			if (line.owing) {
				framed(line.detail)
				line.owing = false
			}
		}
		if (carried.length === 0 || SLASH_COMMAND.test(text)) {
			push(text, uuid)
			return
		}
		waiting.length = 0
		const section = unavailableServersSection(
			carried.map(({ detail, state }) => ({ detail, state })),
		)
		push(`${section}\n\n${text}`, uuid)
	}

	const release = (settled: ReportedLine[]) => {
		if (signal.aborted) {
			return
		}
		for (const { detail, state } of settled) {
			record?.({ detail, state })
		}
		waiting.push(
			...settled.map(({ detail, state, notice }) => ({
				detail,
				state,
				owing: notice,
			})),
		)
		holding = false
		for (const prompt of held.splice(0)) {
			hand(prompt)
		}
	}

	const passing: ConnectPass = { ...pass, signal, report: reported }

	void delay(0, signal)
		.then(() => (signal.aborted ? [] : unconnectedServers(passing, secrets)))
		.then(release, () => release([]))

	return {
		prompt: (text: string, uuid?: string) => {
			if (holding) {
				held.push({ text, uuid })
				return
			}
			if (!renewsBeforeTurn(passing)) {
				hand({ text, uuid })
				return
			}
			held.push({ text, uuid })
			holding = true
			void renewedBeforeTurn(passing, secrets).then(() => release([]))
		},
		drop: () => {
			const dropped = held.length > 0
			held.length = 0
			return dropped
		},
		abandon: () => {
			abandoning.abort()
			held.length = 0
			holding = false
		},
	}
}

const removedOnThrow = <T>(launch: () => T, remove?: () => void): T => {
	try {
		return launch()
	} catch (error) {
		remove?.()
		throw error
	}
}

export const openClaudeSession = async (
	request: SessionRequest,
	emit: EmitFrame,
): Promise<AgentSession> => {
	const prompts = createPromptStream()
	const permissions = createPermissionGate(emit, writeScope(request))
	const botSettings = readBotSettings(request)
	if (botSettings.rejection) {
		emit({ type: "settings_rejected", detail: botSettings.rejection })
	}
	const requested = requestedServers(request)
	const serverEnv = request.serverEnv ?? {}
	const resolved = resolveServers(requested, serverEnv)
	const record = recordStanding(request.session)
	for (const line of resolved.rejections) {
		emit({ type: "server_env_rejected", detail: line.detail })
		record(line)
	}
	const reminder = createMissionStatusReminder()
	const mcpConfig = handsServers(request)
		? mcpConfigFileFor(resolved.servers)
		: undefined
	const launch = () => {
		const options = buildOptions(
			request,
			permissions.canUseTool,
			botSettings.options,
			resolved,
			reminder.stop,
			mcpConfig,
		)
		return { options, run: query({ prompt: prompts.stream, options }) }
	}
	const { options, run } = removedOnThrow(launch, mcpConfig?.remove)
	const declared = declaredServers(options, resolved.servers)

	let closing = false
	const settler = createTurnSettler(emit)

	const pump = async () => {
		try {
			for await (const message of run) {
				reminder.observe(message)
				settler.relay(message as unknown as SessionFrame)
			}
			return ENDED
		} catch (error) {
			return describeError(error)
		}
	}

	const drained = pump().then((detail) => {
		settler.forget()
		permissions.denyAll(ABANDONED)
		if (!closing) {
			emit({ type: "closed", detail })
		}
		mcpConfig?.remove()
		return detail
	})
	const collapsed = drained.then((detail) => {
		throw new Error(detail)
	})
	collapsed.catch(() => {})

	const initialized = await Promise.race([
		run.initializationResult(),
		collapsed,
	])

	emit({ type: "commands", commands: described(initialized.commands) })

	const declare = declaringGrants(declared, (servers) =>
		run.setMcpServers(servers),
	)

	const report = reportConnections({
		emit,
		push: prompts.push,
		pass: {
			names: dialledServers(declared),
			port: {
				status: () => run.mcpServerStatus(),
				reconnect: (name) => run.reconnectMcpServer(name),
			},
			env: boundEnv(requested, serverEnv),
			grants: {
				renew: renewGrant(request.session),
				declare,
			},
		},
		record,
		secrets: heldSecrets(serverEnv),
	})

	return {
		prompt: (text: string, uuid?: string) => {
			settler.prompted()
			report.prompt(text, uuid)
		},
		interrupt: () => {
			reminder.forget()
			return stopTurn({
				dropped: report.drop(),
				emit,
				interrupt: () => {
					settler.stopped()
					return run.interrupt()
				},
			})
		},
		decide: permissions.decide,
		close: async () => {
			closing = true
			report.abandon()
			prompts.end()
			run.close()
			await drained
		},
	}
}
