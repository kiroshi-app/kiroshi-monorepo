import { type KeyboardEvent, type RefObject, useState } from "react"

import {
	type Landing,
	PINNED_ZONE,
	type PinnedEntry,
	SORTED,
	SORTED_ZONE,
} from "@workspace/ui/components/app-sidebar-pins"
import type { RosterEntries } from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	ROSTER_SLOT,
	type RosterMove,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { dropAreaAt, useLiftLanding } from "@workspace/ui/hooks/use-roster-lift"
import {
	type SlideGeometry,
	type SlideShift,
	slideLandingIn,
	useSlidingLift,
} from "@workspace/ui/hooks/use-sliding-lift"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"

type PinnedLanding = Exclude<Landing, typeof SORTED>

const NOWHERE = "nowhere"

type SlideLanding = number | typeof SORTED | typeof NOWHERE

const FOCUSABLE =
	'[data-slot="roster-section-trigger"], [data-slot="sidebar-menu-button"]'

const headSlotOf = (sectionId: string) => `${sectionId}:head`

const emptySlotOf = (sectionId: string) => `${sectionId}:empty`

const slotIdOf = (entry: PinnedEntry) =>
	entry.section ? headSlotOf(entry.id) : entry.id

const STEP: Record<SlideShift, number> = { start: -1, end: 1 }

const stepOf = (shift: SlideShift | undefined) => (shift ? STEP[shift] : 0)

const shiftWithin = (
	own: SlideShift | undefined,
	card: SlideShift | undefined,
): SlideShift | undefined => {
	const step = stepOf(own) - stepOf(card)
	if (step < 0) return "start"
	if (step > 0) return "end"
	return undefined
}

const holdersAt = (rest: PinnedEntry[], at: number) => {
	const next = rest[at]
	if (next && !next.section && next.sectionId) return [next.sectionId]
	const previous = rest[at - 1]
	const closing = previous ? (previous.section?.id ?? previous.sectionId) : null
	return closing ? [closing, null] : [null]
}

const keyStepOf = (event: KeyboardEvent<HTMLElement>) => {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
		return 0
	if (event.key === "ArrowUp") return -1
	if (event.key === "ArrowDown") return 1
	return 0
}

const nameOf = ({ section, bot, conversation }: PinnedEntry) =>
	section?.name ?? bot?.name ?? conversation?.name ?? ""

interface RosterDragSource {
	entries: RosterEntries
	collapsedSectionIds: string[]
	containerRef: RefObject<HTMLElement | null>
	onLand: (id: string, landing: Landing) => void
	onMoveSection: (id: string, by: number) => void
}

const useRosterDrag = ({
	entries,
	collapsedSectionIds,
	containerRef,
	onLand,
	onMoveSection,
}: RosterDragSource) => {
	const { topLevel, pinnedEntries, blockOf, withoutBlock, holderOf, rowsOf } =
		entries
	const [pointerHolder, setPointerHolder] = useState<string | null>(null)
	const [move, setMove] = useState<RosterMove | null>(null)
	const [focusKept] = useState(() => ({
		id: null as string | null,
		held: new Map<string, HTMLElement>(),
	}))

	const isShown = ({ section, sectionId }: PinnedEntry) =>
		Boolean(section) ||
		sectionId === null ||
		!collapsedSectionIds.includes(sectionId)

	const slotsOf = (entry: PinnedEntry) =>
		entry.section &&
		rowsOf(entry.id).length === 0 &&
		!collapsedSectionIds.includes(entry.id)
			? [headSlotOf(entry.id), emptySlotOf(entry.id)]
			: [slotIdOf(entry)]

	const rowZone =
		topLevel.length > 0
			? pinnedEntries.filter(isShown).flatMap(slotsOf)
			: [PINNED_ZONE]

	const isSectionLift = (id: string) =>
		Boolean(topLevel.find((entry) => entry.id === id)?.section)

	const pointerHolderAt = (x: number, y: number) => {
		const area = dropAreaAt(x, y)
		return area === null || area === SORTED_ZONE ? null : holderOf(area)
	}

	const atOf = (id: string, rank: number) => {
		const rest = withoutBlock(id)
		const target = rowZone.filter((slot) => slot !== id)[rank]
		const at = rest.findIndex((entry) => slotIdOf(entry) === target)
		if (at >= 0) return at
		const head = rest.findIndex((entry) => emptySlotOf(entry.id) === target)
		return head < 0 ? rest.length : head + 1
	}

	const pinnedLandingOf = (
		id: string,
		rank: number,
		pointer: string | null,
	): PinnedLanding => {
		if (isSectionLift(id)) return { at: rank, holder: null }
		const at = atOf(id, rank)
		const holders = holdersAt(withoutBlock(id), at)
		return { at, holder: holders.includes(pointer) ? pointer : holders[0] }
	}

	const landingAt = (
		x: number,
		y: number,
		geometry: SlideGeometry,
	): SlideLanding => {
		const area = dropAreaAt(x, y)
		if (area === null) return NOWHERE
		if (area === SORTED_ZONE) return SORTED
		const id = geometry.liftedId
		if (isSectionLift(id)) return slideLandingIn(geometry, x, y)
		const pointer = holderOf(area)
		const rest = withoutBlock(id)
		const holdersOf = (rank: number) => holdersAt(rest, atOf(id, rank))
		const gap = geometry.shift - geometry.rest.height
		const slots = geometry.slots.map((slot, index) => {
			const previous = geometry.slots[index - 1]
			const [closing, outer] = holdersOf(slot.rank)
			return previous &&
				slot.rank < geometry.origin &&
				outer === null &&
				closing === pointer
				? { ...slot, start: previous.end + gap }
				: slot
		})
		return slideLandingIn({ ...geometry, slots }, x, y, (rank) =>
			holdersOf(rank).includes(pointer),
		)
	}

	const slide = useSlidingLift<SlideLanding>({
		axis: "y",
		slot: `[${ROSTER_SLOT}]`,
		idAttribute: ROSTER_SLOT,
		zones: [rowZone, topLevel.map((entry) => entry.id)],
		entryZone: rowZone,
		containerRef,
		isEnabled: true,
		landingOutside: landingAt,
		onLift: () => setPointerHolder(null),
		onMove: (_id, _landing, moved) =>
			setPointerHolder(pointerHolderAt(moved.clientX, moved.clientY)),
		onLand: (id, landing, released) => {
			if (landing === NOWHERE) return
			onLand(
				id,
				landing === SORTED
					? SORTED
					: pinnedLandingOf(
							id,
							landing,
							pointerHolderAt(released.clientX, released.clientY),
						),
			)
		},
	})

	const rosterLift = slide.lift
	const liftedId = rosterLift.lift?.id
	const liftedEntry = liftedId ? blockOf(liftedId)[0] : undefined
	const liftedSectionId = liftedEntry?.section?.id
	const landing = useLiftLanding(rosterLift)
	const pinnedLanding =
		liftedId && typeof landing === "number"
			? pinnedLandingOf(liftedId, landing, pointerHolder)
			: null
	const landingSection = liftedSectionId
		? null
		: (pinnedLanding?.holder ?? null)

	const shiftOfSlot = (slotId: string) =>
		typeof landing === "number" ? slide.shiftOf(slotId, landing) : undefined

	const cardShiftOf = (sectionId: string) =>
		shiftOfSlot(liftedSectionId ? sectionId : headSlotOf(sectionId))

	const rowShiftOf = (entry: PinnedEntry) => {
		const own = shiftOfSlot(entry.id)
		if (liftedSectionId || !isShown(entry) || !entry.sectionId) return own
		return shiftWithin(own, shiftOfSlot(headSlotOf(entry.sectionId)))
	}

	const keepFocus = useStableCallback(
		(id: string, node: HTMLElement | null) => {
			if (node) {
				focusKept.held.set(id, node)
				if (focusKept.id !== id) return
				focusKept.id = null
				node.querySelector<HTMLElement>(FOCUSABLE)?.focus()
				return
			}
			if (focusKept.held.get(id)?.contains(document.activeElement))
				focusKept.id = id
			focusKept.held.delete(id)
		},
	)

	const moveRowByKey = useStableCallback(
		(id: string, event: KeyboardEvent<HTMLElement>) => {
			const step = keyStepOf(event)
			if (step === 0) return
			event.preventDefault()
			const from = pinnedEntries.findIndex((entry) => entry.id === id)
			const lifted = pinnedEntries[from]
			if (!lifted) return
			const rest = withoutBlock(id)
			const positions = Array.from({ length: rowZone.length }, (_, rank) =>
				atOf(id, rank),
			)
				.flatMap((at) => holdersAt(rest, at).map((holder) => ({ at, holder })))
				.filter(
					(position, rank, all) =>
						all.findIndex(
							({ at, holder }) =>
								at === position.at && holder === position.holder,
						) === rank,
				)
			const current = positions.findIndex(
				({ at, holder }) => at === from && holder === lifted.sectionId,
			)
			const to = current < 0 ? undefined : positions[current + step]
			if (!to) return
			const siblings = [
				...rest.slice(0, to.at),
				{ ...lifted, sectionId: to.holder },
				...rest.slice(to.at),
			].filter((entry) => entry.sectionId === to.holder)
			setMove({
				name: nameOf(lifted),
				position: siblings.findIndex((entry) => entry.id === id) + 1,
				count: siblings.length,
				section: topLevel.find((entry) => entry.id === to.holder)?.section
					?.name,
			})
			onLand(id, to)
		},
	)

	const moveSectionByKey = (id: string, event: KeyboardEvent<HTMLElement>) => {
		const step = keyStepOf(event)
		if (step === 0) return
		event.preventDefault()
		const from = topLevel.findIndex((entry) => entry.id === id)
		const to = from + step
		if (from < 0 || to < 0 || to >= topLevel.length) return
		setMove({
			name: nameOf(topLevel[from]),
			position: to + 1,
			count: topLevel.length,
		})
		onMoveSection(id, step)
	}

	return {
		cardShiftOf,
		isLandingSorted: landing === SORTED,
		isLifting: Boolean(liftedId),
		isPinnedLanding: pinnedLanding !== null,
		isReceiving: (sectionId: string) =>
			landingSection === sectionId && liftedEntry?.sectionId !== sectionId,
		landingSection,
		liftedEntry,
		liftedId,
		liftedSectionId,
		move,
		moveRowByKey,
		moveSectionByKey,
		rosterLift,
		keepFocus,
		rowShiftOf,
	}
}

type RosterDrag = ReturnType<typeof useRosterDrag>

export { emptySlotOf, headSlotOf, type RosterDrag, useRosterDrag }
