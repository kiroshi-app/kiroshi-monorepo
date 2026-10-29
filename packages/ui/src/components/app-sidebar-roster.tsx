import { useRef } from "react"
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
	type SectionActions,
	type SectionNaming,
} from "@workspace/ui/components/app-sidebar-model"
import { SORTED_ZONE } from "@workspace/ui/components/app-sidebar-pins"
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
	RosterDropArea,
	RosterLiftFrame,
	RosterMoveAnnouncement,
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
import { mergeRefs } from "@workspace/ui/lib/utils"

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
		RosterCreateActions {
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
	onSelectConversation,
	onOpenConversationInNewTab,
	onOpenConversationSettings,
	onDeleteConversation,
	onSelectBot,
	onOpenBotInNewTab,
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
	const moveSection = useStableCallback(moves.moveSection)
	const frameRef = useRef<HTMLDivElement>(null)
	const drag = useRosterDrag({
		collapsedSectionIds,
		containerRef: frameRef,
		entries,
		onLand: land,
		onMoveSection: moveSection,
	})
	const { isNamed, sortedBots, sortedConversations, topLevel } = entries
	const { liftedEntry, rosterLift } = drag

	const rows: RosterRowsContext = {
		activeBotId: selectedConversationId ? undefined : selectedBotId,
		lift: rosterLift,
		liftedId: drag.liftedId,
		membershipsOf,
		onAddBotToSpace,
		onCreateSectionFor: onCreateSection
			? (rowId) => onNaming?.({ rowId })
			: undefined,
		onDeleteBot,
		onDeleteConversation,
		onDuplicateBot,
		onEditBot,
		onMoveKey: onPinRoster ? drag.moveRowByKey : undefined,
		onMoveToSection: onPinRoster && sections.length > 0 ? fileRow : undefined,
		onOpenBotInNewTab,
		onOpenConversationInNewTab,
		onOpenConversationSettings,
		onPin: onPinRoster ? pinLast : undefined,
		onRemoveBotFromSpace,
		onSelectBot,
		onSelectConversation,
		onUnpin: onPinRoster ? unpin : undefined,
		sections,
		selectedConversationId,
		shiftOf: drag.rowShiftOf,
		keepFocus: drag.keepFocus,
		spaceId,
		spaces,
	}

	const surface: RosterSurfaceProps = {
		onCreateBot,
		onCreateConversation,
		onCreateSection: onCreateSection
			? () => onNaming?.({ rowId: null })
			: undefined,
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
			<RosterLiftFrame
				isLifting={drag.isLifting}
				ref={mergeRefs(frameRef, rosterLift.followRef)}
			>
				{hasPinnedZone ? (
					<PinnedZone
						collapsedSectionIds={collapsedSectionIds}
						drag={drag}
						entries={entries}
						onCollapseSection={onCollapseSection}
						onDeleteSection={onDeleteSection}
						onMoveSection={moveSection}
						onRenameSection={onRenameSection}
						rows={rows}
					/>
				) : null}
				{hasPinnedZone ? <RosterZoneSeparator /> : null}
				{hasSortedRows || isLifting ? (
					<RosterDropArea
						isLanding={drag.isLandingSorted}
						landing={SORTED_ZONE}
					>
						{hasSortedRows ? (
							recentMenuOf(sortedConversations, sortedBots, rows)
						) : (
							<SectionDropZone name={t("roster.label")} />
						)}
					</RosterDropArea>
				) : null}
			</RosterLiftFrame>
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
			<RosterMoveAnnouncement move={drag.move} />
		</>
	)
}

export { BotRoster }
