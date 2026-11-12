"use client"

import { type ComponentProps, memo, useState } from "react"

import { AppFrame } from "@workspace/ui/components/app-frame"
import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarOpenPanel,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	ROW_AVATAR_SIZE,
	type RosterPin,
	type SidebarClickModifiers,
} from "@workspace/ui/components/app-sidebar-model"
import { AppSidebarPanel } from "@workspace/ui/components/app-sidebar-panel"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import { type Space, spaceAtRank } from "@workspace/ui/components/space"
import { SpaceDots } from "@workspace/ui/components/space-switcher"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"
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

const railPanelOf = (panel: string): AppRailPanel =>
	panel === "missions" || panel === "library" ? panel : "conversations"

type AppSidebarFrameKey =
	| keyof TitleBarTabsProps
	| "space"
	| "onCreateSpace"
	| "hostBySpaceId"
	| "spaceHost"
	| "invitations"
	| "onAcceptInvitation"
	| "onDeclineInvitation"
	| "onRetryInvitation"
	| "onSpaceSwitcherOpenChange"
	| "onOpenSpaceSettings"
	| "updateBadge"
	| "user"
	| "onOpenUserSettings"
	| "onOpenSearch"
	| "isSearchOpen"
	| "insetWindowControls"
	| "windowControls"
	| "openPanel"
	| "openSettings"
	| "onOpenPanelChange"
	| "onSelectLibrary"
	| "data-tauri-drag-region"

type AppSidebarBodyProps = Omit<AppSidebarProps, AppSidebarFrameKey> & {
	openPanel?: AppSidebarOpenPanel
}

const AppSidebarBody = ({
	badgesBySpaceId,
	spaces = [],
	selectedSpaceId,
	isSpaceSwitchingEnabled = true,
	onSelectSpace,
	onReorderSpaces,
	openPanel = "conversations",
	...sidebar
}: AppSidebarBodyProps) => {
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
	)
}

const AppSidebarBase = ({
	badgesBySpaceId,
	space,
	spaces = [],
	onSelectSpace,
	onCreateSpace,
	hostBySpaceId,
	spaceHost,
	invitations,
	onAcceptInvitation,
	onDeclineInvitation,
	onRetryInvitation,
	onSpaceSwitcherOpenChange,
	onOpenSpaceSettings,
	updateBadge,
	user,
	onOpenUserSettings,
	onOpenSearch,
	isSearchOpen,
	insetWindowControls,
	windowControls,
	tabs,
	activeTabId,
	canGoBack,
	canGoForward,
	hasClosedTab,
	onSelectTab,
	onCloseTab,
	onPinTab,
	onUnpinTab,
	onCloseOtherTabs,
	onDuplicateTab,
	onReopenClosedTab,
	onMoveTabToNewWindow,
	onReorderTabs,
	onTearOffTab,
	onNewTab,
	onGoBack,
	onGoForward,
	openPanel: controlledPanel,
	openSettings,
	onOpenPanelChange,
	onSelectLibrary,
	"data-tauri-drag-region": dragRegion,
	...sidebar
}: AppSidebarProps) => {
	probeRender("AppSidebar")
	const [ownPanel, setOwnPanel] = useState<AppRailPanel>("conversations")
	const selectedPanel = railPanelOf(controlledPanel ?? ownPanel)
	const openPanel: AppSidebarOpenPanel =
		selectedPanel === "missions" ? "missions" : "conversations"
	const setOpenPanel = (next: AppSidebarOpenPanel) => {
		setOwnPanel(next)
		onOpenPanelChange?.(next)
	}
	const selectLibrary = onSelectLibrary
		? () => {
				setOwnPanel("library")
				onSelectLibrary()
			}
		: undefined

	return (
		<AppFrame
			rail={{
				badgesBySpaceId,
				"data-tauri-drag-region": dragRegion,
				hostBySpaceId,
				invitations,
				isSearchOpen,
				onAcceptInvitation,
				onCreateSpace,
				onDeclineInvitation,
				onOpenSearch,
				onOpenSpaceSettings,
				onOpenYou: onOpenUserSettings,
				onRetryInvitation,
				onSelectConversations: () => setOpenPanel("conversations"),
				onSelectLibrary: selectLibrary,
				onSelectMissions: () => setOpenPanel("missions"),
				onSelectSpace,
				onSpacesMenuOpenChange: onSpaceSwitcherOpenChange,
				openSettings,
				selected: selectedPanel,
				spaces,
				updateBadge,
				user,
			}}
			space={space}
			spaceHost={spaceHost}
			titleBar={{
				activeTabId,
				canGoBack,
				canGoForward,
				"data-tauri-drag-region": dragRegion,
				hasClosedTab,
				insetWindowControls,
				onCloseOtherTabs,
				onCloseTab,
				onDuplicateTab,
				onGoBack,
				onGoForward,
				onMoveTabToNewWindow,
				onNewTab,
				onPinTab,
				onReopenClosedTab,
				onReorderTabs,
				onSelectTab,
				onTearOffTab,
				onUnpinTab,
				tabs,
				windowControls,
			}}
		>
			<AppSidebarBody
				{...sidebar}
				badgesBySpaceId={badgesBySpaceId}
				onSelectSpace={onSelectSpace}
				openPanel={openPanel}
				spaces={spaces}
			/>
		</AppFrame>
	)
}

const AppSidebar = memo(AppSidebarBase)

export {
	AppSidebar,
	AppSidebarBody,
	type AppSidebarBodyProps,
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	type ListEnd,
	ROW_AVATAR_SIZE,
	type RosterPin,
	type SidebarClickModifiers,
	type Space,
	type UserChipIdentity,
}
