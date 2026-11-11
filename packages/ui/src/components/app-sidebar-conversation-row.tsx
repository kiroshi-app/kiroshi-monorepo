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
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { Icons } from "@workspace/ui/components/icons"
import { MissionCapsuleList } from "@workspace/ui/components/mission-capsule"
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
import { SidebarMenuItem } from "@workspace/ui/components/ui/sidebar"
import { dropArea, type Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const MISSION_SURFACE =
	"relative flex flex-col gap-1 rounded-lg p-1.5 hover:bg-sidebar-accent active:bg-sidebar-accent has-[[data-active]]:bg-sidebar-accent data-popup-open:bg-sidebar-accent/70 group-data-[collapsible=icon]:p-0"

const ROW_ICON_SIDE = 36

interface ConversationRosterRowProps extends RosterRowSlot, RosterPinActions {
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
}: ConversationRosterRowProps) => {
	const { t } = useTranslation("bots")
	const hasMissions = Boolean(conversation.missions?.length)

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
			<ContextMenu>
				<ContextMenuTrigger
					className={hasMissions ? MISSION_SURFACE : undefined}
				>
					<SidebarListRow
						{...lift.handlersFor(conversation.id)}
						isLiftable
						badge={badgeOf(conversation)}
						geometry={hasMissions ? "surfaced" : "roster"}
						isActive={isSelected}
						isMiddleClickSelectable
						isWorking={Boolean(workingBotOf(conversation))}
						media={
							conversation.agent ? (
								<BotRowAvatar bot={conversation.agent} size={ROW_ICON_SIDE} />
							) : (
								<ConversationSubjectIcon
									hue={conversation.color}
									icon={conversation.icon}
									side={ROW_ICON_SIDE}
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
							<ConversationBotPile bots={heldBotsOf(conversation)} />
						}
						isTimestampDestructive={conversation.isNotSent}
						timestamp={
							conversation.isNotSent
								? t("roster.conversation.notSent")
								: (conversation.timestamp ?? "")
						}
					/>
					<MissionCapsuleList missions={conversation.missions} />
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
