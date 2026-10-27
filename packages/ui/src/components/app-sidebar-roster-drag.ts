import { useState } from "react"

import {
	isSameLanding,
	type Landing,
	type PinnedEntry,
	SORTED,
	SORTED_ZONE,
} from "@workspace/ui/components/app-sidebar-pins"
import type { RosterEntries } from "@workspace/ui/components/app-sidebar-roster-layout"
import type { InsertionEdge } from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	dropAreaAt,
	useLiftLanding,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"

interface RosterDragSource {
	entries: RosterEntries
	onLand: (id: string, landing: Landing) => void
}

const useRosterDrag = ({ entries, onLand }: RosterDragSource) => {
	const { topLevel, pinnedEntries, blockOf, withoutBlock, topLevelWithout } =
		entries

	const [slots] = useState(() => new Map<string, HTMLElement>())

	const [cards] = useState(() => new Map<string, HTMLElement>())

	const keeping =
		(held: Map<string, HTMLElement>) =>
		(id: string) =>
		(node: HTMLElement | null) => {
			if (node) held.set(id, node)
			else held.delete(id)
		}

	const middleIn = (held: Map<string, HTMLElement>, id: string) => {
		const box = held.get(id)?.getBoundingClientRect()
		return box ? box.top + box.height / 2 : Number.POSITIVE_INFINITY
	}

	const isSectionLift = (id: string) =>
		Boolean(topLevel.find((entry) => entry.id === id)?.section)

	const landingAt = useStableCallback(
		(x: number, y: number, id: string): Landing | null => {
			const area = dropAreaAt(x, y)
			if (area === null) return null
			if (area === SORTED_ZONE) return SORTED
			if (isSectionLift(id))
				return {
					at: topLevelWithout(id).filter(
						(entry) => middleIn(cards, entry.id) < y,
					).length,
					holder: null,
				}
			return {
				at: withoutBlock(id).filter((entry) => middleIn(slots, entry.id) < y)
					.length,
				holder: entries.holderOf(area),
			}
		},
	)

	const rosterLift = useRosterLift({
		isEnabled: true,
		isSameLanding,
		landingAt,
		onLand,
	})

	const liftedId = rosterLift.lift?.id
	const liftedEntry = liftedId ? blockOf(liftedId)[0] : undefined
	const liftedSectionId = liftedEntry?.section?.id
	const held = useLiftLanding(rosterLift)
	const insertion = held === null || held === SORTED ? null : held
	const placedUnderLift = !liftedId
		? pinnedEntries
		: liftedSectionId
			? topLevelWithout(liftedId)
			: withoutBlock(liftedId)

	const holds = (entry: PinnedEntry | undefined, holder: string | null) =>
		entry !== undefined &&
		(entry.section ? holder === null : entry.sectionId === holder)

	const insertionMark = () => {
		if (!insertion) return null
		const { at, holder } = insertion
		if (holds(placedUnderLift[at], holder))
			return { id: placedUnderLift[at].id, edge: "above" as const }
		for (let rank = at - 1; rank >= 0; rank -= 1) {
			const above = placedUnderLift[rank]
			if (holds(above, holder)) return { id: above.id, edge: "below" as const }
		}
		return null
	}

	const mark = insertionMark()

	return {
		cardFor: keeping(cards),
		edgeAt: (id: string): InsertionEdge | undefined =>
			mark?.id === id ? mark.edge : undefined,
		insertion,
		isLandingSorted: held === SORTED,
		landingSection: liftedSectionId ? null : (insertion?.holder ?? null),
		liftedEntry,
		liftedSectionId,
		rosterLift,
		slotFor: keeping(slots),
	}
}

type RosterDrag = ReturnType<typeof useRosterDrag>

export { type RosterDrag, useRosterDrag }
