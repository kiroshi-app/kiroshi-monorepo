// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import type { HostedSpace, HostingTransport } from "./hosting-transport"
import { isDesktopHost, listen } from "./index"
import { useHosting } from "./use-hosting"

import { commands, HOSTING_CHANGED_EVENT, type HostingState } from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("./index", () => ({
	isDesktopHost: vi.fn(),
	listen: vi.fn(),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: {
		hostingState: vi.fn(),
		hostingStart: vi.fn(),
		hostingStop: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

const HOME: HostedSpace = { id: "home", name: "Home" }

const GARAGE: HostedSpace = { id: "garage", name: "Garage" }

const OFF: HostingState = { kind: "off" }

const ONLINE: HostingState = { kind: "online" }

const DROPPED: HostingState = {
	kind: "failed",
	failure: "takenOverByAnotherHost",
	detail: "relay closed",
}

const COULDNT_HOST_HOME: NoticeMessage = {
	title: "Couldn’t host Home",
	description: "Check your connection and turn it on again.",
}

const unlisten = vi.fn()

const changes: { announce: () => void } = { announce: () => undefined }

const settle = () =>
	act(async () => {
		for (let round = 0; round < 3; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

type OpenSpace = { openSpace: HostedSpace | null }

const renderHosting = (openSpace: HostedSpace | null) =>
	renderHook(({ openSpace }: OpenSpace) => useHosting(openSpace), {
		initialProps: { openSpace },
		wrapper: createQueryTestWrapper().wrapper,
	})

const announce = async (state?: HostingState) => {
	if (state) vi.mocked(commands.hostingState).mockResolvedValue(state)
	act(() => changes.announce())
	await settle()
}

const createFakeTransport = (
	overrides: Partial<HostingTransport> = {},
): HostingTransport => ({
	read: vi.fn(async () => OFF),
	start: vi.fn(async () => ONLINE),
	stop: vi.fn(async () => OFF),
	...overrides,
})

const watchHome = async (overrides: Partial<HostingTransport> = {}) => {
	const transport = createFakeTransport(overrides)
	const reportFailure = vi.fn<(message: NoticeMessage) => void>()
	const hook = renderHook(
		({ openSpace }: OpenSpace) =>
			useHosting(openSpace, { transport, reportFailure }),
		{
			initialProps: { openSpace: HOME as HostedSpace | null },
			wrapper: createQueryTestWrapper().wrapper,
		},
	)
	await settle()
	const hostsAgain = async (state: HostingState) => {
		vi.mocked(transport.read).mockResolvedValue(state)
		await announce()
	}
	return { ...hook, transport, reportFailure, hostsAgain }
}

beforeEach(() => {
	vi.mocked(isDesktopHost).mockReturnValue(true)
	vi.mocked(commands.hostingState).mockResolvedValue(OFF)
	vi.mocked(commands.hostingStart).mockResolvedValue({
		status: "ok",
		data: { kind: "connecting" },
	})
	vi.mocked(commands.hostingStop).mockResolvedValue({
		status: "ok",
		data: OFF,
	})
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		if (event === HOSTING_CHANGED_EVENT) {
			changes.announce = () => handler({ event, id: 1, payload: null }, null)
		}
		return unlisten
	})
})

afterEach(async () => {
	cleanup()
	await new Promise((resolve) => setTimeout(resolve, 0))
	vi.clearAllMocks()
})

describe("useHosting", () => {
	it("passes nothing until the first read lands, then the hosting of the open space", async () => {
		const { result } = renderHosting(HOME)

		expect(result.current).toBeUndefined()
		await settle()

		expect(commands.hostingState).toHaveBeenCalledWith(HOME.id)
		expect(result.current?.hosting).toBe("off")
	})

	it("reads the hosting once for two panels on the same space", async () => {
		renderHook(() => [useHosting(HOME), useHosting({ ...HOME })], {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(commands.hostingState).toHaveBeenCalledOnce()
	})

	it.each([
		[{ kind: "off" }, "off"],
		[{ kind: "connecting" }, "connecting"],
		[{ kind: "online" }, "online"],
		[{ kind: "needsSignIn" }, "signed-out"],
		[
			{
				kind: "failed",
				failure: "takenOverByAnotherHost",
				detail: "relay closed",
			},
			"off",
		],
	] as const)("maps %o to %s", async (state, hosting) => {
		const { result } = renderHosting(HOME)
		await settle()

		await announce(state)

		expect(result.current?.hosting).toBe(hosting)
	})

	it("renders the state hostingStart returns once the person hosts", async () => {
		const { result } = renderHosting(HOME)
		await settle()

		act(() => result.current?.onHost())
		await settle()

		expect(commands.hostingStart).toHaveBeenCalledWith(HOME.id)
		expect(result.current?.hosting).toBe("connecting")
	})

	it("keeps the state when hostingStop answers an error", async () => {
		vi.mocked(commands.hostingState).mockResolvedValue(ONLINE)
		vi.mocked(commands.hostingStop).mockResolvedValue({
			status: "error",
			error: { kind: "notFound" } as never,
		})
		const { result } = renderHosting(HOME)
		await settle()

		act(() => result.current?.onStopHosting())
		await settle()

		expect(result.current?.hosting).toBe("online")
	})

	it("follows the next space", async () => {
		const { rerender, result } = renderHosting(HOME)
		await settle()

		rerender({ openSpace: GARAGE })
		await settle()

		expect(commands.hostingState).toHaveBeenLastCalledWith("garage")
		expect(result.current?.hosting).toBe("off")
	})

	it("keeps listening while the dialog is closed and stops on unmount", async () => {
		const { rerender, unmount } = renderHosting(HOME)
		await settle()

		rerender({ openSpace: null })
		await settle()
		expect(unlisten).not.toHaveBeenCalled()

		unmount()
		await settle()
		expect(unlisten).toHaveBeenCalledOnce()
	})

	it("passes nothing outside the desktop window and reads nothing", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(false)
		const { result } = renderHosting(HOME)

		await settle()

		expect(result.current).toBeUndefined()
		expect(commands.hostingState).not.toHaveBeenCalled()
	})
})

describe("useHosting notices", () => {
	it("starts and stops the watched space and keeps the state each returns", async () => {
		const { result, transport } = await watchHome()

		act(() => result.current?.onHost())
		await settle()
		expect(transport.start).toHaveBeenCalledWith(HOME.id)
		expect(result.current?.hosting).toBe("online")

		act(() => result.current?.onStopHosting())
		await settle()
		expect(transport.stop).toHaveBeenCalledWith(HOME.id)
		expect(result.current?.hosting).toBe("off")
	})

	it("raises one H6 notice naming the space, without the raw reason, when hosting fails", async () => {
		const { reportFailure, hostsAgain } = await watchHome()

		await hostsAgain(DROPPED)
		await hostsAgain(DROPPED)

		expect(reportFailure).toHaveBeenCalledExactlyOnceWith(COULDNT_HOST_HOME)
	})

	it("returns the switch to off with the H6 notice when the start rejects", async () => {
		const { result, reportFailure } = await watchHome({
			start: vi.fn(async () => {
				throw new Error("relay refused the token")
			}),
		})

		act(() => result.current?.onHost())
		await settle()

		expect(result.current?.hosting).toBe("off")
		expect(reportFailure).not.toHaveBeenCalled()
		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith({
			...COULDNT_HOST_HOME,
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-hosting" }),
			}),
		})
	})

	it("keeps the switch on and raises the stop notice when the stop rejects", async () => {
		const { result } = await watchHome({
			read: vi.fn(async () => ONLINE),
			stop: vi.fn(async () => {
				throw new Error("unreachable")
			}),
		})

		act(() => result.current?.onStopHosting())
		await settle()

		expect(result.current?.hosting).toBe("online")
		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t stop hosting Home",
			description: "Turn it off again.",
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-hosting" }),
			}),
		})
	})

	it("raises a notice when the read rejects", async () => {
		const { result } = await watchHome({
			read: vi.fn(async () => {
				throw new Error("unreachable")
			}),
		})

		expect(result.current).toBeUndefined()
		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith({
			...COULDNT_HOST_HOME,
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-hosting" }),
			}),
		})
	})

	it("raises one more notice when a retry from failed ends in failed again", async () => {
		const { result, reportFailure, hostsAgain } = await watchHome({
			start: vi.fn(async () => DROPPED),
		})
		await hostsAgain(DROPPED)

		act(() => result.current?.onHost())
		await settle()
		await hostsAgain(DROPPED)

		expect(reportFailure).toHaveBeenCalledTimes(2)
		expect(result.current?.hosting).toBe("off")
	})

	it("raises one notice when the event lands before the failed answer of the same start", async () => {
		let answer: (hosting: HostingState) => void = () => undefined
		const { result, reportFailure, hostsAgain } = await watchHome({
			start: vi.fn(
				() =>
					new Promise<HostingState>((resolve) => {
						answer = resolve
					}),
			),
		})

		act(() => result.current?.onHost())
		await hostsAgain(DROPPED)
		answer(DROPPED)
		await settle()

		expect(reportFailure).toHaveBeenCalledExactlyOnceWith(COULDNT_HOST_HOME)
	})

	it("raises one notice when the failed answer lands before the event of the same start", async () => {
		const { result, reportFailure, hostsAgain } = await watchHome({
			start: vi.fn(async () => DROPPED),
		})

		act(() => result.current?.onHost())
		await settle()
		await hostsAgain(DROPPED)

		expect(reportFailure).toHaveBeenCalledExactlyOnceWith(COULDNT_HOST_HOME)
	})

	it("keeps a state an event settled before the initial read resolves", async () => {
		let answerFirstRead: (hosting: HostingState) => void = () => undefined
		const read = vi
			.fn<HostingTransport["read"]>()
			.mockReturnValueOnce(
				new Promise((resolve) => {
					answerFirstRead = resolve
				}),
			)
			.mockResolvedValue(ONLINE)
		const { result } = await watchHome({ read })

		await announce()
		answerFirstRead(OFF)
		await settle()

		expect(result.current?.hosting).toBe("online")
	})

	it("raises no notice when the same failed space is reopened", async () => {
		const { reportFailure, hostsAgain, rerender } = await watchHome()
		await hostsAgain(DROPPED)

		rerender({ openSpace: null })
		await settle()
		rerender({ openSpace: HOME })
		await settle()

		expect(reportFailure).toHaveBeenCalledOnce()
	})
})
