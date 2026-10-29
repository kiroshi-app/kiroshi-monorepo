import { Fragment, useState } from "react"
import { useTranslation } from "react-i18next"

import { NAVIGATION_ROW_GAP } from "@workspace/ui/components/app-rail"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarSection,
	BotRosterActions,
	ConversationRosterActions,
	SectionActions,
} from "@workspace/ui/components/app-sidebar-model"
import {
	botEntry,
	byMostRecent,
	conversationEntry,
	inRuns,
	PINNED_ZONE,
	type PinnedEntry,
	waitingFirst,
} from "@workspace/ui/components/app-sidebar-pins"
import {
	emptySlotOf,
	headSlotOf,
	type RosterDrag,
} from "@workspace/ui/components/app-sidebar-roster-drag"
import type { RosterEntries } from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	RosterDropArea,
	type RosterRowSlot,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { RosterSection } from "@workspace/ui/components/app-sidebar-section"
import type { RosterPinActions } from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"
import type { SlideShift } from "@workspace/ui/hooks/use-sliding-lift"

interface RosterRowsContext
	extends BotRosterActions,
		ConversationRosterActions,
		RosterPinActions {
	activeBotId?: string
	selectedConversationId?: string
	spaceId?: string
	spaces: Space[]
	sections: AppSidebarSection[]
	membershipsOf: (botId: string) => string[]
	lift: Lifter
	liftedId?: string
	shiftOf: (entry: PinnedEntry) => SlideShift | undefined
	keepFocus: (id: string, node: HTMLElement | null) => void
	onMoveKey: RosterRowSlot["onMoveKey"]
	onCreateSectionFor?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
}

const NO_SPACE_IDS: string[] = []

const useSameSpaceIds = (next: string[]) => {
	const [held, setHeld] = useState(next)
	const isSame =
		held.length === next.length && held.every((id, at) => id === next[at])
	if (isSame) return held
	setHeld(next)
	return next
}

interface RosterRowProps {
	entry: PinnedEntry
	isSlotted: boolean
	rows: RosterRowsContext
}

const RosterRow = ({ entry, isSlotted, rows }: RosterRowProps) => {
	const { liftedId, membershipsOf } = rows
	const memberships = useSameSpaceIds(
		entry.bot ? membershipsOf(entry.bot.id) : NO_SPACE_IDS,
	)
	const isLifted = entry.id === liftedId
	const shared = {
		isLifted,
		isPinned: isSlotted,
		isSliding: isSlotted && Boolean(liftedId) && !isLifted,
		lift: rows.lift,
		onCreateSectionFor: rows.onCreateSectionFor,
		onMoveToSection: rows.onMoveToSection,
		onPin: rows.onPin,
		onUnpin: rows.onUnpin,
		onMoveKey: isSlotted ? rows.onMoveKey : undefined,
		sections: rows.sections,
		shift: isSlotted ? rows.shiftOf(entry) : undefined,
		keepFocus: rows.keepFocus,
	}
	if (entry.conversation)
		return (
			<ConversationRosterRow
				{...shared}
				conversation={entry.conversation}
				isSelected={entry.conversation.id === rows.selectedConversationId}
				onDelete={rows.onDeleteConversation}
				onOpenInNewTab={rows.onOpenConversationInNewTab}
				onOpenSettings={rows.onOpenConversationSettings}
				onSelect={rows.onSelectConversation}
			/>
		)
	if (!entry.bot) return null
	return (
		<BotRosterRow
			{...shared}
			bot={entry.bot}
			isSelected={entry.bot.id === rows.activeBotId}
			memberships={memberships}
			onAddToSpace={rows.onAddBotToSpace}
			onDelete={rows.onDeleteBot}
			onDuplicate={rows.onDuplicateBot}
			onEdit={rows.onEditBot}
			onOpenInNewTab={rows.onOpenBotInNewTab}
			onRemoveFromSpace={rows.onRemoveBotFromSpace}
			onSelect={rows.onSelectBot}
			openSpaceId={rows.spaceId}
			spaces={rows.spaces}
		/>
	)
}

const rosterMenuOf = (
	entries: PinnedEntry[],
	isSlotted: boolean,
	rows: RosterRowsContext,
) => (
	<SidebarMenu className={NAVIGATION_ROW_GAP}>
		{entries.map((entry) => (
			<RosterRow
				entry={entry}
				isSlotted={isSlotted}
				key={entry.id}
				rows={rows}
			/>
		))}
	</SidebarMenu>
)

const recentMenuOf = (
	conversations: AppSidebarConversation[],
	bots: AppSidebarBot[],
	rows: RosterRowsContext,
) =>
	rosterMenuOf(
		waitingFirst(
			[
				...conversations.map((conversation) => conversationEntry(conversation)),
				...bots.map((bot) => botEntry(bot)),
			].toSorted(byMostRecent),
		),
		false,
		rows,
	)

const PINNED_ZONE_STACK = "flex flex-col gap-1.5"

interface PinnedZoneProps
	extends Pick<
		SectionActions,
		"onCollapseSection" | "onDeleteSection" | "onRenameSection"
	> {
	entries: RosterEntries
	drag: RosterDrag
	rows: RosterRowsContext
	collapsedSectionIds: string[]
	onMoveSection: (id: string, by: number) => void
}

const PinnedZone = ({
	entries: { topLevel, rowsOf },
	drag,
	rows,
	collapsedSectionIds,
	onCollapseSection,
	onDeleteSection,
	onRenameSection,
	onMoveSection,
}: PinnedZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<RosterDropArea
			className={PINNED_ZONE_STACK}
			isLanding={topLevel.length === 0 && drag.isPinnedLanding}
			landing={PINNED_ZONE}
			slotId={topLevel.length === 0 ? PINNED_ZONE : undefined}
		>
			{topLevel.length > 0 ? (
				inRuns(topLevel).map((run) => {
					const [entry] = run
					if (!entry.section)
						return (
							<Fragment key={`run:${entry.id}`}>
								{rosterMenuOf(run, true, rows)}
							</Fragment>
						)
					const { id } = entry.section
					const rank = topLevel.indexOf(entry)
					const heldRows = rowsOf(id)
					const isLifted = id === drag.liftedSectionId
					return (
						<RosterDropArea
							isLanding={drag.landingSection === id}
							isLifted={isLifted}
							isReceiving={drag.isReceiving(id)}
							isSliding={drag.isLifting && !isLifted}
							key={entry.id}
							landing={entry.id}
							ref={(node) => drag.keepFocus(id, node)}
							shift={drag.cardShiftOf(id)}
							slotId={id}
						>
							<RosterSection
								isFirst={rank === 0}
								isLast={rank === topLevel.length - 1}
								isOpen={!collapsedSectionIds.includes(id)}
								lift={drag.rosterLift}
								onOpenChange={(isOpen) => onCollapseSection?.(id, !isOpen)}
								onDelete={onDeleteSection}
								onMove={onMoveSection}
								onMoveKey={(event) => drag.moveSectionByKey(id, event)}
								onRename={onRenameSection}
								section={entry.section}
								slotId={headSlotOf(id)}
							>
								{heldRows.length > 0 ? (
									rosterMenuOf(heldRows, true, rows)
								) : (
									<SectionDropZone
										name={entry.section.name}
										slotId={emptySlotOf(id)}
									/>
								)}
							</RosterSection>
						</RosterDropArea>
					)
				})
			) : (
				<SectionDropZone label={t("roster.pinDrop")} name={t("roster.pin")} />
			)}
		</RosterDropArea>
	)
}

export { PinnedZone, type RosterRowsContext, recentMenuOf, rosterMenuOf }
