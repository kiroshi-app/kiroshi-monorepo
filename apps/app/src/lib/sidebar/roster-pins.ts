import type { RosterPin } from "@workspace/ui/components/app-sidebar"

export type PinnedRow = {
	id: string
	sectionId?: string | null
	pinPosition?: number | null
}

export type PinnedSection = {
	id: string
	position: number
}

type RosterPinsSource = {
	rows: PinnedRow[]
	sections: PinnedSection[]
}

type RankedPin = RosterPin & { rank: number; isSection: boolean }

const byRank = (one: RankedPin, other: RankedPin) => one.rank - other.rank

const toPin = ({ id, sectionId }: RankedPin): RosterPin => ({ id, sectionId })

export const isPinnedRow = (row: PinnedRow) =>
	(row.pinPosition ?? null) !== null

export const pinsOf = ({ rows, sections }: RosterPinsSource): RosterPin[] => {
	const knownSectionIds = new Set(sections.map((section) => section.id))

	const sectionOf = (row: PinnedRow) =>
		row.sectionId && knownSectionIds.has(row.sectionId) ? row.sectionId : null

	const rowsIn = (sectionId: string | null): RankedPin[] =>
		rows
			.filter((row) => isPinnedRow(row) && sectionOf(row) === sectionId)
			.map((row) => ({
				id: row.id,
				isSection: false,
				rank: row.pinPosition ?? 0,
				sectionId,
			}))
			.toSorted(byRank)

	const topLevel: RankedPin[] = [
		...sections.map((section) => ({
			id: section.id,
			isSection: true,
			rank: section.position,
			sectionId: null,
		})),
		...rowsIn(null),
	].toSorted(byRank)

	return topLevel
		.flatMap((entry) =>
			entry.isSection ? [entry, ...rowsIn(entry.id)] : entry,
		)
		.map(toPin)
}

export const pinsOfRowsNotShown = (
	rows: PinnedRow[],
	shownIds: Set<string>,
): RosterPin[] =>
	rows
		.filter((row) => isPinnedRow(row) && !shownIds.has(row.id))
		.map(({ id, sectionId }) => ({ id, sectionId: sectionId ?? null }))

export const withoutPin = (pins: RosterPin[], id: string) =>
	pins.filter((pin) => pin.id !== id)

export const pinnedLast = (pins: RosterPin[], id: string): RosterPin[] => [
	...withoutPin(pins, id),
	{ id, sectionId: null },
]

const endOfSection = (pins: RosterPin[], sectionId: string) => {
	const head = pins.findIndex((pin) => pin.id === sectionId)
	if (head < 0) return null
	let at = head + 1
	while (pins[at]?.sectionId === sectionId) at += 1
	return at
}

export const filedInSection = (
	pins: RosterPin[],
	id: string,
	sectionId: string,
): RosterPin[] | null => {
	const rest = withoutPin(pins, id)
	const at = endOfSection(rest, sectionId)
	if (at === null) return null
	return [...rest.slice(0, at), { id, sectionId }, ...rest.slice(at)]
}
