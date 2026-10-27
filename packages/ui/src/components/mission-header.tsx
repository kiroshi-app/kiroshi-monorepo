import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	type MissionBot,
	type MissionPullRequest,
	type MissionState,
	type MissionStatus,
	type MissionTicketLink,
	missionBadgeFor,
	shownMissionStatus,
} from "@workspace/ui/components/mission"
import {
	hasActivityLine,
	MissionActivityLine,
} from "@workspace/ui/components/mission-activity-line"
import {
	MissionStatusTime,
	MissionTicketLine,
	MissionToolMark,
} from "@workspace/ui/components/mission-marks"
import {
	hasStatePill,
	MissionStatePill,
} from "@workspace/ui/components/mission-state-pill"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"
import { toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

const MISSION_HEADER_AVATAR_SIZE = 24

type MissionHeaderProps = {
	bot: MissionBot
	objective: string
	ticket: MissionTicketLink
	tools: string[]
	state: MissionState
	isWorking: boolean
	openedAt: number
	now: number
	status?: MissionStatus
	commitsAhead?: number
	pullRequest?: MissionPullRequest
	onBack: () => void
	windowControls?: ReactNode
	dragRegion?: "deep"
	className?: string
}

const MissionTicketRule = () => (
	<span
		aria-hidden="true"
		className="h-3 w-px shrink-0 bg-border"
		data-slot="mission-ticket-rule"
	/>
)

const MissionHeader = ({
	bot,
	objective,
	ticket,
	tools,
	state,
	isWorking,
	openedAt,
	now,
	status,
	commitsAhead,
	pullRequest,
	onBack,
	windowControls,
	dragRegion,
	className,
}: MissionHeaderProps) => {
	const { t } = useTranslation("chat")
	const hasTicket = Boolean(ticket.externalId || ticket.title)
	const hasTools = tools.length > 0
	const shownStatus = shownMissionStatus(status, now)

	return (
		<div
			className={cn("flex w-full shrink-0 flex-col", className)}
			data-slot="mission-header"
		>
			<AppHeader
				data-tauri-drag-region={dragRegion}
				leading={
					<>
						<Button
							aria-label={t("missions.header.back")}
							onClick={onBack}
							size="icon"
							variant="ghost"
						>
							<Icons.Previous aria-hidden="true" />
						</Button>
						<BotIdentityAvatar
							badge={missionBadgeFor(state)}
							hue={bot.blot}
							image={bot.image}
							kind="working"
							name={bot.name}
							seed={bot.seed}
							size={MISSION_HEADER_AVATAR_SIZE}
							working={isWorking}
						/>
						<span className="min-w-0 truncate" data-slot="mission-objective">
							{objective}
						</span>
					</>
				}
				trailing={
					hasStatePill(state) ? <MissionStatePill state={state} /> : null
				}
				windowControls={windowControls}
			/>
			<div
				className="flex h-8.5 shrink-0 items-center gap-2 border-border border-b pe-4 ps-12.5"
				data-slot="mission-ticket-band"
			>
				{hasTicket ? <MissionTicketLine layout="line" ticket={ticket} /> : null}
				{hasTicket && hasTools ? <MissionTicketRule /> : null}
				{hasTools ? (
					<ul
						aria-label={t("missions.header.tools")}
						className="flex shrink-0 items-center gap-2"
					>
						{tools.map((tool) => (
							<li className="flex" key={tool}>
								<MissionToolMark className="size-3" tool={tool} />
							</li>
						))}
					</ul>
				) : null}
				{shownStatus ? (
					<>
						{hasTicket || hasTools ? <MissionTicketRule /> : null}
						<span
							className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs leading-4"
							data-slot="mission-status"
						>
							<TooltipHint content={shownStatus.text}>
								<span className="truncate">{shownStatus.text}</span>
							</TooltipHint>
							<MissionStatusTime className="shrink-0" status={shownStatus} />
						</span>
					</>
				) : null}
				<time
					className="ms-auto shrink-0 text-[11px] text-muted-foreground leading-4 tabular-nums"
					dateTime={new Date(openedAt).toISOString()}
				>
					{t("missions.header.openedAt", {
						time: toRelativeTime(openedAt, now),
					})}
				</time>
			</div>
			{hasActivityLine({ commitsAhead, pullRequest }) ? (
				<MissionActivityLine
					className="h-7 shrink-0 border-border border-b pe-4 ps-12.5"
					commitsAhead={commitsAhead}
					pullRequest={pullRequest}
				/>
			) : null}
		</div>
	)
}

export { MissionHeader, type MissionHeaderProps }
