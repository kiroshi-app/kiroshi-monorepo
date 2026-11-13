import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type AppSidebarConversation,
	type AppSidebarSection,
	badgeOf,
	heldBotsOf,
	previewOf,
	workingBotOf,
} from "@workspace/ui/components/app-sidebar-model"
import {
	BotRowAvatar,
	type RosterRowSlot,
	rosterRowSlotOf,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	COMPACT_LEAD_SIDE,
	COMPACT_ROW_STACK,
	useIsCompactRows,
} from "@workspace/ui/components/compact-rows"
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { Icons } from "@workspace/ui/components/icons"
import {
	MissionCapsuleList,
	type MissionOpening,
} from "@workspace/ui/components/mission-capsule"
import {
	PinGroup,
	type RosterPinActions,
	SectionBranch,
} from "@workspace/ui/components/roster-menu-items"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import type { SidebarClickModifiers } from "@workspace/ui/components/sidebar-menu-row"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import {
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/ui/sidebar"
import { dropArea, type Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const ROW_ICON_SIDE = 28

const SURFACE =
	"rounded-lg hover:bg-sidebar-accent has-data-active:bg-sidebar-accent data-popup-open:bg-sidebar-accent/70"

const stackedGeometryOf = (hasSurface: boolean) =>
	hasSurface ? "conversation" : "roster"

interface ConversationRosterRowProps
	extends RosterRowSlot,
		RosterPinActions,
		MissionOpening {
	conversation: AppSidebarConversation
	isSelected: boolean
	sections: AppSidebarSection[]
	onSelect?: (id: string, modifiers?: SidebarClickModifiers) => void
	onOpenInNewTab?: (id: string) => void
	onOpenSettings?: (id: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
	lift: Lifter
}

const ConversationRosterRow = ({
	conversation,
	isSelected,
	sections,
	lift,
	shift,
	isSliding,
	isLifted,
	onMoveKey,
	keepFocus,
	isPinned,
	onPin,
	onUnpin,
	onSelect,
	onOpenInNewTab,
	onOpenSettings,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
	openMissionId,
	onOpenMission,
}: ConversationRosterRowProps) => {
	const { t } = useTranslation("bots")
	const { state } = useSidebar()
	const isCompact = useIsCompactRows()
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const hasSurface =
		state !== "collapsed" || Boolean(conversation.missions?.length)
	const leadSide = isCompact ? COMPACT_LEAD_SIDE : ROW_ICON_SIDE
	const stackedSurface = hasSurface ? SURFACE : undefined
	const isAgentLine = isCompact && Boolean(conversation.agent)

	return (
		<SidebarMenuItem
			{...(isPinned ? dropArea(conversation.id) : undefined)}
			{...rosterRowSlotOf(conversation.id, {
				isLifted,
				isPinned,
				isSliding,
				onMoveKey,
				shift,
			})}
			data-tauri-drag-region="false"
			ref={(node) => keepFocus?.(conversation.id, node)}
		>
			<ContextMenu onOpenChange={setIsMenuOpen}>
				<ContextMenuTrigger
					className={isCompact ? COMPACT_ROW_STACK : stackedSurface}
				>
					<SidebarListRow
						{...lift.handlersFor(conversation.id)}
						isLiftable
						badge={badgeOf(conversation)}
						geometry={isCompact ? "compact" : stackedGeometryOf(hasSurface)}
						hasRowTooltip
						isActive={isSelected}
						isMiddleClickSelectable
						isTooltipHidden={isLifted || isMenuOpen}
						isWorking={Boolean(workingBotOf(conversation))}
						media={
							conversation.agent ? (
								<BotRowAvatar bot={conversation.agent} size={leadSide} />
							) : (
								<ConversationSubjectIcon
									hue={conversation.color}
									icon={conversation.icon}
									isBare={isCompact}
									isFilled={isSelected}
									side={leadSide}
								/>
							)
						}
						name={conversation.name}
						onSelect={(modifiers) => {
							if (lift.hasJustDropped()) return
							onSelect?.(conversation.id, modifiers)
						}}
						pendingQuestion={conversation.pendingQuestion}
						preview={previewOf(t, conversation) ?? ""}
						previewTrailing={
							isAgentLine ? undefined : (
								<ConversationBotPile
									bots={heldBotsOf(conversation)}
									isCompact={isCompact}
								/>
							)
						}
						isTimestampDestructive={conversation.isNotSent}
						timestamp={
							conversation.isNotSent
								? t("roster.conversation.notSent")
								: (conversation.timestamp ?? "")
						}
					/>
					<MissionCapsuleList
						isTooltipHidden={isLifted || isMenuOpen}
						missions={conversation.missions}
						onOpenMission={onOpenMission}
						openMissionId={openMissionId}
					/>
				</ContextMenuTrigger>
				<ContextMenuContent
					aria-label={t("roster.actions", { name: conversation.name })}
					className={STILL_UNDER_REDUCED_MOTION}
				>
					<PinGroup
						id={conversation.id}
						isPinned={isPinned}
						onOpenInNewTab={onOpenInNewTab}
						onPin={onPin}
						onUnpin={onUnpin}
					/>
					<ContextMenuItem onClick={() => onOpenSettings?.(conversation.id)}>
						<Icons.Settings aria-hidden="true" className="size-3.5" />
						{t("roster.settings")}
					</ContextMenuItem>
					<SectionBranch
						id={conversation.id}
						onCreateSectionFor={onCreateSectionFor}
						onMoveToSection={onMoveToSection}
						sectionId={conversation.sectionId}
						sections={sections}
					/>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={() => onDelete?.(conversation.id)}
						variant="destructive"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("roster.delete")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</SidebarMenuItem>
	)
}

export { ConversationRosterRow, ROW_ICON_SIDE }
