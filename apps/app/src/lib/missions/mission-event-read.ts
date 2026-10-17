import type { MissionChanged, MissionDetail } from "./mission-contract"

export type MissionEvent = Pick<MissionChanged, "missionId" | "spaceId"> & {
	hostId: string | null
}

export type ReadMissionOfEvent = (
	event: MissionEvent,
) => Promise<MissionDetail | null>

type MissionSides = {
	detailOn: (hostId: string | null, missionId: string) => Promise<MissionDetail>
}

const LOCAL_SIDE = "local"

const isUnknownMission = (reason: unknown): boolean =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === "unknownMission"

const logSkipped = ({ missionId, spaceId, hostId }: MissionEvent) => {
	console.info(
		[
			"missions: skipped the change of a mission its side cannot read",
			`mission: ${missionId}`,
			`space: ${spaceId ?? "none"}`,
			`side: ${hostId ?? LOCAL_SIDE}`,
		].join(" | "),
	)
}

export const createMissionEventRead =
	({ detailOn }: MissionSides): ReadMissionOfEvent =>
	(event) =>
		detailOn(event.hostId, event.missionId).catch((reason: unknown) => {
			if (!isUnknownMission(reason)) {
				throw reason
			}
			logSkipped(event)
			return null
		})
