"use client"

import type { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"
import { useTranslation } from "react-i18next"

import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { Badge } from "@workspace/ui/components/ui/badge"
import { cn } from "@workspace/ui/lib/utils"

const BOT_BADGES = ["attention", "done", "failed"] as const

type BotBadge = (typeof BOT_BADGES)[number]

const DOT_CLASS = "pointer-events-none size-2 gap-0 rounded-full border-0 p-0"

const botBadgeVariants = cva("", {
	variants: {
		badge: {
			attention: "bg-warning motion-safe:animate-pulse",
			done: "bg-bot-badge-done",
			failed: "bg-bot-badge-failed",
		},
		placement: {
			inline: "",
			avatar:
				"absolute right-[6%] bottom-[6%] size-[34%] max-h-4 max-w-4 ring-2 ring-[var(--badge-ring,var(--color-sidebar))]",
			switcher:
				"group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:ring-2 group-data-[collapsible=icon]:ring-[var(--badge-ring,var(--color-sidebar))]",
			row: "absolute end-0 bottom-1",
			rail: "absolute -end-px -top-px ring-2 ring-background transition-shadow duration-400 ease-out motion-reduce:transition-none",
		},
	},
})

const botBadgeRingVariants = cva("ring-2", {
	variants: {
		badge: {
			attention: "ring-warning motion-safe:animate-pulse",
			done: "ring-bot-badge-done",
			failed: "ring-bot-badge-failed",
		},
	},
})

type BotBadgeDotProps = useRender.ComponentProps<"span"> &
	Required<Pick<VariantProps<typeof botBadgeVariants>, "badge" | "placement">>

const BotBadgeDot = ({
	badge,
	placement,
	className,
	...props
}: BotBadgeDotProps) => (
	<Badge
		aria-hidden="true"
		className={cn(DOT_CLASS, botBadgeVariants({ badge, placement }), className)}
		data-badge={badge}
		data-slot="bot-badge-dot"
		{...props}
	/>
)

const BOT_MISSION_STATES = [
	"waiting",
	"failed",
	"ready",
	"working",
	"waiting_agent",
] as const

type BotMissionState = (typeof BOT_MISSION_STATES)[number]

const BOT_MISSION_STRIP =
	"flex h-6 items-center gap-1.5 rounded-sm bg-foreground/10 px-2 py-1 text-xs"

const BOT_MISSION_DOT_SLOT = "size-3 shrink-0"

type BotMissionTicket = {
	platform: string
	externalId: string
	title: string
}

type BotMissionStripProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
	state: BotMissionState
	ticket: BotMissionTicket
	objective?: string
	isLive?: boolean
}

const BotMissionStrip = ({
	state,
	ticket,
	objective,
	isLive,
	className,
	...props
}: BotMissionStripProps) => {
	const { t } = useTranslation("bots")
	const { Mark, isNamed } = missionTicketPlatform(ticket.platform)
	const isDotDrawn = state !== "working" || isLive

	return (
		<span
			className={cn(BOT_MISSION_STRIP, className)}
			data-slot="bot-mission-strip"
			data-state={state}
			{...props}
		>
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<Mark
				aria-hidden="true"
				className="size-3 shrink-0 text-muted-foreground"
				data-slot="bot-mission-mark"
			/>
			{isNamed ? (
				<span className="shrink-0 font-medium text-foreground/70 tabular-nums">
					{ticket.externalId}
				</span>
			) : null}
			<span
				className="min-w-0 grow truncate text-muted-foreground"
				data-slot="bot-mission-ticket-title"
			>
				{ticket.title || objective}
			</span>
			{isDotDrawn ? (
				<MissionStateMark data-slot="bot-mission-dot" state={state} />
			) : (
				<span
					aria-hidden="true"
					className={BOT_MISSION_DOT_SLOT}
					data-slot="bot-mission-dot-placeholder"
				/>
			)}
		</span>
	)
}

const BOT_TITLE_BADGE =
	"min-w-6 max-w-max grow basis-0 truncate rounded-full bg-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-foreground/80 leading-none"

type BotTitleBadgeVariant = "pill" | "line" | "plain"

const BOT_TITLE_BADGE_VARIANT = {
	pill: "",
	line: "shrink-0 grow-0 basis-auto rounded-sm bg-foreground/8 py-0 font-normal text-soft-foreground text-xs leading-5",
	plain:
		"rounded-none bg-transparent px-0 py-0 font-normal text-compact text-muted-foreground leading-5",
} as const satisfies Record<BotTitleBadgeVariant, string>

type BotTitleBadgeProps = Omit<ComponentPropsWithRef<"span">, "title"> & {
	title?: string
	variant?: BotTitleBadgeVariant
}

const BotTitleBadge = ({
	title,
	variant = "pill",
	className,
	...props
}: BotTitleBadgeProps) =>
	title ? (
		<span
			data-slot="bot-title-badge"
			data-variant={variant}
			className={cn(
				BOT_TITLE_BADGE,
				BOT_TITLE_BADGE_VARIANT[variant],
				className,
			)}
			{...props}
		>
			{title}
		</span>
	) : null

export {
	BOT_BADGES,
	BOT_MISSION_STATES,
	type BotBadge,
	BotBadgeDot,
	type BotMissionState,
	BotMissionStrip,
	type BotMissionTicket,
	BotTitleBadge,
	botBadgeRingVariants,
}
