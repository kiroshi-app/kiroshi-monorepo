import type {
	BotMcpConnectionReason,
	BotMcpConnectionState,
	BotMcpServerItem,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"

import type { ApplicationRow } from "./connection-port"
import { toConnectionReason } from "./connection-reason"
import type { ConnectionOutcome, Connections } from "./use-connections"

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

const settling =
	(onSettled?: (name: string) => void) =>
	(
		name: string,
		landing: ConnectionLanding,
		run: Promise<ConnectionOutcome>,
	) => {
		void run.then(({ rows }) => {
			if (isLanded(rows, name, landing)) {
				onSettled?.(name)
			}
		})
	}

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
			settle(server.name, "connected", connections.connect(server.name, url))
		},
		onCancel: connections.cancel,
		onDisconnect: () => {
			settle(
				server.name,
				"disconnected",
				connections.disconnect(server.name, url),
			)
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
			settle(
				server.name,
				"connected",
				connections.connect(server.name, urlOf(server.config)),
			)
		},
		serverConnection: opened && sectionOf(connections, opened, settle),
	}
}
