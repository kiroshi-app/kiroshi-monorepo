import type {
	BoardObjectOutlineSpec,
	BoardPointerPlacement,
	BoardPresenceOwner,
} from "@workspace/ui/components/board/board-presence"

import { agentOwnerOf } from "./use-thread-board-drawers"

import type { Bot, LibraryBoardPoint, LibraryWriter } from "../bindings"

type BoardSeat = {
	owner: BoardPresenceOwner
	point: LibraryBoardPoint
	nodeId: string | null
}

type AgentDrawing = {
	agent: BoardPresenceOwner
}

export type LibraryBoardPresence = {
	pointers: BoardPointerPlacement[]
	outlines: BoardObjectOutlineSpec[]
	drawers: AgentDrawing[]
	people: BoardPresenceOwner[]
}

const personOf = ({ id, name, hue }: LibraryWriter): BoardPresenceOwner => ({
	kind: "person",
	id,
	name: name ?? "",
	...(hue == null ? {} : { hue }),
})

const ownerOf = (writer: LibraryWriter, bots: Bot[]): BoardPresenceOwner =>
	writer.kind === "agent" ? agentOwnerOf(writer, bots) : personOf(writer)

const seatsOnBoard = (writers: LibraryWriter[], bots: Bot[]): BoardSeat[] =>
	writers.flatMap((writer) =>
		writer.at.kind === "board"
			? [
					{
						owner: ownerOf(writer, bots),
						point: writer.at.point,
						nodeId: writer.at.nodeId,
					},
				]
			: [],
	)

const outlinesOf = (seats: BoardSeat[]): BoardObjectOutlineSpec[] =>
	seats.flatMap(({ owner, nodeId }) =>
		nodeId === null
			? []
			: [
					{
						objectId: nodeId,
						owner,
						state: owner.kind === "agent" ? "drawing" : "writing",
					},
				],
	)

const isAgent = (owner: BoardPresenceOwner) => owner.kind === "agent"

export const boardPresenceOf = (
	others: LibraryWriter[],
	bots: Bot[],
): LibraryBoardPresence => {
	const seats = seatsOnBoard(others, bots)
	const owners = seats.map(({ owner }) => owner)
	return {
		pointers: seats.map(({ owner, point }) => ({ owner, position: point })),
		outlines: outlinesOf(seats),
		drawers: owners.filter(isAgent).map((agent) => ({ agent })),
		people: owners.filter((owner) => !isAgent(owner)),
	}
}
