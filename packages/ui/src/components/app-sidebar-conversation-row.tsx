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
	InsertionLine,
	missionStripsOf,
	ROW_ITEM,
	type RosterRowSlot,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { Icons } from "@workspace/ui/components/icons"
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
	insertion,
	slotRef,
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

	return (
		<SidebarMenuItem
			{...(isPinned ? dropArea(conversation.id) : undefined)}
			className={ROW_ITEM}
			data-tauri-drag-region="false"
			ref={slotRef}
		>
			<InsertionLine edge={insertion} />
			<ContextMenu>
				<ContextMenuTrigger>
					<SidebarListRow
						{...lift.handlersFor(conversation.id)}
						isLiftable
						badge={badgeOf(conversation)}
						isActive={isSelected}
						isMiddleClickSelectable
						isWorking={Boolean(workingBotOf(conversation))}
						media={<ConversationSubjectIcon icon={conversation.icon} />}
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
						strips={missionStripsOf(conversation.missions)}
						timestamp={conversation.timestamp ?? ""}
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

export { ConversationRosterRow }
