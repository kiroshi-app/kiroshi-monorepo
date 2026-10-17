// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { invoke, listen } from "./index"
import { useSpaceMembers } from "./use-space-members"

import { HOSTING_MEMBERS_CHANGED_EVENT, type Member } from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("./index", () => ({
	invoke: vi.fn(),
	listen: vi.fn(async () => () => undefined),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))

afterEach(() => {
	cleanup()
	vi.mocked(invoke).mockReset()
	vi.mocked(listen).mockClear()
})

const hostNamed = (name: string): Member => ({
	userId: "u-lea",
	name,
	email: "lea@example.com",
	status: "host",
})

const changeAnnounced = () => {
	const [, announce] =
		vi
			.mocked(listen)
			.mock.calls.find(([event]) => event === HOSTING_MEMBERS_CHANGED_EVENT) ??
		[]
	act(() => {
		announce?.(
			{ event: HOSTING_MEMBERS_CHANGED_EVENT, id: 1, payload: null },
			null,
		)
	})
}

it("reads the member record of the shared space", async () => {
	vi.mocked(invoke).mockResolvedValue([hostNamed("Lea")])

	const { result } = renderHook(() => useSpaceMembers("studio"), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	await waitFor(() => expect(result.current).toEqual([hostNamed("Lea")]))
	expect(invoke).toHaveBeenCalledWith("hosting_members", { spaceId: "studio" })
})

it("reads the record again once the host announces a rename", async () => {
	vi.mocked(invoke).mockResolvedValueOnce([hostNamed("Lea")])
	const { result } = renderHook(() => useSpaceMembers("studio"), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(result.current).toEqual([hostNamed("Lea")]))

	vi.mocked(invoke).mockResolvedValueOnce([hostNamed("Léa Martin")])
	changeAnnounced()

	await waitFor(() => expect(result.current).toEqual([hostNamed("Léa Martin")]))
})

it("reads nothing for a space with no member record", () => {
	const { result } = renderHook(() => useSpaceMembers(undefined), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	expect(result.current).toEqual([])
	expect(invoke).not.toHaveBeenCalled()
})
