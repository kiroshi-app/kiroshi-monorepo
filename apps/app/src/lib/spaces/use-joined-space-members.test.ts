// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { useJoinedSpaceMembers } from "./use-joined-space-members"

import {
	commands,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpaceMember,
} from "../bindings"
import { listen } from "../host"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({
	listen: vi.fn(async () => () => undefined),
	joinedHosts: {
		getState: () => ({ active: "joined-studio", connections: {} }),
	},
	onHostReconnected: vi.fn(() => () => undefined),
}))
vi.mock("../bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../bindings")>()
	return {
		...actual,
		commands: { ...actual.commands, joinedSpaceMembers: vi.fn() },
	}
})

afterEach(() => {
	cleanup()
	vi.mocked(commands.joinedSpaceMembers).mockReset()
	vi.mocked(listen).mockClear()
})

const hostNamed = (name: string): JoinedSpaceMember => ({
	userId: "u-lea",
	name,
	role: "host",
	deviceId: "device-of-lea",
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
})

const rosterAnswered = (roster: JoinedSpaceMember[]) =>
	vi.mocked(commands.joinedSpaceMembers).mockResolvedValueOnce({
		status: "ok",
		data: roster,
	})

const membersChangeAnnounced = () => {
	const [, announce] =
		vi
			.mocked(listen)
			.mock.calls.find(
				([event]) => event === JOINED_SPACE_MEMBERS_CHANGED_EVENT,
			) ?? []
	act(() => {
		announce?.(
			{
				event: JOINED_SPACE_MEMBERS_CHANGED_EVENT,
				id: 1,
				payload: { id: "joined-studio", members: [] },
			},
			null,
		)
	})
}

const watched = (joinedIds: string[]) =>
	renderHook(() => useJoinedSpaceMembers(joinedIds), {
		wrapper: createQueryTestWrapper().wrapper,
	}).result

it("reads the roster of each joined space through joinedSpaceMembers", async () => {
	rosterAnswered([hostNamed("Lea")])
	rosterAnswered([hostNamed("Sam")])

	const result = watched(["joined-studio", "joined-garage"])

	await waitFor(() =>
		expect(result.current).toEqual([[hostNamed("Lea")], [hostNamed("Sam")]]),
	)
	expect(commands.joinedSpaceMembers).toHaveBeenCalledWith("joined-studio")
	expect(commands.joinedSpaceMembers).toHaveBeenCalledWith("joined-garage")
})

it("reads the roster again once the joined members change", async () => {
	rosterAnswered([hostNamed("Lea")])
	const result = watched(["joined-studio"])
	await waitFor(() => expect(result.current).toEqual([[hostNamed("Lea")]]))

	rosterAnswered([hostNamed("Léa Martin")])
	membersChangeAnnounced()

	await waitFor(() =>
		expect(result.current).toEqual([[hostNamed("Léa Martin")]]),
	)
})
