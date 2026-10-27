import { afterEach, describe, expect, it, vi } from "vitest"

import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type { Space as SwitcherSpace } from "@workspace/ui/components/space"
import { spaceArcs } from "@workspace/ui/components/space-avatar-recipe"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	createJoinedSpacesController,
	hostMarksOf,
	type JoinedSpacesTransport,
	openLocalSpaceOf,
	openRowIdOf,
	openSpaceColourOf,
	rosterSpacesOf,
	switcherSpacesOf,
} from "./joined-spaces-controller"
import { spaceQueryKeys } from "./space-query-keys"
import { createSpacesController } from "./spaces-controller"

import type {
	JoinedSpace,
	JoinedSpaceMember,
	JoinedSpaceRemovalReason,
	JoinedSpaceRemoved,
	JoinedSpaceWaitReason,
	Space,
	SpaceDescribed,
} from "../bindings"
import { createStore } from "../store"
import iPhoneVectors from "../../../../ios/KiroshiTests/Vectors/space-avatar.json?raw"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { JoinedHostState, JoinedHostsState } from "../host/joined-hosts"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
	raiseTransientNotice: vi.fn(() => "notice-2"),
}))

const GARAGE: JoinedSpace = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
	state: "online",
	hostedBy: null,
	colour: 132,
	instanceId: "instance-of-joined-garage",
}

const GARAGE_ROW = "joined:joined-garage"

const ATTIC: JoinedSpace = {
	id: "joined-attic",
	hostUrl: "http://192.168.1.21:45367",
	remoteSpaceId: "attic",
	name: "Attic",
	state: "online",
	hostedBy: null,
	colour: 358,
	instanceId: "instance-of-joined-attic",
}

const hostsFake = () => {
	const store = createStore<JoinedHostsState>({ active: null, connections: {} })
	const answers = new Map<string, JoinedHostState>()
	const record = (id: string, state: JoinedHostState) =>
		store.setState({
			...store.getState(),
			connections: { ...store.getState().connections, [id]: state },
		})
	return {
		getState: store.getState,
		subscribe: store.subscribe,
		connect: vi.fn(async (id: string) => {
			const answer = answers.get(id)
			if (answer) record(id, answer)
		}),
		activate: vi.fn(async (id: string | null) => {
			store.setState({ ...store.getState(), active: id })
		}),
		forget: vi.fn(),
		answer: (id: string, state: JoinedHostState) => answers.set(id, state),
		record,
	}
}

const transportFake = (listed: JoinedSpace[] = []) => {
	let held = [...listed]
	let announce: () => void = () => undefined
	let announceRemoval: (removed: JoinedSpaceRemoved) => void = () => undefined
	let announceDescription: (described: SpaceDescribed) => void = () => undefined
	const stopHearingDescriptions = vi.fn()
	const transport = {
		list: vi.fn(async () => held),
		remove: vi.fn(async (id: string) => {
			held = held.filter((joined) => joined.id !== id)
		}),
		describe: vi.fn(async (id: string, name: string, colour: number | null) => {
			const described = held.find((joined) => joined.id === id)
			if (!described) throw { kind: "unknownJoinedSpace", id }
			return {
				...described,
				name,
				colour: colour ?? described.colour,
				hostedBy: "Lea",
			}
		}),
		onChanged: vi.fn(async (listener: () => void) => {
			announce = listener
			return () => undefined
		}),
		onRemoved: vi.fn(
			async (listener: (removed: JoinedSpaceRemoved) => void) => {
				announceRemoval = listener
				return () => undefined
			},
		),
		onDescribed: vi.fn(
			async (listener: (described: SpaceDescribed) => void) => {
				announceDescription = listener
				return stopHearingDescriptions
			},
		),
	} satisfies JoinedSpacesTransport
	return {
		transport,
		stopHearingDescriptions,
		announce: () => announce(),
		describeAs: (described: SpaceDescribed) => announceDescription(described),
		evict: (
			joined: JoinedSpace,
			reason: JoinedSpaceRemovalReason = "removed",
		) => {
			held = held.filter((entry) => entry.id !== joined.id)
			announce()
			announceRemoval({ id: joined.id, name: joined.name, reason })
		},
		hold: (next: JoinedSpace[]) => {
			held = next
		},
	}
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const gearFor = async (listed: JoinedSpace[] = []) => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const { queryClient } = createQueryTestWrapper()
	const hosts = hostsFake()
	const spaces = createSpacesController(store, { queryClient, hosts })
	await spaces.load(home.id)
	const wire = transportFake(listed)
	const reportFailure = vi.fn()
	const reportHostOffline = vi.fn()
	const shownThreads = createStore({
		selectedBotId: null as string | null,
		selectedConversationId: "conversation-on-screen" as string | null,
	})
	const joined = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts,
		transport: wire.transport,
		reportFailure,
		reportHostOffline,
		shownThreads,
	})
	return {
		home,
		store,
		spaces,
		hosts,
		wire,
		reportFailure,
		reportHostOffline,
		shownThreads,
		joined,
		holdMembers: (joinedId: string, members: JoinedSpaceMember[]) =>
			queryClient.setQueryData(
				spaceQueryKeys.joinedMembersOf(joinedId),
				members,
			),
	}
}

afterEach(() => {
	vi.useRealTimers()
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(raiseTransientNotice).mockClear()
})

describe("the switcher rows", () => {
	it("lists the joined spaces after the local ones, named by the link and painted with their colour", () => {
		const local = [{ id: "home", name: "Home", colour: null, position: 0 }]

		expect(switcherSpacesOf(local as never, [GARAGE])).toEqual([
			{ ...local[0], avatarSeed: "home" },
			{
				id: GARAGE_ROW,
				name: "Garage",
				colour: 132,
				avatarSeed: GARAGE.instanceId,
			},
		])
	})

	it("marks a joined space down once its host is down or refused", () => {
		expect(
			hostMarksOf(
				[GARAGE, ATTIC, { ...ATTIC, id: "j3", remoteSpaceId: "loft" }],
				{
					[GARAGE.id]: { status: "up" },
					[ATTIC.id]: { status: "down" },
					j3: { status: "refused", failure: "gone" },
				},
			),
		).toEqual({
			[GARAGE_ROW]: "up",
			"joined:joined-attic": "down",
			"joined:j3": "down",
		})
	})

	it("marks a joined space waiting for its host down whatever its connection", () => {
		expect(
			hostMarksOf([{ ...GARAGE, state: "waitingForHost" }], {
				[GARAGE.id]: { status: "up" },
			}),
		).toEqual({ [GARAGE_ROW]: "down" })
	})

	it("marks a joined space connecting while its host is still connecting", () => {
		expect(
			hostMarksOf([GARAGE], { [GARAGE.id]: { status: "connecting" } }),
		).toEqual({ [GARAGE_ROW]: "connecting" })
	})

	it("marks a joined space connecting before its host reports any state", () => {
		expect(hostMarksOf([GARAGE], {})).toEqual({ [GARAGE_ROW]: "connecting" })
	})

	it("keeps a joined row apart from a local space carrying the same id", () => {
		const local = [{ id: "personal", name: "Personal" }]
		const hostPersonal = { ...GARAGE, remoteSpaceId: "personal" }

		expect(switcherSpacesOf(local as never, [hostPersonal])).toEqual([
			{ ...local[0], avatarSeed: "personal" },
			{
				id: GARAGE_ROW,
				name: "Garage",
				colour: 132,
				avatarSeed: GARAGE.instanceId,
			},
		])
		expect(
			hostMarksOf([hostPersonal], { [GARAGE.id]: { status: "up" } }),
		).toEqual({ [GARAGE_ROW]: "up" })
	})
})

type ParityVector = {
	id: string
	anchor: { x: number; y: number }
	radii: number[]
}

const IPHONE_PARITY_VECTORS: ParityVector[] = JSON.parse(iPhoneVectors).arcs

const SHARED_INSTANCE_ID = "9b1e0000-0000-4000-8000-000000000001"

const OWNED_STUDIO: Space = {
	id: "studio",
	name: "Studio",
	colour: 257,
	position: 0,
	createdAt: 0,
	shared: true,
	instanceId: SHARED_INSTANCE_ID,
}

const arcsOfRow = (rows: SwitcherSpace[], rowId: string) => {
	const row = rows.find((space) => space.id === rowId)
	if (!row) throw new Error(`no switcher row ${rowId}`)
	return spaceArcs(row.avatarSeed)
}

describe("the avatar seed of a switcher row", () => {
	it("draws the host view and the joined view of one shared space with the arcs of the iPhone", () => {
		const joinedStudio = { ...GARAGE, instanceId: SHARED_INSTANCE_ID }
		const hostView = switcherSpacesOf([OWNED_STUDIO], [])
		const joinedView = switcherSpacesOf([], [joinedStudio])
		const vector = IPHONE_PARITY_VECTORS.find(
			({ id }) => id === SHARED_INSTANCE_ID,
		)

		expect(arcsOfRow(joinedView, GARAGE_ROW)).toEqual(
			arcsOfRow(hostView, "studio"),
		)
		expect(arcsOfRow(hostView, "studio")).toEqual({
			anchor: vector?.anchor,
			radii: vector?.radii,
		})
	})

	it("draws a space never shared with the arcs of its local id", () => {
		const local = { ...OWNED_STUDIO, shared: false, instanceId: null }

		expect(arcsOfRow(switcherSpacesOf([local], []), "studio")).toEqual(
			spaceArcs("studio"),
		)
	})

	it("draws a joined row read without an instance with the arcs of its row id", () => {
		const unseeded = { ...GARAGE, instanceId: undefined } as never

		expect(arcsOfRow(switcherSpacesOf([], [unseeded]), GARAGE_ROW)).toEqual(
			spaceArcs(GARAGE_ROW),
		)
	})

	it("keeps the arcs of a renamed space", () => {
		const renamed = { ...OWNED_STUDIO, name: "Studio B" }

		expect(arcsOfRow(switcherSpacesOf([renamed], []), "studio")).toEqual(
			arcsOfRow(switcherSpacesOf([OWNED_STUDIO], []), "studio"),
		)
	})
})

describe("the roster spaces", () => {
	it("reads the local spaces while the local host is active", () => {
		const local = [{ id: "home" }, { id: "work" }]

		expect(rosterSpacesOf(local as never, [GARAGE], null)).toEqual([
			{ spaceRowId: "home", spaceId: "home" },
			{ spaceRowId: "work", spaceId: "work" },
		])
	})

	it("reads the remote space alone while its host is active", () => {
		expect(rosterSpacesOf([], [GARAGE], GARAGE.id)).toEqual([
			{ spaceRowId: GARAGE_ROW, spaceId: "garage" },
		])
	})

	it("falls back to the joined id when the link names no remote space", () => {
		expect(
			rosterSpacesOf([], [{ ...GARAGE, remoteSpaceId: null }], GARAGE.id),
		).toEqual([{ spaceRowId: GARAGE_ROW, spaceId: GARAGE.id }])
	})
})

describe("watching the joined spaces", () => {
	it("lists them and connects each host", async () => {
		const { joined, hosts } = await gearFor([GARAGE, ATTIC])

		joined.watch()
		await settle()

		expect(joined.getState().joinedSpaces).toEqual([GARAGE, ATTIC])
		expect(hosts.connect).toHaveBeenCalledWith(GARAGE.id)
		expect(hosts.connect).toHaveBeenCalledWith(ATTIC.id)
	})

	it("lists them again when a joined space changes", async () => {
		const { joined, wire } = await gearFor()
		joined.watch()
		await settle()

		wire.hold([ATTIC])
		wire.announce()
		await settle()

		expect(joined.getState().joinedSpaces).toEqual([ATTIC])
	})

	it("records a failed list and raises it", async () => {
		const { joined, wire } = await gearFor()
		wire.transport.list.mockRejectedValueOnce(new Error("database locked"))

		joined.watch()
		await settle()

		expect(joined.getState().hasFailedToLoad).toBe(true)
		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: "Something went wrong with this space",
				description:
					"Kiroshi couldn’t finish the request. Try again in a moment.",
			}),
		)
	})

	it("raises a refused list in a sentence, never the refusal kind", async () => {
		const { joined, wire } = await gearFor()
		wire.transport.list.mockRejectedValueOnce({
			kind: "unavailable",
			failure: { kind: "sqlite", detail: "database is locked" },
		})

		joined.watch()
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: "Couldn’t open the spaces you joined",
				description:
					"Kiroshi can’t read its saved data on this computer. Restart Kiroshi, then try again.",
			}),
		)
	})
})

describe("selecting a space", () => {
	it("activates the host of a remote row", async () => {
		const { joined, spaces, hosts } = await gearFor([GARAGE])
		joined.watch()
		await settle()

		joined.selectSpace(GARAGE_ROW)

		expect(spaces.getState().selectedSpaceId).toBe("garage")
		expect(hosts.activate).toHaveBeenLastCalledWith(
			GARAGE.id,
			GARAGE.remoteSpaceId,
		)
	})

	it("activates the local host for a local row", async () => {
		const { joined, spaces, hosts, home } = await gearFor([GARAGE])
		joined.watch()
		await settle()
		joined.selectSpace(GARAGE_ROW)

		joined.selectSpace(home.id)

		expect(spaces.getState().selectedSpaceId).toBe(home.id)
		expect(hosts.activate).toHaveBeenLastCalledWith(null)
	})

	it("selects a Space created while a joined one is shown with no joined host active", async () => {
		const { joined, spaces, hosts, home } = await gearFor([GARAGE])
		joined.watch()
		await settle()
		joined.selectSpace(GARAGE_ROW)

		await spaces.create()

		const { selectedSpaceId } = spaces.getState()
		expect(spaces.getState().spaces.map(({ id }) => id)).toContain(
			selectedSpaceId,
		)
		expect(selectedSpaceId).not.toBe(home.id)
		expect(openRowIdOf(joined.getState(), selectedSpaceId)).toBe(
			selectedSpaceId,
		)
		expect(hosts.getState().active).toBeNull()
	})

	it("keeps the joined Space shown with its host active when a create is refused", async () => {
		const { joined, spaces, hosts, store } = await gearFor([GARAGE])
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		joined.watch()
		await settle()
		joined.selectSpace(GARAGE_ROW)

		await spaces.create()

		const { selectedSpaceId } = spaces.getState()
		expect(openRowIdOf(joined.getState(), selectedSpaceId)).toBe(GARAGE_ROW)
		expect(hosts.getState().active).toBe(GARAGE.id)
	})

	it("opens a remote row once its connection learned the shared Space id", async () => {
		const unlearned = { ...GARAGE, remoteSpaceId: null }
		const { joined, spaces, hosts, home, wire } = await gearFor([unlearned])
		hosts.connect.mockImplementation(async () => wire.hold([GARAGE]))
		joined.watch()
		await settle()

		joined.selectSpace(GARAGE_ROW)

		expect(spaces.getState().selectedSpaceId).toBe(home.id)
		expect(hosts.activate).not.toHaveBeenCalled()
		await settle()
		expect(spaces.getState().selectedSpaceId).toBe(GARAGE.remoteSpaceId)
		expect(hosts.activate).toHaveBeenCalledExactlyOnceWith(
			GARAGE.id,
			GARAGE.remoteSpaceId,
		)
	})

	it("raises a refused connection of a remote row waiting for its shared Space id and keeps the Space picked", async () => {
		const unlearned = { ...GARAGE, remoteSpaceId: null }
		const { joined, spaces, hosts, home, reportFailure } = await gearFor([
			unlearned,
		])
		hosts.connect.mockRejectedValue(new Error("the relay closed"))
		joined.watch()
		await settle()
		reportFailure.mockClear()

		joined.selectSpace(GARAGE_ROW)
		await settle()

		expect(reportFailure).toHaveBeenCalledOnce()
		expect(spaces.getState().selectedSpaceId).toBe(home.id)
		expect(hosts.activate).not.toHaveBeenCalled()
	})

	it("keeps the Space picked while a remote row waits for its shared Space id", async () => {
		const unlearned = { ...GARAGE, remoteSpaceId: null }
		const { joined, spaces, hosts, home, wire } = await gearFor([unlearned])
		hosts.connect.mockImplementation(async () => wire.hold([GARAGE]))
		joined.watch()
		await settle()

		joined.selectSpace(GARAGE_ROW)
		joined.selectSpace(home.id)
		await settle()

		expect(spaces.getState().selectedSpaceId).toBe(home.id)
		expect(hosts.activate).toHaveBeenCalledExactlyOnceWith(null)
	})
})

describe("leaving a space", () => {
	const leavingGarage = async () => {
		const gear = await gearFor([GARAGE])
		gear.joined.watch()
		await settle()
		gear.joined.selectSpace(GARAGE_ROW)
		return gear
	}

	it("removes the selected space and selects the first local one", async () => {
		const gear = await leavingGarage()

		await gear.joined.leave(GARAGE.id)

		expect(gear.wire.transport.remove).toHaveBeenCalledWith(GARAGE.id)
		expect(gear.hosts.forget).toHaveBeenCalledWith(GARAGE.id)
		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
	})

	it("keeps the selection when the space left is not the selected one", async () => {
		const gear = await leavingGarage()
		gear.joined.selectSpace(gear.home.id)
		gear.hosts.activate.mockClear()

		await gear.joined.leave(GARAGE.id)

		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.activate).not.toHaveBeenCalled()
	})

	it("raises a refused removal and keeps the space", async () => {
		const gear = await leavingGarage()
		gear.wire.transport.remove.mockRejectedValueOnce(new Error("disk full"))

		await expect(gear.joined.leave(GARAGE.id)).rejects.toThrow("disk full")

		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
		expect(gear.hosts.forget).not.toHaveBeenCalled()
		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "Something went wrong with this space",
			description:
				"Kiroshi couldn’t finish the request. Try again in a moment.",
		})
	})

	it("keeps a space its owner tries to leave and says an owner can’t leave", async () => {
		const gear = await leavingGarage()
		const refusal = { kind: "ownerNotRemovable" }
		gear.wire.transport.remove.mockRejectedValueOnce(refusal)

		await expect(gear.joined.leave(GARAGE.id)).rejects.toBe(refusal)

		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
		expect(gear.hosts.forget).not.toHaveBeenCalled()
		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "You own this space",
			description: "An owner can’t leave their own space.",
		})
	})

	it("keeps a space the cloud could not be reached to leave and says to retry", async () => {
		const gear = await leavingGarage()
		const refusal = {
			kind: "relayUnreachable",
			detail: "the cloud answered 500",
		}
		gear.wire.transport.remove.mockRejectedValueOnce(refusal)

		await expect(gear.joined.leave(GARAGE.id)).rejects.toBe(refusal)

		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t leave this space",
			description:
				"Kiroshi couldn’t reach its cloud. Check your network, then try again.",
		})
	})

	it("keeps a space the cloud refused to let go and says it didn’t confirm", async () => {
		const gear = await leavingGarage()
		const refusal = { kind: "relayRefused", detail: "the cloud answered 500" }
		gear.wire.transport.remove.mockRejectedValueOnce(refusal)

		await expect(gear.joined.leave(GARAGE.id)).rejects.toBe(refusal)

		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t leave this space",
			description:
				"Kiroshi’s cloud didn’t confirm you left. Try again in a moment.",
		})
	})
})

const STUDIO: JoinedSpace = {
	id: "joined-studio",
	hostUrl: "wss://cloud.kiroshi.test/instances/studio/relay/member",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: null,
	colour: 296,
	instanceId: "instance-of-joined-studio",
}

const STUDIO_ROW = "joined:joined-studio"

const hostNamed = (name: string | null): JoinedSpaceMember => ({
	userId: "u-lea",
	name,
	role: "host",
	deviceId: "device-of-lea",
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
})

const WAITING_STUDIO: JoinedSpace = { ...STUDIO, state: "waitingForHost" }

const HOST_OFFLINE_NOTICE = {
	title: "Studio Nord is offline",
	description:
		"You can read what’s here. You can send again once Kiroshi is open on Lea’s computer.",
}

const withStudio = async () => {
	const gear = await gearFor([STUDIO])
	gear.holdMembers(STUDIO.id, [hostNamed("Lea")])
	gear.joined.watch()
	await settle()
	return gear
}

describe("accepting an invited space", () => {
	it("adds the space as a remote row, connects it and opens it", async () => {
		const gear = await gearFor()
		gear.joined.watch()
		await settle()
		gear.wire.hold([STUDIO])

		await gear.joined.admit(STUDIO)

		expect(gear.joined.getState().joinedSpaces).toEqual([STUDIO])
		expect(gear.hosts.connect).toHaveBeenCalledWith(STUDIO.id)
		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			STUDIO.id,
			STUDIO.remoteSpaceId,
		)
	})
})

describe("accepting an invited space its host has not let in yet", () => {
	const admittedWaiting = async () => {
		const gear = await gearFor()
		gear.joined.watch()
		await settle()
		gear.wire.hold([WAITING_STUDIO])
		await gear.joined.admit(WAITING_STUDIO)
		return gear
	}

	it("lists it and keeps the open space until its host lets it in", async () => {
		const gear = await admittedWaiting()

		expect(gear.joined.getState().joinedSpaces).toEqual([WAITING_STUDIO])
		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.activate).not.toHaveBeenCalledWith(
			STUDIO.id,
			expect.anything(),
		)
	})

	it("opens it once it turns online", async () => {
		const gear = await admittedWaiting()

		gear.wire.hold([STUDIO])
		gear.wire.announce()
		await settle()

		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			STUDIO.id,
			STUDIO.remoteSpaceId,
		)
	})

	it("stays on the space the reader picked meanwhile", async () => {
		const gear = await admittedWaiting()
		gear.joined.selectSpace(gear.home.id)

		gear.wire.hold([STUDIO])
		gear.wire.announce()
		await settle()

		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
	})

	it("opens nothing when the reader picks it while it waits", async () => {
		const gear = await admittedWaiting()

		gear.joined.selectSpace(STUDIO_ROW)

		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.activate).not.toHaveBeenCalledWith(
			STUDIO.id,
			expect.anything(),
		)
	})
})

describe("a joined space turning to wait for its host", () => {
	const turnWaiting = async (gear: Awaited<ReturnType<typeof gearFor>>) => {
		gear.wire.hold([WAITING_STUDIO])
		gear.wire.announce()
		await settle()
	}

	it("raises the host offline notice once for the turn", async () => {
		const gear = await withStudio()

		await turnWaiting(gear)
		gear.wire.announce()
		await settle()

		expect(gear.reportHostOffline).toHaveBeenCalledExactlyOnceWith(
			HOST_OFFLINE_NOTICE,
		)
	})

	it.each([
		"relayUnreachable",
		"rekeySendFailed",
		"hostSilent",
		"socketClosed",
		"rekeyNotVerified",
		"notMember",
		"unknownInstance",
		"deviceKeysUnreadable",
		"deviceAwaitingApproval",
		"socketUrlFailed",
		"rosterMissing",
		"keychainReadFailed",
	] satisfies JoinedSpaceWaitReason[])(
		"describes the host offline notice with the %s wait copy, never its detail",
		async (reason) => {
			const gear = await withStudio()

			gear.wire.hold([
				{ ...WAITING_STUDIO, wait: { reason, detail: "relay said 502" } },
			])
			gear.wire.announce()
			await settle()

			const description = i18n.t(
				`chat:spaceAccessBanner.offline.reasons.${reason}`,
				{ space: "Studio Nord", host: "Lea" },
			)
			expect(gear.reportHostOffline).toHaveBeenCalledExactlyOnceWith({
				title: HOST_OFFLINE_NOTICE.title,
				description,
			})
			expect(description).not.toBe(HOST_OFFLINE_NOTICE.description)
			expect(description).not.toContain("relay said 502")
		},
	)

	it("raises nothing for a space already waiting", async () => {
		const gear = await gearFor([WAITING_STUDIO])
		gear.joined.watch()
		await settle()

		await turnWaiting(gear)

		expect(gear.reportHostOffline).not.toHaveBeenCalled()
	})

	it("keeps the open space open", async () => {
		const gear = await withStudio()
		await gear.joined.admit(STUDIO)

		await turnWaiting(gear)

		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
		expect(gear.joined.getState().openId).toBe(STUDIO.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			STUDIO.id,
			STUDIO.remoteSpaceId,
		)
	})
})

describe("a joined space admitted before whose host is offline", () => {
	const withWaitingStudio = async () => {
		const gear = await gearFor([WAITING_STUDIO])
		gear.joined.watch()
		await settle()
		return gear
	}

	it("opens it when the reader picks it", async () => {
		const gear = await withWaitingStudio()

		gear.joined.selectSpace(STUDIO_ROW)

		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
		expect(gear.joined.getState().openId).toBe(STUDIO.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			STUDIO.id,
			STUDIO.remoteSpaceId,
		)
	})

	it("leaves it and selects the first local space", async () => {
		const gear = await withWaitingStudio()
		gear.joined.selectSpace(STUDIO_ROW)

		await gear.joined.leave(STUDIO.id)

		expect(gear.wire.transport.remove).toHaveBeenCalledWith(STUDIO.id)
		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
	})
})

describe("the host name of a joined space", () => {
	it("reads the host name from the member record of the space", async () => {
		const gear = await withStudio()

		expect(gear.joined.hostNameOf(STUDIO.id)).toBe("Lea")
	})

	it("falls back to the unnamed copy when the record carries no name", async () => {
		const gear = await withStudio()
		gear.holdMembers(STUDIO.id, [hostNamed(null)])

		expect(gear.joined.hostNameOf(STUDIO.id)).toBe("No name")
	})

	it("falls back to the unnamed copy before the record is read", async () => {
		const gear = await gearFor([STUDIO])
		gear.joined.watch()
		await settle()

		expect(gear.joined.hostNameOf(STUDIO.id)).toBe("No name")
	})
})

const openStudioThenEvict = async (reason: JoinedSpaceRemovalReason) => {
	const gear = await withStudio()
	await gear.joined.admit(STUDIO)
	vi.mocked(gear.hosts.activate).mockClear()
	vi.mocked(gear.hosts.connect).mockClear()
	gear.wire.evict(STUDIO, reason)
	await settle()
	return gear
}

const openRowOf = (gear: Awaited<ReturnType<typeof gearFor>>) =>
	openRowIdOf(gear.joined.getState(), gear.spaces.getState().selectedSpaceId)

describe("a host removing the reader from the open space", () => {
	it.each(["removed", "deleted", "unknown"] as const)(
		"keeps the space shown frozen when the reason is %s",
		async (reason) => {
			const gear = await openStudioThenEvict(reason)

			expect(gear.joined.getState().departed).toEqual({
				rowId: STUDIO_ROW,
				spaceId: "studio",
				reason,
				space: STUDIO.name,
				host: "Lea",
				threadId: "conversation-on-screen",
			})
			expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
			expect(openRowOf(gear)).toBe(STUDIO_ROW)
			expect(gear.joined.getState().joinedSpaces).toEqual([])
			expect(gear.hosts.forget).toHaveBeenCalledWith(STUDIO.id)
			expect(gear.hosts.activate).not.toHaveBeenCalled()
			expect(gear.hosts.connect).not.toHaveBeenCalled()
			expect(gear.reportFailure).not.toHaveBeenCalled()
			expect(raiseTransientNotice).not.toHaveBeenCalled()
		},
	)

	it("switches to the previous local space when the reader left", async () => {
		const gear = await openStudioThenEvict("left")

		expect(gear.joined.getState().departed).toBeNull()
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
		expect(gear.hosts.forget).toHaveBeenCalledWith(STUDIO.id)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("lands a reader who left on the first local space when no previous one was recorded", async () => {
		const gear = await gearFor([STUDIO])
		gear.spaces.select("studio")
		gear.joined.restore(STUDIO_ROW)
		gear.joined.watch()
		await settle()
		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")

		const [firstLocal] = gear.spaces.getState().spaces

		gear.wire.evict(STUDIO, "left")
		await settle()

		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
		expect(firstLocal?.id).not.toBe("studio")
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
	})

	it("drops the frozen space for good once the reader selects another space", async () => {
		const gear = await openStudioThenEvict("removed")

		gear.joined.selectSpace(gear.home.id)
		gear.shownThreads.setState({
			selectedBotId: null,
			selectedConversationId: "conversation-on-screen",
		})

		expect(gear.joined.getState().departed).toBeNull()
		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(openRowOf(gear)).toBe(gear.home.id)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("drops the frozen space for good once the reader selects another conversation", async () => {
		const gear = await openStudioThenEvict("deleted")

		gear.shownThreads.setState({
			selectedBotId: null,
			selectedConversationId: "another-conversation",
		})

		expect(gear.joined.getState().departed).toBeNull()
		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("keeps the frozen space while the shown conversation stays", async () => {
		const gear = await openStudioThenEvict("unknown")

		gear.shownThreads.setState({ ...gear.shownThreads.getState() })

		expect(gear.joined.getState().departed?.reason).toBe("unknown")
		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")
	})
})

describe("a host removing the reader from a space not open", () => {
	it.each(["removed", "deleted", "unknown", "left"] as const)(
		"drops the row and shows nothing when the reason is %s",
		async (reason) => {
			const gear = await withStudio()
			await gear.joined.admit(STUDIO)
			gear.joined.selectSpace(gear.home.id)

			gear.wire.evict(STUDIO, reason)
			await settle()

			expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
			expect(gear.joined.getState().joinedSpaces).toEqual([])
			expect(gear.joined.getState().departed).toBeNull()
			expect(gear.hosts.forget).toHaveBeenCalledWith(STUDIO.id)
			expect(raiseTransientNotice).not.toHaveBeenCalled()
		},
	)
})

describe("an unreachable host", () => {
	it("keeps an unreachable host as an unreachable row, never as removed", async () => {
		const gear = await withStudio()
		gear.joined.selectSpace(STUDIO_ROW)

		gear.hosts.record(STUDIO.id, { status: "down" })

		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(gear.joined.getState().joinedSpaces).toEqual([STUDIO])
		expect(
			hostMarksOf(
				gear.joined.getState().joinedSpaces,
				gear.hosts.getState().connections,
			),
		).toEqual({ [STUDIO_ROW]: "down" })
	})
})

describe("a read dropping a joined space", () => {
	it("moves the reader from an open relay space dropped by sign out to the local space", async () => {
		const gear = await withStudio()
		await gear.joined.admit(STUDIO)
		expect(gear.spaces.getState().selectedSpaceId).toBe("studio")

		gear.wire.hold([])
		gear.wire.announce()
		await settle()

		expect(gear.joined.getState().joinedSpaces).toEqual([])
		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
		expect(gear.hosts.forget).toHaveBeenCalledWith(STUDIO.id)
	})

	it("forgets a dropped space that is not open and keeps the selection", async () => {
		const gear = await withStudio()
		await gear.joined.admit(STUDIO)
		gear.joined.selectSpace(gear.home.id)

		gear.wire.hold([])
		gear.wire.announce()
		await settle()

		expect(gear.spaces.getState().selectedSpaceId).toBe(gear.home.id)
		expect(gear.hosts.forget).toHaveBeenCalledWith(STUDIO.id)
	})
})

const HOST_PERSONAL: JoinedSpace = {
	id: "joined-personal",
	hostUrl: "http://192.168.1.22:45367",
	remoteSpaceId: "personal",
	name: "Personal",
	state: "online",
	hostedBy: null,
	colour: 63,
	instanceId: "instance-of-joined-personal",
}

const HOST_PERSONAL_ROW = "joined:joined-personal"

describe("a local and a joined space both carrying the id personal", () => {
	const withBothPersonals = async () => {
		const gear = await gearFor([HOST_PERSONAL])
		gear.joined.watch()
		await settle()
		return gear
	}

	const switcherOf = (gear: Awaited<ReturnType<typeof withBothPersonals>>) => {
		const shown = gear.joined.getState().joinedSpaces
		return {
			rowIds: switcherSpacesOf(gear.spaces.getState().spaces, shown).map(
				(row) => row.id,
			),
			checked: openRowIdOf(
				gear.joined.getState(),
				gear.spaces.getState().selectedSpaceId,
			),
			marks: hostMarksOf(shown, gear.hosts.getState().connections),
		}
	}

	it("checks the joined row only and marks it alone while it is open", async () => {
		const gear = await withBothPersonals()

		gear.joined.selectSpace(HOST_PERSONAL_ROW)

		const switcher = switcherOf(gear)
		expect(switcher.rowIds).toContain("personal")
		expect(switcher.rowIds).toContain(HOST_PERSONAL_ROW)
		expect(switcher.checked).toBe(HOST_PERSONAL_ROW)
		expect(Object.keys(switcher.marks)).toEqual([HOST_PERSONAL_ROW])
		expect(
			openLocalSpaceOf(gear.spaces.getState().spaces, switcher.checked),
		).toBeUndefined()
		expect(gear.spaces.getState().selectedSpaceId).toBe("personal")
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			HOST_PERSONAL.id,
			HOST_PERSONAL.remoteSpaceId,
		)
	})

	it("checks the local row only, with no mark, once the local one is open", async () => {
		const gear = await withBothPersonals()
		gear.joined.selectSpace(HOST_PERSONAL_ROW)

		gear.joined.selectSpace("personal")

		const switcher = switcherOf(gear)
		expect(switcher.checked).toBe("personal")
		expect(switcher.marks.personal).toBeUndefined()
		expect(
			openLocalSpaceOf(gear.spaces.getState().spaces, switcher.checked)?.id,
		).toBe("personal")
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
	})

	it("leaves the joined one and opens the first local space", async () => {
		const gear = await withBothPersonals()
		gear.joined.selectSpace(HOST_PERSONAL_ROW)

		await gear.joined.leave(HOST_PERSONAL.id)

		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.wire.transport.remove).toHaveBeenCalledWith(HOST_PERSONAL.id)
		expect(switcherOf(gear).checked).toBe(firstLocal?.id)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
	})

	it("reopens the joined one remembered at relaunch", async () => {
		const gear = await gearFor([HOST_PERSONAL])
		gear.joined.restore(HOST_PERSONAL_ROW)

		gear.joined.watch()
		await settle()

		expect(switcherOf(gear).checked).toBe(HOST_PERSONAL_ROW)
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(
			HOST_PERSONAL.id,
			HOST_PERSONAL.remoteSpaceId,
		)
	})

	it("keeps the local one open when it was the one remembered", async () => {
		const gear = await withBothPersonals()
		gear.joined.selectSpace("personal")

		gear.joined.restore("personal")

		expect(switcherOf(gear).checked).toBe("personal")
		expect(gear.hosts.activate).toHaveBeenLastCalledWith(null)
	})
})

describe("describing a joined space", () => {
	const describingGarage = async (garage: JoinedSpace = GARAGE) => {
		const gear = await gearFor([garage, ATTIC])
		gear.joined.watch()
		await settle()
		gear.joined.selectSpace(GARAGE_ROW)
		return gear
	}

	type Gear = Awaited<ReturnType<typeof describingGarage>>

	const garageOf = ({ joined }: Gear) =>
		joined.getState().joinedSpaces.find(({ id }) => id === GARAGE.id)

	it("paints the new name and hue at once, in the switcher and as the open space colour", async () => {
		const gear = await describingGarage()

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })

		expect(garageOf(gear)).toMatchObject({ name: "Workshop", colour: 40 })
		expect(
			switcherSpacesOf(
				gear.spaces.getState().spaces,
				gear.joined.getState().joinedSpaces,
			),
		).toContainEqual(
			expect.objectContaining({ id: GARAGE_ROW, name: "Workshop", colour: 40 }),
		)
		expect(
			openSpaceColourOf(gear.spaces.getState(), gear.joined.getState()),
		).toBe(40)
	})

	it("writes them through the joined describe and holds the space it returns", async () => {
		const gear = await describingGarage()

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })
		await settle()

		expect(gear.wire.transport.describe).toHaveBeenCalledExactlyOnceWith(
			GARAGE.id,
			"Workshop",
			40,
		)
		expect(gear.joined.getState().joinedSpaces).toEqual([
			{ ...GARAGE, name: "Workshop", colour: 40, hostedBy: "Lea" },
			ATTIC,
		])
	})

	it("restores the previous name and hue and raises the save failure with the host offline sentence as its reason", async () => {
		const gear = await describingGarage()
		gear.wire.transport.describe.mockRejectedValueOnce({
			kind: "hostOffline",
			id: GARAGE.id,
		})

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })
		await settle()

		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE, ATTIC])
		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t save the name and colour",
			description:
				"Its computer is offline. Try again once it’s back online. The space kept its previous name and colour.",
		})
	})

	it("raises the save failure with the unexpected sentence as its reason when the refusal is not a joined space error", async () => {
		const gear = await describingGarage()
		gear.wire.transport.describe.mockRejectedValueOnce(new Error("disk full"))

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })
		await settle()

		expect(gear.reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t save the name and colour",
			description:
				"Kiroshi couldn’t finish the request. Try again in a moment. The space kept its previous name and colour.",
		})
	})

	it("sends nothing while the host of the space is offline", async () => {
		const waiting: JoinedSpace = { ...GARAGE, state: "waitingForHost" }
		const gear = await describingGarage(waiting)

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })
		await settle()

		expect(gear.wire.transport.describe).not.toHaveBeenCalled()
		expect(garageOf(gear)).toEqual(waiting)
	})

	it("paints the name and hue another member gave the space", async () => {
		const gear = await describingGarage()

		gear.wire.describeAs({ spaceId: "garage", name: "Lab", colour: 200 })

		expect(gear.joined.getState().joinedSpaces).toEqual([
			{ ...GARAGE, name: "Lab", colour: 200 },
			ATTIC,
		])
	})

	it("keeps an edit in flight over a description heard meanwhile, and falls back to the heard one when refused", async () => {
		const gear = await describingGarage()
		let refuse: (reason: unknown) => void = () => undefined
		gear.wire.transport.describe.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					refuse = reject
				}),
		)

		gear.joined.describe(GARAGE.id, { name: "Workshop", colour: 40 })
		await settle()
		gear.wire.describeAs({ spaceId: "garage", name: "Lab", colour: 200 })

		expect(garageOf(gear)).toMatchObject({ name: "Workshop", colour: 40 })

		refuse({ kind: "hostOffline", id: GARAGE.id })
		await settle()

		expect(garageOf(gear)).toMatchObject({ name: "Lab", colour: 200 })
	})

	it("stops hearing descriptions once the watch ends", async () => {
		const gear = await gearFor([GARAGE])
		const stopWatching = gear.joined.watch()
		await settle()

		stopWatching()
		await settle()

		expect(gear.wire.transport.onDescribed).toHaveBeenCalledOnce()
		expect(gear.wire.stopHearingDescriptions).toHaveBeenCalledOnce()
	})
})
