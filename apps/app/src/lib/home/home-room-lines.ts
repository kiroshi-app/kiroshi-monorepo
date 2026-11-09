export type HomeRoomLineModel = { conversationId: string } & (
	| { state: "working" }
	| { state: "done"; at: number }
)

const workingLineOf = (conversationId: string): HomeRoomLineModel => ({
	conversationId,
	state: "working",
})

const nextRoomLines = (
	held: HomeRoomLineModel[],
	workingIds: string[],
	at: number,
): HomeRoomLineModel[] => {
	const working = new Set(workingIds)
	const settled = held.map(
		(line): HomeRoomLineModel =>
			line.state === "working" && !working.has(line.conversationId)
				? { conversationId: line.conversationId, state: "done", at }
				: line,
	)
	const shownIds = new Set(
		settled
			.filter((line) => line.state === "working")
			.map((line) => line.conversationId),
	)
	const arrived = workingIds
		.filter((id) => !shownIds.has(id))
		.map(workingLineOf)
	return [...settled, ...arrived]
}

type SeenRooms = {
	signature: string
	lines: HomeRoomLineModel[]
}

export type RoomLog = {
	linesOf: (key: string, workingIds: string[]) => HomeRoomLineModel[]
}

export const createRoomLog = (): RoomLog => {
	const seen = new Map<string, SeenRooms>()

	return {
		linesOf: (key, workingIds) => {
			const signature = workingIds.join(" ")
			const held = seen.get(key)
			if (held?.signature === signature) {
				return held.lines
			}
			const lines = nextRoomLines(held?.lines ?? [], workingIds, Date.now())
			seen.set(key, { signature, lines })
			return lines
		},
	}
}
