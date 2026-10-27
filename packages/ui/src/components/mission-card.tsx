"use client"

import type { HTMLAttributes, ReactElement, ReactNode, Ref } from "react"
import { useTranslation } from "react-i18next"

import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	MESSAGE_BUBBLE_INTERACTIVE,
	MESSAGE_BUBBLE_PADDING_INSET,
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	MISSION_AVATAR_SIZE,
	type MissionCardModel,
	type MissionState,
	type MissionTicketLink,
	type ShownMissionStatus,
	shownMissionStatus,
} from "@workspace/ui/components/mission"
import {
	hasActivityLine,
	MissionActivityLine,
	MissionLiveActivity,
} from "@workspace/ui/components/mission-activity-line"
import {
	MissionStatusTime,
	MissionTicketLine,
	MissionToolMark,
	missionAgentTool,
	missionTicketPlatform,
} from "@workspace/ui/components/mission-marks"
import {
	hasStatePill,
	MissionStatePill,
} from "@workspace/ui/components/mission-state-pill"
import {
	DOT_CLASS,
	ROW_GLYPH_CLASS,
} from "@workspace/ui/components/row-anatomy"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import {
	type ClickModifiers,
	clickHandlersFor,
} from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

type MissionCardDensity = "row" | "card"

type MissionCardSurface = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLDivElement & HTMLLIElement>
}

type MissionCardProps = Omit<MissionCardModel, "author"> & {
	density: MissionCardDensity
	onOpen: (missionId: string, modifiers: ClickModifiers) => void
	surface?: MissionCardSurface
	isActive?: boolean
	className?: string
}

type MissionDensityProps = Omit<
	MissionCardProps,
	"density" | "now" | "status"
> & {
	shownStatus?: ShownMissionStatus
}

const BADGE_OF: Partial<Record<MissionState, BotBadge>> = {
	waiting_human: "attention",
	ready_to_merge: "done",
	failed: "failed",
}

const MARKS_CLASS =
	"me-[5px] inline-flex h-4 items-center gap-[5px] align-top text-muted-foreground [&_svg]:size-[11px]!"

const IDENTIFIER_CLASS = "font-medium tabular-nums"

const isTicketed = ({ platform, externalId, title }: MissionTicketLink) =>
	Boolean(platform || externalId || title)

type MissionTitleRowProps = Pick<
	MissionCardProps,
	"state" | "tools" | "timestamp"
>

const hasTitleRow = ({ state, tools, timestamp }: MissionTitleRowProps) =>
	tools.length > 0 || hasStatePill(state) || timestamp !== ""

const MissionTitleRow = ({ state, tools, timestamp }: MissionTitleRowProps) =>
	hasTitleRow({ state, tools, timestamp }) ? (
		<span
			className="flex flex-wrap items-center gap-x-2 gap-y-1"
			data-slot="mission-title-row"
		>
			{tools.map((tool) => (
				<MissionToolMark key={tool} tool={tool} />
			))}
			<MissionStatePill state={state} />
			<span
				className="ms-auto shrink-0 text-[11px] text-muted-foreground leading-5 tabular-nums"
				data-slot="mission-timestamp"
			>
				{timestamp}
			</span>
		</span>
	) : null

const liveActivityOf = ({
	isWorking,
	lastActivity,
}: Pick<MissionCardProps, "isWorking" | "lastActivity">) =>
	isWorking && lastActivity ? lastActivity : undefined

const CardDensity = ({
	id,
	objective,
	state,
	ticket,
	tools,
	isWorking,
	isClosed,
	timestamp,
	shownStatus,
	commitsAhead,
	pullRequest,
	lastActivity,
	surface,
	onOpen,
	className,
}: MissionDensityProps) => {
	const { t } = useTranslation("chat")
	const hasTicket = Boolean(ticket.externalId || ticket.title)
	const liveActivity = liveActivityOf({ isWorking, lastActivity })

	return (
		<MessageBubble className={className} variant="soft">
			<MessageBubbleContent {...surface} className={MESSAGE_BUBBLE_INTERACTIVE}>
				<button
					aria-label={t("missions.card.open", { objective })}
					className={cn(
						"absolute rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
						MESSAGE_BUBBLE_PADDING_INSET,
					)}
					{...clickHandlersFor((modifiers) => onOpen(id, modifiers))}
					type="button"
				/>
				<span
					className="flex min-w-0 flex-col gap-2"
					data-closed={isClosed}
					data-slot="mission-card"
				>
					{isWorking ? (
						<span className="sr-only">{t("missions.live")}</span>
					) : null}
					<MissionTitleRow state={state} timestamp={timestamp} tools={tools} />
					<span className="flex min-w-0 flex-col gap-1">
						<span
							className={cn(
								"wrap-break-word",
								isClosed && "text-muted-foreground",
							)}
							data-slot="mission-objective"
						>
							{objective}
						</span>
						{hasTicket ? <MissionTicketLine ticket={ticket} /> : null}
						{liveActivity ? <MissionLiveActivity {...liveActivity} /> : null}
					</span>
					{shownStatus ? (
						<span
							className="flex flex-col text-muted-foreground text-xs"
							data-slot="mission-status"
						>
							<span className="line-clamp-3 wrap-break-word">
								{shownStatus.text}
							</span>
							<MissionStatusTime status={shownStatus} />
						</span>
					) : null}
					{hasActivityLine({ commitsAhead, pullRequest }) ? (
						<MissionActivityLine
							commitsAhead={commitsAhead}
							pullRequest={pullRequest}
						/>
					) : null}
				</span>
			</MessageBubbleContent>
		</MessageBubble>
	)
}

const RowDensity = ({
	id,
	objective,
	ticket,
	identity,
	tools,
	state,
	isWorking,
	timestamp,
	shownStatus,
	commitsAhead,
	pullRequest,
	surface,
	isActive,
	onOpen,
	className,
}: MissionDensityProps) => {
	const { t } = useTranslation("chat")
	const { Mark, isNamed } = missionTicketPlatform(ticket.platform)
	const parts = [
		{
			slot: "ticket",
			text: isNamed ? ticket.externalId : ticket.title,
			className: isNamed ? IDENTIFIER_CLASS : undefined,
		},
		{ slot: "bot", text: identity.name },
		...(hasStatePill(state)
			? [{ slot: "state", text: t(`missions.state.${state}`) }]
			: []),
	].filter((part) => part.text !== "")
	const hasActivity = hasActivityLine({ commitsAhead, pullRequest })
	const tool = missionAgentTool(tools) ?? tools[0]
	const hasTicketMark = isTicketed(ticket)

	return (
		<li
			{...surface}
			className={cn("relative", className)}
			data-slot="mission-card-row"
		>
			<SidebarListRow
				badge={BADGE_OF[state]}
				data-opens={id}
				detail={
					hasActivity ? (
						<span aria-hidden="true" className="block h-4" />
					) : undefined
				}
				isActive={isActive}
				isMiddleClickSelectable
				isNameMuted={state === "done"}
				isWorking={isWorking}
				media={
					<BotIdentityAvatar
						hue={identity.blot}
						image={identity.image}
						kind="working"
						name={identity.name}
						seed={identity.id}
						size={MISSION_AVATAR_SIZE}
						working={isWorking}
					/>
				}
				name={objective}
				onSelect={(modifiers) => onOpen(id, modifiers)}
				preview={
					<>
						{isWorking ? (
							<span className="sr-only">{t("missions.live")}</span>
						) : null}
						{tool || hasTicketMark ? (
							<span className={MARKS_CLASS} data-slot="mission-card-marks">
								{tool ? (
									<MissionToolMark className={ROW_GLYPH_CLASS} tool={tool} />
								) : null}
								{hasTicketMark ? (
									<Mark aria-hidden="true" className={ROW_GLYPH_CLASS} />
								) : null}
							</span>
						) : null}
						{parts.map((part, index) => (
							<span
								className={cn(index > 0 && DOT_CLASS, part.className)}
								data-slot="mission-card-part"
								key={part.slot}
							>
								{part.text}
							</span>
						))}
						{shownStatus ? (
							<TooltipHint
								content={
									<span className="flex flex-col">
										<span>{shownStatus.text}</span>
										<MissionStatusTime status={shownStatus} />
									</span>
								}
							>
								<span
									className={cn(parts.length > 0 && DOT_CLASS)}
									data-slot="mission-status"
								>
									{shownStatus.text}
									<MissionStatusTime className="sr-only" status={shownStatus} />
								</span>
							</TooltipHint>
						) : null}
					</>
				}
				timestamp={timestamp}
			/>
			{hasActivity ? (
				<MissionActivityLine
					className={cn(
						"pointer-events-none absolute start-12 end-3 bottom-1.5 [&_a]:pointer-events-auto",
					)}
					commitsAhead={commitsAhead}
					pullRequest={pullRequest}
				/>
			) : null}
		</li>
	)
}

const MissionCard = ({ density, status, now, ...props }: MissionCardProps) => {
	const shownStatus = shownMissionStatus(status, now)

	return density === "row" ? (
		<RowDensity {...props} shownStatus={shownStatus} />
	) : (
		<CardDensity {...props} shownStatus={shownStatus} />
	)
}

type MissionCardWrap = (card: ReactElement<MissionCardProps>) => ReactNode

const wrapCard = (
	card: ReactElement<MissionCardProps>,
	wrap: MissionCardWrap | undefined,
) => (wrap ? wrap(card) : card)

export { MissionCard, type MissionCardProps, type MissionCardWrap, wrapCard }
