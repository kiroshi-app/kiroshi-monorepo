// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { newBotIdentity } from "./bot-settings"
import { createRosterController } from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import { createHarness } from "../chat/controller/controller-fixtures"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { HostSocket } from "../host/http"
import { createQueryTestWrapper } from "../query/query-test-wrapper"
import { joinedRowIdOf } from "../spaces/joined-spaces-controller"

const wire = vi.hoisted(() => ({
	sockets: [] as HostSocket[],
	raised: [] as unknown[],
	hostFailures: [] as unknown[],
}))

vi.mock("../failure-report", async (original) => ({
	...(await original<object>()),
	raiseReportedFailure: (notice: unknown) => {
		wire.raised.push(notice)
		return `notice-${wire.raised.length}`
	},
}))

vi.mock("@/lib/host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host")>()
	const { createJoinedHosts } = await import("../host/joined-hosts")
	const joinedHosts = createJoinedHosts({
		local: {
			invoke: (async () => null) as never,
			listen: async () => () => undefined,
			fileSrc: (path) => path,
		},
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
		fetch: async () =>
			new Response("null", { headers: { "content-type": "application/json" } }),
		openSocket: () => {
			const socket: HostSocket = {
				onopen: null,
				onmessage: null,
				onclose: null,
				close: () => undefined,
			}
			wire.sockets.push(socket)
			return socket
		},
		reportFailure: (failure) => {
			wire.hostFailures.push(failure)
		},
	})
	return {
		...actual,
		joinedHosts,
		listen: joinedHosts.listen,
		onHostReconnected: joinedHosts.onReconnected,
		onHostReconnectedFirst: joinedHosts.onReconnectedFirst,
	}
})

const { joinedHosts } = await import("@/lib/host")

const SHED_HOST = "shed"

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

let detachChat: () => void = () => undefined

const settled = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50))
	})

const lastSocket = () => wire.sockets[wire.sockets.length - 1]

const openLastSocket = () =>
	act(async () => {
		const socket = lastSocket()
		socket?.onopen?.call(socket as WebSocket, new Event("open"))
	})

const dropLastSocket = () => {
	vi.useFakeTimers()
	const socket = lastSocket()
	socket?.onclose?.call(socket as WebSocket, new Event("close") as CloseEvent)
	vi.runOnlyPendingTimers()
	vi.useRealTimers()
}

const sharedStore = async () => {
	const store = createFakeTranscriptStore()
	const shed = await store.createSpace("Shed")
	const seat = async () => {
		const bot = await store.createBot(newBotIdentity([]), LOCAL.spaceId)
		await store.addBotToSpace(bot.id, shed.id)
		return bot
	}
	return { store, shed, kept: await seat(), unshared: await seat() }
}

const joinedMember = async () => {
	const shared = await sharedStore()
	await act(() => joinedHosts.activate(SHED_HOST))
	await openLastSocket()
	const { queryClient, wrapper } = createQueryTestWrapper()
	const roster = createRosterController(shared.store, {
		queryClient,
		reportFailure: (notice) => {
			wire.raised.push(notice)
		},
	})
	renderHook(() => useRosterReads(roster, useControllerState(roster)), {
		wrapper,
	})
	const shedRow = {
		spaceRowId: joinedRowIdOf(SHED_HOST),
		spaceId: shared.shed.id,
	}
	await act(() =>
		roster.load({
			spaces: [LOCAL, shedRow],
			spaceRowId: shedRow.spaceRowId,
			lastRowId: null,
		}),
	)
	const chat = createHarness({
		store: shared.store,
		onReconnected: joinedHosts.onReconnected,
		isListedInOpenSpace: (botId) =>
			roster.getState().bots.some((bot) => bot.id === botId),
	})
	detachChat = chat.detach
	await act(() => chat.controller.open(shared.kept.id, shared.shed.id))
	await act(() => chat.controller.openAside(shared.unshared.id, shared.shed.id))
	await settled()
	return { ...shared, roster, chat }
}

afterEach(async () => {
	wire.raised = []
	wire.hostFailures = []
	detachChat()
	cleanup()
	await joinedHosts.activate(null)
	joinedHosts.forget(SHED_HOST)
})

it("rereads the shared agents before any main chat, and never the chat of an agent unshared while down", async () => {
	const { store, shed, kept, unshared, roster, chat } = await joinedMember()
	const keptChatId = chat.controller.stateFor(kept.id).conversationId
	expect(chat.controller.stateFor(unshared.id).conversationId).not.toBeNull()
	const pageReads = vi.spyOn(store, "loadPage")

	dropLastSocket()
	await store.removeBotFromSpace(unshared.id, shed.id)
	await openLastSocket()
	await settled()

	expect(roster.getState().bots.map(({ id }) => id)).toEqual([kept.id])
	expect(pageReads.mock.calls.map(([id]) => id)).toEqual([keptChatId])
	expect(wire.raised).toEqual([])
	expect(wire.hostFailures).toEqual([])
	expect(chat.controller.stateFor(kept.id).errors).toEqual([])
	expect(chat.controller.stateFor(unshared.id).errors).toEqual([])
})

it("reads no main chat on a reconnection whose reread of the shared agents fails, and shows the roster failure", async () => {
	const { store, roster } = await joinedMember()
	const pageReads = vi.spyOn(store, "loadPage")
	vi.spyOn(store, "conversationPage").mockRejectedValue(
		new Error("the host could not list its conversations"),
	)

	dropLastSocket()
	await openLastSocket()
	await settled()

	expect(roster.getState().hasFailedToLoad).toBe(true)
	expect(pageReads).not.toHaveBeenCalled()
})
