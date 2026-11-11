import type { BotBadge as ShownBadge } from "@workspace/ui/components/bot-badge"

import type { BotBadge } from "./bot-badge"

import { rosterLineKey } from "../bots/roster-line"

type BadgedRow = {
	id: string
}

type BadgeCarrier = {
	badge?: ShownBadge
}

type BadgeCarriersBySpaceId = Record<string, BadgeCarrier[]>

type Badged<Row> = Row & BadgeCarrier

const STRONGEST_FIRST: ShownBadge[] = ["attention", "failed", "done"]

const shownBadge = (badge: BotBadge | undefined): ShownBadge | undefined =>
	badge === undefined || badge === "none" ? undefined : badge

export const withBadges = <Row extends BadgedRow>(
	rows: Row[],
	badges: Record<string, BotBadge>,
): Badged<Row>[] =>
	rows.map((row) => ({ ...row, badge: shownBadge(badges[row.id]) }))

export const withLineBadges = <Row extends BadgedRow>(
	rows: Row[],
	badges: Record<string, BotBadge>,
	spaceId: string | null,
): Badged<Row>[] =>
	rows.map((row) => ({
		...row,
		badge:
			spaceId === null
				? undefined
				: shownBadge(badges[rosterLineKey({ spaceId, botId: row.id })]),
	}))

const strongestBadge = (rows: BadgeCarrier[]): ShownBadge | undefined =>
	STRONGEST_FIRST.find((badge) => rows.some((row) => row.badge === badge))

export const toSpaceBadges = (
	...groups: BadgeCarriersBySpaceId[]
): Record<string, ShownBadge> => {
	const spaceIds = new Set(groups.flatMap((group) => Object.keys(group)))
	const badges: Record<string, ShownBadge> = {}
	for (const spaceId of spaceIds) {
		const badge = strongestBadge(
			groups.flatMap((group) => group[spaceId] ?? []),
		)
		if (badge) {
			badges[spaceId] = badge
		}
	}
	return badges
}
