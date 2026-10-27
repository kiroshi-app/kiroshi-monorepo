"use client"

import type {
	ComponentProps,
	HTMLAttributes,
	ReactElement,
	ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/bot-badge"
import { ContextMenuPressTrigger } from "@workspace/ui/components/context-menu-press-trigger"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { FillIcons, Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import type { Space } from "@workspace/ui/components/space"
import {
	SpaceAvatar,
	spaceAvatarStateOf,
} from "@workspace/ui/components/space-avatar"
import {
	type SpaceInvitation,
	type SpaceInvitationCallbacks,
	SpaceInvitations,
} from "@workspace/ui/components/space-invitations"
import {
	badgeElsewhere,
	SpaceMenuRows,
} from "@workspace/ui/components/space-switcher"
import {
	TITLE_BAR_MENU,
	TITLE_BAR_MENU_ROW,
} from "@workspace/ui/components/title-bar-menu"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type AppRailPanel = "conversations" | "missions"

type AppRailSettings = "space" | "you"

type AppRailDots = Partial<
	Record<AppRailPanel, BotBadge> & Record<"settings" | "you", boolean>
>

const PANEL_ICON = {
	conversations: "Conversations",
	missions: "Missions",
} as const satisfies Record<AppRailPanel, keyof typeof FillIcons>

const RAIL =
	"flex w-15 shrink-0 flex-col justify-between gap-1 px-2 pt-1.75 pb-[calc(var(--shell-inset)-var(--spacing))]"

const NAVIGATION_ROW_GAP = "gap-0.5"

const RAIL_GROUP = `flex flex-col ${NAVIGATION_ROW_GAP}`

const RAIL_SLOT =
	"flex size-11 items-center justify-center rounded-lg empty:hidden"

const RAIL_ITEM =
	"relative size-11 rounded-lg text-muted-foreground hover:bg-rail-item-selected/50 hover:text-foreground dark:hover:bg-rail-item-selected/50 aria-[current=true]:bg-rail-item-selected aria-[current=true]:text-foreground dark:aria-[current=true]:bg-rail-item-selected [&_svg]:size-4.5 [&_svg]:stroke-[1.75]!"

const RAIL_DOT =
	"pointer-events-none absolute -end-px -top-px size-2 rounded-full bg-primary-strong ring-2 ring-(--shell-surface,var(--background)) transition-shadow duration-400 ease-out motion-reduce:transition-none"

const RAIL_AVATAR =
	"grid size-full place-items-center bg-rail-avatar font-medium text-foreground text-xs/4 uppercase"

const AVATAR_SIZE = 26

const RAIL_SPACES_TRIGGER =
	"transition-none aria-expanded:bg-rail-item-selected aria-expanded:text-foreground dark:aria-expanded:bg-rail-item-selected"

const SPACES_MENU_ROW = "gap-2.5 ps-2.5 pe-8 [&_svg]:size-3.5!"

const SPACES_MENU_ICON = "size-3.5"

type RailButton = ReactElement<HTMLAttributes<HTMLElement>>

type RailItemProps = {
	name: string
	badge?: BotBadge
	hasDot?: boolean
	isSelected?: boolean
	className?: string
	onPress?: () => void
	renderButton?: (button: RailButton) => ReactNode
	children: ReactNode
}

const RailItem = ({
	name,
	badge,
	hasDot,
	isSelected,
	className,
	onPress,
	renderButton,
	children,
}: RailItemProps) => {
	const { t } = useTranslation("bots")
	const spokenName = badge
		? t(`rail.badge.${badge}`, { name })
		: hasDot
			? t("rail.dot", { name })
			: name

	const button = (
		<TooltipButton
			aria-current={isSelected ? "true" : undefined}
			aria-label={spokenName}
			className={cn(RAIL_ITEM, className)}
			data-slot="app-rail-item"
			onClick={onPress}
			size="icon-lg"
			tooltip={name}
			tooltipSide="right"
			variant="ghost"
		>
			{children}
			{badge ? (
				<BotBadgeDot badge={badge} data-slot="app-rail-dot" placement="rail" />
			) : null}
			{hasDot ? (
				<span
					aria-hidden="true"
					className={RAIL_DOT}
					data-slot="app-rail-dot"
				/>
			) : null}
		</TooltipButton>
	)

	return <li>{renderButton ? renderButton(button) : button}</li>
}

type RailAvatarProps = UserChipIdentity

const RailAvatar = ({ name, image }: RailAvatarProps) => (
	<AvatarFrame
		image={image}
		shape="round"
		size={AVATAR_SIZE}
		slot="app-rail-avatar"
	>
		<span aria-hidden="true" className={RAIL_AVATAR}>
			{initialsOf(displayNameOf(name))}
		</span>
	</AvatarFrame>
)

type RailSpacesMenuProps = SpaceInvitationCallbacks & {
	trigger: RailButton
	spaces: Space[]
	selectedSpaceId?: string
	badgesBySpaceId?: Record<string, BotBadge>
	hostBySpaceId?: Record<string, SpaceHost>
	invitations?: SpaceInvitation[]
	onSelectSpace?: (id: string) => void
	onOpenSpaceSettings?: () => void
	onCreateSpace?: () => void
	onOpenChange?: (isOpen: boolean) => void
}

const RailSpacesMenu = ({
	trigger,
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	hostBySpaceId,
	invitations = [],
	onSelectSpace,
	onOpenSpaceSettings,
	onCreateSpace,
	onOpenChange,
	...invitationCallbacks
}: RailSpacesMenuProps) => {
	const { t } = useTranslation("bots")

	return (
		<ContextMenu onOpenChange={(isOpen) => onOpenChange?.(isOpen)}>
			<ContextMenuPressTrigger render={trigger} />
			<ContextMenuContent
				aria-label={t("spaces.label")}
				className={cn(TITLE_BAR_MENU, "w-62", STILL_UNDER_REDUCED_MOTION)}
			>
				<SpaceMenuRows
					badgesBySpaceId={badgesBySpaceId}
					hostBySpaceId={hostBySpaceId}
					onSelectSpace={onSelectSpace}
					rowClassName={cn(TITLE_BAR_MENU_ROW, SPACES_MENU_ROW)}
					selectedSpaceId={selectedSpaceId}
					spaces={spaces}
				/>
				<SpaceInvitations {...invitationCallbacks} invitations={invitations} />
				<ContextMenuSeparator />
				<ContextMenuItem
					className={TITLE_BAR_MENU_ROW}
					onClick={onOpenSpaceSettings}
				>
					<Icons.Settings aria-hidden="true" className={SPACES_MENU_ICON} />
					{t("rail.spaceSettings")}
				</ContextMenuItem>
				<ContextMenuItem className={TITLE_BAR_MENU_ROW} onClick={onCreateSpace}>
					<Icons.Add aria-hidden="true" className={SPACES_MENU_ICON} />
					{t("spaces.create")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

type AppRailProps = Omit<ComponentProps<"nav">, "children"> &
	SpaceInvitationCallbacks & {
		selected: AppRailPanel
		space?: Space
		spaceHost?: SpaceHost
		spaces?: Space[]
		badgesBySpaceId?: Record<string, BotBadge>
		hostBySpaceId?: Record<string, SpaceHost>
		invitations?: SpaceInvitation[]
		onSelectSpace?: (id: string) => void
		onCreateSpace?: () => void
		onSpacesMenuOpenChange?: (isOpen: boolean) => void
		openSettings?: AppRailSettings
		dots?: AppRailDots
		user?: UserChipIdentity
		updateBadge?: ReactNode
		onSelectConversations?: () => void
		onSelectMissions?: () => void
		onOpenSpaceSettings?: () => void
		onOpenYou?: () => void
	}

const AppRail = ({
	selected,
	space,
	spaceHost,
	spaces,
	badgesBySpaceId,
	hostBySpaceId,
	invitations,
	onSelectSpace,
	onCreateSpace,
	onSpacesMenuOpenChange,
	onAcceptInvitation,
	onDeclineInvitation,
	onRetryInvitation,
	openSettings,
	dots,
	user,
	updateBadge,
	onSelectConversations,
	onSelectMissions,
	onOpenSpaceSettings,
	onOpenYou,
	className,
	...props
}: AppRailProps) => {
	const { t } = useTranslation("bots")
	const spaceLogo = (
		<SpaceAvatar
			colour={space?.colour}
			size={26}
			spaceId={space?.avatarSeed ?? ""}
			state={spaceAvatarStateOf(spaceHost)}
		/>
	)
	const panelEntry = (entry: AppRailPanel) => {
		const isSelected = openSettings === undefined && selected === entry
		const PanelIcon = (isSelected ? FillIcons : Icons)[PANEL_ICON[entry]]
		return {
			children: <PanelIcon aria-hidden="true" />,
			badge: dots?.[entry],
			isSelected,
			name: t(`rail.${entry}`),
		}
	}

	return (
		<nav
			{...props}
			aria-label={t("rail.label")}
			className={cn(RAIL, className)}
			data-slot="app-rail"
		>
			<ul className={RAIL_GROUP}>
				{spaces ? (
					<RailItem
						badge={badgeElsewhere(spaces, space?.id, badgesBySpaceId)}
						className={RAIL_SPACES_TRIGGER}
						hasDot={dots?.settings}
						isSelected={openSettings === "space"}
						name={
							space
								? t("spaces.switch", { name: space.name })
								: t("spaces.label")
						}
						renderButton={(button) => (
							<RailSpacesMenu
								badgesBySpaceId={badgesBySpaceId}
								hostBySpaceId={hostBySpaceId}
								invitations={invitations}
								onAcceptInvitation={onAcceptInvitation}
								onCreateSpace={onCreateSpace}
								onDeclineInvitation={onDeclineInvitation}
								onOpenChange={onSpacesMenuOpenChange}
								onOpenSpaceSettings={onOpenSpaceSettings}
								onRetryInvitation={onRetryInvitation}
								onSelectSpace={onSelectSpace}
								selectedSpaceId={space?.id}
								spaces={spaces}
								trigger={button}
							/>
						)}
					>
						{spaceLogo}
					</RailItem>
				) : (
					// TODO: OPE-1334 drops this Space settings dot once apps/app passes spaces to every rail.
					<RailItem
						hasDot={dots?.settings}
						isSelected={openSettings === "space"}
						name={t("rail.spaceSettings")}
						onPress={onOpenSpaceSettings}
					>
						{spaceLogo}
					</RailItem>
				)}
				<RailItem
					{...panelEntry("conversations")}
					onPress={onSelectConversations}
				/>
				<RailItem {...panelEntry("missions")} onPress={onSelectMissions} />
			</ul>
			<ul className={RAIL_GROUP}>
				{updateBadge ? (
					<li className={RAIL_SLOT} data-slot="app-rail-update">
						{updateBadge}
					</li>
				) : null}
				<RailItem
					hasDot={dots?.you}
					isSelected={openSettings === "you"}
					name={displayNameOf(user?.name)}
					onPress={onOpenYou}
				>
					<RailAvatar image={user?.image} name={user?.name} />
				</RailItem>
			</ul>
		</nav>
	)
}

export {
	AppRail,
	type AppRailDots,
	type AppRailPanel,
	type AppRailProps,
	type AppRailSettings,
	NAVIGATION_ROW_GAP,
}
