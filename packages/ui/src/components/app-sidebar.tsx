"use client"

import { type ComponentProps, memo, useState } from "react"

import { AppRail, type AppRailPanel } from "@workspace/ui/components/app-rail"
import {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	ROW_AVATAR_SIZE,
	type RosterPin,
} from "@workspace/ui/components/app-sidebar-model"
import { AppSidebarPanel } from "@workspace/ui/components/app-sidebar-panel"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import { type Space, spaceAtRank } from "@workspace/ui/components/space"
import { SpaceDots } from "@workspace/ui/components/space-switcher"
import { SidebarFooter } from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { useSpaceShortcut } from "@workspace/ui/hooks/use-space-shortcut"
import { probeRender } from "@workspace/ui/lib/render-probe"

const FOOTER_INSET = "px-2 py-0 not-has-[*:not(:empty)]:hidden"

const SpaceDotsFooter = (dots: ComponentProps<typeof SpaceDots>) =>
	dots.spaces.length > 1 ? (
		<SidebarFooter className={FOOTER_INSET}>
			<SpaceDots {...dots} />
		</SidebarFooter>
	) : null

const AppSidebarBase = ({
	badgesBySpaceId,
	spaces = [],
	selectedSpaceId,
	isSpaceSwitchingEnabled = true,
	onSelectSpace,
	onReorderSpaces,
	onCreateSpace,
	hostBySpaceId,
	invitations,
	onAcceptInvitation,
	onDeclineInvitation,
	onRetryInvitation,
	onSpaceSwitcherOpenChange,
	onOpenSpaceSettings,
	updateBadge,
	user,
	onOpenUserSettings,
	insetWindowControls,
	windowControls,
	railDots,
	openPanel: controlledPanel,
	openSettings,
	onOpenPanelChange,
	"data-tauri-drag-region": dragRegion,
	...sidebar
}: AppSidebarProps) => {
	probeRender("AppSidebar")
	const [ownPanel, setOwnPanel] = useState<AppRailPanel>("conversations")
	const openPanel: AppRailPanel =
		(controlledPanel ?? ownPanel) === "missions" ? "missions" : "conversations"
	const setOpenPanel = (next: AppRailPanel) => {
		setOwnPanel(next)
		onOpenPanelChange?.(next)
	}

	const selectRank = (rank: number) => {
		const space = spaceAtRank(spaces, rank)
		if (space) onSelectSpace?.(space.id)
	}

	useSpaceShortcut({
		count: spaces.length,
		isEnabled: isSpaceSwitchingEnabled,
		onRank: selectRank,
	})

	return (
		<>
			<AppTitleBar
				badgesBySpaceId={badgesBySpaceId}
				data-tauri-drag-region={dragRegion}
				hostBySpaceId={hostBySpaceId}
				insetWindowControls={insetWindowControls}
				invitations={invitations}
				onAcceptInvitation={onAcceptInvitation}
				onCreateSpace={onCreateSpace}
				onDeclineInvitation={onDeclineInvitation}
				onRetryInvitation={onRetryInvitation}
				onSelectSpace={onSelectSpace}
				onSpaceSwitcherOpenChange={onSpaceSwitcherOpenChange}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
				windowControls={windowControls}
			/>
			<AppRail
				data-tauri-drag-region={dragRegion}
				dots={railDots}
				onOpenSpaceSettings={onOpenSpaceSettings}
				onOpenYou={onOpenUserSettings}
				onSelectConversations={() => setOpenPanel("conversations")}
				onSelectMissions={() => setOpenPanel("missions")}
				openSettings={openSettings}
				selected={openPanel}
				space={
					spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]
				}
				updateBadge={updateBadge}
				user={user}
			/>
			<AppSidebarPanel
				{...sidebar}
				footer={
					<SpaceDotsFooter
						badgesBySpaceId={badgesBySpaceId}
						onReorderSpaces={onReorderSpaces}
						onSelectSpace={onSelectSpace}
						selectedSpaceId={selectedSpaceId}
						spaces={spaces}
					/>
				}
				isSpaceSwitchingEnabled={isSpaceSwitchingEnabled}
				onOpenSpaceSettings={onOpenSpaceSettings}
				onSelectSpace={onSelectSpace}
				openPanel={openPanel}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
			/>
		</>
	)
}

const AppSidebar = memo(AppSidebarBase)

export {
	AppSidebar,
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	type BotAvatarBlot,
	type ListEnd,
	ROW_AVATAR_SIZE,
	type RosterPin,
	type Space,
	type UserChipIdentity,
}
