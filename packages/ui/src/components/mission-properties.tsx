import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	type MissionPullRequest,
	type MissionStatus,
	type MissionTicketLink,
	shownMissionStatus,
} from "@workspace/ui/components/mission"
import { MissionLink } from "@workspace/ui/components/mission-activity-line"
import {
	MissionStatusTime,
	MissionTicketLine,
} from "@workspace/ui/components/mission-marks"
import { DOT_CLASS } from "@workspace/ui/components/row-anatomy"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"
import { toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

const PROPERTY_ROW = "flex min-h-6 items-center gap-2"

const PROPERTY_LABEL =
	"w-21 shrink-0 py-0.5 text-muted-foreground text-xs leading-5"

const PROPERTY_VALUE =
	"flex min-w-0 flex-1 items-center gap-2 text-compact text-soft-foreground leading-5"

const PROPERTY_PART = cn("whitespace-nowrap", DOT_CLASS)

type MissionPropertiesProps = {
	ticket: MissionTicketLink
	openedAt: number
	now: number
	status?: MissionStatus
	commitsAhead?: number
	pullRequest?: MissionPullRequest
	onOpenCodingSession?: () => void
	className?: string
}

const MissionProperties = ({
	ticket,
	openedAt,
	now,
	status,
	commitsAhead = 0,
	pullRequest,
	onOpenCodingSession,
	className,
}: MissionPropertiesProps) => {
	const { t } = useTranslation("chat")
	const hasTicket = Boolean(ticket.externalId || ticket.title)
	const shownStatus = shownMissionStatus(status, now)

	if (!hasTicket && !shownStatus && !pullRequest) return null

	return (
		<dl
			className={cn(
				"@container flex flex-col gap-1 border-foreground/8 border-b pb-4 dark:border-white/8",
				className,
			)}
			data-slot="mission-properties"
		>
			{hasTicket ? (
				<div
					className={cn(PROPERTY_ROW, "@max-[40rem]:items-start")}
					data-property="ticket"
				>
					<dt className={PROPERTY_LABEL}>{t("missions.properties.ticket")}</dt>
					<dd className={cn(PROPERTY_VALUE, "@max-[40rem]:items-start")}>
						<MissionTicketLine layout="line" ticket={ticket} />
						{onOpenCodingSession ? (
							<span
								className="flex shrink-0 items-center @max-[40rem]:ms-auto"
								data-slot="mission-ticket-actions"
							>
								<Button
									aria-label={t("missions.properties.openCodingSession")}
									className="text-muted-foreground transition-none [&_svg:not([class*='size-'])]:size-3.5"
									onClick={onOpenCodingSession}
									size="icon-xs"
									variant="ghost"
								>
									<Icons.Command aria-hidden="true" />
								</Button>
							</span>
						) : null}
					</dd>
				</div>
			) : null}
			{shownStatus ? (
				<div className={PROPERTY_ROW} data-property="activity">
					<dt className={PROPERTY_LABEL}>
						{t("missions.properties.activity")}
					</dt>
					<dd className={PROPERTY_VALUE}>
						<span
							className="flex min-w-0 items-center"
							data-slot="mission-status"
						>
							<TooltipHint content={shownStatus.text}>
								<span className="truncate">{shownStatus.text}</span>
							</TooltipHint>
							<MissionStatusTime
								className={cn("shrink-0", DOT_CLASS)}
								isElapsed
								status={shownStatus}
							/>
						</span>
					</dd>
				</div>
			) : null}
			{pullRequest ? (
				<div className={PROPERTY_ROW} data-property="pull-request">
					<dt className={PROPERTY_LABEL}>
						{t("missions.properties.pullRequest")}
					</dt>
					<dd className={PROPERTY_VALUE}>
						<Icons.PullRequest
							aria-hidden="true"
							className="size-3.5 shrink-0"
						/>
						<span
							className="flex min-w-0 flex-wrap items-center tabular-nums"
							data-slot="mission-pull-request"
						>
							<MissionLink
								className="font-normal text-soft-foreground"
								pullRequest={pullRequest.number}
								url={pullRequest.url}
							/>
							{commitsAhead > 0 ? (
								<span
									className={PROPERTY_PART}
									data-slot="mission-commits-ahead"
								>
									{t("missions.activity.commitsAhead", {
										count: commitsAhead,
									})}
								</span>
							) : null}
							<time
								className={PROPERTY_PART}
								dateTime={new Date(openedAt).toISOString()}
							>
								{t("missions.properties.openedAt", {
									time: toRelativeTime(openedAt, now, "short"),
								})}
							</time>
						</span>
					</dd>
				</div>
			) : null}
		</dl>
	)
}

export { MissionProperties, type MissionPropertiesProps }
