"use client"

import { Children, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { SectionDropZone } from "@workspace/ui/components/app-sidebar-roster-parts"
import { FoldSection } from "@workspace/ui/components/app-sidebar-section"
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
import { Button } from "@workspace/ui/components/ui/button"
import {
	SidebarContent,
	SidebarMenu,
	SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"

const COLUMN = "flex min-h-0 w-72 shrink-0 flex-col gap-2 px-2 pt-2 pb-1"

const SECTIONS = "gap-3"

const CONVERSATIONS_BODY = "flex flex-col gap-0.5"

const LIST_EMPTY = "p-3 text-start text-compact text-faint-foreground leading-5"

const LIST_FAILED =
	"flex flex-col items-start gap-2 p-3 text-start text-compact text-muted-foreground leading-5"

const LIST_RETRY =
	"h-auto rounded-sm border-input bg-transparent p-1.5 font-medium text-foreground text-xs leading-4"

const MISSION_COUNT =
	"grid size-5 shrink-0 place-items-center font-normal text-muted-foreground text-xs tabular-nums"

const FOOTER = "flex h-9 shrink-0 items-center gap-2 px-1.5"

const FOOTER_AVATAR =
	"grid size-full place-items-center bg-rail-avatar font-medium text-foreground text-xs/4 uppercase"

const FOOTER_NAME =
	"min-w-0 flex-1 truncate text-sidebar-person-foreground text-sm"

const FOOTER_SETTINGS =
	"grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 [&_svg]:size-4.5 [&_svg]:stroke-[1.75]"

type ExpandedSidebarDestination = "newConversation" | "missions" | "library"

type ExpandedSidebarSection = {
	id: string
	name: string
	rows: ReactNode
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
		<div className={FOOTER} data-slot="expanded-sidebar-footer">
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
			<button
				aria-label={t("rail.settings")}
				className={FOOTER_SETTINGS}
				onClick={onOpenSettings}
				type="button"
			>
				<Icons.Settings aria-hidden="true" />
			</button>
		</div>
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
				<FoldSection name={t("rail.pinned")}>
					<SidebarMenu>{pinned}</SidebarMenu>
				</FoldSection>
			) : null}
			{sections.map(({ id, name, rows }) => (
				<FoldSection key={id} name={name}>
					{holdsRows(rows) ? (
						<SidebarMenu>{rows}</SidebarMenu>
					) : (
						<SectionDropZone align="start" />
					)}
				</FoldSection>
			))}
			{hasConversations ? (
				<FoldSection name={t("rail.conversations")}>
					<div className={CONVERSATIONS_BODY}>
						<SidebarMenu>{conversations}</SidebarMenu>
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

	return (
		<nav
			aria-label={t("rail.label")}
			className={COLUMN}
			data-slot="expanded-sidebar"
		>
			<SpaceSwitcher {...switcher} />
			<SidebarMenu>
				<NavigationItem
					icon={<Icons.Search />}
					label={t("open", { ns: "search" })}
					onSelect={onOpenSearch}
				/>
				<NavigationItem
					icon={<Icons.Write />}
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
}
