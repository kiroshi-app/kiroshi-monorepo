import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useContext,
	useRef,
	useState,
} from "react"

import type {
	AppSidebarConversation,
	AppSidebarSection,
	SectionNaming,
	SidebarClickModifiers,
} from "@workspace/ui/components/app-sidebar-model"
import {
	type Landing,
	PINNED_ZONE,
	type PinnedEntry,
	SORTED_ZONE,
} from "@workspace/ui/components/app-sidebar-pins"
import {
	emptySlotOf,
	headSlotOf,
	type RosterDrag,
	useRosterDrag,
} from "@workspace/ui/components/app-sidebar-roster-drag"
import {
	type RosterEntries,
	rosterEntriesOf,
	rosterMovesOf,
} from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	type RosterRowsContext,
	recentMenuOf,
	rosterMenuOf,
} from "@workspace/ui/components/app-sidebar-roster-menu"
import {
	RosterDropArea,
	RosterLiftFrame,
	type RosterMove,
	RosterMoveAnnouncement,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	SectionLabel,
	SectionNameField,
} from "@workspace/ui/components/app-sidebar-section"
import type { ExpandedSidebarProps } from "@workspace/ui/components/expanded-sidebar"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { i18n } from "@workspace/ui/lib/i18n"
import { mergeRefs } from "@workspace/ui/lib/utils"

import {
	dragEntriesOf,
	drawnLandingOf,
	namedSectionsOf,
	pinnedRowsOf,
	rowKeyMoveOf,
	sectionsDrawnAfterPins,
} from "@/lib/sidebar/drawn-roster"
import { isPinnedRow, pinsOfRowsNotShown } from "@/lib/sidebar/roster-pins"
import { useSidebarConversations } from "@/lib/sidebar/use-sidebar-conversations"
import { opensInNewTab } from "@/lib/tabs/new-tab-clicks"
import { isListPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
import { useSharedStructure } from "@/lib/use-shared-structure"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

const NO_AGENTS: never[] = []

const NO_SPACES: never[] = []

const NO_MEMBERSHIPS = () => []

const NO_SHIFT = () => undefined

type NamingRowProps = {
	namedRow: AppSidebarConversation
	onCancel: () => void
	onCreate: (name: string) => void
	rows: RosterRowsContext
}

const NamingRow = ({ namedRow, onCancel, onCreate, rows }: NamingRowProps) => (
	<>
		<SectionLabel>
			<SectionNameField
				ariaLabel={i18n.t("bots:roster.section.createField")}
				initialName={i18n.t("bots:roster.section.createDefault")}
				onCancel={onCancel}
				onCommit={onCreate}
			/>
		</SectionLabel>
		{recentMenuOf([namedRow], NO_AGENTS, rows)}
	</>
)

type RecentRowsProps = {
	conversations: AppSidebarConversation[]
	isLanding: boolean
	isRowLifted: boolean
	rows: RosterRowsContext
}

export const RecentRows = ({
	conversations,
	isLanding,
	isRowLifted,
	rows,
}: RecentRowsProps) => {
	if (conversations.length === 0 && !isRowLifted) return null
	return (
		<RosterDropArea isLanding={isLanding} landing={SORTED_ZONE}>
			{conversations.length > 0 ? (
				recentMenuOf(conversations, NO_AGENTS, rows)
			) : (
				<SectionDropZone />
			)}
		</RosterDropArea>
	)
}

type PinnedAreaProps = {
	drag: RosterDrag
	isOnlySlot: boolean
	pinnedRows: PinnedEntry[]
	rows: RosterRowsContext
}

const PinnedArea = ({
	drag,
	isOnlySlot,
	pinnedRows,
	rows,
}: PinnedAreaProps) => {
	const isEmpty = pinnedRows.length === 0
	return (
		<RosterDropArea
			isLanding={isEmpty && drag.isPinnedLanding && !drag.landingSection}
			landing={PINNED_ZONE}
			slotId={isOnlySlot ? PINNED_ZONE : undefined}
		>
			{isEmpty ? (
				<SectionDropZone label={i18n.t("bots:roster.pinDrop")} />
			) : (
				rosterMenuOf(pinnedRows, true, rows)
			)}
		</RosterDropArea>
	)
}

type RowSelection = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

const selectedRowIdOf = ({
	selectedBotId,
	selectedConversationId,
}: RowSelection) => selectedBotId ?? selectedConversationId ?? undefined

type SlotPresenceSource = {
	hasNamedRow: boolean
	isNamingPinnedRow: boolean
	isRowLifted: boolean
	pinnedRowCount: number
	recentRowCount: number
}

const slotPresenceOf = ({
	hasNamedRow,
	isNamingPinnedRow,
	isRowLifted,
	pinnedRowCount,
	recentRowCount,
}: SlotPresenceSource) => ({
	hasPinned: pinnedRowCount > 0 || isRowLifted || isNamingPinnedRow,
	hasConversations:
		recentRowCount > 0 || isRowLifted || (hasNamedRow && !isNamingPinnedRow),
})

type ExpandedRowContents = {
	conversations: ReactNode
	pinned: ReactNode
	rowsOfSection: (sectionId: string) => ReactNode
}

const ExpandedRowContentsContext = createContext<ExpandedRowContents | null>(
	null,
)

const useExpandedRowContents = () => {
	const contents = useContext(ExpandedRowContentsContext)
	if (!contents)
		throw new Error("expanded rows are read outside their provider")
	return contents
}

type SectionRowsProps = {
	sectionId: string
}

const SectionRows = ({ sectionId }: SectionRowsProps) =>
	useExpandedRowContents().rowsOfSection(sectionId)

type SectionActionSource = Pick<
	ReturnType<typeof useWorkspace>["rosterLines"]["sidebarActions"],
	"onCollapseSection" | "onDeleteSection" | "onRenameSection"
>

type SectionSlotsSource = {
	actions: SectionActionSource
	collapsedSectionIds: string[]
	drag: RosterDrag
	entries: RosterEntries
	onMove: (id: string, by: number) => void
}

const useSectionSlots = ({
	actions,
	collapsedSectionIds,
	drag,
	entries,
	onMove,
}: SectionSlotsSource): NonNullable<ExpandedSidebarProps["sections"]> => {
	const states = useSharedStructure(
		namedSectionsOf(entries).map(({ id, name }) => {
			const isLifted = id === drag.liftedSectionId
			return {
				id,
				name,
				isEmpty: entries.rowsOf(id).length === 0,
				isOpen: !collapsedSectionIds.includes(id),
				isLanding: drag.landingSection === id,
				isGiving: drag.isGiving(id),
				isReceiving: drag.isReceiving(id),
				isLifted,
				isSliding: drag.isLifting && !isLifted,
				shift: drag.cardShiftOf(id),
			}
		}),
	)
	const collapse = useStableCallback((id: string, isOpen: boolean) =>
		actions.onCollapseSection(id, !isOpen),
	)
	const moveByKey = useStableCallback(drag.moveSectionByKey)
	const rename = useStableCallback(actions.onRenameSection)
	const remove = useStableCallback(actions.onDeleteSection)
	const handlersFor = useStableCallback(drag.rosterLift.handlersFor)
	const hasJustDropped = useStableCallback(drag.rosterLift.hasJustDropped)
	const { keepFocus } = drag
	const lift = { handlersFor, hasJustDropped }

	return states.map(({ id, name, isEmpty, isOpen, ...dropArea }) => ({
		id,
		name,
		isOpen,
		lift,
		rows: isEmpty ? (
			<SectionDropZone align="start" slotId={emptySlotOf(id)} />
		) : (
			<SectionRows sectionId={id} />
		),
		headSlotId: headSlotOf(id),
		onDelete: remove,
		onMove,
		onMoveKey: (event) => moveByKey(id, event),
		onOpenChange: (next) => collapse(id, next),
		onRename: rename,
		dropArea: {
			...dropArea,
			landing: id,
			slotId: id,
			ref: (node) => keepFocus(id, node),
		},
	}))
}

type ExpandedRowsSource = {
	conversations: AppSidebarConversation[]
	sections: AppSidebarSection[]
}

const useExpandedRows = ({ conversations, sections }: ExpandedRowsSource) => {
	const { collapsedSectionIds, rosterLines, rosterView, tabs } = useWorkspace()
	const isListShown = usePageShown(tabs, isListPage)
	const { frame, rosterLists } = useWorkspaceFrame()
	const { rowMenu, sidebar } = frame
	const actions = rosterLines.sidebarActions
	const spaceId = rosterView.rosteredSpaceId ?? undefined
	const selectedRowId = isListShown ? selectedRowIdOf(rosterView) : undefined
	const hiddenPins = pinsOfRowsNotShown(
		rosterLists.rosterBots,
		new Set(conversations.map(({ id }) => id)),
	)
	const [naming, setNaming] = useState<SectionNaming | null>(null)
	const namedRow = conversations.find(({ id }) => id === naming?.rowId)
	const [crossingMove, setCrossingMove] = useState<RosterMove | null>(null)
	const frameRef = useRef<HTMLDivElement>(null)

	const entries = rosterEntriesOf({
		bots: NO_AGENTS,
		conversations,
		naming: namedRow ? naming : null,
		sections: sectionsDrawnAfterPins(conversations, sections),
	})
	const moves = rosterMovesOf({
		entries,
		spaceId,
		onPinRoster: (space, pins) =>
			actions.onPinRoster(space, [...pins, ...hiddenPins]),
	})
	const land = useStableCallback((id: string, landing: Landing) => {
		setCrossingMove(null)
		moves.land(id, drawnLandingOf(entries, id, landing))
	})
	const fileRow = useStableCallback(moves.fileRow)
	const pinLast = useStableCallback(moves.pinLast)
	const unpin = useStableCallback(moves.unpin)
	const moveSection = useStableCallback((id: string, by: number) => {
		setCrossingMove(null)
		moves.moveSection(id, by)
	})
	const drag = useRosterDrag({
		collapsedSectionIds,
		containerRef: frameRef,
		entries: dragEntriesOf(entries),
		onLand: land,
		onMoveSection: moveSection,
	})
	const moveRowByKey = useStableCallback(
		(id: string, event: KeyboardEvent<HTMLElement>) => {
			const keyMove = rowKeyMoveOf(entries, id, event)
			if (keyMove.kind === "walk") {
				drag.moveRowByKey(id, event)
				return
			}
			if (keyMove.kind === "stop") return
			event.preventDefault()
			setCrossingMove(keyMove.move)
			moves.land(id, keyMove.landing)
		},
	)

	const selectRow = useStableCallback(
		(id: string, modifiers?: SidebarClickModifiers) => {
			if (opensInNewTab(modifiers)) {
				rowMenu.onOpenInNewTab(id)
				return
			}
			sidebar.onOpenConversation(id)
		},
	)
	const deleteRow = useStableCallback((id: string) => {
		if (rowMenu.isAgent(id)) {
			rowMenu.onOpenAgentDangerZone(id)
			return
		}
		void actions.onDeleteConversation(id)
	})
	const openInNewTab = useStableCallback(rowMenu.onOpenInNewTab)
	const openSettings = useStableCallback(rowMenu.onOpenSettings)
	const createSectionFor = useStableCallback((rowId: string) =>
		setNaming({ rowId }),
	)

	const rows: RosterRowsContext = {
		keepFocus: drag.keepFocus,
		lift: drag.rosterLift,
		liftedId: drag.liftedId,
		membershipsOf: NO_MEMBERSHIPS,
		onCreateSectionFor: createSectionFor,
		onDeleteConversation: deleteRow,
		onMoveKey: moveRowByKey,
		onMoveToSection: sections.length > 0 ? fileRow : undefined,
		onOpenConversationInNewTab: openInNewTab,
		onOpenConversationSettings: openSettings,
		onPin: pinLast,
		onSelectConversation: selectRow,
		onUnpin: unpin,
		sections,
		selectedConversationId: selectedRowId,
		shiftOf: drag.isLifting ? drag.rowShiftOf : NO_SHIFT,
		spaceId,
		spaces: NO_SPACES,
	}

	const { rowsOf, sortedConversations, topLevel } = entries
	const pinnedRows = pinnedRowsOf(entries)
	const isRowLifted = Boolean(drag.liftedEntry && !drag.liftedEntry.section)
	const hasPinnedArea = pinnedRows.length > 0 || isRowLifted
	const sectionSlots = useSectionSlots({
		actions,
		collapsedSectionIds,
		drag,
		entries,
		onMove: moveSection,
	})

	const namingField = namedRow ? (
		<NamingRow
			namedRow={namedRow}
			onCancel={() => setNaming(null)}
			onCreate={(name) => {
				setNaming(null)
				actions.onCreateSection(name, namedRow.id)
			}}
			rows={rows}
		/>
	) : null
	const isNamingPinnedRow = namedRow ? isPinnedRow(namedRow) : false

	return {
		...slotPresenceOf({
			hasNamedRow: Boolean(namedRow),
			isNamingPinnedRow,
			isRowLifted,
			pinnedRowCount: pinnedRows.length,
			recentRowCount: sortedConversations.length,
		}),
		conversations: (
			<>
				<RecentRows
					conversations={sortedConversations}
					isLanding={drag.isLandingSorted}
					isRowLifted={isRowLifted}
					rows={rows}
				/>
				{isNamingPinnedRow ? null : namingField}
			</>
		),
		frame: {
			isLifting: drag.isLifting,
			ref: mergeRefs(frameRef, drag.rosterLift.followRef),
		},
		move: crossingMove ?? drag.move,
		pinned: (
			<>
				{hasPinnedArea ? (
					<PinnedArea
						drag={drag}
						isOnlySlot={topLevel.length === 0}
						pinnedRows={pinnedRows}
						rows={rows}
					/>
				) : null}
				{isNamingPinnedRow ? namingField : null}
			</>
		),
		rowsOfSection: (sectionId: string) =>
			rosterMenuOf(rowsOf(sectionId), true, rows),
		sectionSlots,
	}
}

const PinnedRows = () => useExpandedRowContents().pinned

const ConversationRows = () => useExpandedRowContents().conversations

const PINNED_ROWS = <PinnedRows />

const CONVERSATION_ROWS = <ConversationRows />

type ExpandedSlotElements = Pick<
	ExpandedSidebarProps,
	"conversations" | "pinned" | "sections"
>

const ExpandedSlotElementsContext = createContext<ExpandedSlotElements | null>(
	null,
)

export const useExpandedSlotElements = () => {
	const elements = useContext(ExpandedSlotElementsContext)
	if (!elements)
		throw new Error("expanded rows are read outside their provider")
	return elements
}

type ExpandedRowsProviderProps = {
	children: ReactNode
}

export const ExpandedRowsProvider = ({
	children,
}: ExpandedRowsProviderProps) => {
	const {
		conversations,
		frame,
		hasConversations,
		hasPinned,
		move,
		pinned,
		rowsOfSection,
		sectionSlots,
	} = useExpandedRows(useSidebarConversations())
	const elements = {
		pinned: hasPinned ? PINNED_ROWS : null,
		conversations: hasConversations ? CONVERSATION_ROWS : null,
		sections: sectionSlots,
	}

	return (
		<ExpandedRowContentsContext.Provider
			value={{ conversations, pinned, rowsOfSection }}
		>
			<ExpandedSlotElementsContext.Provider value={elements}>
				<RosterLiftFrame {...frame}>
					{children}
					<RosterMoveAnnouncement move={move} />
				</RosterLiftFrame>
			</ExpandedSlotElementsContext.Provider>
		</ExpandedRowContentsContext.Provider>
	)
}
