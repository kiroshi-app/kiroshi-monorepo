import type { TFunction } from "i18next"

import type {
	BotMcpConnectionReason,
	BotMcpConnectionState,
} from "@workspace/ui/components/bot-settings"

type McpRefusedRefresh = {
	reason: string
	companionName: string
	toolCount: number
	sessionCount: number
}

type McpConnectionSection = {
	state: BotMcpConnectionState
	reason?: BotMcpConnectionReason
	host?: string
	refusedRefresh?: McpRefusedRefresh
	onConnect?: () => void
	onCancel?: () => void
	onDisconnect?: () => void
}

const readMcpConnectionReason = (
	t: TFunction<"bots">,
	reason?: BotMcpConnectionReason,
) => {
	if (!reason) return null
	if (reason.kind === "unknown")
		return reason.detail.trim()
			? t("applications.connection.reason.unknown", {
					detail: reason.detail,
				})
			: null

	return t(`applications.connection.reason.${reason.kind}`)
}

const MCP_ATTENTION_FIELD =
	"border-bot-badge-attention/45 bg-bot-badge-attention/8"

const MCP_DESTRUCTIVE_SURFACE = "border-destructive/22 bg-destructive/6"

const MCP_CONNECTION_DOT = {
	connected: "bg-emerald-500",
	needsAuthorization: "bg-state-needs-authorization",
	connecting: "bg-muted-foreground motion-safe:animate-pulse",
	failed: "bg-destructive",
} satisfies Record<BotMcpConnectionState, string>

export {
	MCP_ATTENTION_FIELD,
	MCP_CONNECTION_DOT,
	MCP_DESTRUCTIVE_SURFACE,
	type McpConnectionSection,
	type McpRefusedRefresh,
	readMcpConnectionReason,
}
