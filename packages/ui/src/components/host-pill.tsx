"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

type SpaceHost = "shared" | "up" | "connecting" | "down"

type HostPillState = Extract<SpaceHost, "connecting" | "down">

const PILL =
	"inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-title-bar-pill ps-2 pe-2.5 font-medium text-foreground text-xs"

const PILL_DOWN = "text-muted-foreground"

const DOT = "pointer-events-none size-1.75 shrink-0 rounded-full"

const DOT_FILL: Record<SpaceHost, string> = {
	shared: "bg-presence-online",
	up: "bg-presence-online",
	connecting:
		"inset-ring-[1.5px] inset-ring-presence-offline bg-(--host-dot-surface,var(--shell-surface,var(--background)))",
	down: "bg-presence-offline",
}

const LABEL = "whitespace-nowrap"

type HostDotProps = {
	host: SpaceHost
	className?: string
}

const HostDot = ({ host, className }: HostDotProps) => (
	<span
		aria-hidden="true"
		className={cn(DOT, DOT_FILL[host], className)}
		data-host={host}
		data-slot="host-dot"
	/>
)

const hostPillOf = (host?: SpaceHost): HostPillState | undefined =>
	host === "connecting" || host === "down" ? host : undefined

type HostPillProps = {
	host: HostPillState
}

const HostPill = ({ host }: HostPillProps) => {
	const { t } = useTranslation("bots")

	return (
		<span
			className={cn(PILL, host === "down" && PILL_DOWN)}
			data-slot="host-pill"
		>
			<HostDot host={host} />
			<span className={LABEL}>{t(`spaces.host.${host}`)}</span>
		</span>
	)
}

export { HostPill, type HostPillProps, hostPillOf, type SpaceHost }
