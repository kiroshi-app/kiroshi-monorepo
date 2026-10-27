"use client"

import { type ComponentProps, memo, useState } from "react"

import { AppFrame } from "@workspace/ui/components/app-frame"
import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	ROW_AVATAR_SIZE,
	type RosterPin,
	type SidebarClickModifiers,
} from "@workspace/ui/components/app-sidebar-model"
import { AppSidebarPanel } from "@workspace/ui/components/app-sidebar-panel"
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
	space,
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
	tabs,
	activeTabId,
	canGoBack,
	canGoForward,
	onSelectTab,
	onCloseTab,
	onPinTab,
	onUnpinTab,
	onCloseOtherTabs,
	onNewTab,
	onGoBack,
	onGoForward,
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
		<AppFrame
			rail={{
				badgesBySpaceId,
				"data-tauri-drag-region": dragRegion,
				dots: railDots,
				hostBySpaceId,
				invitations,
				onAcceptInvitation,
				onCreateSpace,
				onDeclineInvitation,
				onOpenSpaceSettings,
				onOpenYou: onOpenUserSettings,
				onRetryInvitation,
				onSelectConversations: () => setOpenPanel("conversations"),
				onSelectMissions: () => setOpenPanel("missions"),
				onSelectSpace,
				onSpacesMenuOpenChange: onSpaceSwitcherOpenChange,
				openSettings,
				selected: openPanel,
				spaces,
				updateBadge,
				user,
			}}
			space={space}
			spaceHost={space ? hostBySpaceId?.[space.id] : undefined}
			titleBar={{
				activeTabId,
				canGoBack,
				canGoForward,
				"data-tauri-drag-region": dragRegion,
				insetWindowControls,
				onCloseOtherTabs,
				onCloseTab,
				onGoBack,
				onGoForward,
				onNewTab,
				onPinTab,
				onSelectTab,
				onUnpinTab,
				tabs,
				windowControls,
			}}
		>
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
				onSelectSpace={onSelectSpace}
				openPanel={openPanel}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
			/>
		</AppFrame>
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
	type SidebarClickModifiers,
	type Space,
	type UserChipIdentity,
}
