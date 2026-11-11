import type {
	AppSidebarProps,
	AppSidebarRowMission,
} from "@workspace/ui/components/app-sidebar"
import type {
	BotBadge,
	BotMissionState,
} from "@workspace/ui/components/bot-badge"
import type { SpaceHost } from "@workspace/ui/components/host-pill"

import { type SceneSpace, SPACES } from "./scene-cast"

type SceneRail = Pick<
	AppSidebarProps,
	"badgesBySpaceId" | "hostBySpaceId" | "space" | "spaceHost"
>

type BadgeCarrier = {
	badge?: BotBadge
}

type MissionCarrier = {
	missions?: AppSidebarRowMission[]
}

const STRONGEST_FIRST: BotBadge[] = ["attention", "failed", "done"]

const RING_BADGE_OF: Partial<Record<BotMissionState, BotBadge>> = {
	waiting: "attention",
	failed: "failed",
	ready: "done",
}

const HOST_BY_SPACE: Record<string, SpaceHost> = {}

const strongestBadge = (rows: BadgeCarrier[]) =>
	STRONGEST_FIRST.find((badge) => rows.some((row) => row.badge === badge))

const missionRingsOf = (rows: MissionCarrier[]): BadgeCarrier[] =>
	rows.map((row) => ({
		badge: row.missions?.[0] && RING_BADGE_OF[row.missions[0].state],
	}))

const badgesBySpaceOf = (spaces: SceneSpace[]): Record<string, BotBadge> =>
	Object.fromEntries(
		spaces.flatMap((space) => {
			const badge = strongestBadge([
				...space.rows,
				...space.conversations,
				...missionRingsOf(space.rows),
				...missionRingsOf(space.conversations),
			])
			return badge ? [[space.id, badge]] : []
		}),
	)

export const sceneRailOf = (
	spaces: SceneSpace[],
	selected: SceneSpace,
): SceneRail => ({
	badgesBySpaceId: badgesBySpaceOf(spaces),
	hostBySpaceId: HOST_BY_SPACE,
	space: SPACES.find((space) => space.id === selected.id),
	spaceHost: HOST_BY_SPACE[selected.id],
})
