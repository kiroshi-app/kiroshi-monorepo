// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type PropsWithChildren } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"

import { useLibraryCommentPeople } from "./use-library-comment-people"
import { useLibraryDocumentComments } from "./use-library-document-comments"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	LIBRARY_COMMENT_HOST_AUTHOR_ID,
	LIBRARY_COMMENT_THREAD_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
	type LibraryCommentThread,
} from "../bindings"
import {
	HOSTED_SIGNED_OUT,
	type ThreadAuthorship,
	ThreadAuthorshipContext,
} from "../chat/thread-authorship"
import type { Bot } from "../conversations/store-contract"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	invoke: vi.fn(),
	listen: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	invoke: host.invoke,
	listen: host.listen,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

type Heard = (event: { payload: unknown }, hostId: string | null) => void

const SPACE_ID = "space-on-screen"
const ITEM = "launch"
const THREAD_ID = "thread-intro"
const ASKED = "Can you both check this?"
const ATLAS_REPLY = "Checked, it holds."

const botNamed = (id: string, name: string): Bot => ({
	id,
	name,
	title: "",
	model: "sonnet",
	avatarBlot: null,
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	effort: null,
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

const ATLAS = botNamed("bot-atlas", "Atlas")
const JUNIPER = botNamed("bot-juniper", "Juniper")
const BOTS = [ATLAS, JUNIPER]

const partyOfAgent = ({ id }: Bot) => ({ kind: "agent" as const, id })

const THREAD: LibraryCommentThread = {
	id: THREAD_ID,
	spaceId: SPACE_ID,
	itemName: ITEM,
	anchor: { kind: "block", blockId: "intro" },
	state: "open",
	comments: [
		{
			author: { kind: "person", id: LIBRARY_COMMENT_HOST_AUTHOR_ID },
			createdAt: 1_000,
			text: ASKED,
			mentions: BOTS.map(partyOfAgent),
		},
	],
	targetMissing: false,
	resolvedBy: null,
	resolvedAt: null,
	lastBoardPoint: null,
}

const THREAD_WITH_ATLAS_REPLY: LibraryCommentThread = {
	...THREAD,
	comments: [
		...THREAD.comments,
		{
			author: partyOfAgent(ATLAS),
			createdAt: 2_000,
			text: ATLAS_REPLY,
			mentions: [],
		},
	],
}

const workingTurnOf = ({ id }: Bot): LibraryCommentAgentTurn => ({
	threadId: THREAD_ID,
	agentId: id,
	state: { kind: "working" },
})

const failedTurnOf = ({ id }: Bot): LibraryCommentAgentTurn => ({
	threadId: THREAD_ID,
	agentId: id,
	state: { kind: "failed", reason: "turnFailed", failedAt: 2_000 },
})

const SPACES: { space: string; authorship: ThreadAuthorship }[] = [
	{ space: "hosted here", authorship: HOSTED_SIGNED_OUT },
	{
		space: "joined",
		authorship: {
			accountId: "account-guest",
			host: { kind: "joined", members: [] },
		},
	},
]

const wrapperIn = (authorship: ThreadAuthorship) => {
	const queries = createQueryTestWrapper().wrapper
	return ({ children }: PropsWithChildren) =>
		createElement(
			queries,
			null,
			createElement(
				ThreadAuthorshipContext.Provider,
				{ value: authorship },
				children,
			),
		)
}

const holdsTurns = (held: LibraryCommentAgentTurn[]) =>
	host.invoke.mockImplementation((command: string) =>
		Promise.resolve(
			command === "library_comment_agent_turns" ? held : [THREAD],
		),
	)

const noticedAgentIds = () =>
	host.raiseReportedFailure.mock.calls.map(([, raised]) => raised.botId)

const useDocumentThreads = () => {
	const people = useLibraryCommentPeople({
		spaceId: SPACE_ID,
		bots: BOTS,
		viewerName: "Mona",
	})
	return useLibraryDocumentComments({
		spaceId: SPACE_ID,
		name: ITEM,
		hasOpened: true,
		people,
	})
}

const mountOpenThread = async (authorship: ThreadAuthorship) => {
	const heardOn = new Map<string, Heard>()
	host.listen.mockImplementation((event: string, heard: Heard) => {
		heardOn.set(event, heard)
		return Promise.resolve(vi.fn())
	})
	holdsTurns([workingTurnOf(JUNIPER), workingTurnOf(ATLAS)])
	const hook = renderHook(useDocumentThreads, {
		wrapper: wrapperIn(authorship),
	})
	const openCard = () => {
		const { threads, openThread } = hook.result.current
		return threads?.find(({ id }) => id === openThread?.id)
	}
	const namesAtWork = () =>
		openCard()?.workingAgents?.map(({ name }) => name) ?? []
	await waitFor(() => expect(hook.result.current.threads).toHaveLength(1))
	act(() => hook.result.current.onOpenThread?.(THREAD_ID))
	await waitFor(() => expect(namesAtWork()).toHaveLength(2))
	return {
		openCard,
		namesAtWork,
		bodiesShown: () => openCard()?.comments.map(({ body }) => body),
		hearTurnsNow: (held: LibraryCommentAgentTurn[]) => {
			holdsTurns(held)
			act(() =>
				heardOn.get(LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT)?.(
					{
						payload: {
							spaceId: SPACE_ID,
							threadId: THREAD_ID,
							agentId: ATLAS.id,
						},
					},
					null,
				),
			)
		},
		hearThread: (thread: LibraryCommentThread) =>
			act(() =>
				heardOn.get(LIBRARY_COMMENT_THREAD_CHANGED_EVENT)?.(
					{ payload: { spaceId: SPACE_ID, itemName: ITEM, thread } },
					null,
				),
			),
	}
}

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe.each(SPACES)(
	"agents at work on a Library document thread of a Space $space",
	({ authorship }) => {
		it("passes every agent whose turn runs on the thread, and no single agent beside them", async () => {
			const { openCard, namesAtWork } = await mountOpenThread(authorship)

			expect(namesAtWork()).toEqual(["Atlas", "Juniper"])
			expect(openCard()).not.toHaveProperty("workingAgent")
			expect(noticedAgentIds()).toEqual([])
		})

		it("keeps only the agent still at work once the other has replied", async () => {
			const { namesAtWork, bodiesShown, hearThread, hearTurnsNow } =
				await mountOpenThread(authorship)

			hearThread(THREAD_WITH_ATLAS_REPLY)
			hearTurnsNow([workingTurnOf(JUNIPER)])

			await waitFor(() => expect(namesAtWork()).toEqual(["Juniper"]))
			expect(bodiesShown()).toEqual([ASKED, ATLAS_REPLY])
			expect(noticedAgentIds()).toEqual([])
		})

		it("drops the agent whose turn failed, keeps the other at work, and raises one notice for the failed agent", async () => {
			const { namesAtWork, hearTurnsNow } = await mountOpenThread(authorship)

			hearTurnsNow([failedTurnOf(ATLAS), workingTurnOf(JUNIPER)])

			await waitFor(() => expect(namesAtWork()).toEqual(["Juniper"]))
			expect(noticedAgentIds()).toEqual([ATLAS.id])
		})
	},
)
