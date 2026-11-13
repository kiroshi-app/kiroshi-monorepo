"use client"

import { Children, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CurrentSpaceCarousel } from "@workspace/ui/components/app-sidebar-carousel"
import {
	RosterDropArea,
	type RosterDropAreaProps,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	FoldSection,
	NamedFoldSection,
	type SectionHeadActions,
} from "@workspace/ui/components/app-sidebar-section"
import type { CollapsedSidebarListStatus } from "@workspace/ui/components/collapsed-sidebar"
import {
	COMPACT_ROW_GAP,
	COMPACT_ROW_STACK,
	CompactRowsContext,
} from "@workspace/ui/components/compact-rows"
import { FillIcons, type Icon, Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import {
	type ListEnd,
	ListEndSlot,
} from "@workspace/ui/components/list-skeleton"
import {
	SIDEBAR_LIST_END_ROWS,
	SidebarListSkeleton,
} from "@workspace/ui/components/sidebar-list-skeleton"
import {
	SIDEBAR_AVATAR_SIDE,
	SIDEBAR_COLUMN,
	SidebarMenuRow,
} from "@workspace/ui/components/sidebar-menu-row"
import type { Space } from "@workspace/ui/components/space"
import {
	SpaceDots,
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"
import { Button } from "@workspace/ui/components/ui/button"
import {
	SidebarContent,
	SidebarMenu,
	SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { cn } from "@workspace/ui/lib/utils"

const BLOCK_GAP = "gap-6"

const COLUMN = cn(SIDEBAR_COLUMN, "w-(--sidebar-width) p-3", BLOCK_GAP)

const SECTIONS = BLOCK_GAP

const LIST_EMPTY = "p-3 text-start text-compact text-faint-foreground leading-5"

const LIST_FAILED =
	"flex flex-col items-start gap-2 p-3 text-start text-compact text-muted-foreground leading-5"

const LIST_RETRY =
	"h-auto rounded-sm border-input bg-transparent p-1.5 font-medium text-compact text-foreground leading-4.5 transition-none"

const MISSION_COUNT =
	"w-16 shrink-0 text-end text-[11px] text-muted-foreground leading-4 tabular-nums"

const FOOTER_BLOCK = cn(COMPACT_ROW_STACK, "shrink-0")

const FOOTER =
	"group/person flex w-full shrink-0 items-center gap-2.5 rounded-sm p-2 text-start text-muted-foreground hover:bg-mission-list-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 aria-[current]:bg-sidebar-accent aria-[current]:hover:bg-sidebar-accent"

const FOOTER_GLYPH =
	"grid size-4.5 shrink-0 place-items-center [&>svg]:size-full [&>svg]:stroke-[1.75]"

const FOOTER_AVATAR =
	"grid size-full place-items-center bg-sidebar-accent font-medium text-[11px] text-foreground uppercase leading-none group-aria-[current]/person:bg-background"

const FOOTER_NAME =
	"min-w-0 flex-1 truncate text-sidebar-person-foreground text-sm leading-4.5 group-aria-[current]/person:text-foreground"

const SWITCHER_ROW = "flex shrink-0 items-center gap-1"

type ExpandedSidebarDestination = "newConversation" | "missions" | "library"

type DestinationHandlers = Pick<
	ExpandedSidebarProps,
	"onNewConversation" | "onSelectMissions" | "onSelectLibrary"
>

type NavigationDestination = {
	id: ExpandedSidebarDestination
	label: "rail.newConversation" | "rail.missions" | "rail.library"
	Icon: Icon
	FilledIcon: Icon
	onSelect?: () => void
}

const navigationDestinationsOf = ({
	onNewConversation,
	onSelectMissions,
	onSelectLibrary,
}: DestinationHandlers): NavigationDestination[] => [
	{
		id: "newConversation",
		label: "rail.newConversation",
		Icon: Icons.Add,
		FilledIcon: FillIcons.Add,
		onSelect: onNewConversation,
	},
	{
		id: "missions",
		label: "rail.missions",
		Icon: Icons.Missions,
		FilledIcon: FillIcons.Missions,
		onSelect: onSelectMissions,
	},
	{
		id: "library",
		label: "rail.library",
		Icon: Icons.Library,
		FilledIcon: FillIcons.Library,
		onSelect: onSelectLibrary,
	},
]

type ExpandedSidebarSection = SectionHeadActions & {
	id: string
	name: string
	rows: ReactNode
	dropArea: Omit<RosterDropAreaProps, "children">
	headSlotId?: string
}

type ExpandedSidebarProps = SpaceSwitcherProps & {
	destination?: ExpandedSidebarDestination
	isSettingsShown?: boolean
	missionCount?: number
	pinned: ReactNode
	conversations: ReactNode
	sections?: ExpandedSidebarSection[]
	listStatus?: CollapsedSidebarListStatus
	listEnd?: ListEnd
	update?: ReactNode
	user?: UserChipIdentity
	isSpaceSwitchingEnabled?: boolean
	renderSpaceList?: (space: Space) => ReactNode
	onReorderSpaces?: (ids: string[]) => void
	onNewConversation?: () => void
	onSelectMissions?: () => void
	onSelectLibrary?: () => void
	onOpenSettings?: () => void
	onRetryList?: () => void
}

type NavigationItemProps = {
	label: string
	icon: ReactNode
	isCurrent?: boolean
	trailing?: ReactNode
	onSelect?: () => void
}

const NavigationItem = ({
	label,
	icon,
	isCurrent = false,
	trailing,
	onSelect,
}: NavigationItemProps) => (
	<SidebarMenuItem>
		<SidebarMenuRow
			icon={icon}
			isActive={isCurrent}
			label={label}
			onSelect={onSelect}
			trailing={trailing}
			variant="navigation"
		>
			{label}
		</SidebarMenuRow>
	</SidebarMenuItem>
)

type PersonFooterProps = {
	user?: UserChipIdentity
	isCurrent?: boolean
	onOpenSettings?: () => void
}

const PersonFooter = ({
	user,
	isCurrent = false,
	onOpenSettings,
}: PersonFooterProps) => {
	const { t } = useTranslation("bots")
	const name = displayNameOf(user?.name)
	const SettingsIcon = (isCurrent ? FillIcons : Icons).Settings

	return (
		<button
			aria-current={isCurrent ? "page" : undefined}
			aria-label={t("rail.personSettings", { name })}
			className={FOOTER}
			data-slot="expanded-sidebar-footer"
			onClick={onOpenSettings}
			type="button"
		>
			<AvatarFrame
				image={user?.image}
				shape="round"
				size={SIDEBAR_AVATAR_SIDE}
				slot="expanded-sidebar-avatar"
			>
				<span aria-hidden="true" className={FOOTER_AVATAR}>
					{initialsOf(name)}
				</span>
			</AvatarFrame>
			<span className={FOOTER_NAME}>{name}</span>
			<span aria-hidden="true" className={FOOTER_GLYPH}>
				<SettingsIcon />
			</span>
		</button>
	)
}

type ExpandedSidebarListProps = Pick<
	ExpandedSidebarProps,
	| "pinned"
	| "conversations"
	| "sections"
	| "listStatus"
	| "listEnd"
	| "onRetryList"
>

const holdsRows = (rows: ReactNode) => Children.toArray(rows).length > 0

const ExpandedSidebarListBody = ({
	pinned,
	conversations,
	sections = [],
	listStatus = "ready",
	listEnd,
	onRetryList,
}: ExpandedSidebarListProps) => {
	const { t } = useTranslation("bots")

	if (listStatus === "loading") return <SidebarListSkeleton />

	if (listStatus === "failed")
		return (
			<div className={LIST_FAILED}>
				<p>{t("roster.failed")}</p>
				<Button
					className={LIST_RETRY}
					onClick={onRetryList}
					size="xs"
					variant="outline"
				>
					{t("roster.retry")}
				</Button>
			</div>
		)

	const hasPinned = holdsRows(pinned)
	const hasConversations = holdsRows(conversations)

	if (
		!hasPinned &&
		!hasConversations &&
		!sections.some(({ rows }) => holdsRows(rows))
	)
		return <p className={LIST_EMPTY}>{t("roster.empty")}</p>

	const listEndSlot = (
		<ListEndSlot listEnd={listEnd} row={SIDEBAR_LIST_END_ROWS} />
	)

	return (
		<>
			{hasPinned ? (
				<FoldSection name={t("roster.pinned")}>{pinned}</FoldSection>
			) : null}
			{sections.map(
				({ id, name, rows, dropArea, headSlotId, ...head }, rank) => (
					<RosterDropArea key={id} {...dropArea}>
						<NamedFoldSection
							{...head}
							isFirst={rank === 0}
							isLast={rank === sections.length - 1}
							section={{ id, name }}
							slotId={headSlotId}
						>
							{holdsRows(rows) ? rows : <SectionDropZone align="start" />}
						</NamedFoldSection>
					</RosterDropArea>
				),
			)}
			{hasConversations ? (
				<FoldSection name={t("rail.conversations")}>
					<div className={COMPACT_ROW_STACK}>
						{conversations}
						{listEndSlot}
					</div>
				</FoldSection>
			) : (
				listEndSlot
			)}
		</>
	)
}

const ExpandedSidebarList = (props: ExpandedSidebarListProps) => (
	<CompactRowsContext.Provider value>
		<SidebarContent className={SECTIONS}>
			<ExpandedSidebarListBody {...props} />
		</SidebarContent>
	</CompactRowsContext.Provider>
)

const ExpandedSidebar = ({
	destination,
	isSettingsShown,
	missionCount,
	pinned,
	conversations,
	sections,
	listStatus,
	listEnd,
	update,
	user,
	isSpaceSwitchingEnabled = true,
	renderSpaceList,
	onReorderSpaces,
	onNewConversation,
	onSelectMissions,
	onSelectLibrary,
	onOpenSettings,
	onRetryList,
	...switcher
}: ExpandedSidebarProps) => {
	const { t } = useTranslation("bots")

	return (
		<nav
			aria-label={t("rail.label")}
			className={COLUMN}
			data-slot="expanded-sidebar"
		>
			<div className={SWITCHER_ROW} data-slot="expanded-sidebar-switcher-row">
				<SpaceSwitcher {...switcher} />
			</div>
			<SidebarMenu className={COMPACT_ROW_GAP}>
				{navigationDestinationsOf({
					onNewConversation,
					onSelectMissions,
					onSelectLibrary,
				}).map(({ id, label, Icon, FilledIcon, onSelect }) => (
					<NavigationItem
						icon={destination === id ? <FilledIcon /> : <Icon />}
						isCurrent={destination === id}
						key={id}
						label={t(label)}
						onSelect={onSelect}
						trailing={
							id === "missions" && missionCount !== undefined ? (
								<span className={MISSION_COUNT}>{missionCount}</span>
							) : null
						}
					/>
				))}
			</SidebarMenu>
			<CurrentSpaceCarousel
				isSwitchingEnabled={isSpaceSwitchingEnabled}
				onSelectSpace={switcher.onSelectSpace}
				renderSpaceList={renderSpaceList}
				selectedSpaceId={switcher.selectedSpaceId}
				spaces={switcher.spaces}
			>
				<ExpandedSidebarList
					conversations={conversations}
					listEnd={listEnd}
					listStatus={listStatus}
					onRetryList={onRetryList}
					pinned={pinned}
					sections={sections}
				/>
			</CurrentSpaceCarousel>
			<div className={FOOTER_BLOCK} data-slot="expanded-sidebar-footer-block">
				<SpaceDots
					badgesBySpaceId={switcher.badgesBySpaceId}
					onReorderSpaces={onReorderSpaces}
					onSelectSpace={switcher.onSelectSpace}
					selectedSpaceId={switcher.selectedSpaceId}
					spaces={switcher.spaces}
				/>
				{update}
				<PersonFooter
					isCurrent={isSettingsShown}
					onOpenSettings={onOpenSettings}
					user={user}
				/>
			</div>
		</nav>
	)
}

export {
	ExpandedSidebar,
	type ExpandedSidebarDestination,
	ExpandedSidebarList,
	type ExpandedSidebarListProps,
	type ExpandedSidebarProps,
	type ExpandedSidebarSection,
	navigationDestinationsOf,
}
