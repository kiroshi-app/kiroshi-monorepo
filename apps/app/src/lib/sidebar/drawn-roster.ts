import type { KeyboardEvent } from "react"

import type {
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar-model"
import {
	endOfSection,
	type Landing,
	SORTED,
} from "@workspace/ui/components/app-sidebar-pins"
import type { RosterEntries } from "@workspace/ui/components/app-sidebar-roster-layout"
import type { RosterMove } from "@workspace/ui/components/app-sidebar-roster-parts"

export const sectionsDrawnAfterPins = (
	conversations: AppSidebarConversation[],
	sections: AppSidebarSection[],
) => {
	const firstFreeRank =
		Math.max(-1, ...conversations.map((row) => row.pinPosition ?? -1)) + 1
	return sections.map((section) => ({
		...section,
		position: section.position + firstFreeRank,
	}))
}

export const pinnedRowsOf = ({ topLevel }: RosterEntries) =>
	topLevel.filter(({ section }) => !section)

export const namedSectionsOf = ({ topLevel }: RosterEntries) =>
	topLevel.flatMap(({ section }) => (section ? [section] : []))

export const dragEntriesOf = (entries: RosterEntries): RosterEntries => {
	const sectionHeads = entries.topLevel.filter(({ section }) => section)
	return sectionHeads.length > 0
		? { ...entries, topLevel: sectionHeads }
		: entries
}

export const drawnLandingOf = (
	entries: RosterEntries,
	id: string,
	landing: Landing,
): Landing => {
	if (!entries.blockOf(id)[0]?.section) return landing
	return {
		holder: null,
		at:
			landing === SORTED
				? entries.topLevel.length - 1
				: landing.at + pinnedRowsOf(entries).length,
	}
}

type RowKeyMove =
	| { kind: "walk" }
	| { kind: "stop" }
	| { kind: "cross"; landing: Landing; move: RosterMove }

const WALK: RowKeyMove = { kind: "walk" }

const STOP: RowKeyMove = { kind: "stop" }

const keyStepOf = (event: KeyboardEvent<HTMLElement>) => {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
		return 0
	if (event.key === "ArrowUp") return -1
	if (event.key === "ArrowDown") return 1
	return 0
}

export const rowKeyMoveOf = (
	entries: RosterEntries,
	id: string,
	event: KeyboardEvent<HTMLElement>,
): RowKeyMove => {
	const step = keyStepOf(event)
	const row = entries.blockOf(id)[0]
	if (step === 0 || !row?.sectionId) return WALK
	const held = entries.rowsOf(row.sectionId)
	const edgeRow = step > 0 ? held.at(-1) : held[0]
	if (edgeRow?.id !== id) return WALK
	const sections = namedSectionsOf(entries)
	const neighbour =
		sections[
			sections.findIndex((section) => section.id === row.sectionId) + step
		]
	if (!neighbour) return step > 0 ? STOP : WALK
	const rest = entries.withoutBlock(id)
	const count = entries.rowsOf(neighbour.id).length + 1
	return {
		kind: "cross",
		landing: {
			holder: neighbour.id,
			at:
				step > 0
					? rest.findIndex((entry) => entry.id === neighbour.id) + 1
					: endOfSection(rest, neighbour.id),
		},
		move: {
			name: row.conversation?.name ?? row.bot?.name ?? "",
			position: step > 0 ? 1 : count,
			count,
			section: neighbour.name,
		},
	}
}
