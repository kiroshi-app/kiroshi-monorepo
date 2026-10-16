// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type {
	ApplicationInstall,
	ApplicationInstalled,
	ApplicationPort,
} from "./application-port"
import {
	createFakeApplicationPort,
	type FakeApplicationPort,
} from "./fake-application-port"
import {
	type ConversationApplications,
	ConversationApplicationsContext,
	useConversationInstalls,
} from "./use-conversation-installs"

import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"
import { hostOfflineOf } from "../host/host-offline"
import { createJoinedHosts } from "../host/joined-hosts"
import { invalidateOnHostReconnect } from "../query/host-invalidations"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

type Provided = {
	children: ReactNode
}

const providing = (applications: ConversationApplications) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	invalidateOnHostReconnect(queryClient)
	return ({ children }: Provided) =>
		createElement(
			wrapper,
			null,
			createElement(
				ConversationApplicationsContext.Provider,
				{ value: applications },
				children,
			),
		)
}

const installsRefusedWith = (reason: unknown) => {
	const installs = vi.fn(() => Promise.reject(reason))
	const applications = {
		port: {
			installs,
			onInstalled: () => Promise.resolve(() => undefined),
		} as unknown as ApplicationPort,
		curated: [],
		spaces: [],
		onOpen: vi.fn(),
	} satisfies ConversationApplications
	renderHook(() => useConversationInstalls("conversation-1"), {
		wrapper: providing(applications),
	})
	return installs
}

describe("reading the installs of a conversation", () => {
	beforeEach(() => {
		vi.mocked(raiseFailureNotice).mockClear()
		vi.spyOn(console, "error").mockImplementation(() => undefined)
	})

	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it("raises its own notice when the installs cannot be read", async () => {
		installsRefusedWith(new Error("no installs"))

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t read the applications added to this conversation.",
				report: expect.objectContaining({
					context: expect.objectContaining({
						raisedIn: "use-conversation-installs",
					}),
				}),
			}),
		)
		expect(console.error).not.toHaveBeenCalled()
	})

	it("raises no notice of its own when the host of the space is offline", async () => {
		const installs = installsRefusedWith(
			hostOfflineOf("the host of this space is offline"),
		)

		await waitFor(() => expect(installs).toHaveBeenCalled())
		await Promise.resolve()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})
})

describe("reading the installs again when an application is installed", () => {
	const installedIn = (conversationId: string) =>
		({ conversationId }) as ApplicationInstalled

	const installReadsOf = (port: FakeApplicationPort) =>
		port.calls.filter(({ command }) => command === "installs").length

	const installsShownWithFakePort = async () => {
		const port = createFakeApplicationPort()
		renderHook(() => useConversationInstalls("conversation-1"), {
			wrapper: providing({ port, curated: [], spaces: [], onOpen: vi.fn() }),
		})
		await waitFor(() => expect(port.isListening()).toBe(true))
		await waitFor(() => expect(installReadsOf(port)).toBe(1))
		return port
	}

	afterEach(cleanup)

	it("reads the installs again for an install in the shown conversation", async () => {
		const port = await installsShownWithFakePort()

		act(() => port.announce(installedIn("conversation-1")))

		await waitFor(() => expect(installReadsOf(port)).toBe(2))
	})

	it("reads nothing for an install in another conversation", async () => {
		const port = await installsShownWithFakePort()

		act(() => port.announce(installedIn("conversation-2")))
		await Promise.resolve()

		expect(installReadsOf(port)).toBe(1)
	})
})

describe("reading the installs again when the relay of a joined Space reopens", () => {
	const JOINED = "garage"

	const installOf = (title: string) =>
		({
			id: title,
			conversationId: "conversation-1",
			application: title,
			title,
		}) as ApplicationInstall

	const installsShownOnHost = async () => {
		const held = { installs: [installOf("Linear")] }
		const installs = vi.fn(async () => held.installs)
		const applications = {
			port: {
				installs,
				onInstalled: () => Promise.resolve(() => undefined),
			} as unknown as ApplicationPort,
			curated: [],
			spaces: [],
			onOpen: vi.fn(),
		} satisfies ConversationApplications
		await joinFakeHost(JOINED)
		const rendered = renderHook(
			() => useConversationInstalls("conversation-1"),
			{ wrapper: providing(applications) },
		)
		await waitFor(() =>
			expect(rendered.result.current.map(({ title }) => title)).toEqual([
				"Linear",
			]),
		)
		held.installs = [installOf("Linear"), installOf("Notion")]
		return { installs, rendered }
	}

	const titlesOf = (installs: ApplicationInstall[]) =>
		installs.map(({ title }) => title)

	afterEach(async () => {
		cleanup()
		await leaveFakeHost(JOINED)
	})

	it("shows the installs written during the cut", async () => {
		const { rendered } = await installsShownOnHost()

		reopenFakeRelay(JOINED)

		await waitFor(() =>
			expect(titlesOf(rendered.result.current)).toEqual(["Linear", "Notion"]),
		)
	})

	it("reads nothing when the relay of another Space reopens", async () => {
		const { installs, rendered } = await installsShownOnHost()

		reopenFakeRelay("attic")
		await Promise.resolve()

		expect(installs).toHaveBeenCalledOnce()
		expect(titlesOf(rendered.result.current)).toEqual(["Linear"])
	})

	it("reads nothing once the conversation is gone", async () => {
		const { installs, rendered } = await installsShownOnHost()
		rendered.unmount()

		reopenFakeRelay(JOINED)

		expect(installs).toHaveBeenCalledOnce()
	})
})

describe("reading installs while a joined Space is active", () => {
	const SOLO_THREAD = "guest-solo-thread"
	const SHARED_THREAD = "shared-thread"

	const answerOf = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		})

	const hostAnswering = async (url: URL | RequestInfo, init?: RequestInit) => {
		const command = String(url).split("/").at(-1)
		const args = JSON.parse(String(init?.body ?? "{}"))
		if (command === "conversation_main_chat") {
			return answerOf({ id: SHARED_THREAD })
		}
		return args.conversationId === SHARED_THREAD
			? answerOf([])
			: answerOf("this command reaches outside the shared space", 403)
	}

	const guestJoinedTo = async () => {
		const local = {
			invoke: vi.fn(async (command: string) =>
				command === "conversation_main_chat"
					? ({ id: SOLO_THREAD } as never)
					: ([] as never),
			),
			listen: vi.fn(async () => () => undefined),
			fileSrc: (path: string) => path,
		}
		const fetch = vi.fn(hostAnswering)
		const hosts = createJoinedHosts({
			local,
			join: async (id) => ({
				status: "ok",
				data: {
					id,
					hostUrl: "http://192.168.1.20:45367",
					token: "joined",
					remoteSpaceId: null,
					name: id,
				},
			}),
			fetch: fetch as unknown as typeof globalThis.fetch,
			openSocket: () => ({
				onopen: null,
				onmessage: null,
				onclose: null,
				close: () => undefined,
			}),
			reportFailure: vi.fn(),
		})
		await hosts.invoke("conversation_main_chat", {
			botId: "b1",
			spaceId: "home",
		})
		await hosts.activate("garage")
		await hosts.invoke("conversation_main_chat", { botId: "b2", spaceId: "g" })
		return { hosts, local, fetch }
	}

	const installsAskedOf = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls
			.filter(([url]) => String(url).endsWith("/application_installs"))
			.map(([, init]) => JSON.parse(String(init.body)).conversationId)

	beforeEach(() => {
		vi.mocked(raiseFailureNotice).mockClear()
	})

	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it("reads a guest-local conversation on the guest, then the shared one on the host, with no notice", async () => {
		const { hosts, local, fetch } = await guestJoinedTo()
		const applications = {
			port: {
				installs: (conversationId: string) =>
					hosts.invoke("application_installs", { conversationId }),
				onInstalled: () => Promise.resolve(() => undefined),
			} as unknown as ApplicationPort,
			curated: [],
			spaces: [],
			onOpen: vi.fn(),
		} satisfies ConversationApplications

		const { rerender } = renderHook(
			({ conversationId }) => useConversationInstalls(conversationId),
			{
				wrapper: providing(applications),
				initialProps: { conversationId: SOLO_THREAD },
			},
		)
		await waitFor(() =>
			expect(local.invoke).toHaveBeenCalledWith("application_installs", {
				conversationId: SOLO_THREAD,
			}),
		)

		rerender({ conversationId: SHARED_THREAD })
		await waitFor(() => expect(installsAskedOf(fetch)).toEqual([SHARED_THREAD]))

		expect(local.invoke).not.toHaveBeenCalledWith("application_installs", {
			conversationId: SHARED_THREAD,
		})
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})
})
