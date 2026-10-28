import type { AppRailDots } from "@workspace/ui/components/app-rail"
import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar"
import type { BotBadge } from "@workspace/ui/components/bot-badge"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { MissionCardModel } from "@workspace/ui/components/mission"

import { type SceneSpace, SPACES } from "./scene-cast"

type SceneRail = Pick<
	AppSidebarProps,
	"badgesBySpaceId" | "hostBySpaceId" | "railDots" | "space" | "spaceHost"
>

type BadgeCarrier = {
	badge?: BotBadge
}

const STRONGEST_FIRST: BotBadge[] = ["attention", "failed", "done"]

const HOST_BY_SPACE: Record<string, SpaceHost> = {}

const strongestBadge = (rows: BadgeCarrier[]) =>
	STRONGEST_FIRST.find((badge) => rows.some((row) => row.badge === badge))

const badgesBySpaceOf = (spaces: SceneSpace[]): Record<string, BotBadge> =>
	Object.fromEntries(
		spaces.flatMap((space) => {
			const badge = strongestBadge([...space.rows, ...space.conversations])
			return badge ? [[space.id, badge]] : []
		}),
	)

const isWaitingOnReader = (mission: MissionCardModel) =>
	mission.state === "waiting_human"

const railDotsOf = (space: SceneSpace): AppRailDots => ({
	conversations: strongestBadge(space.conversations),
	missions: space.missions.some(isWaitingOnReader) ? "attention" : undefined,
})

export const sceneRailOf = (
	spaces: SceneSpace[],
	selected: SceneSpace,
): SceneRail => ({
	badgesBySpaceId: badgesBySpaceOf(spaces),
	hostBySpaceId: HOST_BY_SPACE,
	railDots: railDotsOf(selected),
	space: SPACES.find((space) => space.id === selected.id),
	spaceHost: HOST_BY_SPACE[selected.id],
})
