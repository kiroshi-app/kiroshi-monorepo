export type ReadMission = (missionId: string) => Promise<unknown>

const GONE_MISSION_KINDS = new Set(["unknownMission", "missionOfAnotherSpace"])

const kindOf = (reason: unknown) =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	typeof reason.kind === "string"
		? reason.kind
		: String(reason)

const logKept = (missionId: string, reason: unknown) => {
	console.warn(
		[
			"tabs: kept a restored mission tab its side could not read",
			`mission: ${missionId}`,
			`reason: ${kindOf(reason)}`,
		].join(" | "),
	)
}

const isMissionGone = (readMission: ReadMission, missionId: string) =>
	readMission(missionId).then(
		() => false,
		(reason: unknown) => {
			if (GONE_MISSION_KINDS.has(kindOf(reason))) {
				return true
			}
			logKept(missionId, reason)
			return false
		},
	)

export const goneMissionIdsOf = async (
	readMission: ReadMission,
	missionIds: string[],
) => {
	const unique = [...new Set(missionIds)]
	const gone = await Promise.all(
		unique.map((missionId) => isMissionGone(readMission, missionId)),
	)
	return unique.filter((_, index) => gone[index])
}
