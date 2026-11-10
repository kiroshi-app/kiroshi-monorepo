import {
	createContext,
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
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	SectionLabel,
	SectionNameField,
} from "@workspace/ui/components/app-sidebar-section"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { i18n } from "@workspace/ui/lib/i18n"
import { mergeRefs } from "@workspace/ui/lib/utils"

import { isPinnedRow, pinsOfRowsNotShown } from "@/lib/sidebar/roster-pins"
import { useSidebarConversations } from "@/lib/sidebar/use-sidebar-conversations"
import { opensInNewTab } from "@/lib/tabs/new-tab-clicks"
import { isListPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
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

type RowSelection = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

const selectedRowIdOf = ({
	selectedBotId,
	selectedConversationId,
}: RowSelection) => selectedBotId ?? selectedConversationId ?? undefined

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
	const frameRef = useRef<HTMLDivElement>(null)

	const entries = rosterEntriesOf({
		bots: NO_AGENTS,
		conversations,
		naming: namedRow ? naming : null,
		sections,
	})
	const moves = rosterMovesOf({
		entries,
		spaceId,
		onPinRoster: (space, pins) =>
			actions.onPinRoster(space, [...pins, ...hiddenPins]),
	})
	const land = useStableCallback(moves.land)
	const fileRow = useStableCallback(moves.fileRow)
	const pinLast = useStableCallback(moves.pinLast)
	const unpin = useStableCallback(moves.unpin)
	const moveSection = useStableCallback(moves.moveSection)
	const drag = useRosterDrag({
		collapsedSectionIds,
		containerRef: frameRef,
		entries,
		onLand: land,
		onMoveSection: moveSection,
	})

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
	const openMission = useStableCallback(sidebar.onOpenMission)
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
		onMoveKey: drag.moveRowByKey,
		onMoveToSection: sections.length > 0 ? fileRow : undefined,
		onOpenConversationInNewTab: openInNewTab,
		onOpenConversationSettings: openSettings,
		onOpenMission: openMission,
		onPin: pinLast,
		onSelectConversation: selectRow,
		onUnpin: unpin,
		sections,
		selectedConversationId: selectedRowId,
		shiftOf: drag.isLifting ? drag.rowShiftOf : NO_SHIFT,
		spaceId,
		spaces: NO_SPACES,
	}

	const { sortedConversations, topLevel } = entries
	const isRowLifted = Boolean(drag.liftedEntry && !drag.liftedEntry.section)
	const hasPinnedZone = topLevel.length > 0 || isRowLifted
	const hasSortedRows = sortedConversations.length > 0

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
		conversations: (
			<>
				{hasSortedRows || isRowLifted ? (
					<RosterDropArea
						isLanding={drag.isLandingSorted}
						landing={SORTED_ZONE}
					>
						{hasSortedRows ? (
							recentMenuOf(sortedConversations, NO_AGENTS, rows)
						) : (
							<SectionDropZone />
						)}
					</RosterDropArea>
				) : null}
				{isNamingPinnedRow ? null : namingField}
			</>
		),
		frame: {
			isLifting: drag.isLifting,
			ref: mergeRefs(frameRef, drag.rosterLift.followRef),
		},
		move: drag.move,
		pinned: (
			<>
				{hasPinnedZone ? (
					<PinnedZone
						collapsedSectionIds={collapsedSectionIds}
						drag={drag}
						entries={entries}
						onCollapseSection={actions.onCollapseSection}
						onDeleteSection={actions.onDeleteSection}
						onMoveSection={moveSection}
						onRenameSection={actions.onRenameSection}
						rows={rows}
					/>
				) : null}
				{isNamingPinnedRow ? namingField : null}
			</>
		),
	}
}

type ExpandedSlots = Pick<
	ReturnType<typeof useExpandedRows>,
	"conversations" | "pinned"
>

const ExpandedSlotsContext = createContext<ExpandedSlots | null>(null)

const useExpandedSlots = () => {
	const slots = useContext(ExpandedSlotsContext)
	if (!slots) throw new Error("expanded rows are read outside their provider")
	return slots
}

const PinnedRows = () => useExpandedSlots().pinned

const ConversationRows = () => useExpandedSlots().conversations

export const EXPANDED_PINNED_ROWS = <PinnedRows />

export const EXPANDED_CONVERSATION_ROWS = <ConversationRows />

type ExpandedRowsProviderProps = {
	children: ReactNode
}

export const ExpandedRowsProvider = ({
	children,
}: ExpandedRowsProviderProps) => {
	const { conversations, frame, move, pinned } = useExpandedRows(
		useSidebarConversations(),
	)

	return (
		<ExpandedSlotsContext.Provider value={{ conversations, pinned }}>
			<RosterLiftFrame {...frame}>
				{children}
				<RosterMoveAnnouncement move={move} />
			</RosterLiftFrame>
		</ExpandedSlotsContext.Provider>
	)
}
