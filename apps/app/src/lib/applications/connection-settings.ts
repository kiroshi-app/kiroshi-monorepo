import type {
	BotMcpConnectionReason,
	BotMcpConnectionState,
	BotMcpServerItem,
} from "@workspace/ui/components/bot-settings"
import {
	type McpConnectionSection,
	readMcpConnectionReason,
} from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ApplicationRow } from "./connection-port"
import { toConnectionReason } from "./connection-reason"
import type { ConnectionOutcome, Connections } from "./use-connections"

import { failureReporterIn } from "../failure-report"
import type { BotMcpServer } from "../conversations/store-contract"

export const APPLICATIONS_TAB = "mcp"

export type ConnectionSettings = {
	mcpServers: BotMcpServerItem[]
	onServerConnect: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
}

type ConnectionSettingsSource = {
	servers: BotMcpServer[]
	connections: Connections
	openedName: string | null
	onSettled?: (name: string) => void
}

const configOf = ({ config }: BotMcpServer): Record<string, unknown> =>
	typeof config === "object" && config !== null && !Array.isArray(config)
		? config
		: {}

const urlOf = (config: Record<string, unknown>) =>
	readMcpServerLaunch(config).url ?? ""

const keptMarkOf = ({ title, logo, logoUrl }: BotMcpServer) => ({
	displayName: title ?? undefined,
	mark: logo ?? logoUrl ?? undefined,
})

export const hasKeptMark = (server: BotMcpServer) => {
	const { displayName, mark } = keptMarkOf(server)
	return displayName !== undefined || mark !== undefined
}

const hostOf = (url: string) =>
	URL.canParse(url) ? new URL(url).host : undefined

type ApplicationConnection = {
	state?: BotMcpConnectionState
	reason?: BotMcpConnectionReason
}

const connectionOf = (
	{ connecting, failure, rows }: Connections,
	name: string,
): ApplicationConnection => {
	if (connecting === name) {
		return { state: "connecting" }
	}
	if (failure?.command === "connect" && failure.name === name) {
		return { state: "failed", reason: toConnectionReason(failure.reason) }
	}
	const status = rows.find((row) => row.name === name)?.status
	return status === "unknown" ? {} : { state: status }
}

type ConnectionLanding = "connected" | "disconnected"

const isLanded = (
	rows: ApplicationRow[],
	name: string,
	landing: ConnectionLanding,
) => {
	const isConnected =
		rows.find((row) => row.name === name)?.status === "connected"
	return landing === "connected" ? isConnected : !isConnected
}

const failedRefusal = () =>
	new Error(i18n.t("bots:applications.connection.state.failed"))

export const connectRefusalOf = (
	{ failure, rows }: ConnectionOutcome,
	name: string,
): unknown => {
	if (failure?.command === "connect" && failure.name === name) {
		return failure.reason ?? failedRefusal()
	}
	const row = rows.find((held) => held.name === name)
	if (!row) {
		return failedRefusal()
	}
	if (row.status !== "needsAuthorization" && row.status !== "failed") {
		return null
	}
	return new Error(
		row.reason ?? i18n.t(`bots:applications.connection.state.${row.status}`),
	)
}

const reportFailure = failureReporterIn("connection-settings")

const refusalSentenceOf = (refusal: unknown) =>
	refusal instanceof Error
		? refusal.message
		: (readMcpConnectionReason(
				i18n.getFixedT(null, "bots"),
				toConnectionReason(refusal),
			) ?? undefined)

const raiseConnectRefusal = (title: string, refusal: unknown) => {
	void reportFailure(
		{
			title: i18n.t("bots:applications.connection.failed", { name: title }),
			description: refusalSentenceOf(refusal),
		},
		{ command: "connect", reason: refusal },
	)
}

type ConnectingApplication = {
	name: string
	title: string
}

const settling = (onSettled?: (name: string) => void) => ({
	connected: (
		{ name, title }: ConnectingApplication,
		run: Promise<ConnectionOutcome>,
	) => {
		void run.then((outcome) => {
			if (outcome.isCancelled) {
				return
			}
			const refusal = connectRefusalOf(outcome, name)
			if (refusal) {
				raiseConnectRefusal(title, refusal)
				return
			}
			if (isLanded(outcome.rows, name, "connected")) {
				onSettled?.(name)
			}
		})
	},
	disconnected: (name: string, run: Promise<ConnectionOutcome>) => {
		void run.then(({ rows }) => {
			if (isLanded(rows, name, "disconnected")) {
				onSettled?.(name)
			}
		})
	},
})

type ConnectionRuns = ReturnType<typeof settling>

const sectionOf = (
	connections: Connections,
	server: BotMcpServer,
	settle: ConnectionRuns,
): McpConnectionSection | undefined => {
	const connection = connectionOf(connections, server.name)
	if (!connection.state) {
		return undefined
	}
	const url = urlOf(configOf(server))

	return {
		state: connection.state,
		reason: connection.reason,
		host: hostOf(url),
		onConnect: () => {
			settle.connected(
				{ name: server.name, title: server.title ?? server.name },
				connections.connect(server.name, url),
			)
		},
		onCancel: connections.cancel,
		onDisconnect: () => {
			settle.disconnected(server.name, connections.disconnect(server.name, url))
		},
	}
}

export const toConnectionSettings = ({
	servers,
	connections,
	openedName,
	onSettled,
}: ConnectionSettingsSource): ConnectionSettings => {
	const opened = servers.find((server) => server.name === openedName)
	const settle = settling(onSettled)

	return {
		mcpServers: servers.map((server) => {
			const { state, reason } = connectionOf(connections, server.name)
			return {
				name: server.name,
				config: configOf(server),
				...keptMarkOf(server),
				connection: state,
				reason,
			}
		}),
		onServerConnect: (server) => {
			settle.connected(
				{ name: server.name, title: server.displayName ?? server.name },
				connections.connect(server.name, urlOf(server.config)),
			)
		},
		serverConnection: opened && sectionOf(connections, opened, settle),
	}
}
