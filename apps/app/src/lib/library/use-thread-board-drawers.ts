import { useState } from "react"

import type { BoardCardDrawing } from "@workspace/ui/components/board/board-card"
import type {
	BoardPointerPlacement,
	BoardPresenceOwner,
} from "@workspace/ui/components/board/board-presence"

import { usePresenceInSpace } from "./use-followed-library-document"

import type { Bot, LibraryBoardPoint, LibraryWriter } from "../bindings"
import { avatarSrc } from "../host/index"

type ThreadBoardDrawersInput = {
	spaceId: string | undefined
	conversationId: string | null
	workingAgentIds: string[]
	bots: Bot[]
}

type BoardDrawer = {
	id: string
	name: string | null
	point: LibraryBoardPoint
	nodeId: string | null
}

type DrawersByBoard = ReadonlyMap<string, BoardDrawer[]>

export type BoardDrawing = {
	drawing?: BoardCardDrawing
	pointers: BoardPointerPlacement[]
}

const UNPAINTED_AGENT_HUE = 0

const NO_DRAWN_OBJECT = ""

const NOBODY_DRAWS: DrawersByBoard = new Map()

const NOBODY_DRAWING: BoardDrawing = { pointers: [] }

const drawersAmong = (writers: LibraryWriter[]): BoardDrawer[] =>
	writers.flatMap(({ id, kind, name, at }) =>
		kind === "agent" && at.kind === "board"
			? [{ id, name, point: at.point, nodeId: at.nodeId }]
			: [],
	)

const withDrawersOf = (
	drawersByBoard: DrawersByBoard,
	name: string,
	drawers: BoardDrawer[],
): DrawersByBoard => {
	if (drawers.length === 0 && !drawersByBoard.has(name)) {
		return drawersByBoard
	}
	const next = new Map(drawersByBoard)
	if (drawers.length === 0) {
		next.delete(name)
	} else {
		next.set(name, drawers)
	}
	return next
}

const ownerOf = (
	{ id, name }: BoardDrawer,
	bots: Bot[],
): BoardPresenceOwner => {
	const bot = bots.find((known) => known.id === id)
	return {
		kind: "agent",
		id,
		name: bot?.name ?? name ?? "",
		hue: bot?.avatarBlot ?? UNPAINTED_AGENT_HUE,
		image: avatarSrc(bot?.avatarImagePath ?? null),
	}
}

const drawingBy = (drawers: BoardDrawer[], bots: Bot[]): BoardDrawing => {
	const [first] = drawers
	if (!first) {
		return NOBODY_DRAWING
	}
	const pointers = drawers.map((drawer) => ({
		owner: ownerOf(drawer, bots),
		position: drawer.point,
	}))
	return {
		drawing: {
			agent: ownerOf(first, bots),
			objectId: first.nodeId ?? NO_DRAWN_OBJECT,
		},
		pointers,
	}
}

export const useThreadBoardDrawers = ({
	spaceId,
	conversationId,
	workingAgentIds,
	bots,
}: ThreadBoardDrawersInput) => {
	const [drawersByBoard, setDrawersByBoard] =
		useState<DrawersByBoard>(NOBODY_DRAWS)

	usePresenceInSpace(spaceId, conversationId, ({ name, writers }) =>
		setDrawersByBoard((current) =>
			withDrawersOf(current, name, drawersAmong(writers)),
		),
	)

	return (name: string) =>
		drawingBy(
			(drawersByBoard.get(name) ?? []).filter(({ id }) =>
				workingAgentIds.includes(id),
			),
			bots,
		)
}
