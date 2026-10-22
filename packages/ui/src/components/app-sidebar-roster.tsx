import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	RosterSurface,
	type RosterSurfaceProps,
} from "@workspace/ui/components/app-sidebar-actions"
import {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarSection,
	type BotRosterActions,
	type ConversationRosterActions,
	NO_COLLAPSED_SECTIONS,
	type RosterCreateActions,
	type RosterSpaceActions,
	type SectionActions,
	type SectionNaming,
} from "@workspace/ui/components/app-sidebar-model"
import { SORTED, SORTED_ZONE } from "@workspace/ui/components/app-sidebar-pins"
import { useRosterDrag } from "@workspace/ui/components/app-sidebar-roster-drag"
import {
	rosterEntriesOf,
	rosterMovesOf,
} from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	PinnedZone,
	type RosterRowsContext,
	recentMenuOf,
} from "@workspace/ui/components/app-sidebar-roster-menu"
import {
	LiftedRow,
	RosterDropArea,
	RosterZoneSeparator,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	SECTION_GROUP,
	SectionLabel,
	SectionNameField,
} from "@workspace/ui/components/app-sidebar-section"
import {
	type ListEnd,
	ListEndSlot,
} from "@workspace/ui/components/list-skeleton"
import { sidebarRowAt } from "@workspace/ui/components/sidebar-list-skeleton"
import type { Space } from "@workspace/ui/components/space"
import {
	SidebarGroup,
	SidebarGroupContent,
} from "@workspace/ui/components/ui/sidebar"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"

const EMPTY_COPY = "px-3 py-4 text-center text-sidebar-foreground/70 text-sm"

interface SectionNamingGroupProps {
	bots: AppSidebarBot[]
	conversations: AppSidebarConversation[]
	rows: RosterRowsContext
	onCreate: (name: string) => void
	onEndNaming: () => void
}

const SectionNamingGroup = ({
	bots,
	conversations,
	rows,
	onCreate,
	onEndNaming,
}: SectionNamingGroupProps) => {
	const { t } = useTranslation("bots")

	return (
		<SidebarGroup className={SECTION_GROUP}>
			<SectionLabel>
				<SectionNameField
					ariaLabel={t("roster.section.createField")}
					initialName={t("roster.section.createDefault")}
					onCancel={onEndNaming}
					onCommit={(name) => {
						onEndNaming()
						onCreate(name)
					}}
				/>
			</SectionLabel>
			{bots.length + conversations.length > 0 ? (
				<SidebarGroupContent>
					{recentMenuOf(conversations, bots, rows)}
				</SidebarGroupContent>
			) : null}
		</SidebarGroup>
	)
}

interface BotRosterProps
	extends BotRosterActions,
		ConversationRosterActions,
		SectionActions,
		RosterCreateActions,
		RosterSpaceActions {
	spaceId?: string
	bots: AppSidebarBot[]
	haveBotsFailedToLoad?: boolean
	conversations: AppSidebarConversation[]
	selectedBotId?: string
	selectedConversationId?: string
	spaces: Space[]
	membershipsOf: (botId: string) => string[]
	sections: AppSidebarSection[]
	collapsedSectionIds?: string[]
	naming?: SectionNaming | null
	onNaming?: (naming: SectionNaming | null) => void
	listEnd?: ListEnd
}

const BotRoster = ({
	spaceId,
	bots,
	haveBotsFailedToLoad = false,
	conversations,
	selectedBotId,
	selectedConversationId,
	spaces,
	membershipsOf,
	sections,
	collapsedSectionIds = NO_COLLAPSED_SECTIONS,
	onCollapseSection,
	naming = null,
	onNaming,
	listEnd,
	onCreateBot,
	onCreateConversation,
	onOpenSpaceSettings,
	onSelectConversation,
	onOpenConversationSettings,
	onDeleteConversation,
	onSelectBot,
	onEditBot,
	onDuplicateBot,
	onAddBotToSpace,
	onRemoveBotFromSpace,
	onDeleteBot,
	onCreateSection,
	onRenameSection,
	onDeleteSection,
	onPinRoster,
}: BotRosterProps) => {
	const { t } = useTranslation("bots")
	const entries = rosterEntriesOf({ bots, conversations, naming, sections })
	const moves = rosterMovesOf({ entries, onPinRoster, spaceId })
	const land = useStableCallback(moves.land)
	const fileRow = useStableCallback(moves.fileRow)
	const pinLast = useStableCallback(moves.pinLast)
	const unpin = useStableCallback(moves.unpin)
	const drag = useRosterDrag({ entries, onLand: land })
	const { isNamed, sortedBots, sortedConversations, topLevel } = entries
	const { liftedEntry, rosterLift } = drag
	const { followRef } = rosterLift

	const rows: RosterRowsContext = {
		activeBotId: selectedConversationId ? undefined : selectedBotId,
		edgeAt: drag.edgeAt,
		lift: rosterLift,
		membershipsOf,
		onAddBotToSpace,
		onCreateSectionFor: onCreateSection
			? (rowId) => onNaming?.({ rowId })
			: undefined,
		onDeleteBot,
		onDeleteConversation,
		onDuplicateBot,
		onEditBot,
		onMoveToSection: onPinRoster && sections.length > 0 ? fileRow : undefined,
		onOpenConversationSettings,
		onPin: onPinRoster ? pinLast : undefined,
		onRemoveBotFromSpace,
		onSelectBot,
		onSelectConversation,
		onUnpin: onPinRoster ? unpin : undefined,
		sections,
		selectedConversationId,
		slotFor: drag.slotFor,
		spaceId,
		spaces,
	}

	const surface: RosterSurfaceProps = {
		onCreateBot,
		onCreateConversation,
		onCreateSection: onCreateSection
			? () => onNaming?.({ rowId: null })
			: undefined,
		onOpenSpaceSettings,
	}

	if (haveBotsFailedToLoad && bots.length === 0)
		return (
			<RosterSurface {...surface}>
				<p className={EMPTY_COPY}>{t("roster.unavailable")}</p>
			</RosterSurface>
		)

	if (
		!naming &&
		bots.length === 0 &&
		conversations.length === 0 &&
		sections.length === 0
	)
		return (
			<RosterSurface {...surface}>
				<p className={EMPTY_COPY}>{t("roster.empty")}</p>
			</RosterSurface>
		)

	const hasSortedRows = sortedBots.length + sortedConversations.length > 0
	const isLifting = Boolean(liftedEntry && !liftedEntry.section)
	const hasPinnedZone = topLevel.length > 0 || isLifting

	return (
		<>
			{hasPinnedZone ? (
				<PinnedZone
					collapsedSectionIds={collapsedSectionIds}
					drag={drag}
					entries={entries}
					onCollapseSection={onCollapseSection}
					onDeleteSection={onDeleteSection}
					onMoveSection={moves.moveSection}
					onRenameSection={onRenameSection}
					rows={rows}
				/>
			) : null}
			{hasPinnedZone ? <RosterZoneSeparator /> : null}
			{hasSortedRows || isLifting ? (
				<RosterDropArea
					isLanding={rosterLift.lift?.landing === SORTED}
					landing={SORTED_ZONE}
				>
					{hasSortedRows ? (
						recentMenuOf(sortedConversations, sortedBots, rows)
					) : (
						<SectionDropZone name={t("roster.label")} />
					)}
				</RosterDropArea>
			) : null}
			<ListEndSlot listEnd={listEnd} row={sidebarRowAt(0)} />
			{naming ? (
				<SectionNamingGroup
					bots={bots.filter((bot) => isNamed(bot.id))}
					conversations={conversations.filter(({ id }) => isNamed(id))}
					onCreate={(name) =>
						onCreateSection?.(name, naming.rowId ?? undefined)
					}
					onEndNaming={() => onNaming?.(null)}
					rows={rows}
				/>
			) : null}
			<RosterSurface {...surface} />
			{isLifting
				? createPortal(
						<LiftedRow
							bot={liftedEntry?.bot}
							conversation={liftedEntry?.conversation}
							ref={followRef}
						/>,
						document.body,
					)
				: null}
		</>
	)
}

export { BotRoster }
