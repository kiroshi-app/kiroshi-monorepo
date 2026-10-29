import type { BotBadge as ShownBadge } from "@workspace/ui/components/bot-badge"

import type { SoloThreads } from "../bots/roster-line"
import type { ConversationHostStates } from "../bots/roster-pages"
import type { BotBadge } from "../chat/bot-badge"
import { withBadges, withLineBadges } from "../chat/sidebar-badges"
import { botHostStatesIn, withNeedsYou } from "../conversations/host-state-rows"

type RosterRow = {
	id: string
}

export type WaitingRoster = {
	rosters: Record<string, RosterRow[]>
	conversationRosters: Record<string, RosterRow[]>
	soloThreads: SoloThreads
	hostStates: ConversationHostStates
}

export type WaitingBadges = {
	botBadges: Record<string, BotBadge>
	conversationBadges: Record<string, BotBadge>
}

const isWaiting = ({ badge }: { badge?: ShownBadge }) =>
	badge === "attention" || badge === "failed"

const botRowsOf = (roster: WaitingRoster, badges: WaitingBadges) =>
	Object.entries(roster.rosters).flatMap(([spaceId, bots]) =>
		withNeedsYou(
			withLineBadges(bots, badges.botBadges, spaceId),
			botHostStatesIn({
				hostStates: roster.hostStates,
				soloThreads: roster.soloThreads,
				spaceId,
			}),
		),
	)

const conversationRowsOf = (roster: WaitingRoster, badges: WaitingBadges) =>
	Object.values(roster.conversationRosters).flatMap((rooms) =>
		withNeedsYou(
			withBadges(rooms, badges.conversationBadges),
			roster.hostStates,
		),
	)

export const countWaitingRows = (
	roster: WaitingRoster,
	badges: WaitingBadges,
): number =>
	[...botRowsOf(roster, badges), ...conversationRowsOf(roster, badges)].filter(
		isWaiting,
	).length
