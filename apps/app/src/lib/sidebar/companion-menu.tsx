import { useMemo } from "react"

import type { RosterPin, Space } from "@workspace/ui/components/app-sidebar"
import {
	CompanionMenuContent,
	type CompanionMenuLookup,
} from "@workspace/ui/components/companion-menu"

import {
	filedInSection,
	isPinnedRow,
	type PinnedRow,
	type PinnedSection,
	pinnedLast,
	pinsOf,
	withoutPin,
} from "./roster-pins"
import type { SidebarActions } from "./use-sidebar-actions"

const NO_COMPANION_MENU: CompanionMenuLookup = () => null

export type CompanionMenuActions = Pick<
	SidebarActions,
	| "onAddBotToSpace"
	| "onDeleteBot"
	| "onDuplicateBot"
	| "onEditBot"
	| "onPinRoster"
	| "onRemoveBotFromSpace"
>

type CompanionRow = PinnedRow & { name: string }

type CompanionRosters = Record<string, CompanionRow[]>

type CompanionSection = PinnedSection & { name: string }

export type CompanionMenuSource = {
	actions: CompanionMenuActions
	rosters: CompanionRosters
	conversationRosters: Record<string, PinnedRow[]>
	sectionsBySpaceId: Record<string, CompanionSection[]>
	spaces: Space[]
	openSpaceId: string | null
}

export const spaceIdsOfBot = (rosters: CompanionRosters, botId: string) =>
	Object.entries(rosters)
		.filter(([, held]) => held.some((bot) => bot.id === botId))
		.map(([spaceId]) => spaceId)

export const useCompanionMenuLookup = ({
	actions,
	rosters,
	conversationRosters,
	sectionsBySpaceId,
	spaces,
	openSpaceId,
}: CompanionMenuSource): CompanionMenuLookup =>
	useMemo(() => {
		if (!openSpaceId) return NO_COMPANION_MENU

		const bots = rosters[openSpaceId] ?? []
		const sections = sectionsBySpaceId[openSpaceId] ?? []
		const pins = pinsOf({
			rows: [...(conversationRosters[openSpaceId] ?? []), ...bots],
			sections,
		})

		const repin = (next: RosterPin[]) => actions.onPinRoster(openSpaceId, next)

		const pin = (id: string) => repin(pinnedLast(pins, id))

		const unpin = (id: string) => repin(withoutPin(pins, id))

		const moveToSection = (id: string, sectionId: string | null) => {
			if (sectionId === null) {
				unpin(id)
				return
			}
			const filed = filedInSection(pins, id, sectionId)
			if (filed) repin(filed)
		}

		return (companionId: string) => {
			const companion = bots.find((bot) => bot.id === companionId)
			if (!companion) return null

			return (
				<CompanionMenuContent
					companion={companion}
					isPinned={isPinnedRow(companion)}
					memberships={spaceIdsOfBot(rosters, companionId)}
					onAddToSpace={actions.onAddBotToSpace}
					onDelete={actions.onDeleteBot}
					onDuplicate={actions.onDuplicateBot}
					onEdit={actions.onEditBot}
					onMoveToSection={sections.length > 0 ? moveToSection : undefined}
					onPin={pin}
					onRemoveFromSpace={actions.onRemoveBotFromSpace}
					onUnpin={unpin}
					openSpaceId={openSpaceId}
					sections={sections}
					spaces={spaces}
				/>
			)
		}
	}, [
		actions,
		rosters,
		conversationRosters,
		sectionsBySpaceId,
		spaces,
		openSpaceId,
	])
