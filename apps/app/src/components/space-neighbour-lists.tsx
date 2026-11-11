import { PINNED_ZONE } from "@workspace/ui/components/app-sidebar-pins"
import type { RosterEntries } from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	type RosterRowsContext,
	rosterMenuOf,
} from "@workspace/ui/components/app-sidebar-roster-menu"
import { RosterDropArea } from "@workspace/ui/components/app-sidebar-roster-parts"
import { CollapsedSidebarList } from "@workspace/ui/components/collapsed-sidebar"
import {
	ExpandedSidebarList,
	type ExpandedSidebarSection,
} from "@workspace/ui/components/expanded-sidebar"
import type { Space } from "@workspace/ui/components/space"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

import { RecentRows } from "@/components/expanded-sidebar-rows"
import {
	drawnEntriesOf,
	namedSectionsOf,
	pinnedRowsOf,
} from "@/lib/sidebar/drawn-roster"
import { sidebarZonesOf } from "@/lib/sidebar/sidebar-zones"
import { useSpaceSidebarConversations } from "@/lib/sidebar/use-sidebar-conversations"

const IGNORED = () => undefined

const STILL_LIFT: Lifter = {
	handlersFor: () => ({ onPointerDown: IGNORED }),
	hasJustDropped: () => false,
}

const STILL_ROWS: RosterRowsContext = {
	keepFocus: IGNORED,
	lift: STILL_LIFT,
	membershipsOf: () => [],
	onMoveKey: IGNORED,
	sections: [],
	shiftOf: IGNORED,
	spaces: [],
}

const stillSectionsOf = (entries: RosterEntries): ExpandedSidebarSection[] =>
	namedSectionsOf(entries).map(({ id, name }) => {
		const heldRows = entries.rowsOf(id)
		return {
			id,
			name,
			isOpen: true,
			lift: STILL_LIFT,
			onOpenChange: IGNORED,
			rows:
				heldRows.length > 0 ? rosterMenuOf(heldRows, true, STILL_ROWS) : null,
			dropArea: { landing: id, isLanding: false },
		}
	})

type SpaceListProps = {
	spaceId: string
}

const ExpandedSpaceList = ({ spaceId }: SpaceListProps) => {
	const rows = useSpaceSidebarConversations(spaceId)
	const entries = drawnEntriesOf({ ...rows, naming: null })
	const pinnedRows = pinnedRowsOf(entries)

	return (
		<ExpandedSidebarList
			conversations={
				entries.sortedConversations.length > 0 ? (
					<RecentRows
						conversations={entries.sortedConversations}
						isLanding={false}
						isRowLifted={false}
						rows={STILL_ROWS}
					/>
				) : null
			}
			pinned={
				pinnedRows.length > 0 ? (
					<RosterDropArea isLanding={false} landing={PINNED_ZONE}>
						{rosterMenuOf(pinnedRows, true, STILL_ROWS)}
					</RosterDropArea>
				) : null
			}
			sections={stillSectionsOf(entries)}
		/>
	)
}

const RailSpaceList = ({ spaceId }: SpaceListProps) => (
	<CollapsedSidebarList
		zones={sidebarZonesOf(useSpaceSidebarConversations(spaceId))}
	/>
)

export const expandedSpaceListOf = (space: Space) => (
	<ExpandedSpaceList spaceId={space.id} />
)

export const railSpaceListOf = (space: Space) => (
	<RailSpaceList spaceId={space.id} />
)
