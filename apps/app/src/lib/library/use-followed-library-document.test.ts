// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import {
	type ThreadLibraryItem,
	useFollowedLibraryDocument,
} from "./use-followed-library-document"

import type { LibraryDocumentPresence, LibraryWriter } from "../bindings"
import { listen } from "@/lib/host"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
}))

type Shown = {
	conversationId: string | null
	workingAgentIds: string[]
}

const SPACE_ID = "space-on-screen"
const WRITER = "bot-writer"
const PLAN = "plan.md"
const NOTES = "notes.md"
const LAUNCH_BOARD = "launch.canvas"

const agent = (id: string): LibraryWriter => ({
	id,
	kind: "agent",
	name: null,
	at: { kind: "text", anchor: "caret" },
})

const drawer = (id: string): LibraryWriter => ({
	...agent(id),
	at: { kind: "board", point: { x: 120, y: 80 }, nodeId: null },
})

const document = (name: string): ThreadLibraryItem => ({
	kind: "document",
	name,
})

const board = (name: string): ThreadLibraryItem => ({ kind: "board", name })

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

const mountFollowed = (shown: Shown) => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const hook = renderHook(
		(props: Shown) =>
			useFollowedLibraryDocument({ spaceId: SPACE_ID, ...props }),
		{ initialProps: shown },
	)
	const write = (
		name: string,
		writers: LibraryWriter[],
		spaceId = SPACE_ID,
	) => {
		const handler = vi.mocked(listen).mock.calls.at(-1)?.[1]
		const payload: LibraryDocumentPresence = { spaceId, name, writers }
		act(() =>
			handler?.(
				{ event: LIBRARY_DOCUMENT_PRESENCE_EVENT, id: 1, payload },
				null,
			),
		)
	}
	return { ...hook, unlisten, write }
}

const IN_TURN: Shown = {
	conversationId: "conversation-a",
	workingAgentIds: [WRITER],
}

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
	vi.restoreAllMocks()
})

describe("useFollowedLibraryDocument", () => {
	it("opens the document a working agent of the conversation writes", () => {
		const { result, write } = mountFollowed(IN_TURN)

		write(PLAN, [agent(WRITER)])

		expect(result.current.opened).toEqual(document(PLAN))
	})

	it("opens the board a working agent of the conversation draws on", () => {
		const { result, write } = mountFollowed(IN_TURN)

		write(LAUNCH_BOARD, [drawer(WRITER)])

		expect(result.current.opened).toEqual(board(LAUNCH_BOARD))
	})

	it("keeps a closed board shut for the rest of the turn", () => {
		const { result, write } = mountFollowed(IN_TURN)
		write(LAUNCH_BOARD, [drawer(WRITER)])

		act(() => result.current.close())
		write(LAUNCH_BOARD, [drawer(WRITER)])

		expect(result.current.opened).toBeNull()
	})

	it("switches to the next document that agent writes", () => {
		const { result, write } = mountFollowed(IN_TURN)

		write(PLAN, [agent(WRITER)])
		write(NOTES, [agent(WRITER)])

		expect(result.current.opened).toEqual(document(NOTES))
	})

	it("keeps the panel closed for the rest of the turn once closed", () => {
		const { result, write } = mountFollowed(IN_TURN)
		write(PLAN, [agent(WRITER)])

		act(() => result.current.close())
		write(PLAN, [agent(WRITER)])
		write(NOTES, [agent(WRITER)])

		expect(result.current.opened).toBeNull()
	})

	it("opens again when that agent writes in a later turn", () => {
		const { result, rerender, write } = mountFollowed(IN_TURN)
		write(PLAN, [agent(WRITER)])
		act(() => result.current.close())

		rerender({ ...IN_TURN, workingAgentIds: [] })
		rerender(IN_TURN)
		write(NOTES, [agent(WRITER)])

		expect(result.current.opened).toEqual(document(NOTES))
	})

	it("leaves the panel as it is for a foreign writer", () => {
		const { result, write } = mountFollowed(IN_TURN)
		act(() => result.current.open(document(NOTES)))

		write(PLAN, [{ ...agent("someone"), kind: "person" }])
		write(PLAN, [{ ...agent(WRITER), kind: "member" }])
		write(PLAN, [agent("bot-elsewhere")])
		write(PLAN, [agent(WRITER)], "another-space")

		expect(result.current.opened).toEqual(document(NOTES))
	})

	it("listens once per conversation and stops on change and unmount", async () => {
		const { rerender, unmount, unlisten, write, result } =
			mountFollowed(IN_TURN)

		rerender({ ...IN_TURN })
		rerender({ ...IN_TURN, workingAgentIds: [WRITER, "bot-other"] })
		expect(listen).toHaveBeenCalledTimes(1)

		rerender({ conversationId: "conversation-b", workingAgentIds: [WRITER] })
		await settle()
		expect(unlisten).toHaveBeenCalledTimes(1)
		expect(listen).toHaveBeenCalledTimes(2)
		write(PLAN, [agent(WRITER)])
		expect(result.current.opened).toEqual(document(PLAN))

		unmount()
		await settle()
		expect(unlisten).toHaveBeenCalledTimes(2)
	})

	it("logs a listener that cannot be registered and keeps working", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(listen).mockRejectedValueOnce(new Error("no host"))
		const { result } = renderHook(() =>
			useFollowedLibraryDocument({ spaceId: SPACE_ID, ...IN_TURN }),
		)

		await waitFor(() =>
			expect(logged).toHaveBeenCalledWith(
				`library: ${LIBRARY_DOCUMENT_PRESENCE_EVENT} could not be listened to`,
				expect.any(Error),
			),
		)
		act(() => result.current.open(document(PLAN)))
		expect(result.current.opened).toEqual(document(PLAN))
	})
})
