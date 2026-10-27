// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSpaces } from "./use-spaces"

import { HOSTING_CHANGED_EVENT, type Space } from "../bindings"
import { listen } from "../host"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({
	isDesktopHost: () => true,
	listen: vi.fn(),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))

const STUDIO: Space = {
	id: "studio",
	name: "Studio",
	colour: null,
	position: 0,
	createdAt: 0,
	shared: false,
	instanceId: null,
}

const REGISTERED: Space = { ...STUDIO, shared: true, instanceId: "i1" }

afterEach(cleanup)

describe("useSpaces", () => {
	it("reads the spaces again once the hosting changes", async () => {
		const announced: { change?: () => void } = {}
		vi.mocked(listen).mockImplementation(async (event, handler) => {
			if (event === HOSTING_CHANGED_EVENT) {
				announced.change = () => handler({ event, id: 1, payload: null }, null)
			}
			return () => undefined
		})
		const spaces = vi
			.fn<() => Promise<Space[]>>()
			.mockResolvedValueOnce([STUDIO])
			.mockResolvedValue([REGISTERED])
		const store = { spaces } as unknown as TranscriptStore

		const { result } = renderHook(() => useSpaces(store), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.state.spaces).toEqual([STUDIO]))
		await waitFor(() => expect(announced.change).toBeDefined())
		act(() => announced.change?.())

		await waitFor(() =>
			expect(result.current.state.spaces).toEqual([REGISTERED]),
		)
	})
})
