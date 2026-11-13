import {
	Fragment,
	type HTMLAttributes,
	type ReactElement,
	type ReactNode,
	type Ref,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { HeaderIslandCell } from "@workspace/ui/components/header-island"
import {
	type ConversationIconName,
	ConversationIcons,
	Icons,
} from "@workspace/ui/components/icons"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import type {
	MissionPullRequest,
	MissionState,
} from "@workspace/ui/components/mission"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { Notice } from "@workspace/ui/components/notice"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { toElapsedTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

type MissionsPageGroupKey =
	| "blockedOnYou"
	| "readyToMerge"
	| "working"
	| "waitingOnAgent"
	| "completed"
	| "blocked"

type MissionsPageGroupShape = {
	key: MissionsPageGroupKey
	states: MissionState[]
	mark?: BotMissionState
}

const MISSIONS_PAGE_GROUPS: MissionsPageGroupShape[] = [
	{ key: "blockedOnYou", states: ["waiting_human"], mark: "waiting" },
	{ key: "readyToMerge", states: ["ready_to_merge"], mark: "ready" },
	{ key: "working", states: ["working"], mark: "working" },
	{ key: "waitingOnAgent", states: ["waiting_bot"], mark: "waiting_agent" },
	{ key: "completed", states: ["done", "closed"] },
	{ key: "blocked", states: ["failed"], mark: "failed" },
]

const EMPHASISED_GROUP: MissionsPageGroupKey = "blockedOnYou"

const MISSIONS_PAGE_FRAMES = {
	row: "flex w-full min-w-0 items-center gap-2.5 border-mission-list-divider border-b p-3",
	groupHeader:
		"flex w-full min-w-0 items-center gap-2 bg-mission-list-group p-3",
	chip: "inline-flex h-5.5 shrink-0 items-center",
	glyph: "flex size-4 shrink-0 items-center justify-center",
}

const LINE = "text-compact leading-4"
const SMALL_LINE = "text-xs leading-4"
const FOCUS_RING =
	"outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:-outline-offset-2"
const PRESSABLE = "hover:bg-mission-list-hover active:bg-title-bar-highlight"

type MissionsPageAgent = {
	id: string
	name: string
	hue?: number | null
	image?: string
}

type MissionsPageConversation = {
	title: string
	icon: ConversationIconName
}

type MissionsPageMission = {
	id: string
	identifier: string
	title: string
	state: MissionState
	conversation: MissionsPageConversation
	agent: MissionsPageAgent
	updatedAt: number
	pullRequest?: MissionPullRequest
}

type MissionsPageStatus = "loaded" | "loading" | "failed"

type MissionsPageProps = {
	missions: MissionsPageMission[]
	now: number
	onOpen: (missionId: string) => void
	onRetry: () => void
	status?: MissionsPageStatus
	defaultFoldedGroups?: MissionsPageGroupKey[]
	wrap?: MissionsPageRowWrap
}

type MissionGlyphProps = Pick<MissionsPageGroupShape, "mark">

const MissionGlyph = ({ mark }: MissionGlyphProps) => (
	<span
		aria-hidden="true"
		className={cn("pointer-events-none", MISSIONS_PAGE_FRAMES.glyph)}
		data-slot="missions-page-glyph"
		data-state={mark ?? "done"}
	>
		{mark ? (
			<MissionStateMark size={14} state={mark} />
		) : (
			<svg
				aria-hidden="true"
				className="size-3.5 text-mission-glyph-success"
				fill="none"
				viewBox="0 0 14 14"
			>
				<circle cx="7" cy="7" fill="currentColor" r="7" />
				<path
					className="stroke-card"
					d="M4.25 7.25 6.1 9.1 9.75 5.25"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="1.5"
				/>
			</svg>
		)}
	</span>
)

type MissionChipProps = {
	slot: string
	mark: ReactNode
	label: string
	className?: string
}

const MissionChip = ({ slot, mark, label, className }: MissionChipProps) => (
	<span
		className={cn(
			MISSIONS_PAGE_FRAMES.chip,
			"gap-1.5 rounded-full border border-title-bar-chip px-2 text-mission-chip-foreground",
			SMALL_LINE,
			className,
		)}
		data-slot={slot}
	>
		{mark}
		<span className="truncate whitespace-nowrap">{label}</span>
	</span>
)

const CHIP_ICON = "size-3 shrink-0 text-muted-foreground"

type MissionsPageRowSurface = HTMLAttributes<HTMLButtonElement> & {
	ref?: Ref<HTMLButtonElement>
}

type MissionsPageRowProps = {
	mission: MissionsPageMission
	group: MissionsPageGroupShape
	now: number
	onOpen: (missionId: string) => void
	surface?: MissionsPageRowSurface
}

type MissionsPageRowWrap = (
	row: ReactElement<MissionsPageRowProps>,
) => ReactNode

const MissionsPageRow = ({
	mission,
	group,
	now,
	onOpen,
	surface,
}: MissionsPageRowProps) => {
	const ConversationIcon = ConversationIcons[mission.conversation.icon]

	return (
		<li className="flex">
			<button
				{...surface}
				className={cn(
					MISSIONS_PAGE_FRAMES.row,
					"text-start",
					FOCUS_RING,
					PRESSABLE,
				)}
				data-slot="missions-page-row"
				onClick={() => onOpen(mission.id)}
				onContextMenu={(event) => {
					event.currentTarget.focus()
					surface?.onContextMenu?.(event)
				}}
				type="button"
			>
				<span
					className={cn(
						"w-16 shrink-0 truncate text-mission-list-faint-foreground tabular-nums",
						LINE,
					)}
					data-slot="missions-page-row-identifier"
				>
					{mission.identifier}
				</span>
				<MissionGlyph mark={group.mark} />
				<span
					className={cn(
						"min-w-24 flex-1 truncate text-bubble-foreground",
						LINE,
						group.key === EMPHASISED_GROUP && "font-medium",
					)}
					data-slot="missions-page-row-title"
				>
					{mission.title}
				</span>
				<MissionChip
					className="min-w-9 max-w-48 shrink"
					label={mission.conversation.title}
					mark={<ConversationIcon aria-hidden="true" className={CHIP_ICON} />}
					slot="missions-page-conversation-chip"
				/>
				{mission.pullRequest ? (
					<MissionChip
						label={`#${mission.pullRequest.number}`}
						mark={
							<Icons.PullRequest aria-hidden="true" className={CHIP_ICON} />
						}
						slot="missions-page-pull-request-chip"
					/>
				) : null}
				<MissionChip
					className="ps-1.5"
					label={mission.agent.name}
					mark={
						<BotIdentityAvatar
							hue={mission.agent.hue}
							image={mission.agent.image}
							name={mission.agent.name}
							seed={mission.agent.id}
							size={12}
						/>
					}
					slot="missions-page-agent-chip"
				/>
				<time
					className={cn(
						"w-11 shrink-0 text-end text-mission-list-faint-foreground tabular-nums",
						SMALL_LINE,
					)}
					data-slot="missions-page-row-time"
					dateTime={new Date(mission.updatedAt).toISOString()}
				>
					{toElapsedTime(mission.updatedAt, now)}
				</time>
			</button>
		</li>
	)
}

type MissionsPageAgentGroup = {
	agent: MissionsPageAgent
	missions: MissionsPageMission[]
}

const byAgent = (missions: MissionsPageMission[]) =>
	missions.reduce<MissionsPageAgentGroup[]>((groups, mission) => {
		const held = groups.find(({ agent }) => agent.id === mission.agent.id)
		if (held) {
			held.missions.push(mission)
			return groups
		}
		return [...groups, { agent: mission.agent, missions: [mission] }]
	}, [])

type MissionsPageRowsProps = Omit<
	MissionsPageRowProps,
	"mission" | "surface"
> & {
	missions: MissionsPageMission[]
	wrap?: MissionsPageRowWrap
}

const MissionsPageRows = ({
	missions,
	wrap,
	...rowProps
}: MissionsPageRowsProps) => (
	<ul className="flex flex-col">
		{missions.map((mission) => {
			const row = <MissionsPageRow mission={mission} {...rowProps} />
			return <Fragment key={mission.id}>{wrap ? wrap(row) : row}</Fragment>
		})}
	</ul>
)

const MissionsPageAgentHeading = ({
	agent,
	missions,
}: MissionsPageAgentGroup) => (
	<h3
		className="flex items-center gap-2 px-3 pt-2 pb-1"
		data-slot="missions-page-agent"
	>
		<BotIdentityAvatar
			hue={agent.hue}
			image={agent.image}
			name={agent.name}
			seed={agent.id}
			size={12}
		/>
		<span className={cn("font-medium text-muted-foreground", SMALL_LINE)}>
			{agent.name}
		</span>
		<span
			className={cn(
				"text-mission-list-faint-foreground tabular-nums",
				SMALL_LINE,
			)}
		>
			{missions.length}
		</span>
		<span
			aria-hidden="true"
			className="pointer-events-none h-px min-w-0 flex-1 bg-shell-divider"
		/>
	</h3>
)

type MissionsPageGroupProps = Omit<MissionsPageRowsProps, "group"> & {
	group: MissionsPageGroupShape
	isFolded: boolean
	onToggle: () => void
}

const MissionsPageGroup = ({
	group,
	isFolded,
	onToggle,
	missions,
	...rowProps
}: MissionsPageGroupProps) => {
	const { t } = useTranslation("chat")
	const rowsId = useId()
	const agentGroups = byAgent(missions)

	return (
		<section data-group={group.key} data-slot="missions-page-group">
			<h2 className="flex">
				<button
					aria-controls={rowsId}
					aria-expanded={!isFolded}
					className={cn(
						MISSIONS_PAGE_FRAMES.groupHeader,
						"text-start",
						FOCUS_RING,
						PRESSABLE,
					)}
					data-slot="missions-page-group-header"
					onClick={onToggle}
					type="button"
				>
					<MissionGlyph mark={group.mark} />
					<span
						className={cn(
							"min-w-0 truncate font-medium text-bubble-foreground",
							LINE,
						)}
					>
						{t(`missions.page.group.${group.key}`)}
					</span>
					<span
						className={cn(
							"text-mission-list-faint-foreground tabular-nums",
							LINE,
						)}
						data-slot="missions-page-group-count"
					>
						{missions.length}
					</span>
				</button>
			</h2>
			{isFolded ? null : (
				<div id={rowsId}>
					{agentGroups.length > 1 ? (
						agentGroups.map((agentGroup) => (
							<div
								data-slot="missions-page-agent-group"
								key={agentGroup.agent.id}
							>
								<MissionsPageAgentHeading {...agentGroup} />
								<MissionsPageRows
									{...rowProps}
									group={group}
									missions={agentGroup.missions}
								/>
							</div>
						))
					) : (
						<MissionsPageRows {...rowProps} group={group} missions={missions} />
					)}
				</div>
			)}
		</section>
	)
}

const SKELETON_ROW_TITLES = ["w-56", "w-72", "w-44"]

const SkeletonGlyph = () => (
	<span className={MISSIONS_PAGE_FRAMES.glyph}>
		<SkeletonBar className="size-3.5" />
	</span>
)

const MissionsPageSkeletonGroup = () => (
	<div className="flex flex-col">
		<div
			className={MISSIONS_PAGE_FRAMES.groupHeader}
			data-slot="missions-page-skeleton-group-header"
		>
			<SkeletonGlyph />
			<SkeletonBar className="h-2.25 w-24" />
		</div>
		{SKELETON_ROW_TITLES.map((titleWidth) => (
			<div
				className={MISSIONS_PAGE_FRAMES.row}
				data-slot="missions-page-skeleton-row"
				key={titleWidth}
			>
				<span className="w-16 shrink-0">
					<SkeletonBar className="h-2.25 w-14" />
				</span>
				<SkeletonGlyph />
				<span className="min-w-0 flex-1">
					<SkeletonBar className={cn("h-2.25 max-w-full", titleWidth)} />
				</span>
				<span className={cn(MISSIONS_PAGE_FRAMES.chip, "w-28")}>
					<SkeletonBar className="size-full" isFaint />
				</span>
				<span className={cn(MISSIONS_PAGE_FRAMES.chip, "w-16")}>
					<SkeletonBar className="size-full" isFaint />
				</span>
				<span className="flex w-11 shrink-0 justify-end">
					<SkeletonBar className="h-2.25 w-6" />
				</span>
			</div>
		))}
	</div>
)

const MissionsEmpty = () => {
	const { t } = useTranslation("chat")

	return (
		<EmptyStateShell
			data-slot="missions-panel-empty"
			description={t("missions.panel.empty.description")}
			mark={
				<Icons.Missions
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
			}
			title={t("missions.panel.empty.title")}
		/>
	)
}

const MissionsPageBody = ({
	missions,
	now,
	onOpen,
	onRetry,
	status = "loaded",
	defaultFoldedGroups = [],
	wrap,
}: MissionsPageProps) => {
	const { t } = useTranslation("chat")
	const [foldedGroups, setFoldedGroups] = useState(
		() => new Set(defaultFoldedGroups),
	)

	if (status === "loading") {
		return (
			<div className="min-h-0 flex-1 pt-14" data-slot="missions-page-skeleton">
				<ListSkeleton className="gap-0" row={MissionsPageSkeletonGroup} />
			</div>
		)
	}

	if (status === "failed") {
		return (
			<div className="p-3 pt-17" data-slot="missions-page-failure">
				<Notice
					description={t("activity.failure.missions.description")}
					retry={{ onRetry }}
					title={t("activity.failure.missions.title")}
				/>
			</div>
		)
	}

	if (missions.length === 0)
		return (
			<div className="pt-14" data-slot="missions-page-empty">
				<MissionsEmpty />
			</div>
		)

	const toggle = (key: MissionsPageGroupKey) =>
		setFoldedGroups((folded) => {
			const next = new Set(folded)
			if (!next.delete(key)) next.add(key)
			return next
		})

	return (
		<div
			className="min-h-0 flex-1 overflow-y-auto pt-14"
			data-slot="missions-page-groups"
		>
			{MISSIONS_PAGE_GROUPS.map((group) => {
				const held = missions.filter(({ state }) =>
					group.states.includes(state),
				)
				if (held.length === 0) return null

				return (
					<MissionsPageGroup
						group={group}
						isFolded={foldedGroups.has(group.key)}
						key={group.key}
						missions={held}
						now={now}
						onOpen={onOpen}
						onToggle={() => toggle(group.key)}
						wrap={wrap}
					/>
				)
			})}
		</div>
	)
}

const MissionsPage = (props: MissionsPageProps) => {
	const { t } = useTranslation("chat")
	const titleId = useId()

	return (
		<section
			aria-labelledby={titleId}
			className="size-full min-h-0 min-w-0 overflow-hidden"
			data-slot="missions-page"
		>
			<ScreenLayout
				header={
					<AppHeader
						isFloating
						leading={
							<HeaderIslandCell>
								<h1 className="truncate font-medium leading-4" id={titleId}>
									{t("missions.page.title")}
								</h1>
							</HeaderIslandCell>
						}
					/>
				}
				isHeaderFloating
				scroller={() => <MissionsPageBody {...props} />}
			/>
		</section>
	)
}

export {
	MISSIONS_PAGE_FRAMES,
	MissionsEmpty,
	MissionsPage,
	type MissionsPageAgent,
	type MissionsPageConversation,
	type MissionsPageGroupKey,
	type MissionsPageMission,
	type MissionsPageProps,
	type MissionsPageRowWrap,
	type MissionsPageStatus,
}
