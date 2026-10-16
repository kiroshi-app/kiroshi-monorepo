// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	renderHook,
	waitFor,
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import type { SearchTab } from "@workspace/ui/components/search-palette"

import type {
	Catalogue,
	CatalogueChat,
	CatalogueMission,
	CatalogueRoutine,
} from "./catalogue-contract"
import type { MessageHit } from "./search-contract"
import { createSearchLookups } from "./search-model"
import type { SearchNavigation } from "./search-navigation"
import type { SearchPort } from "./search-port"
import { useSearch } from "./use-search"

import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { botIdentity } from "@/lib/conversations/transcript-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const PERSONAL = "personal"

const WORK = "work"

const A_BOT: Bot = {
	...botIdentity({ name: "Basile", avatarBlot: null }),
	id: "b-work",
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
}

const A_ROOM: Conversation = {
	id: "c-work",
	spaceId: WORK,
	sectionId: null,
	pinPosition: null,
	title: "Roadmap of the other space",
	instructions: "",
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
	participants: [
		{
			botId: A_BOT.id,
			role: "lead",
			joinedAt: 1,
			leftAt: null,
			name: A_BOT.name,
			avatarBlot: null,
			avatarImagePath: null,
			isDeleted: false,
		},
	],
}

const A_CHAT: CatalogueChat = {
	conversationId: A_ROOM.id,
	kind: "topic",
	title: A_ROOM.title,
	botId: null,
	participants: [A_BOT.name],
	spaceId: WORK,
}

const A_MISSION: CatalogueMission = {
	id: "m-1",
	threadConversationId: "c-mission",
	objective: "Roadmap the parser",
	ticketPlatform: "linear",
	ticketExternalId: "OPE-51",
	ticketTitle: "Parser",
	state: "working",
	botId: A_BOT.id,
	spaceId: WORK,
}

const A_ROUTINE: CatalogueRoutine = {
	id: "r-1",
	conversationId: A_ROOM.id,
	botId: A_BOT.id,
	title: "Roadmap digest",
	triggerSourceId: "schedule",
	isEnabled: true,
	expression: "0 9 * * *",
	spaceId: WORK,
}

const ANOTHER_ROUTINE: CatalogueRoutine = {
	...A_ROUTINE,
	id: "r-2",
	title: "Roadmap review",
}

const A_CATALOGUE: Catalogue = {
	chats: [A_CHAT],
	missions: [A_MISSION],
	routines: [A_ROUTINE],
}

const FOUR_RECENTS: CatalogueChat[] = Array.from({ length: 4 }, (_, index) => ({
	...A_CHAT,
	conversationId: `c-recent-${index + 1}`,
	title: `Recent room ${index + 1}`,
}))

type PortSource = {
	catalogue?: Catalogue
	recents?: CatalogueChat[]
}

const aPort = ({
	catalogue = A_CATALOGUE,
	recents = [],
}: PortSource = {}): SearchPort => ({
	messages: vi.fn().mockResolvedValue([]),
	catalogue: vi.fn().mockResolvedValue(catalogue),
	recent: vi.fn().mockResolvedValue(recents),
})

type TracedNavigation = {
	navigation: SearchNavigation
	trace: string[]
}

const aNavigation = (): TracedNavigation => {
	const trace: string[] = []

	return {
		trace,
		navigation: {
			selectBot: (botId) => trace.push(`bot:${botId}`),
			selectConversation: (id) => trace.push(`conversation:${id}`),
			selectSpace: (spaceId) => trace.push(`space:${spaceId}`),
			openMission: ({ missionId, rowId }) =>
				trace.push(`mission:${missionId}:${rowId}`),
			leaveMission: () => undefined,
			openRoutine: ({ routineId, conversationId }) =>
				trace.push(`routine:${routineId}:${conversationId}`),
			openActivityPanel: () => trace.push("activity"),
			recordLanding: ({ messageId, seq }) =>
				trace.push(`landing:${messageId}:${seq}`),
		},
	}
}

type Rendering = {
	navigation: SearchNavigation
	port: SearchPort
	canOpen?: boolean
}

const renderSearch = ({ navigation, port, canOpen = true }: Rendering) => {
	const lookups = createSearchLookups({
		rosters: { [WORK]: [A_BOT] },
		conversationRosters: { [WORK]: [A_ROOM] },
		readerName: "You",
		now: 2,
	})

	return renderHook(
		() =>
			useSearch({
				spaceId: PERSONAL,
				spaceName: "Personal",
				lookups,
				navigation,
				port,
				canOpen,
			}),
		{ wrapper: createQueryTestWrapper().wrapper },
	).result
}

const searchedOn = async (port: SearchPort, navigation: SearchNavigation) => {
	const result = renderSearch({ navigation, port })

	act(() => result.current.open())
	act(() => result.current.palette.onQueryChange("roadmap"))
	await waitFor(() =>
		expect(result.current.palette.results[1].results).toHaveLength(1),
	)

	return result
}

const press = (key: string, held: KeyboardEventInit = {}) => {
	fireEvent.keyDown(document.body, { key, ...held })
}

const pressOnControl = (key: string, held: KeyboardEventInit = {}) => {
	const control = document.createElement("button")
	document.body.append(control)
	fireEvent.keyDown(control, { key, ...held })
	control.remove()
}

afterEach(cleanup)

it("opens the palette on an empty query, the All tab and the current space", () => {
	const { navigation } = aNavigation()
	const result = renderSearch({ navigation, port: aPort() })

	act(() => press("k", { metaKey: true }))

	expect(result.current.isOpen).toBe(true)
	expect(result.current.palette).toMatchObject({
		query: "",
		tab: "all",
		spaceName: "Personal",
	})
})

const pressInField = (markup: string, key: string, held: KeyboardEventInit) => {
	const holder = document.createElement("div")
	holder.innerHTML = markup
	document.body.append(holder)
	const field = holder.querySelector("span") ?? holder.firstElementChild
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key,
		...held,
	})
	field?.dispatchEvent(event)
	holder.remove()
	return event
}

it.each([
	"<input />",
	"<textarea></textarea>",
	"<div contenteditable='true'><span>draft</span></div>",
])("opens no palette on the chord while typing in %s", (markup) => {
	const { navigation } = aNavigation()
	const result = renderSearch({ navigation, port: aPort() })

	let event: KeyboardEvent | undefined
	act(() => {
		event = pressInField(markup, "k", { metaKey: true })
	})

	expect(result.current.isOpen).toBe(false)
	expect(event?.defaultPrevented).toBe(false)
})

it("keeps the chord on an open palette whatever field holds the focus", () => {
	const { navigation } = aNavigation()
	const result = renderSearch({ navigation, port: aPort() })
	act(() => press("k", { metaKey: true }))

	let event: KeyboardEvent | undefined
	act(() => {
		event = pressInField("<input />", "k", { metaKey: true })
	})

	expect(result.current.isOpen).toBe(true)
	expect(event?.defaultPrevented).toBe(true)
})

it("opens no palette on the chord while another dialog is open", () => {
	const { navigation } = aNavigation()
	const result = renderSearch({
		navigation,
		port: aPort(),
		canOpen: false,
	})

	act(() => press("k", { metaKey: true }))

	expect(result.current.isOpen).toBe(false)
})

it("reads only the query the typing went quiet on", async () => {
	const { navigation } = aNavigation()
	const port = aPort()
	const result = renderSearch({ navigation, port })

	act(() => result.current.open())
	act(() => result.current.palette.onQueryChange("r"))
	act(() => result.current.palette.onQueryChange("ro"))
	act(() => result.current.palette.onQueryChange("roadmap"))

	await waitFor(() => expect(port.messages).toHaveBeenCalled())
	expect(port.messages).toHaveBeenCalledOnce()
	expect(port.messages).toHaveBeenCalledWith({
		text: "roadmap",
		spaceId: PERSONAL,
	})
})

it("ignores a rank chord while the palette is open", async () => {
	const { navigation, trace } = aNavigation()
	const result = await searchedOn(aPort(), navigation)

	for (const rank of ["1", "2", "3", "9"]) {
		act(() => press(rank, { metaKey: true }))
	}

	expect(trace).toEqual([])
	expect(result.current.isOpen).toBe(true)
})

it("opens the active result on Enter and moves it with the arrows", async () => {
	const { navigation, trace } = aNavigation()
	const result = await searchedOn(aPort(), navigation)

	expect(result.current.palette.activeResultId).toBe(`chat-${A_ROOM.id}`)

	act(() => press("ArrowUp"))

	expect(result.current.palette.activeResultId).toBe(`routine-${A_ROUTINE.id}`)

	act(() => press("ArrowDown"))
	act(() => press("Enter"))

	expect(trace).toEqual([`conversation:${A_ROOM.id}`, `space:${WORK}`])
})

it("puts the highlight back on the first row when new results land", async () => {
	const { navigation } = aNavigation()
	const port = aPort()
	const result = await searchedOn(port, navigation)
	let answer: (hits: MessageHit[]) => void = () => undefined
	vi.mocked(port.messages).mockReturnValue(
		new Promise((settle) => {
			answer = settle
		}),
	)

	act(() => result.current.palette.onQueryChange("roadmaps"))
	await waitFor(() =>
		expect(port.messages).toHaveBeenCalledWith(
			expect.objectContaining({ text: "roadmaps" }),
		),
	)
	act(() => press("ArrowDown"))

	expect(result.current.palette.activeResultId).not.toBe(`chat-${A_ROOM.id}`)

	await act(async () => answer([]))

	await waitFor(() =>
		expect(result.current.palette.activeResultId).toBe(`chat-${A_ROOM.id}`),
	)
})

it("leaves Enter to a control that is neither the query input nor the body", async () => {
	const { navigation, trace } = aNavigation()
	const result = await searchedOn(aPort(), navigation)

	act(() => pressOnControl("Enter"))

	expect(trace).toEqual([])
	expect(result.current.isOpen).toBe(true)
})

it("moves and opens the active result after the See all button changed the tab", async () => {
	const { navigation, trace } = aNavigation()
	const port = aPort({
		catalogue: { ...A_CATALOGUE, routines: [A_ROUTINE, ANOTHER_ROUTINE] },
	})
	const result = await searchedOn(port, navigation)

	act(() => result.current.palette.onTabChange("routines"))
	act(() => press("ArrowDown"))

	expect(result.current.palette.activeResultId).toBe(
		`routine-${ANOTHER_ROUTINE.id}`,
	)

	act(() => press("Enter"))

	expect(trace).toEqual([
		`conversation:${A_ROOM.id}`,
		`space:${WORK}`,
		"activity",
		`routine:${ANOTHER_ROUTINE.id}:${A_ROOM.id}`,
	])
})

type Resting = {
	tab: SearchTab
	navigation: SearchNavigation
	port?: SearchPort
}

const restingOn = async ({
	tab,
	navigation,
	port = aPort({ recents: FOUR_RECENTS }),
}: Resting) => {
	const result = renderSearch({ navigation, port })

	act(() => result.current.open())
	await waitFor(() =>
		expect(result.current.palette.resting[0]?.results).toHaveLength(
			FOUR_RECENTS.length,
		),
	)
	act(() => result.current.palette.onTabChange(tab))

	return result
}

it("rests on one group per kind, chats then missions then routines", async () => {
	const { navigation } = aNavigation()
	const result = await restingOn({ tab: "all", navigation })

	expect(result.current.palette.resting.map((group) => group.kind)).toEqual([
		"chats",
		"missions",
		"routines",
	])
	expect(
		result.current.palette.resting[1]?.results.map((row) => row.id),
	).toEqual([`mission-${A_MISSION.id}`])
})

it("leaves out of the resting groups a kind that has no row", async () => {
	const { navigation } = aNavigation()
	const result = await restingOn({
		tab: "all",
		navigation,
		port: aPort({
			catalogue: { chats: [], missions: [], routines: [] },
			recents: FOUR_RECENTS,
		}),
	})

	expect(result.current.palette.resting.map((group) => group.kind)).toEqual([
		"chats",
	])
})

it("walks three resting rows per kind on the All tab and no more", async () => {
	const { navigation, trace } = aNavigation()
	const result = await restingOn({ tab: "all", navigation })

	expect(result.current.palette.activeResultId).toBe("chat-c-recent-1")

	act(() => press("ArrowUp"))

	expect(result.current.palette.activeResultId).toBe(`routine-${A_ROUTINE.id}`)

	act(() => press("ArrowDown"))
	act(() => press("ArrowDown"))
	act(() => press("ArrowDown"))
	act(() => press("Enter"))

	expect(trace).toEqual(["conversation:c-recent-3", `space:${WORK}`])
})

it("opens a resting mission the way a mission hit opens", async () => {
	const { navigation, trace } = aNavigation()
	await restingOn({ tab: "all", navigation })

	act(() => press("ArrowDown"))
	act(() => press("ArrowDown"))
	act(() => press("ArrowDown"))
	act(() => press("Enter"))

	expect(trace).toEqual([
		`bot:${A_BOT.id}`,
		`space:${WORK}`,
		`mission:${A_MISSION.id}:${A_BOT.id}`,
	])
})

it("shows the resting set of the new tab without reading again", async () => {
	const { navigation } = aNavigation()
	const port = aPort({ recents: FOUR_RECENTS })
	const result = await restingOn({ tab: "all", navigation, port })
	const reads = vi.mocked(port.catalogue).mock.calls.length

	act(() => result.current.palette.onTabChange("routines"))

	expect(result.current.palette.activeResultId).toBe(`routine-${A_ROUTINE.id}`)
	expect(vi.mocked(port.catalogue).mock.calls).toHaveLength(reads)
	expect(vi.mocked(port.recent).mock.calls).toHaveLength(1)
})

it("walks every resting row of the tab of that kind", async () => {
	const { navigation, trace } = aNavigation()
	const result = await restingOn({ tab: "chats", navigation })

	act(() => press("ArrowUp"))

	expect(result.current.palette.activeResultId).toBe("chat-c-recent-4")

	act(() => press("Enter"))

	expect(trace).toEqual(["conversation:c-recent-4", `space:${WORK}`])
})

it("walks nothing on a resting tab that admits no resting kind", async () => {
	const { navigation, trace } = aNavigation()
	const result = await restingOn({ tab: "messages", navigation })

	expect(result.current.palette.activeResultId).toBeUndefined()

	act(() => press("ArrowDown"))
	act(() => press("Enter"))

	expect(trace).toEqual([])
	expect(result.current.palette.activeResultId).toBeUndefined()
})

it("leaves a key press that only ends a composition to the composition", async () => {
	const { navigation, trace } = aNavigation()
	const result = await searchedOn(aPort(), navigation)
	const active = result.current.palette.activeResultId

	act(() => press("Enter", { isComposing: true }))

	expect(trace).toEqual([])
	expect(result.current.isOpen).toBe(true)
	expect(result.current.palette.activeResultId).toBe(active)
})
