"use client"

import type { TFunction } from "i18next"
import { Fragment, type ReactElement, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CurrentSpaceCarousel } from "@workspace/ui/components/app-sidebar-carousel"
import type {
	AppSidebarConversation,
	AppSidebarRowMission,
} from "@workspace/ui/components/app-sidebar-model"
import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import type { ExpandedSidebarProps } from "@workspace/ui/components/expanded-sidebar"
import { Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import {
	type ListEnd,
	ListEndSlot,
	ListSkeleton,
} from "@workspace/ui/components/list-skeleton"
import {
	MISSION_GLYPH,
	MISSION_GLYPH_COLOUR,
} from "@workspace/ui/components/mission-capsule"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { ProgressRing } from "@workspace/ui/components/progress-ring"
import {
	SpaceAvatar,
	spaceAvatarStateOf,
} from "@workspace/ui/components/space-avatar"
import {
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"
import { HOVER_INTENT_DELAY_MS } from "@workspace/ui/components/tooltip-hint"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"
import type {
	UpdateBadgeProps,
	UpdateBadgeStatus,
} from "@workspace/ui/components/update-badge"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const RAIL =
	"flex min-h-0 w-15 shrink-0 flex-col items-center gap-0.5 px-2 pt-2"

const LIST =
	"flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto scrollbar-hide"

const SLOT =
	"relative grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"

const SLOT_ICON = "[&_svg]:size-4.5 [&_svg]:stroke-[1.75]"

const SLOT_HOVER = "hover:bg-title-bar-highlight"

const SLOT_CURRENT =
	"bg-rail-item-selected text-foreground hover:bg-rail-item-selected-hover"

const ATTENTION_DOT =
	"-end-0.25 -top-0.25 pointer-events-none absolute size-2 rounded-full bg-mission-glyph-waiting ring-2 ring-background"

const SEPARATOR =
	"pointer-events-none box-content h-px w-7 shrink-0 bg-border bg-clip-content py-1"

const ITEM =
	"relative grid shrink-0 place-items-center outline-none before:pointer-events-none before:absolute before:rounded-md focus-visible:before:ring-2 focus-visible:before:ring-ring"

const CONVERSATION_ITEM = "size-11 before:inset-1"

const MISSION_ITEM = "h-7 w-11 before:inset-x-1 before:inset-y-0"

const TILE_HOVER = "hover:before:bg-title-bar-highlight"

const TILE_CURRENT = "before:bg-rail-item-selected"

const NOT_SENT_DOT =
	"-bottom-0.5 -end-0.5 pointer-events-none absolute size-2.5 rounded-full bg-mission-glyph-failure ring-2 ring-background"

const GROUP = "flex w-11 shrink-0 flex-col rounded-control bg-update-row pb-2"

const OVERFLOW_COUNT =
	"relative font-semibold text-[11px] text-foreground tabular-nums"

const TIP = cn(
	"max-w-xs flex-col items-start gap-0.5 rounded-md bg-prompt-surface p-2 text-foreground text-xs/4 shadow-rail-tooltip [&>[data-side]]:hidden",
	STILL_UNDER_REDUCED_MOTION,
)

const TIP_LINE = "flex max-w-full flex-wrap items-baseline gap-x-1 break-words"

const TIP_STRONG = "font-medium"

const TIP_MUTED = "text-muted-foreground"

const TIP_OFFSET = 12

const SKELETON_TILE = "size-7 rounded-md bg-foreground/7"

const SKELETON_LIST = "items-center gap-0.5 pt-2"

const EMPTY_TILE =
	"size-7 rounded-md border border-rail-section-placeholder border-dashed"

const UPDATE_DISC =
	"grid size-7 place-items-center rounded-full bg-foreground text-on-foreground [&_svg]:size-3.5 [&_svg]:stroke-[2.5]"

const UPDATE_DISC_FAILED = "bg-update-failed text-update-failed-foreground"

const UPDATE_RING =
	"size-7 [&_circle]:stroke-[2.57] [&_circle:first-child]:stroke-update-track [&_circle:last-child]:stroke-foreground"

const UPDATE_RING_ARROW = "size-3.5 stroke-[2.5] text-muted-foreground"

const PERSON_INITIAL =
	"grid size-full place-items-center bg-rail-avatar font-medium text-foreground text-xs/4 uppercase"

const MISSION_ORDER: BotMissionState[] = [
	"waiting",
	"ready",
	"working",
	"waiting_agent",
	"failed",
]

const MAX_MISSION_CELLS = 3

const CELLS_BEFORE_OVERFLOW = 2

type CollapsedSidebarZone = {
	id: string
	name?: string
	conversations: AppSidebarConversation[]
}

type CollapsedSidebarListStatus = "ready" | "loading" | "failed"

type CollapsedSidebarProps = Omit<
	ExpandedSidebarProps,
	| "pinned"
	| "conversations"
	| "sections"
	| "update"
	| "missionCount"
	| "onReorderSpaces"
	| "trigger"
> & {
	zones: CollapsedSidebarZone[]
	listStatus?: CollapsedSidebarListStatus
	listEnd?: ListEnd
	openConversationId?: string
	openMissionId?: string
	update?: UpdateBadgeProps
	onOpenConversation?: (conversationId: string) => void
	onOpenMission?: (missionId: string) => void
	onRetryList?: () => void
}

const inRailOrder = (missions: AppSidebarRowMission[] = []) =>
	[...missions].sort(
		(first, second) =>
			MISSION_ORDER.indexOf(first.state) - MISSION_ORDER.indexOf(second.state),
	)

const hasWaitingMission = (zones: CollapsedSidebarZone[]) =>
	zones.some((zone) =>
		zone.conversations.some((conversation) =>
			conversation.missions?.some((mission) => mission.state === "waiting"),
		),
	)

const missionTitleOf = (mission: AppSidebarRowMission) =>
	mission.ticket.title || mission.objective || ""

const missionTicketOf = (mission: AppSidebarRowMission) =>
	missionTicketPlatform(mission.ticket.platform).isNamed
		? mission.ticket.externalId
		: undefined

const missionNameOf = (mission: AppSidebarRowMission) =>
	[missionTicketOf(mission), missionTitleOf(mission)].filter(Boolean).join(" ")

type RailTipContentProps = {
	children: ReactNode
}

const RailTipContent = ({ children }: RailTipContentProps) => (
	<TooltipContent
		className={TIP}
		role="tooltip"
		side="right"
		sideOffset={TIP_OFFSET}
	>
		{children}
	</TooltipContent>
)

type RailTipProps = {
	content: ReactNode
	children: ReactElement
}

const RailTip = ({ content, children }: RailTipProps) => (
	<Tooltip>
		<TooltipTrigger delay={HOVER_INTENT_DELAY_MS} render={children} />
		<RailTipContent>{content}</RailTipContent>
	</Tooltip>
)

type TipLineProps = {
	title: string
	detail?: string
}

const TipLine = ({ title, detail }: TipLineProps) => {
	const { t } = useTranslation("bots")

	return (
		<span className={TIP_LINE}>
			<span className={TIP_STRONG}>{title}</span>
			{detail ? (
				<span className={TIP_MUTED}>{t("rail.detail", { detail })}</span>
			) : null}
		</span>
	)
}

const RailSeparator = () => (
	<span
		aria-hidden="true"
		className={SEPARATOR}
		data-slot="collapsed-sidebar-separator"
	/>
)

type DestinationProps = {
	label: string
	icon: ReactNode
	isCurrent?: boolean
	hasAttention?: boolean
	onSelect?: () => void
}

const Destination = ({
	label,
	icon,
	isCurrent = false,
	hasAttention = false,
	onSelect,
}: DestinationProps) => (
	<RailTip content={<TipLine title={label} />}>
		<button
			aria-current={isCurrent ? "page" : undefined}
			aria-label={label}
			className={cn(SLOT, SLOT_ICON, isCurrent ? SLOT_CURRENT : SLOT_HOVER)}
			data-slot="collapsed-sidebar-destination"
			onClick={onSelect}
			type="button"
		>
			<span className="relative grid place-items-center">
				{icon}
				{hasAttention ? (
					<span
						aria-hidden="true"
						className={ATTENTION_DOT}
						data-slot="collapsed-sidebar-attention"
					/>
				) : null}
			</span>
		</button>
	</RailTip>
)

const SpaceSlot = (switcher: SpaceSwitcherProps) => {
	const { t } = useTranslation("bots")
	const selected =
		switcher.spaces.find((space) => space.id === switcher.selectedSpaceId) ??
		switcher.spaces[0]

	if (!selected) return null

	const host = switcher.hostBySpaceId?.[selected.id]
	const offline = host === "down" ? t("spaces.host.down") : undefined
	const label = offline
		? t("roster.titled", { name: selected.name, title: offline })
		: selected.name

	return (
		<Tooltip>
			<SpaceSwitcher
				{...switcher}
				trigger={
					<TooltipTrigger
						delay={HOVER_INTENT_DELAY_MS}
						render={
							<button
								aria-label={label}
								className={cn(
									SLOT,
									SLOT_HOVER,
									"aria-expanded:bg-rail-item-selected",
								)}
								data-slot="collapsed-sidebar-space"
								type="button"
							>
								<SpaceAvatar
									colour={selected.colour}
									name={selected.name}
									size={26}
									spaceId={selected.avatarSeed}
									state={spaceAvatarStateOf(host)}
								/>
							</button>
						}
					/>
				}
			/>
			<RailTipContent>
				<TipLine detail={offline} title={selected.name} />
			</RailTipContent>
		</Tooltip>
	)
}

type MissionTipProps = {
	mission: AppSidebarRowMission
}

const MissionTip = ({ mission }: MissionTipProps) => {
	const { t } = useTranslation("bots")
	const ticket = missionTicketOf(mission)

	return (
		<>
			<span className={TIP_LINE}>
				{ticket ? (
					<span className={cn(TIP_MUTED, "tabular-nums")}>{ticket}</span>
				) : null}
				<span className={TIP_STRONG}>{missionTitleOf(mission)}</span>
			</span>
			<span className={TIP_LINE}>
				<span className={cn(TIP_STRONG, MISSION_GLYPH_COLOUR[mission.state])}>
					{t(`roster.mission.state.${mission.state}`)}
				</span>
				{mission.agentName ? (
					<span className={TIP_MUTED}>
						{t("rail.detail", { detail: mission.agentName })}
					</span>
				) : null}
			</span>
		</>
	)
}

type MissionGlyphProps = {
	state: BotMissionState
}

const MissionGlyph = ({ state }: MissionGlyphProps) => (
	<span
		aria-hidden="true"
		className={cn(
			MISSION_GLYPH,
			"relative size-3.5",
			MISSION_GLYPH_COLOUR[state],
		)}
		data-slot="collapsed-sidebar-mission-glyph"
	/>
)

type MissionCellProps = {
	mission: AppSidebarRowMission
	isOpen: boolean
}

const MissionCell = ({ mission, isOpen }: MissionCellProps) => (
	<RailTip content={<MissionTip mission={mission} />}>
		<span
			aria-current={isOpen ? "page" : undefined}
			className={cn(ITEM, MISSION_ITEM, isOpen && TILE_CURRENT)}
			data-slot="collapsed-sidebar-mission"
			data-state={mission.state}
		>
			<span className="sr-only">{missionNameOf(mission)}</span>
			<MissionGlyph state={mission.state} />
		</span>
	</RailTip>
)

type MissionOverflowProps = {
	count: number
}

const MissionOverflow = ({ count }: MissionOverflowProps) => {
	const { t } = useTranslation("bots")

	return (
		<span
			className={cn(ITEM, MISSION_ITEM)}
			data-slot="collapsed-sidebar-overflow"
		>
			<span aria-hidden="true" className={OVERFLOW_COUNT}>
				{t("roster.conversation.others", { count })}
			</span>
			<span className="sr-only">{t("rail.moreMissions", { count })}</span>
		</span>
	)
}

type ConversationTipProps = {
	conversation: AppSidebarConversation
	missions: AppSidebarRowMission[]
}

const ConversationTip = ({ conversation, missions }: ConversationTipProps) => {
	const { t } = useTranslation("bots")
	const [first] = missions

	return (
		<>
			<TipLine
				detail={
					conversation.isNotSent ? t("roster.conversation.notSent") : undefined
				}
				title={conversation.name}
			/>
			{first ? (
				<span className={cn(TIP_LINE, TIP_MUTED)}>
					<span>{t("rail.missionCount", { count: missions.length })}</span>
					<span>
						{t("rail.detail", {
							detail: t(`roster.mission.state.${first.state}`),
						})}
					</span>
				</span>
			) : null}
		</>
	)
}

type RailConversationProps = {
	conversation: AppSidebarConversation
	openConversationId?: string
	openMissionId?: string
	onOpenConversation?: (conversationId: string) => void
}

const RailConversation = ({
	conversation,
	openConversationId,
	openMissionId,
	onOpenConversation,
}: RailConversationProps) => {
	const { t } = useTranslation("bots")
	const missions = inRailOrder(conversation.missions)
	const isOpen = conversation.id === openConversationId
	const isOverflowing = missions.length > MAX_MISSION_CELLS
	const cells = isOverflowing
		? missions.slice(0, CELLS_BEFORE_OVERFLOW)
		: missions
	const item = (
		<RailTip
			content={
				<ConversationTip conversation={conversation} missions={missions} />
			}
		>
			<button
				aria-current={isOpen ? "page" : undefined}
				aria-label={
					conversation.isNotSent
						? t("roster.titled", {
								name: conversation.name,
								title: t("roster.conversation.notSent"),
							})
						: conversation.name
				}
				className={cn(
					ITEM,
					CONVERSATION_ITEM,
					isOpen ? TILE_CURRENT : TILE_HOVER,
				)}
				data-slot="collapsed-sidebar-conversation"
				onClick={() => onOpenConversation?.(conversation.id)}
				type="button"
			>
				<span className="relative">
					<ConversationSubjectIcon
						hue={conversation.color}
						icon={conversation.icon}
						side={28}
					/>
					{conversation.isNotSent ? (
						<span
							aria-hidden="true"
							className={NOT_SENT_DOT}
							data-slot="collapsed-sidebar-not-sent"
						/>
					) : null}
				</span>
			</button>
		</RailTip>
	)

	if (missions.length === 0) return item

	return (
		<div className={GROUP} data-slot="collapsed-sidebar-group">
			{item}
			{cells.map((mission) => (
				<MissionCell
					isOpen={mission.id === openMissionId}
					key={mission.id}
					mission={mission}
				/>
			))}
			{isOverflowing ? (
				<MissionOverflow count={missions.length - CELLS_BEFORE_OVERFLOW} />
			) : null}
		</div>
	)
}

type EmptyZoneProps = {
	name: string
}

const EmptyZone = ({ name }: EmptyZoneProps) => {
	const { t } = useTranslation("bots")
	const hint = t("roster.section.empty")

	return (
		<RailTip content={<TipLine detail={hint} title={name} />}>
			<span
				aria-label={t("roster.titled", { name, title: hint })}
				className="grid size-11 shrink-0 place-items-center"
				data-slot="collapsed-sidebar-empty-section"
				role="img"
			>
				<span className={EMPTY_TILE} />
			</span>
		</RailTip>
	)
}

const SKELETON_SLOT = (
	<span
		className="grid size-11 place-items-center"
		data-slot="collapsed-sidebar-skeleton"
	>
		<span className={SKELETON_TILE} />
	</span>
)

const LIST_END_SLOTS = (
	<span className="flex flex-col items-center gap-0.5">
		{SKELETON_SLOT}
		{SKELETON_SLOT}
	</span>
)

type RetrySlotProps = {
	onRetry?: () => void
}

const RetrySlot = ({ onRetry }: RetrySlotProps) => {
	const { t } = useTranslation("bots")
	const failure = t("roster.failed")

	return (
		<RailTip
			content={
				<>
					<TipLine title={t("roster.retry")} />
					<span className={TIP_MUTED}>{failure}</span>
				</>
			}
		>
			<button
				aria-description={failure}
				aria-label={t("roster.retry")}
				className={cn(
					SLOT,
					SLOT_ICON,
					"bg-title-bar-highlight text-foreground",
				)}
				data-slot="collapsed-sidebar-retry"
				onClick={onRetry}
				type="button"
			>
				<Icons.Retry aria-hidden="true" />
			</button>
		</RailTip>
	)
}

type CollapsedSidebarListProps = Pick<
	CollapsedSidebarProps,
	| "zones"
	| "listStatus"
	| "listEnd"
	| "openConversationId"
	| "openMissionId"
	| "onOpenConversation"
	| "onRetryList"
>

const CollapsedSidebarList = ({
	zones,
	listStatus,
	listEnd,
	onRetryList,
	...conversations
}: CollapsedSidebarListProps) => {
	if (listStatus === "loading")
		return (
			<div className={LIST} data-slot="collapsed-sidebar-list">
				<ListSkeleton className={SKELETON_LIST} row={SKELETON_SLOT} />
			</div>
		)

	if (listStatus === "failed")
		return (
			<div className={LIST} data-slot="collapsed-sidebar-list">
				<RetrySlot onRetry={onRetryList} />
			</div>
		)

	return (
		<div className={LIST} data-slot="collapsed-sidebar-list">
			{zones.map((zone) =>
				zone.conversations.length > 0 ? (
					<Fragment key={zone.id}>
						<RailSeparator />
						{zone.conversations.map((conversation) => (
							<RailConversation
								conversation={conversation}
								key={conversation.id}
								{...conversations}
							/>
						))}
					</Fragment>
				) : zone.name ? (
					<Fragment key={zone.id}>
						<RailSeparator />
						<EmptyZone name={zone.name} />
					</Fragment>
				) : null,
			)}
			<ListEndSlot listEnd={listEnd} row={LIST_END_SLOTS} />
		</div>
	)
}

type ActiveUpdateStatus = Exclude<UpdateBadgeStatus, "idle">

const UPDATE_GLYPH = {
	available: <Icons.ArrowUp />,
	downloading: <Icons.ArrowUp />,
	ready: <Icons.UpdateRestart />,
	error: <Icons.UpdateRetry />,
} as const satisfies Record<ActiveUpdateStatus, ReactNode>

type UpdateLabelInput = Pick<UpdateBadgeProps, "version"> & {
	status: ActiveUpdateStatus
	activeBotCount: number
}

const updateLabelOf = (
	t: TFunction<"common">,
	{ status, version, activeBotCount }: UpdateLabelInput,
) => {
	if (status !== "ready") return t(`update.badge.${status}`)
	if (activeBotCount > 0)
		return t("update.badge.botsBusy", { count: activeBotCount })
	return version
		? t("update.badge.readyVersion", { version })
		: t("update.badge.ready")
}

const UpdateSlot = ({
	status,
	version,
	progress = 0,
	activeBotCount = 0,
	onDownload,
	onRestart,
}: UpdateBadgeProps) => {
	const { t } = useTranslation("common")

	if (status === "idle") return null

	const isBlocked = status === "ready" && activeBotCount > 0
	const isInert = isBlocked || status === "downloading"
	const label = updateLabelOf(t, { status, version, activeBotCount })
	const onPress = status === "ready" ? onRestart : onDownload

	return (
		<RailTip content={<TipLine title={label} />}>
			<button
				aria-disabled={isInert || undefined}
				aria-label={label}
				className={SLOT}
				data-slot="collapsed-sidebar-update"
				data-status={status}
				onClick={isInert ? undefined : onPress}
				type="button"
			>
				{status === "downloading" ? (
					<ProgressRing
						aria-label={label}
						className={UPDATE_RING}
						value={progress}
					>
						<Icons.ArrowUp aria-hidden="true" className={UPDATE_RING_ARROW} />
					</ProgressRing>
				) : (
					<span
						aria-hidden="true"
						className={cn(
							UPDATE_DISC,
							status === "error" && UPDATE_DISC_FAILED,
							isBlocked && "opacity-50",
						)}
						data-slot="collapsed-sidebar-update-disc"
					>
						{UPDATE_GLYPH[status]}
					</span>
				)}
			</button>
		</RailTip>
	)
}

type PersonSlotProps = Pick<CollapsedSidebarProps, "user" | "onOpenSettings">

const PersonSlot = ({ user, onOpenSettings }: PersonSlotProps) => {
	const name = displayNameOf(user?.name)

	return (
		<RailTip content={<TipLine title={name} />}>
			<button
				aria-label={name}
				className={cn(SLOT, SLOT_HOVER)}
				data-slot="collapsed-sidebar-person"
				onClick={onOpenSettings}
				type="button"
			>
				<AvatarFrame
					image={user?.image}
					shape="round"
					size={26}
					slot="collapsed-sidebar-avatar"
				>
					<span aria-hidden="true" className={PERSON_INITIAL}>
						{initialsOf(name)}
					</span>
				</AvatarFrame>
			</button>
		</RailTip>
	)
}

const CollapsedSidebar = ({
	zones,
	listStatus = "ready",
	listEnd,
	destination,
	openConversationId,
	openMissionId,
	update,
	user,
	onOpenSearch,
	onNewConversation,
	onSelectMissions,
	onSelectLibrary,
	onOpenSettings,
	onOpenConversation,
	onOpenMission: _onOpenMission,
	onRetryList,
	isSpaceSwitchingEnabled = true,
	renderSpaceList,
	...switcher
}: CollapsedSidebarProps) => {
	const { t } = useTranslation(["bots", "search"])

	return (
		<TooltipProvider delay={HOVER_INTENT_DELAY_MS}>
			<nav
				aria-label={t("rail.label")}
				className={RAIL}
				data-slot="collapsed-sidebar"
			>
				<SpaceSlot {...switcher} />
				<Destination
					icon={<Icons.Search aria-hidden="true" />}
					label={t("open", { ns: "search" })}
					onSelect={onOpenSearch}
				/>
				<Destination
					icon={<Icons.Add aria-hidden="true" />}
					isCurrent={destination === "newConversation"}
					label={t("rail.newConversation")}
					onSelect={onNewConversation}
				/>
				<Destination
					hasAttention={hasWaitingMission(zones)}
					icon={<Icons.Missions aria-hidden="true" />}
					isCurrent={destination === "missions"}
					label={t("rail.missions")}
					onSelect={onSelectMissions}
				/>
				<Destination
					icon={<Icons.Library aria-hidden="true" />}
					isCurrent={destination === "library"}
					label={t("rail.library")}
					onSelect={onSelectLibrary}
				/>
				<CurrentSpaceCarousel
					isSwitchingEnabled={isSpaceSwitchingEnabled}
					onSelectSpace={switcher.onSelectSpace}
					renderSpaceList={renderSpaceList}
					selectedSpaceId={switcher.selectedSpaceId}
					spaces={switcher.spaces}
				>
					<CollapsedSidebarList
						listEnd={listEnd}
						listStatus={listStatus}
						onOpenConversation={onOpenConversation}
						onRetryList={onRetryList}
						openConversationId={openConversationId}
						openMissionId={openMissionId}
						zones={zones}
					/>
				</CurrentSpaceCarousel>
				{update ? <UpdateSlot {...update} /> : null}
				<PersonSlot onOpenSettings={onOpenSettings} user={user} />
			</nav>
		</TooltipProvider>
	)
}

export {
	CollapsedSidebar,
	CollapsedSidebarList,
	type CollapsedSidebarListProps,
	type CollapsedSidebarListStatus,
	type CollapsedSidebarProps,
	type CollapsedSidebarZone,
}
