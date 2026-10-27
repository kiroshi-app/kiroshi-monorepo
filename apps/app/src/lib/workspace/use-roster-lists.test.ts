// @vitest-environment happy-dom

import { listen } from "@tauri-apps/api/event"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { useRosterLists } from "./use-roster-lists"

import {
	commands,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpace,
	type JoinedSpaceMember,
} from "../bindings"
import { mountRoster } from "../bots/mounted-roster"
import type { RosterController } from "../bots/roster-controller"
import { rosterLinesIn } from "../bots/roster-line"
import {
	type ChatController,
	createChatController,
} from "../chat/chat-controller"
import { createConversationController } from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createScriptedDriver } from "../conversations/scripted-driver"
import type { ObservedState } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))
vi.mock("../bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../bindings")>()
	return {
		...actual,
		commands: { ...actual.commands, joinedSpaceMembers: vi.fn() },
	}
})

afterEach(cleanup)

const SPACE = "personal"

const BOT = "default"

type Said = {
	conversationId: string
	content: string
	authorBotId: string | null
	createdAt: number
}

const saidIn = async (store: TranscriptStore, said: Said) => {
	const turnId = `turn-${said.createdAt}`
	await store.startTurn({
		id: turnId,
		conversationId: said.conversationId,
		startedAt: said.createdAt,
	})
	await store.appendUserMessage({
		id: `said-${said.createdAt}`,
		turnId,
		repliedToMessageId: null,
		...said,
	})
}

type HeldChat = Pick<ChatController, "subscribe" | "stateFor">

type HeldConversations = Pick<ConversationRuntimes, "subscribe" | "heldFor">

const NO_HELD_CHAT: HeldChat = {
	subscribe: () => () => undefined,
	stateFor: () => {
		throw new Error("no chat is held")
	},
}

const NO_HELD_CONVERSATIONS: HeldConversations = {
	subscribe: () => () => undefined,
	heldFor: () => null,
}

type RosterListsWiring = {
	roster: RosterController
	chat?: HeldChat
	conversationRuntimes?: HeldConversations
	joinedSpaces?: JoinedSpace[]
}

const SIGNED_IN = { kind: "signedIn", id: "account-self" }

const rosterListsOn = ({
	roster,
	chat = NO_HELD_CHAT,
	conversationRuntimes = NO_HELD_CONVERSATIONS,
	joinedSpaces = [],
}: RosterListsWiring) => {
	const { bots, rosters, soloThreads, spaceRowId } = roster.getState()
	return {
		core: {
			account: { state: SIGNED_IN },
			joinedSpaces: { state: { joinedSpaces } },
			chat: { controller: chat },
			conversationRuntimes,
			roster: { controller: roster, state: { isRosterPending: false } },
		},
		drivers: { badges: {}, conversationBadges: {} },
		rosterLines: {
			lines: rosterLinesIn(rosters),
			now: 0,
			rosters,
			working: {},
		},
		rosterView: {
			bots,
			missions: [],
			rosteredSpaceId: spaceRowId ?? SPACE,
			soloThreads,
		},
		waitingMissionCount: 0,
	} as unknown as Parameters<typeof useRosterLists>[0]
}

const loadedRoster = async (store: TranscriptStore) => {
	const roster = mountRoster(store)
	await roster.load({
		spaces: [{ spaceRowId: SPACE, spaceId: SPACE }],
		spaceRowId: SPACE,
		lastRowId: null,
	})
	return roster
}

const renderRosterLists = (wiring: RosterListsWiring) =>
	renderHook(() => useRosterLists(rosterListsOn(wiring)), {
		wrapper: createQueryTestWrapper().wrapper,
	}).result

const WHICH_BRANCH = {
	promptId: "prompt-branch",
	kind: "question",
	text: "Which branch should I use?",
} as const

const asking: ObservedState = {
	state: "needs_you",
	pendingPrompt: WHICH_BRANCH,
	workingBotIds: [],
}

const workingBy = (botId: string): ObservedState => ({
	state: "working",
	pendingPrompt: null,
	workingBotIds: [botId],
})

const AT_REST: ObservedState = {
	state: "idle",
	pendingPrompt: null,
	workingBotIds: [],
}

const hostReads = (
	roster: RosterController,
	conversationId: string,
	observed: ObservedState,
) =>
	act(() =>
		roster.holdHostState(
			{ hostId: null, spaceId: SPACE },
			{ conversationId, ...observed },
		),
	)

describe("useRosterLists", () => {
	it("shows a room question on its room row and leaves the companion row to its solo thread", async () => {
		const store = createFakeTranscriptStore()
		const soloThread = await store.mainChat(BOT, null)
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [BOT],
		})
		const roster = await loadedRoster(store)
		const { queryClient, wrapper } = createQueryTestWrapper()
		const { result } = renderHook(
			() => useRosterLists(rosterListsOn({ roster })),
			{ wrapper },
		)
		await waitFor(() => expect(queryClient.isFetching()).toBe(0))
		const conversationRow = () =>
			result.current.rosterConversationsBySpace[SPACE]?.find(
				({ id }) => id === conversation.id,
			)
		const botRow = () =>
			result.current.rosterBotsBySpace[SPACE]?.find(({ id }) => id === BOT)

		hostReads(roster, conversation.id, asking)

		await waitFor(() =>
			expect(conversationRow()?.pendingQuestion).toBe(
				"Which branch should I use?",
			),
		)
		expect(conversationRow()?.badge).toBe("attention")
		expect(botRow()).toMatchObject({ status: "idle", badge: undefined })
		expect(botRow()?.pendingQuestion).toBeUndefined()

		hostReads(roster, conversation.id, workingBy(BOT))

		await waitFor(() =>
			expect(conversationRow()?.pendingQuestion).toBeUndefined(),
		)
		expect(conversationRow()).toMatchObject({ status: "working" })
		expect(botRow()).toMatchObject({ status: "idle" })

		hostReads(roster, soloThread.id, asking)

		await waitFor(() =>
			expect(botRow()).toMatchObject({
				badge: "attention",
				pendingQuestion: "Which branch should I use?",
			}),
		)

		hostReads(roster, soloThread.id, workingBy(BOT))

		await waitFor(() => expect(botRow()?.status).toBe("working"))
		expect(botRow()?.pendingQuestion).toBeUndefined()

		hostReads(roster, conversation.id, AT_REST)
		hostReads(roster, soloThread.id, AT_REST)

		await waitFor(() => expect(conversationRow()?.status).toBe("idle"))
		expect(conversationRow()?.badge).toBeUndefined()
		expect(botRow()).toMatchObject({ status: "idle", badge: undefined })
		expect(botRow()?.pendingQuestion).toBeUndefined()
	})

	it("shows the host state of a row nothing holds in memory, and follows it on rerender", async () => {
		const store = createFakeTranscriptStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [BOT],
		})
		const roster = await loadedRoster(store)
		const { result, rerender } = renderHook(
			() => useRosterLists(rosterListsOn({ roster })),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		const conversationRow = () =>
			result.current.rosterConversations.find(
				({ id }) => id === conversation.id,
			)
		expect(conversationRow()).toMatchObject({ status: "idle" })

		hostReads(roster, conversation.id, workingBy(BOT))
		rerender()

		expect(conversationRow()).toMatchObject({ status: "working" })
		expect(conversationRow()?.badge).toBeUndefined()

		hostReads(roster, conversation.id, { state: "needs_you" })
		rerender()

		expect(conversationRow()).toMatchObject({
			status: "idle",
			badge: "attention",
		})
		expect(conversationRow()?.pendingQuestion).toBeUndefined()
	})

	it("shows the stored last word on a row whose held controller settled on an older one", async () => {
		const store = createFakeTranscriptStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [BOT],
		})
		await saidIn(store, {
			conversationId: conversation.id,
			content: "Older word",
			authorBotId: null,
			createdAt: 1,
		})
		const held = createConversationController(createScriptedDriver(), store)
		await act(() => held.open(conversation))
		await saidIn(store, {
			conversationId: conversation.id,
			content: "Newer word",
			authorBotId: BOT,
			createdAt: 2,
		})
		const roster = await loadedRoster(store)

		const result = renderRosterLists({
			roster,
			conversationRuntimes: { subscribe: held.subscribe, heldFor: () => held },
		})

		const speaker = conversation.participants.find(
			(participant) => participant.botId === BOT,
		)
		const row = result.current.rosterConversations.find(
			({ id }) => id === conversation.id,
		)
		expect(held.getState().messages.map(({ content }) => content)).toEqual([
			"Older word",
		])
		expect(row).toMatchObject({
			lastMessage: "Newer word",
			lastSpeaker: speaker?.name,
			lastActivityAt: 2,
		})
	})

	it.each([
		{ openBotIds: [BOT], status: "working" },
		{ openBotIds: null, status: "idle" },
	])(
		"shows the row $status when its stored open turn names $openBotIds",
		async ({ openBotIds, status }) => {
			const store = createFakeTranscriptStore()
			const conversation = await store.createConversation({
				spaceId: SPACE,
				sectionId: null,
				title: "Walls",
				botIds: [BOT],
			})
			const roster = await loadedRoster(store)
			act(() =>
				roster.holdPageRow(
					{ hostId: null, spaceId: SPACE },
					{
						...conversation,
						lastActivityAt: 0,
						lastWord: null,
						soloBotId: null,
						activeTurn: openBotIds && {
							bots: openBotIds.map((botId) => ({ botId, startedAt: 1 })),
						},
						state: openBotIds ? "working" : "idle",
						workingBotIds: openBotIds ?? [],
					},
				),
			)

			const result = renderRosterLists({ roster })

			const row = result.current.rosterConversations.find(
				({ id }) => id === conversation.id,
			)
			expect(row?.status).toBe(status)
			expect(
				row?.participants.map((participant) => participant.status),
			).toEqual([status])
		},
	)

	it("shows the stored last word on a companion row whose held solo thread settled on an older one", async () => {
		const store = createFakeTranscriptStore()
		const soloThread = await store.mainChat(BOT, null)
		await saidIn(store, {
			conversationId: soloThread.id,
			content: "Older word",
			authorBotId: null,
			createdAt: 1,
		})
		const chat = createChatController(createScriptedDriver(), store)
		await act(() => chat.open(BOT, null))
		await saidIn(store, {
			conversationId: soloThread.id,
			content: "Newer word",
			authorBotId: null,
			createdAt: 2,
		})
		const roster = await loadedRoster(store)

		const result = renderRosterLists({ roster, chat })

		const row = result.current.rosterBots.find(({ id }) => id === BOT)
		expect(chat.stateFor(BOT).messages.map(({ content }) => content)).toEqual([
			"Older word",
		])
		expect(row).toMatchObject({ lastMessage: "Newer word", lastActivityAt: 2 })
	})
})

const STUDIO: JoinedSpace = {
	id: "joined-studio",
	hostUrl: "wss://cloud.kiroshi.test/instances/studio/relay/member",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: null,
	colour: "purple",
	instanceId: "instance-of-joined-studio",
}

const STUDIO_ROW = "joined:joined-studio"

const LEA_HOST: JoinedSpaceMember = {
	userId: "account-lea",
	name: "Lea",
	role: "host",
	deviceId: "device-of-lea",
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
}

const hostedAndJoinedPanels = async (selectedRowId: string) => {
	const store = createFakeTranscriptStore()
	const mine = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [BOT],
	})
	const studio = await store.createSpace("Studio Nord")
	const theirs = await store.createConversation({
		spaceId: studio.id,
		sectionId: null,
		title: "Menu",
		botIds: [],
	})
	const roster = mountRoster(store)
	await roster.load({
		spaces: [
			{ spaceRowId: SPACE, spaceId: SPACE },
			{ spaceRowId: STUDIO_ROW, spaceId: studio.id },
		],
		spaceRowId: selectedRowId,
		lastRowId: null,
	})
	const pageRowOf = (
		conversation: typeof mine,
		authorAccountId: string | null,
		authorName: string | null,
	) => ({
		...conversation,
		lastActivityAt: 5,
		lastWord: {
			text: "Menu is set.",
			at: 5,
			authorBotId: null,
			authorAccountId,
			authorName,
		},
		soloBotId: null,
		activeTurn: null,
		state: "idle" as const,
	})
	act(() => {
		roster.holdPageRow(
			{ hostId: null, spaceId: SPACE },
			pageRowOf(mine, null, null),
		)
		roster.holdPageRow(
			{ hostId: STUDIO.id, spaceId: studio.id },
			pageRowOf(theirs, LEA_HOST.userId, "lea@example.com"),
		)
	})
	return { roster, mine, theirs }
}

const rosterAnswered = (roster: JoinedSpaceMember[]) =>
	vi.mocked(commands.joinedSpaceMembers).mockResolvedValue({
		status: "ok",
		data: roster,
	})

const previewAuthorsOn = async (selectedRowId: string) => {
	const { roster, mine, theirs } = await hostedAndJoinedPanels(selectedRowId)
	const result = renderRosterLists({ roster, joinedSpaces: [STUDIO] })
	const speakerOf = (spaceRowId: string, id: string) =>
		result.current.rosterConversationsBySpace[spaceRowId]?.find(
			(row) => row.id === id,
		)?.lastSpeaker
	return () => ({
		hosted: speakerOf(SPACE, mine.id),
		joined: speakerOf(STUDIO_ROW, theirs.id),
	})
}

const membersChangeAnnounced = () => {
	const [, announce] =
		vi
			.mocked(listen)
			.mock.calls.find(
				([event]) => event === JOINED_SPACE_MEMBERS_CHANGED_EVENT,
			) ?? []
	act(() => {
		announce?.({
			event: JOINED_SPACE_MEMBERS_CHANGED_EVENT,
			id: 1,
			payload: { id: STUDIO.id, members: [] },
		})
	})
}

describe("the preview author of each panel", () => {
	afterEach(() => vi.mocked(commands.joinedSpaceMembers).mockReset())

	it.each([SPACE, STUDIO_ROW])(
		"names each author from the space owning the conversation with %s selected",
		async (selectedRowId) => {
			rosterAnswered([LEA_HOST])

			const authors = await previewAuthorsOn(selectedRowId)

			await waitFor(() =>
				expect(authors()).toEqual({ hosted: undefined, joined: "Lea" }),
			)
			expect(commands.joinedSpaceMembers).toHaveBeenCalledWith(STUDIO.id)
		},
	)

	it.each([SPACE, STUDIO_ROW])(
		"falls back to the unnamed copy, never the stored email, with %s selected",
		async (selectedRowId) => {
			rosterAnswered([{ ...LEA_HOST, name: null }])

			const authors = await previewAuthorsOn(selectedRowId)

			await waitFor(() =>
				expect(authors()).toEqual({ hosted: undefined, joined: "No name" }),
			)
		},
	)

	it("relabels the joined panel once its members change", async () => {
		rosterAnswered([LEA_HOST])
		const authors = await previewAuthorsOn(SPACE)
		await waitFor(() => expect(authors().joined).toBe("Lea"))

		rosterAnswered([{ ...LEA_HOST, name: "Léa Martin" }])
		membersChangeAnnounced()

		await waitFor(() => expect(authors().joined).toBe("Léa Martin"))
	})
})
