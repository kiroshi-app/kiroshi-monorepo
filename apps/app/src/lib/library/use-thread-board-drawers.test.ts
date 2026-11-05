// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import { useThreadBoardDrawers } from "./use-thread-board-drawers"

import type { Bot, LibraryDocumentPresence, LibraryWriter } from "../bindings"
import { listen } from "@/lib/host"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
}))

const SPACE_ID = "space-on-screen"
const BOARD = "Launch week.canvas"
const ATLAS_ID = "bot-atlas"

const ATLAS = {
	id: ATLAS_ID,
	name: "Atlas",
	avatarBlot: 210,
	avatarImagePath: null,
} as Bot

const drawerOn = (nodeId: string | null): LibraryWriter => ({
	id: ATLAS_ID,
	kind: "agent",
	name: "atlas-runtime",
	at: { kind: "board", point: { x: 40, y: 20 }, nodeId },
})

const mountDrawers = async (workingAgentIds: string[]) => {
	vi.mocked(listen).mockResolvedValue(() => undefined)
	const hook = renderHook(() =>
		useThreadBoardDrawers({
			spaceId: SPACE_ID,
			conversationId: "conversation-on-screen",
			workingAgentIds,
			bots: [ATLAS],
		}),
	)
	await waitFor(() => expect(listen).toHaveBeenCalled())
	const hear = (name: string, writers: LibraryWriter[]) => {
		const handler = vi.mocked(listen).mock.calls.at(-1)?.[1]
		const payload: LibraryDocumentPresence = {
			spaceId: SPACE_ID,
			name,
			writers,
		}
		act(() =>
			handler?.(
				{ event: LIBRARY_DOCUMENT_PRESENCE_EVENT, id: 1, payload },
				null,
			),
		)
	}
	return { ...hook, hear }
}

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
})

describe("useThreadBoardDrawers", () => {
	it("draws the working agent with its face, pointer and the node it draws", async () => {
		const { result, hear } = await mountDrawers([ATLAS_ID])

		hear(BOARD, [drawerOn("sticky-ship")])

		const { drawing, pointers } = result.current(BOARD)
		expect(drawing?.objectId).toBe("sticky-ship")
		expect(drawing?.agent).toMatchObject({ name: "Atlas", hue: 210 })
		expect(pointers.map(({ position }) => position)).toEqual([{ x: 40, y: 20 }])
	})

	it("ignores an agent working outside the thread and a writer of a document", async () => {
		const { result, hear } = await mountDrawers([])

		hear(BOARD, [drawerOn(null)])
		hear("plan.md", [
			{ ...drawerOn(null), at: { kind: "text", anchor: "caret" } },
		])

		expect(result.current(BOARD).drawing).toBeUndefined()
		expect(result.current("plan.md").drawing).toBeUndefined()
	})

	it("stops drawing once the agent leaves the board", async () => {
		const { result, hear } = await mountDrawers([ATLAS_ID])

		hear(BOARD, [drawerOn("sticky-ship")])
		hear(BOARD, [])

		expect(result.current(BOARD)).toEqual({ pointers: [] })
	})
})
