// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import { useLibraryBoardPresence } from "./use-library-board-presence"

import type { Bot, LibraryDocumentPresence, LibraryWriter } from "../bindings"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import { listen } from "@/lib/host"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
	currentWindowLabel: () => OWN_WINDOW,
}))

const SPACE_ID = "space-on-screen"
const BOARD = "Launch week.canvas"
const OWN_WINDOW = "main"
const OWN_ACCOUNT = "account-me"
const ATLAS_ID = "bot-atlas"

const ATLAS = {
	id: ATLAS_ID,
	name: "Atlas",
	avatarBlot: 210,
	avatarImagePath: null,
} as Bot

const BOTS = [ATLAS]

const seatOf = (
	id: string,
	kind: LibraryWriter["kind"],
	nodeId: string | null,
	name: string | null = null,
): LibraryWriter => ({
	id,
	kind,
	name,
	at: { kind: "board", point: { x: 40, y: 20 }, nodeId },
})

const presenceListens = () =>
	vi
		.mocked(listen)
		.mock.calls.filter(([event]) => event === LIBRARY_DOCUMENT_PRESENCE_EVENT)

const mountPresence = async (isJoined = false) => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const { queryClient, wrapper } = createQueryTestWrapper()
	queryClient.setQueryData(accountQueryKeys.state(), {
		kind: "signedIn",
		id: OWN_ACCOUNT,
		email: "me@example.com",
		createdAt: "2026-01-01T00:00:00Z",
		plan: null,
	})
	const hook = renderHook(
		() =>
			useLibraryBoardPresence({
				spaceId: SPACE_ID,
				name: BOARD,
				isJoined,
				bots: BOTS,
			}),
		{ wrapper },
	)
	await waitFor(() => expect(presenceListens()).toHaveLength(1))
	const hear = (writers: LibraryWriter[], name = BOARD) => {
		const handler = presenceListens().at(-1)?.[1]
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
	return { ...hook, hear, unlisten }
}

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
})

describe("useLibraryBoardPresence", () => {
	it("keeps one presence subscription across re-renders", async () => {
		const { rerender, hear, result } = await mountPresence()

		rerender()
		hear([seatOf(ATLAS_ID, "agent", "sticky-ship")])
		rerender()

		expect(presenceListens()).toHaveLength(1)
		expect(result.current.pointers).toHaveLength(1)
	})

	it("shows an agent's pointer at its point, its outline on the object it draws and its drawing chip", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf(ATLAS_ID, "agent", "sticky-ship", "atlas-runtime")])

		expect(result.current.pointers).toEqual([
			{
				owner: expect.objectContaining({
					kind: "agent",
					name: "Atlas",
					hue: 210,
				}),
				position: { x: 40, y: 20 },
			},
		])
		expect(result.current.outlines).toEqual([
			expect.objectContaining({ objectId: "sticky-ship", state: "drawing" }),
		])
		expect(result.current.drawers.map(({ agent }) => agent.name)).toEqual([
			"Atlas",
		])
		expect(result.current.people).toEqual([])
	})

	it("follows the agent from one step to the next", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf(ATLAS_ID, "agent", "sticky-ship")])
		hear([
			{
				...seatOf(ATLAS_ID, "agent", "shape-measure"),
				at: {
					kind: "board",
					point: { x: 300, y: 90 },
					nodeId: "shape-measure",
				},
			},
		])

		expect(result.current.pointers.map(({ position }) => position)).toEqual([
			{ x: 300, y: 90 },
		])
		expect(result.current.outlines.map(({ objectId }) => objectId)).toEqual([
			"shape-measure",
		])
	})

	it("outlines the object another person selected and shows their pointer, but no chip", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf("window-2", "person", "sticky-ship", "Lena")])

		expect(result.current.pointers.map(({ owner }) => owner.name)).toEqual([
			"Lena",
		])
		expect(result.current.outlines).toEqual([
			expect.objectContaining({ objectId: "sticky-ship", state: "writing" }),
		])
		expect(result.current.people.map(({ name }) => name)).toEqual(["Lena"])
		expect(result.current.drawers).toEqual([])
	})

	it("never shows the own window on the host", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf(OWN_WINDOW, "person", "sticky-ship", "Me")])

		expect(result.current.pointers).toEqual([])
		expect(result.current.outlines).toEqual([])
	})

	it("never shows the own member in a joined Space, and shows the host's people", async () => {
		const { result, hear } = await mountPresence(true)

		hear([
			seatOf(OWN_ACCOUNT, "member", "sticky-ship", "Me"),
			seatOf(OWN_WINDOW, "person", null, "Host person"),
		])

		expect(result.current.pointers.map(({ owner }) => owner.name)).toEqual([
			"Host person",
		])
		expect(result.current.outlines).toEqual([])
	})

	it("clears a presence the host no longer lists", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf("window-2", "person", "sticky-ship", "Lena")])
		hear([])

		expect(result.current.pointers).toEqual([])
		expect(result.current.outlines).toEqual([])
	})

	it("ignores the presence of another board and of a text document", async () => {
		const { result, hear } = await mountPresence()

		hear([seatOf("window-2", "person", "sticky-ship", "Lena")], "Other.canvas")
		hear([
			{
				id: ATLAS_ID,
				kind: "agent",
				name: "Atlas",
				at: { kind: "text", anchor: "caret" },
			},
		])

		expect(result.current.pointers).toEqual([])
		expect(result.current.drawers).toEqual([])
	})

	it("stops listening on unmount", async () => {
		const { unmount, unlisten } = await mountPresence()

		unmount()

		await waitFor(() => expect(unlisten).toHaveBeenCalledOnce())
	})
})
