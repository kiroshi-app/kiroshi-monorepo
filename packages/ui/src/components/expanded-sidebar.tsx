"use client"

import { Children, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

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
import { Icons } from "@workspace/ui/components/icons"
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
import { SidebarMenuRow } from "@workspace/ui/components/sidebar-menu-row"
import {
	SpaceDots,
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"
import {
	SidebarContent,
	SidebarMenu,
	SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { useSpaceSwipe } from "@workspace/ui/hooks/use-space-swipe"

const COLUMN =
	"flex min-h-0 w-(--sidebar-width) shrink-0 flex-col gap-2 px-2 pt-2 pb-1"

const SECTIONS = "gap-3"

const CONVERSATIONS_BODY = "flex flex-col gap-0.5"

const LIST_EMPTY = "p-3 text-start text-compact text-faint-foreground leading-5"

const LIST_FAILED =
	"flex flex-col items-start gap-2 p-3 text-start text-compact text-muted-foreground leading-5"

const LIST_RETRY =
	"h-auto rounded-sm border-input bg-transparent p-1.5 font-medium text-foreground text-xs leading-4 transition-none"

const MISSION_COUNT =
	"grid size-5 shrink-0 place-items-center font-normal text-muted-foreground text-xs tabular-nums"

const FOOTER =
	"flex h-9 w-full shrink-0 items-center gap-2 rounded-control ps-1.25 pe-2.25 text-start text-muted-foreground hover:bg-rail-item-selected/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:stroke-[1.75]"

const FOOTER_AVATAR =
	"grid size-full place-items-center bg-rail-avatar font-medium text-foreground text-xs/4 uppercase"

const FOOTER_NAME =
	"min-w-0 flex-1 truncate text-sidebar-person-foreground text-sm"

const SWITCHER_ROW = "flex h-9 shrink-0 items-center gap-1"

const SEARCH_BUTTON =
	"grid size-7 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-rail-item-selected/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 [&_svg]:size-4.5 [&_svg]:stroke-[1.75]"

type ExpandedSidebarDestination = "newConversation" | "missions" | "library"

type ExpandedSidebarSection = SectionHeadActions & {
	id: string
	name: string
	rows: ReactNode
	dropArea: Omit<RosterDropAreaProps, "children">
	headSlotId?: string
	emptySlotId?: string
}

type ExpandedSidebarProps = SpaceSwitcherProps & {
	destination?: ExpandedSidebarDestination
	missionCount?: number
	pinned: ReactNode
	conversations: ReactNode
	sections?: ExpandedSidebarSection[]
	listStatus?: CollapsedSidebarListStatus
	listEnd?: ListEnd
	update?: ReactNode
	user?: UserChipIdentity
	isSpaceSwitchingEnabled?: boolean
	onReorderSpaces?: (ids: string[]) => void
	onOpenSearch?: () => void
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
	onOpenSettings?: () => void
}

const PersonFooter = ({ user, onOpenSettings }: PersonFooterProps) => {
	const { t } = useTranslation("bots")
	const name = displayNameOf(user?.name)

	return (
		<button
			aria-label={t("rail.personSettings", { name })}
			className={FOOTER}
			data-slot="expanded-sidebar-footer"
			onClick={onOpenSettings}
			type="button"
		>
			<AvatarFrame
				image={user?.image}
				shape="round"
				size={26}
				slot="expanded-sidebar-avatar"
			>
				<span aria-hidden="true" className={FOOTER_AVATAR}>
					{initialsOf(name)}
				</span>
			</AvatarFrame>
			<span className={FOOTER_NAME}>{name}</span>
			<Icons.Settings aria-hidden="true" />
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

const ExpandedSidebarList = ({
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
				<FoldSection name={t("rail.pinned")}>{pinned}</FoldSection>
			) : null}
			{sections.map(
				(
					{ id, name, rows, dropArea, headSlotId, emptySlotId, ...head },
					rank,
				) => (
					<RosterDropArea key={id} {...dropArea}>
						<NamedFoldSection
							{...head}
							isFirst={rank === 0}
							isLast={rank === sections.length - 1}
							section={{ id, name }}
							slotId={headSlotId}
						>
							{holdsRows(rows) ? (
								rows
							) : (
								<SectionDropZone align="start" slotId={emptySlotId} />
							)}
						</NamedFoldSection>
					</RosterDropArea>
				),
			)}
			{hasConversations ? (
				<FoldSection name={t("rail.conversations")}>
					<div className={CONVERSATIONS_BODY}>
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

const ExpandedSidebar = ({
	destination,
	missionCount,
	pinned,
	conversations,
	sections,
	listStatus,
	listEnd,
	update,
	user,
	isSpaceSwitchingEnabled,
	onReorderSpaces,
	onOpenSearch,
	onNewConversation,
	onSelectMissions,
	onSelectLibrary,
	onOpenSettings,
	onRetryList,
	...switcher
}: ExpandedSidebarProps) => {
	const { t } = useTranslation(["bots", "search"])
	const searchLabel = t("open", { ns: "search" })
	const swipeRef = useSpaceSwipe({
		isEnabled: isSpaceSwitchingEnabled,
		onSelectSpace: switcher.onSelectSpace,
		selectedSpaceId: switcher.selectedSpaceId,
		spaces: switcher.spaces,
	})

	return (
		<nav
			aria-label={t("rail.label")}
			className={COLUMN}
			data-slot="expanded-sidebar"
			ref={swipeRef}
		>
			<div className={SWITCHER_ROW} data-slot="expanded-sidebar-switcher-row">
				<SpaceSwitcher {...switcher} />
				<TooltipHint content={searchLabel} side="bottom">
					<button
						aria-label={searchLabel}
						className={SEARCH_BUTTON}
						data-slot="expanded-sidebar-search"
						onClick={onOpenSearch}
						type="button"
					>
						<Icons.Search aria-hidden="true" />
					</button>
				</TooltipHint>
			</div>
			<SidebarMenu>
				<NavigationItem
					icon={<Icons.Add />}
					isCurrent={destination === "newConversation"}
					label={t("rail.newConversation")}
					onSelect={onNewConversation}
				/>
				<NavigationItem
					icon={<Icons.Missions />}
					isCurrent={destination === "missions"}
					label={t("rail.missions")}
					onSelect={onSelectMissions}
					trailing={
						missionCount === undefined ? null : (
							<span className={MISSION_COUNT}>{missionCount}</span>
						)
					}
				/>
				<NavigationItem
					icon={<Icons.Library />}
					isCurrent={destination === "library"}
					label={t("rail.library")}
					onSelect={onSelectLibrary}
				/>
			</SidebarMenu>
			<SidebarContent className={SECTIONS}>
				<ExpandedSidebarList
					conversations={conversations}
					listEnd={listEnd}
					listStatus={listStatus}
					onRetryList={onRetryList}
					pinned={pinned}
					sections={sections}
				/>
			</SidebarContent>
			<SpaceDots
				badgesBySpaceId={switcher.badgesBySpaceId}
				onReorderSpaces={onReorderSpaces}
				onSelectSpace={switcher.onSelectSpace}
				selectedSpaceId={switcher.selectedSpaceId}
				spaces={switcher.spaces}
			/>
			{update}
			<PersonFooter onOpenSettings={onOpenSettings} user={user} />
		</nav>
	)
}

export {
	ExpandedSidebar,
	type ExpandedSidebarDestination,
	type ExpandedSidebarProps,
	type ExpandedSidebarSection,
}
