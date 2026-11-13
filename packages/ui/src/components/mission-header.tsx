import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	HeaderIsland,
	HeaderIslandButton,
	HeaderIslandCell,
} from "@workspace/ui/components/header-island"
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
	MissionLink,
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
import { toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

const MISSION_HEADER_AVATAR_SIZE = 24

const MISSION_HEADER_ROWS = "flex w-full min-w-0 flex-col gap-2"

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
	commitsAhead = 0,
	pullRequest,
	onBack,
	dragRegion,
	className,
}: MissionHeaderProps) => {
	const { t } = useTranslation("chat")
	const hasTicket = Boolean(ticket.externalId || ticket.title)
	const hasTools = tools.length > 0
	const shownStatus = shownMissionStatus(status, now)

	return (
		<div
			className={cn(MISSION_HEADER_ROWS, className)}
			data-slot="mission-header"
		>
			<AppHeader
				data-tauri-drag-region={dragRegion}
				isFloating
				leading={
					<>
						<HeaderIslandButton
							aria-label={t("missions.header.back")}
							onClick={onBack}
						>
							<Icons.Previous aria-hidden="true" />
						</HeaderIslandButton>
						<HeaderIslandCell className="p-1">
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
						</HeaderIslandCell>
					</>
				}
				trailing={
					hasStatePill(state) ? <MissionStatePill state={state} /> : null
				}
			/>
			<HeaderIsland
				className="h-auto min-h-10 flex-wrap"
				data-island="mission-ticket"
			>
				{hasTicket || hasTools ? (
					<HeaderIslandCell data-slot="mission-ticket-cell">
						{hasTicket ? (
							<MissionTicketLine layout="line" ticket={ticket} />
						) : null}
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
					</HeaderIslandCell>
				) : null}
				{shownStatus ? (
					<HeaderIslandCell data-slot="mission-status-cell">
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
					</HeaderIslandCell>
				) : null}
				<span aria-hidden="true" className="flex-1" />
				<HeaderIslandCell
					className="shrink-0 gap-3 whitespace-nowrap text-xs leading-4"
					data-slot="mission-opening-cell"
				>
					{hasActivityLine({ commitsAhead, pullRequest }) ? (
						<span
							className="flex items-center gap-3"
							data-slot="mission-activity"
						>
							{commitsAhead > 0 ? (
								<span
									className="tabular-nums"
									data-slot="mission-commits-ahead"
								>
									{t("missions.activity.commitsAhead", { count: commitsAhead })}
								</span>
							) : null}
							{pullRequest ? (
								<span className="flex items-center gap-1">
									<Icons.PullRequest
										aria-hidden="true"
										className="size-3.5 shrink-0"
									/>
									<MissionLink
										pullRequest={pullRequest.number}
										url={pullRequest.url}
									/>
								</span>
							) : null}
						</span>
					) : null}
					<time
						className="text-muted-foreground tabular-nums"
						dateTime={new Date(openedAt).toISOString()}
					>
						{t("missions.header.openedAt", {
							time: toRelativeTime(openedAt, now),
						})}
					</time>
				</HeaderIslandCell>
			</HeaderIsland>
		</div>
	)
}

export { MISSION_HEADER_ROWS, MissionHeader, type MissionHeaderProps }
