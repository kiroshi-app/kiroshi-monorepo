import { describeProvider } from "./describe"
import { describeError } from "./describe-error"
import type { HostError } from "./host"
import { closeHostChannel, openHostChannel, settleHostAnswer } from "./host"
import {
	authorizeMcpServer,
	cancelMcpAuthorization,
	refreshMcpToken,
	revokeMcpToken,
} from "./mcp-oauth"
import { readLines } from "./read-lines"

import type {
	AgentProvider,
	AgentSession,
	PermissionDecision,
	ServerEnv,
	SessionFrame,
	SessionRequest,
} from "./providers/provider"
import { requireProvider } from "./providers/registry"

export type Command = {
	type: string
	session?: string
	cwd?: string
	resume?: string
	pluginPath?: string
	systemPluginPath?: string
	userPluginPath?: string
	spacePluginPath?: string
	agent?: string
	identity?: string
	outputStyle?: string
	settingsPath?: string
	appDataDir?: string
	conversationId?: string
	partialMessages?: boolean
	serverEnv?: ServerEnv
	outputSchema?: Record<string, unknown>
	missionThread?: boolean
	connection?: Record<string, string>
	text?: string
	url?: string
	token?: string
	refreshToken?: string
	clientId?: string
	clientSecret?: string
	redirectUri?: string
	requestId?: string
	decision?: PermissionDecision
	result?: unknown
	error?: HostError
}

export const sessionRequest = (command: Command): SessionRequest => ({
	session: command.session,
	cwd: command.cwd ?? process.cwd(),
	resume: command.resume,
	pluginPath: command.pluginPath,
	systemPluginPath: command.systemPluginPath,
	userPluginPath: command.userPluginPath,
	spacePluginPath: command.spacePluginPath,
	agent: command.agent,
	identity: command.identity,
	outputStyle: command.outputStyle,
	settingsPath: command.settingsPath,
	appDataDir: command.appDataDir,
	conversationId: command.conversationId,
	partialMessages: command.partialMessages ?? false,
	serverEnv: command.serverEnv,
	connection: command.connection,
	outputSchema: command.outputSchema,
	missionThread: command.missionThread,
})

const AUTHORIZE = "mcp_oauth_authorize"
const CANCEL = "mcp_oauth_cancel"
const REVOKE = "mcp_oauth_revoke"
const REFRESH = "mcp_oauth_refresh"
const SIGN_IN = "sign_in"
const SIGN_IN_CODE = "sign_in_code"
const SIGN_IN_CANCEL = "sign_in_cancel"

const write = (payload: unknown) => {
	process.stdout.write(`${JSON.stringify(payload)}\n`)
}

type Handler = (command: Command, session: string) => unknown

export const createRouter = (
	provider: AgentProvider,
	write: (payload: unknown) => void,
) => {
	const emitter = (session: string) => (frame: SessionFrame) =>
		write({ session, frame })

	const opening = new Map<string, Promise<AgentSession | undefined>>()

	const open = async (command: Command, session: string) => {
		const emit = openHostChannel(session, emitter(session))
		try {
			const opened = await provider.open(sessionRequest(command), emit)
			emit({ type: "opened" })
			return opened
		} catch (error) {
			emit({ type: "closed", detail: describeError(error) })
			return undefined
		}
	}

	const on = (session: string, act: (opened: AgentSession) => void) => {
		const pending = opening.get(session)
		if (!pending) {
			return
		}
		void pending.then((opened) => {
			if (opened) {
				act(opened)
			}
		})
	}

	const close = (session: string) => {
		on(session, (opened) => {
			void opened.close()
		})
		opening.delete(session)
		closeHostChannel(session)
	}

	const reportConnection = async (command: Command) =>
		write({
			type: "check",
			...(await provider.authenticate(command.connection)),
		})

	const listModels = async (command: Command) =>
		write({
			type: "models",
			models: await provider.models(command.connection).catch(() => []),
		})

	const listTools = async (command: Command) =>
		write({
			type: "tools",
			tools: await provider.tools(command.connection).catch(() => []),
		})

	const nameConversation = async (command: Command) => {
		const naming = await provider
			.title(command.text ?? "", command.connection)
			.catch(() => null)
		write({
			type: "title",
			title: naming?.title ?? null,
			icon: naming?.icon ?? null,
		})
	}

	const startSignIn = async () =>
		write({ type: SIGN_IN, ...(await provider.signIn(write)) })

	const enterSignInCode = (command: Command) => {
		if (typeof command.text === "string") {
			provider.enterSignInCode(command.text)
		}
	}

	const cancelSignIn = () => provider.cancelSignIn()

	const authorizeServer = async (command: Command) =>
		write({ type: AUTHORIZE, ...(await authorizeMcpServer(command, write)) })

	const revokeGrant = async (command: Command) =>
		write({ type: REVOKE, ...(await revokeMcpToken(command)) })

	const refreshGrant = async (command: Command) =>
		write({ type: REFRESH, ...(await refreshMcpToken(command)) })

	const openSession = (command: Command, session: string) =>
		opening.set(session, open(command, session))

	const promptSession = (command: Command, session: string) =>
		on(session, (opened) => opened.prompt(command.text ?? ""))

	const interruptSession = (_command: Command, session: string) =>
		on(session, (opened) => {
			void opened.interrupt()
		})

	const decidePermission = (command: Command, session: string) =>
		on(session, (opened) => {
			if (command.requestId && command.decision) {
				opened.decide(command.requestId, command.decision)
			}
		})

	const settleHostRequest = (command: Command, session: string) =>
		settleHostAnswer(session, command)

	const closeSession = (_command: Command, session: string) => close(session)

	const answering = new Map<string, Handler>([
		["check", reportConnection],
		["models", listModels],
		["tools", listTools],
		["title", nameConversation],
		[SIGN_IN, startSignIn],
		[SIGN_IN_CODE, enterSignInCode],
		[SIGN_IN_CANCEL, cancelSignIn],
		[AUTHORIZE, authorizeServer],
		[CANCEL, cancelMcpAuthorization],
		[REVOKE, revokeGrant],
		[REFRESH, refreshGrant],
	])

	const acting = new Map<string, Handler>([
		["open", openSession],
		["prompt", promptSession],
		["interrupt", interruptSession],
		["permission", decidePermission],
		["host_response", settleHostRequest],
		["close", closeSession],
	])

	const route = (command: Command): Handler | undefined =>
		command.session ? acting.get(command.type) : answering.get(command.type)

	const dispatch = (command: Command) => {
		void route(command)?.(command, command.session ?? "")
	}

	const closeEvery = () => {
		for (const session of [...opening.keys()]) {
			close(session)
		}
	}

	return {
		route,
		dispatch,
		closeEvery,
		answered: new Set(answering.keys()),
		acted: new Set(acting.keys()),
	}
}

export const serve = async (requestedId?: string) => {
	const provider = requireProvider(requestedId)
	const { dispatch, closeEvery } = createRouter(provider, write)

	write({ type: "ready", ...describeProvider(provider) })

	for await (const line of readLines()) {
		try {
			dispatch(JSON.parse(line) as Command)
		} catch {
			write({ type: "unreadable" })
		}
	}

	closeEvery()
}
