export type MissionSeqs = {
	handled: (missionId: string, stateSeq: number) => boolean
	remember: (missionId: string, stateSeq: number) => void
}

export const createMissionSeqs = (): MissionSeqs => {
	const lastHandled = new Map<string, number>()

	return {
		handled: (missionId, stateSeq) => {
			const last = lastHandled.get(missionId)
			return last !== undefined && stateSeq <= last
		},

		remember: (missionId, stateSeq) => {
			lastHandled.set(missionId, stateSeq)
		},
	}
}
