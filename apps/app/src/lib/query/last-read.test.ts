// @vitest-environment happy-dom

import type { QueryClient } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { hasLastReadFailed, isReadErrorShown, useLastRead } from "./last-read"
import { createQueryTestWrapper } from "./query-test-wrapper"

import { HostRefused } from "@/lib/host/host-refused"

const OLDER_HOST_REFUSAL = new HostRefused(
	"this host knows no command named mission_list",
	null,
	"unknownCommand",
)

const settledWith = (error: unknown) => ({
	isError: true,
	error: error as Error,
	isPending: false,
	isFetching: false,
	errorUpdatedAt: 1,
})

describe("a read error shown inline", () => {
	it("leaves out the refusal of a host that knows no such command", () => {
		expect(isReadErrorShown(OLDER_HOST_REFUSAL)).toBe(false)
	})

	it.each([
		["a command the host keeps", new HostRefused("kept", null, "hostOnly")],
		["a host that broke", new HostRefused("the host broke", null)],
		["a failure of this Mac", new Error("disk full")],
		["a refusal that is no error", { kind: "unknownBot" }],
	])("shows %s", (_case, error) => {
		expect(isReadErrorShown(error)).toBe(true)
	})
})

describe("the last read of a query", () => {
	it("has not failed when an older host refused it", () => {
		expect(hasLastReadFailed(settledWith(OLDER_HOST_REFUSAL))).toBe(false)
	})

	it("has failed on any other error", () => {
		expect(hasLastReadFailed(settledWith(new Error("disk full")))).toBe(true)
	})

	it("still counts as failed while a read that failed is read again", () => {
		expect(
			hasLastReadFailed({
				isError: false,
				error: null,
				isPending: true,
				isFetching: true,
				errorUpdatedAt: 1,
			}),
		).toBe(true)
	})
})

describe("a read that is read again", () => {
	const readMissions = vi.fn<() => Promise<string[]>>()
	const NEVER_ANSWERED = new Promise<string[]>(() => undefined)

	const mountRead = (query = createQueryTestWrapper()) => ({
		...query,
		...renderHook(
			() =>
				useLastRead({
					queryKey: ["missions"],
					queryFn: readMissions,
					meta: { rendersErrorInline: true },
				}),
			{ wrapper: query.wrapper },
		),
	})

	const mountAnsweredWith = async (error: unknown) => {
		readMissions.mockRejectedValueOnce(error)
		const mounted = mountRead()
		await waitFor(() => expect(mounted.result.current.isError).toBe(true))
		return mounted
	}

	const readAgain = async (queryClient: QueryClient) => {
		act(() => {
			void queryClient.invalidateQueries()
		})
		await act(() => new Promise((settle) => setTimeout(settle, 0)))
	}

	beforeEach(() => {
		readMissions.mockReset()
	})

	afterEach(cleanup)

	it("stays on the refusal of an older host until it is answered", async () => {
		const { queryClient, result } = await mountAnsweredWith(OLDER_HOST_REFUSAL)
		readMissions.mockReturnValueOnce(NEVER_ANSWERED)

		await readAgain(queryClient)

		expect(readMissions).toHaveBeenCalledTimes(2)
		expect(result.current).toMatchObject({
			error: OLDER_HOST_REFUSAL,
			isError: true,
			isPending: false,
			isFetching: false,
		})
		expect(hasLastReadFailed(result.current)).toBe(false)
	})

	it("opens a second mount on the refusal of an older host", async () => {
		const { queryClient, wrapper } = await mountAnsweredWith(OLDER_HOST_REFUSAL)
		cleanup()
		readMissions.mockReturnValueOnce(NEVER_ANSWERED)

		const { result } = mountRead({ queryClient, wrapper })

		expect(result.current.error).toBe(OLDER_HOST_REFUSAL)
		expect(result.current.isPending).toBe(false)
	})

	it("shows what a read refused earlier is answered with", async () => {
		const { queryClient, result } = await mountAnsweredWith(OLDER_HOST_REFUSAL)
		readMissions.mockResolvedValueOnce(["m-1"])

		await readAgain(queryClient)

		await waitFor(() => expect(result.current.data).toEqual(["m-1"]))
	})

	it("counts as failed again once a read refused earlier fails otherwise", async () => {
		const { queryClient, result } = await mountAnsweredWith(OLDER_HOST_REFUSAL)
		readMissions.mockRejectedValueOnce(new Error("disk full"))
		await readAgain(queryClient)
		await waitFor(() => expect(hasLastReadFailed(result.current)).toBe(true))
		readMissions.mockReturnValueOnce(NEVER_ANSWERED)

		await readAgain(queryClient)

		expect(readMissions).toHaveBeenCalledTimes(3)
		expect(hasLastReadFailed(result.current)).toBe(true)
	})

	it("leaves a read that failed otherwise pending and failed", async () => {
		const { queryClient, result } = await mountAnsweredWith(
			new Error("disk full"),
		)
		readMissions.mockReturnValueOnce(NEVER_ANSWERED)

		await readAgain(queryClient)

		expect(result.current.isPending).toBe(true)
		expect(hasLastReadFailed(result.current)).toBe(true)
	})
})
