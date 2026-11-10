"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { FoldSection } from "@workspace/ui/components/app-sidebar-section"
import { Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import { SidebarMenuRow } from "@workspace/ui/components/sidebar-menu-row"
import {
	SpaceDots,
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"
import {
	SidebarContent,
	SidebarMenu,
	SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"

const COLUMN = "flex min-h-0 w-72 shrink-0 flex-col gap-2 px-2 pt-2 pb-1"

const SECTIONS = "gap-3"

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

type ExpandedSidebarProps = SpaceSwitcherProps & {
	destination?: ExpandedSidebarDestination
	missionCount?: number
	pinned: ReactNode
	conversations: ReactNode
	update?: ReactNode
	user?: UserChipIdentity
	onReorderSpaces?: (ids: string[]) => void
	onOpenSearch?: () => void
	onNewConversation?: () => void
	onSelectMissions?: () => void
	onSelectLibrary?: () => void
	onOpenSettings?: () => void
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

const ExpandedSidebar = ({
	destination,
	missionCount,
	pinned,
	conversations,
	update,
	user,
	onReorderSpaces,
	onOpenSearch,
	onNewConversation,
	onSelectMissions,
	onSelectLibrary,
	onOpenSettings,
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
				<FoldSection name={t("rail.pinned")}>
					<SidebarMenu>{pinned}</SidebarMenu>
				</FoldSection>
				<FoldSection name={t("rail.conversations")}>
					<SidebarMenu>{conversations}</SidebarMenu>
				</FoldSection>
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
