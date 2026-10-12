// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSpaceLoading } from "./use-space-loading"

import type { JoinedSpace } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createRosterController } from "@/lib/bots/roster-controller"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { HostSocket } from "@/lib/host/http"
import {
	createJoinedHosts,
	type JoinedHostsOptions,
	type JoinedHostsState,
} from "@/lib/host/joined-hosts"
import {
	createJoinedSpacesController,
	openRowIdOf,
} from "@/lib/spaces/joined-spaces-controller"
import { createSpacesController } from "@/lib/spaces/spaces-controller"
import { createStore } from "@/lib/store"

const HOST_PERSONAL: JoinedSpace = {
	id: "joined-personal",
	hostUrl: "http://192.168.1.22:45367",
	remoteSpaceId: "personal",
	name: "Personal",
}

const HOST_PERSONAL_ROW = "joined:joined-personal"

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const hostsFake = () => {
	const store = createStore<JoinedHostsState>({ active: null, connections: {} })
	return {
		getState: store.getState,
		subscribe: store.subscribe,
		connect: vi.fn(async () => undefined),
		activate: vi.fn(async (active: string | null) => {
			store.setState({ ...store.getState(), active })
		}),
		forget: vi.fn(),
	}
}

const transportOf = (listed: JoinedSpace[]) => ({
	list: vi.fn(async () => listed),
	add: vi.fn(),
	remove: vi.fn(async () => undefined),
	onChanged: vi.fn(async () => () => undefined),
	onRemoved: vi.fn(async () => () => undefined),
})

const gearFor = async () => {
	const spaces = createSpacesController(createFakeTranscriptStore())
	await spaces.load(null)
	const hosts = hostsFake()
	const joined = createJoinedSpacesController({
		spaces,
		hosts,
		transport: transportOf([HOST_PERSONAL]),
	})
	joined.watch()
	await settle()
	const roster = { load: vi.fn(async () => undefined), enter: vi.fn() }
	const user = {
		getState: () => ({
			preferences: {
				lastSpaceId: null,
				lastBotIdBySpace: {
					personal: "local-bot",
					[HOST_PERSONAL_ROW]: "host-bot",
				},
			},
		}),
		setLastSpace: vi.fn(async () => undefined),
	}
	const inputOf = () => {
		const { selectedSpaceId } = spaces.getState()
		return {
			core: {
				joinedSpaces: {
					state: joined.getState(),
					controller: joined,
					hosts: hosts.getState(),
				},
				roster: { controller: roster },
				spaces: { state: spaces.getState(), controller: spaces },
				user: { controller: user },
			},
			scopes: {
				selectedSpaceId,
				openRowId: openRowIdOf(joined.getState(), selectedSpaceId),
			},
		} as never
	}
	const view = renderHook((input) => useSpaceLoading(input), {
		initialProps: inputOf(),
	})
	await act(settle)
	const switchTo = async (rowId: string) => {
		roster.load.mockClear()
		roster.enter.mockClear()
		await act(async () => {
			joined.selectSpace(rowId)
			await settle()
		})
		view.rerender(inputOf())
	}
	return { roster, user, switchTo }
}

afterEach(() => {
	cleanup()
})

describe("switching between a local and a joined space both carrying the id personal", () => {
	it("reloads the roster from the joined host with its own last bot", async () => {
		const { roster, user, switchTo } = await gearFor()

		await switchTo(HOST_PERSONAL_ROW)

		expect(roster.load).toHaveBeenCalledWith({
			spaces: [{ spaceRowId: HOST_PERSONAL_ROW, spaceId: "personal" }],
			spaceRowId: HOST_PERSONAL_ROW,
			lastRowId: "host-bot",
		})
		expect(roster.enter).toHaveBeenCalledWith({
			spaceRowId: HOST_PERSONAL_ROW,
			spaceId: "personal",
			lastRowId: "host-bot",
		})
		expect(user.setLastSpace).toHaveBeenLastCalledWith(HOST_PERSONAL_ROW)
	})

	it("reloads the roster from the local store with its own last bot on the way back", async () => {
		const { roster, user, switchTo } = await gearFor()
		await switchTo(HOST_PERSONAL_ROW)

		await switchTo("personal")

		expect(roster.load).toHaveBeenCalledWith({
			spaces: [{ spaceRowId: "personal", spaceId: "personal" }],
			spaceRowId: "personal",
			lastRowId: "local-bot",
		})
		expect(roster.enter).toHaveBeenCalledWith({
			spaceRowId: "personal",
			spaceId: "personal",
			lastRowId: "local-bot",
		})
		expect(user.setLastSpace).toHaveBeenLastCalledWith("personal")
	})
})

const LOCAL_COMPANION = "Local Kiro"

const HOST_COMPANION = "Host Quill"

const storeHolding = async (name: string) => {
	const store = createFakeTranscriptStore()
	await store.createBot({ ...newBotIdentity([]), name }, "personal")
	return store
}

const routedBy = (
	hosts: ReturnType<typeof hostsFake>,
	local: TranscriptStore,
	host: TranscriptStore,
) =>
	new Proxy({} as TranscriptStore, {
		get: (_, key: keyof TranscriptStore) =>
			(hosts.getState().active ? host : local)[key],
	})

const mountedRosters = async () => {
	const hosts = hostsFake()
	const local = await storeHolding(LOCAL_COMPANION)
	const host = await storeHolding(HOST_COMPANION)
	const spaces = createSpacesController(local)
	await spaces.load(null)
	const joined = createJoinedSpacesController({
		spaces,
		hosts,
		transport: transportOf([HOST_PERSONAL]),
	})
	joined.watch()
	await settle()
	const roster = createRosterController(routedBy(hosts, local, host))
	const user = {
		getState: () => ({
			preferences: { lastSpaceId: null, lastBotIdBySpace: {} },
		}),
		setLastSpace: vi.fn(async () => undefined),
	}
	const openRowId = () =>
		openRowIdOf(joined.getState(), spaces.getState().selectedSpaceId)
	const namesIn = (rowId: string | null) =>
		(rowId === null ? [] : (roster.getState().rosters[rowId] ?? [])).map(
			(bot) => bot.name,
		)
	const selectedName = () => {
		const { bots, selectedBotId } = roster.getState()
		return bots.find((bot) => bot.id === selectedBotId)?.name
	}
	const frames: { rowId: string | null; shown: string[]; open: string[] }[] = []
	roster.subscribe(() => {
		frames.push({
			rowId: openRowId(),
			shown: namesIn(openRowId()),
			open: roster.getState().bots.map((bot) => bot.name),
		})
	})
	const inputOf = () =>
		({
			core: {
				joinedSpaces: {
					state: joined.getState(),
					controller: joined,
					hosts: hosts.getState(),
				},
				roster: { controller: roster },
				spaces: { state: spaces.getState(), controller: spaces },
				user: { controller: user },
			},
			scopes: {
				selectedSpaceId: spaces.getState().selectedSpaceId,
				openRowId: openRowId(),
			},
		}) as never
	const view = renderHook((input) => useSpaceLoading(input), {
		initialProps: inputOf(),
	})
	await act(settle)
	const switchTo = async (rowId: string) => {
		frames.length = 0
		await act(async () => {
			joined.selectSpace(rowId)
			await settle()
		})
		view.rerender(inputOf())
		await act(settle)
	}
	const reload = () => act(() => roster.reload())
	return { frames, namesIn, selectedName, switchTo, reload }
}

describe("a local and a joined Personal on mounted rosters", () => {
	it("shows the joined row its own companions only, at every frame and through a reload", async () => {
		const { frames, namesIn, selectedName, switchTo, reload } =
			await mountedRosters()

		await switchTo(HOST_PERSONAL_ROW)
		await reload()

		const joinedFrames = frames.filter(
			({ rowId }) => rowId === HOST_PERSONAL_ROW,
		)
		expect(joinedFrames.length).toBeGreaterThan(0)
		for (const { shown, open } of joinedFrames) {
			expect(shown).not.toContain(LOCAL_COMPANION)
			expect(open).not.toContain(LOCAL_COMPANION)
		}
		expect(namesIn(HOST_PERSONAL_ROW)).toContain(HOST_COMPANION)
		expect(selectedName()).not.toBe(LOCAL_COMPANION)
	})

	it("shows the local Personal its own companions again on the way back, through a reload", async () => {
		const { namesIn, selectedName, switchTo, reload } = await mountedRosters()
		await switchTo(HOST_PERSONAL_ROW)

		await switchTo("personal")
		await reload()

		expect(namesIn("personal")).toContain(LOCAL_COMPANION)
		expect(namesIn("personal")).not.toContain(HOST_COMPANION)
		expect(selectedName()).not.toBe(HOST_COMPANION)
	})
})

type JoinOutcome = Awaited<ReturnType<JoinedHostsOptions["join"]>>

type RelayedCall = { command: string; params: unknown[] }

const ROOM_DRAFT = {
	spaceId: "personal",
	sectionId: null,
	title: "Launch",
	botIds: ["default"],
}

const HOST_URL = "http://192.168.1.22:45367"

const HOST_ROOM = "conversation-1"

const LOCAL_ONLY_ROOM = "conversation-2"

const storeWithRooms = async (count: number) => {
	const store = createFakeTranscriptStore()
	for (let room = 0; room < count; room += 1) {
		await store.createConversation(ROOM_DRAFT)
	}
	return store
}

const answerFrom = async (
	store: TranscriptStore,
	{ command, params }: RelayedCall,
): Promise<unknown> => {
	const method = store[command as keyof TranscriptStore] as (
		...params: unknown[]
	) => Promise<unknown>
	return method(...params)
}

const silentSocket = (): HostSocket => ({
	onopen: null,
	onmessage: null,
	onclose: null,
	close: () => undefined,
})

const deferredJoin = () => {
	let release: (outcome: JoinOutcome) => void = () => undefined
	const joining = new Promise<JoinOutcome>((resolve) => {
		release = resolve
	})
	const open = () =>
		release({
			status: "ok",
			data: {
				id: HOST_PERSONAL.id,
				hostUrl: HOST_URL,
				token: "guest",
				remoteSpaceId: HOST_PERSONAL.remoteSpaceId,
				name: HOST_PERSONAL.name,
			},
		})
	return { join: () => joining, open }
}

const relaunchedOnJoinedSpace = async () => {
	const localStore = await storeWithRooms(2)
	const hostStore = await storeWithRooms(1)
	const localCalls: RelayedCall[] = []
	const hostCalls: RelayedCall[] = []
	const joining = deferredJoin()
	const hosts = createJoinedHosts({
		local: {
			invoke: async <T>(command: string, args?: unknown) => {
				const call = { command, ...(args as { params: unknown[] }) }
				localCalls.push(call)
				return (await answerFrom(localStore, call)) as T
			},
			listen: async () => () => undefined,
			fileSrc: (path) => path,
		},
		join: joining.join,
		fetch: async (url, init) => {
			const command = String(url).split("/").at(-1) ?? ""
			const call = { command, ...JSON.parse(String(init?.body)) }
			hostCalls.push(call)
			return new Response(JSON.stringify(await answerFrom(hostStore, call)), {
				headers: { "content-type": "application/json" },
			})
		},
		openSocket: silentSocket,
		reportFailure: vi.fn(),
		reportHostDown: () => "down",
		endHostDown: vi.fn(),
	})
	const relayed = new Proxy({} as TranscriptStore, {
		get:
			(_, command: string) =>
			(...params: unknown[]) =>
				hosts.invoke(command, { params }),
	})
	const spaces = createSpacesController(localStore)
	const joined = createJoinedSpacesController({
		spaces,
		hosts,
		transport: transportOf([HOST_PERSONAL]),
	})
	joined.watch()
	await settle()
	const roster = createRosterController(relayed)
	const user = {
		getState: () => ({
			preferences: { lastSpaceId: HOST_PERSONAL_ROW, lastBotIdBySpace: {} },
		}),
		setLastSpace: vi.fn(async () => undefined),
	}
	const inputOf = () => {
		const { selectedSpaceId } = spaces.getState()
		return {
			core: {
				joinedSpaces: {
					state: joined.getState(),
					controller: joined,
					hosts: hosts.getState(),
				},
				roster: { controller: roster },
				spaces: { state: spaces.getState(), controller: spaces },
				user: { controller: user },
			},
			scopes: {
				selectedSpaceId,
				openRowId: openRowIdOf(joined.getState(), selectedSpaceId),
			},
		} as never
	}
	const view = renderHook((input) => useSpaceLoading(input), {
		initialProps: inputOf(),
	})
	const follow = async () => {
		for (let frame = 0; frame < 4; frame += 1) {
			await act(settle)
			view.rerender(inputOf())
		}
	}
	await follow()
	const openHost = async () => {
		joining.open()
		await follow()
	}
	return { localCalls, hostCalls, openHost }
}

describe("relaunching the app on a joined Space", () => {
	it("sends nothing for the joined Space to the local host while its connection opens", async () => {
		const { localCalls } = await relaunchedOnJoinedSpace()

		expect(localCalls).toEqual([])
	})

	it("reads every conversation of the joined Space from the host with an id the host holds", async () => {
		const { localCalls, hostCalls, openHost } = await relaunchedOnJoinedSpace()

		await openHost()

		const relayedToHost = JSON.stringify(hostCalls)
		expect(relayedToHost).toContain(HOST_ROOM)
		expect(relayedToHost).not.toContain(LOCAL_ONLY_ROOM)
		expect(localCalls).toEqual([])
	})
})
