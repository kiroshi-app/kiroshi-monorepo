// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSpaces } from "./use-spaces"

import {
	HOSTING_CHANGED_EVENT,
	SPACE_DESCRIBED_EVENT,
	type Space,
} from "../bindings"
import { listen, listenOnThisComputer } from "../host"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({
	isDesktopHost: () => true,
	listen: vi.fn(async () => () => undefined),
	listenOnThisComputer: vi.fn(async () => () => undefined),
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

afterEach(() => {
	cleanup()
	vi.mocked(listenOnThisComputer).mockClear()
})

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

describe("useSpaces hearing a space described on this computer", () => {
	it("reads the spaces again and paints the new name and hue", async () => {
		const heard: { described?: () => void } = {}
		vi.mocked(listenOnThisComputer).mockImplementationOnce(
			async (event, handler) => {
				if (event === SPACE_DESCRIBED_EVENT) {
					heard.described = () =>
						handler({
							event,
							id: 2,
							payload: { spaceId: "studio", name: "Atelier", colour: 40 },
						})
				}
				return () => undefined
			},
		)
		const described = { ...STUDIO, name: "Atelier", colour: 40 }
		const spaces = vi
			.fn<() => Promise<Space[]>>()
			.mockResolvedValueOnce([STUDIO])
			.mockResolvedValue([described])
		const store = { spaces } as unknown as TranscriptStore

		const { result } = renderHook(() => useSpaces(store), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.state.spaces).toEqual([STUDIO]))
		await waitFor(() => expect(heard.described).toBeDefined())
		act(() => heard.described?.())

		await waitFor(() =>
			expect(result.current.state.spaces).toEqual([described]),
		)
	})

	it("listens once while mounted, across renders, and stops on unmount", async () => {
		const stopHearing = vi.fn()
		vi.mocked(listenOnThisComputer).mockImplementationOnce(
			async () => stopHearing,
		)
		const store = {
			spaces: vi.fn(async () => [STUDIO]),
		} as unknown as TranscriptStore

		const { rerender, unmount } = renderHook(() => useSpaces(store), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		rerender()
		rerender()
		unmount()

		await waitFor(() => expect(stopHearing).toHaveBeenCalledOnce())
		expect(listenOnThisComputer).toHaveBeenCalledExactlyOnceWith(
			SPACE_DESCRIBED_EVENT,
			expect.any(Function),
		)
	})
})
