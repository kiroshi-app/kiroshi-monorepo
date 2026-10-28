"use client"

import { useTranslation } from "react-i18next"

import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"
import {
	MCP_ATTENTION_FIELD,
	MCP_CONNECTION_DOT,
	MCP_DESTRUCTIVE_SURFACE,
	type McpConnectionSection,
	type McpRefusedRefresh,
	readMcpConnectionReason,
} from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const OpensBrowserIcon = () => (
	<Icons.ExternalLink
		aria-hidden="true"
		className="size-3.5"
		data-icon="inline-start"
	/>
)

const QUIET_FIELD = "border-border bg-muted/60"

const AUTHORIZATION_FIELD = {
	connected: QUIET_FIELD,
	needsAuthorization: MCP_ATTENTION_FIELD,
	connecting: MCP_ATTENTION_FIELD,
	failed: "border-destructive/45 bg-destructive/8",
} satisfies Record<BotMcpConnectionState, string>

type McpRefusedRefreshBlockProps = {
	refusal: McpRefusedRefresh
	name: string
	onConnect?: () => void
}

const McpRefusedRefreshBlock = ({
	refusal,
	name,
	onConnect,
}: McpRefusedRefreshBlockProps) => {
	const { t } = useTranslation("bots")

	return (
		<div
			className={cn(
				"flex shrink-0 items-start gap-2.5 rounded-xl border p-3.5",
				MCP_DESTRUCTIVE_SURFACE,
			)}
		>
			<span className="mt-0.75 flex size-4 shrink-0 items-center justify-center">
				<span
					aria-hidden="true"
					className={cn("size-2 rounded-full", MCP_CONNECTION_DOT.failed)}
				/>
			</span>
			<div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
				<p className="font-medium text-foreground text-sm/5">
					{t("applications.connection.refused.title")}
				</p>
				<p className="wrap-break-word text-[13px]/4.5 text-muted-foreground">
					{t("applications.connection.refused.description", {
						name,
						agent: refusal.companionName,
						count: refusal.toolCount,
						sessions: t("applications.connection.refused.sessions", {
							count: refusal.sessionCount,
						}),
					})}
				</p>
				<code className="block max-w-full wrap-break-word rounded-md border border-border bg-card px-2.5 py-1.25 font-mono text-muted-foreground text-xs/4">
					{refusal.reason}
				</code>
			</div>
			{onConnect ? (
				<Button className="shrink-0" onClick={onConnect} size="sm">
					{t("applications.connection.refused.action")}
				</Button>
			) : null}
		</div>
	)
}

type McpAuthorizationProps = McpConnectionSection & {
	name: string
	isSaved: boolean
	defaultDisconnecting?: boolean
}

const McpAuthorization = ({
	state,
	reason,
	host,
	refusedRefresh,
	name,
	isSaved,
	defaultDisconnecting,
	onConnect,
	onCancel,
	onDisconnect,
}: McpAuthorizationProps) => {
	const { t } = useTranslation("bots")
	const isWaiting = isSaved && state === "connecting"

	if (isSaved && refusedRefresh) {
		return (
			<McpRefusedRefreshBlock
				name={name}
				onConnect={onConnect}
				refusal={refusedRefresh}
			/>
		)
	}

	const readDescription = () => {
		if (!isSaved) return t("applications.connection.description.unsaved")
		if (state === "needsAuthorization")
			return t("applications.connection.description.needsAuthorization", {
				name,
			})
		if (state === "connecting")
			return host
				? t("applications.connection.description.connecting", { host })
				: null
		if (state === "failed") return readMcpConnectionReason(t, reason)
		return null
	}

	const readActions = () => {
		if (!isSaved)
			return onConnect ? (
				<Button disabled size="sm">
					<OpensBrowserIcon />
					{t("applications.connection.connect")}
				</Button>
			) : null

		if (state === "needsAuthorization")
			return onConnect ? (
				<Button onClick={onConnect} size="sm">
					<OpensBrowserIcon />
					{t("applications.connection.connect")}
				</Button>
			) : null

		if (state === "failed")
			return onConnect ? (
				<Button onClick={onConnect} size="sm" variant="outline">
					{t("applications.connection.retry")}
				</Button>
			) : null

		if (state === "connecting")
			return onCancel ? (
				<Button onClick={onCancel} size="sm" variant="ghost">
					{t("applications.connection.cancel")}
				</Button>
			) : null

		return onDisconnect ? (
			<ConfirmDialog
				confirmLabel={t("applications.connection.disconnect")}
				defaultOpen={defaultDisconnecting}
				description={t("applications.connection.confirm.description", { name })}
				onConfirm={onDisconnect}
				title={t("applications.connection.confirm.title", { name })}
				trigger={t("applications.connection.disconnect")}
				triggerClassName={buttonVariants({ variant: "outline", size: "sm" })}
			/>
		) : null
	}

	const description = readDescription()

	return (
		<div
			className={cn(
				"flex shrink-0 items-start gap-3 rounded-xl border p-3",
				isSaved ? AUTHORIZATION_FIELD[state] : QUIET_FIELD,
			)}
		>
			<span className="flex size-4 shrink-0 items-center justify-center">
				{isWaiting ? (
					<Icons.Loading
						aria-hidden="true"
						className="size-3.5 animate-spin text-bot-badge-attention motion-reduce:animate-none"
					/>
				) : (
					<span
						aria-hidden="true"
						className={cn("size-2 rounded-full", MCP_CONNECTION_DOT[state])}
					/>
				)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="font-medium text-foreground text-sm">
					{isWaiting
						? t("applications.connection.waiting")
						: t(`applications.connection.state.${state}`)}
				</p>
				{description ? (
					<p className="wrap-break-word text-muted-foreground text-xs">
						{description}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">{readActions()}</div>
		</div>
	)
}

export { McpAuthorization }
