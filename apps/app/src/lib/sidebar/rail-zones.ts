import type {
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar-model"
import type { CollapsedSidebarZone } from "@workspace/ui/components/collapsed-sidebar"

import { isPinnedRow, pinsOf } from "./roster-pins"

type RailZonesSource = {
	conversations: AppSidebarConversation[]
	sections: AppSidebarSection[]
}

const RECENT_ZONE_ID = "recent"

export const railZonesOf = ({
	conversations,
	sections,
}: RailZonesSource): CollapsedSidebarZone[] => {
	const conversationOf = new Map(
		conversations.map((conversation) => [conversation.id, conversation]),
	)
	const sectionOf = new Map(sections.map((section) => [section.id, section]))
	const zones: CollapsedSidebarZone[] = []

	for (const pin of pinsOf({ rows: conversations, sections })) {
		const section = sectionOf.get(pin.id)
		if (section) {
			zones.push({ id: section.id, name: section.name, conversations: [] })
			continue
		}
		const conversation = conversationOf.get(pin.id)
		if (!conversation) continue
		const last = zones.at(-1)
		const isFiledInSection = Boolean(pin.sectionId)
		if (last && (isFiledInSection || last.name === undefined)) {
			last.conversations.push(conversation)
			continue
		}
		zones.push({ id: `pinned-${pin.id}`, conversations: [conversation] })
	}

	return [
		...zones,
		{
			id: RECENT_ZONE_ID,
			conversations: conversations.filter(
				(conversation) => !isPinnedRow(conversation),
			),
		},
	]
}
