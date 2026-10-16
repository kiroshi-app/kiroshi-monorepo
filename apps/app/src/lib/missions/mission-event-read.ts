import type { MissionChanged, MissionDetail } from "./mission-contract"

export type MissionEvent = Pick<MissionChanged, "missionId" | "spaceId">

export type ReadMissionOfEvent = (
	event: MissionEvent,
) => Promise<MissionDetail | null>

type MissionSides = {
	sideOfSpace: (spaceId: string | null) => string | null
	detailOn: (side: string | null, missionId: string) => Promise<MissionDetail>
}

const LOCAL_SIDE = "local"

const isUnknownMission = (reason: unknown): boolean =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === "unknownMission"

const logSkipped = (
	{ missionId, spaceId }: MissionEvent,
	side: string | null,
) => {
	console.info(
		[
			"missions: skipped the change of a mission its side cannot read",
			`mission: ${missionId}`,
			`space: ${spaceId ?? "none"}`,
			`side: ${side ?? LOCAL_SIDE}`,
		].join(" | "),
	)
}

export const createMissionEventRead =
	({ sideOfSpace, detailOn }: MissionSides): ReadMissionOfEvent =>
	(event) => {
		const side = sideOfSpace(event.spaceId)
		return detailOn(side, event.missionId).catch((reason: unknown) => {
			if (!isUnknownMission(reason)) {
				throw reason
			}
			logSkipped(event, side)
			return null
		})
	}
