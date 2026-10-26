"use client"

import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/bot-badge"
import { FillIcons, Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
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
	"pointer-events-none absolute -end-px -top-px size-2 rounded-full bg-primary ring-2 ring-(--shell-surface,var(--background)) transition-shadow duration-400 ease-out motion-reduce:transition-none"

const RAIL_AVATAR =
	"grid size-full place-items-center bg-rail-avatar font-medium text-foreground text-xs/4 uppercase"

const AVATAR_SIZE = 26

type RailItemProps = {
	name: string
	badge?: BotBadge
	hasDot?: boolean
	isSelected?: boolean
	onPress?: () => void
	children: ReactNode
}

const RailItem = ({
	name,
	badge,
	hasDot,
	isSelected,
	onPress,
	children,
}: RailItemProps) => {
	const { t } = useTranslation("bots")
	const spokenName = badge
		? t(`rail.badge.${badge}`, { name })
		: hasDot
			? t("rail.dot", { name })
			: name

	return (
		<li>
			<TooltipButton
				aria-current={isSelected ? "true" : undefined}
				aria-label={spokenName}
				className={RAIL_ITEM}
				data-slot="app-rail-item"
				onClick={onPress}
				size="icon-lg"
				tooltip={name}
				tooltipSide="right"
				variant="ghost"
			>
				{children}
				{badge ? (
					<BotBadgeDot
						badge={badge}
						data-slot="app-rail-dot"
						placement="rail"
					/>
				) : null}
				{hasDot ? (
					<span
						aria-hidden="true"
						className={RAIL_DOT}
						data-slot="app-rail-dot"
					/>
				) : null}
			</TooltipButton>
		</li>
	)
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

type AppRailProps = Omit<ComponentProps<"nav">, "children"> & {
	selected: AppRailPanel
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
	const isSpaceSettingsOpen = openSettings === "space"
	const SettingsIcon = (isSpaceSettingsOpen ? FillIcons : Icons).Settings

	return (
		<nav
			{...props}
			aria-label={t("rail.label")}
			className={cn(RAIL, className)}
			data-slot="app-rail"
		>
			<ul className={RAIL_GROUP}>
				<RailItem
					{...panelEntry("conversations")}
					onPress={onSelectConversations}
				/>
				<RailItem {...panelEntry("missions")} onPress={onSelectMissions} />
				<RailItem
					hasDot={dots?.settings}
					isSelected={isSpaceSettingsOpen}
					name={t("rail.spaceSettings")}
					onPress={onOpenSpaceSettings}
				>
					<SettingsIcon aria-hidden="true" />
				</RailItem>
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
