// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type PropsWithChildren } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"

import { useLibraryCommentPeople } from "./use-library-comment-people"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
	type LibraryCommentAgentTurnsChanged,
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

type Heard = (
	event: { payload: LibraryCommentAgentTurnsChanged },
	hostId: string | null,
) => void

type Mounting = {
	authorship: ThreadAuthorship
	heldOnStart: LibraryCommentAgentTurn[]
}

const SPACE_ID = "space-on-screen"
const THREAD_ID = "thread-intro"

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

const threadOf = (
	id: string,
	state: LibraryCommentThread["state"] = "open",
): LibraryCommentThread => ({
	id,
	spaceId: SPACE_ID,
	itemName: "plan.md",
	anchor: { kind: "block", blockId: "intro1" },
	state,
	comments: [],
	targetMissing: false,
	resolvedBy: null,
	resolvedAt: null,
	lastBoardPoint: null,
})

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

const ATLAS_TURN_CHANGED: LibraryCommentAgentTurnsChanged = {
	spaceId: SPACE_ID,
	threadId: THREAD_ID,
	agentId: ATLAS.id,
}

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

const noticedAgentIds = () =>
	host.raiseReportedFailure.mock.calls.map(([, raised]) => raised.botId)

const mountPeople = async ({ authorship, heldOnStart }: Mounting) => {
	let hear: Heard = () => {}
	host.listen.mockImplementation((event: string, heard: Heard) => {
		if (event === LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT) {
			hear = heard
		}
		return Promise.resolve(vi.fn())
	})
	host.invoke.mockResolvedValue(heldOnStart)
	const hook = renderHook(
		() =>
			useLibraryCommentPeople({
				spaceId: SPACE_ID,
				bots: BOTS,
				viewerName: "Mona",
			}),
		{ wrapper: wrapperIn(authorship) },
	)
	const namesAtWorkOn = (thread: LibraryCommentThread) =>
		hook.result.current.workingAgentsOf(thread).map(({ name }) => name)
	const namesAtWork = () => namesAtWorkOn(threadOf(THREAD_ID))
	await waitFor(() => expect(namesAtWork()).toHaveLength(heldOnStart.length))
	return {
		namesAtWork,
		namesAtWorkOn,
		hearTurnsNow: (held: LibraryCommentAgentTurn[]) => {
			host.invoke.mockResolvedValue(held)
			act(() => hear({ payload: ATLAS_TURN_CHANGED }, null))
		},
	}
}

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe.each(SPACES)(
	"agents at work on a Library thread of a Space $space",
	({ authorship }) => {
		it("names every agent whose turn runs on the thread, in the order of the agents", async () => {
			const { namesAtWork, namesAtWorkOn } = await mountPeople({
				authorship,
				heldOnStart: [workingTurnOf(JUNIPER), workingTurnOf(ATLAS)],
			})

			expect(namesAtWork()).toEqual(["Atlas", "Juniper"])
			expect(namesAtWorkOn(threadOf("thread-budget"))).toEqual([])
			expect(noticedAgentIds()).toEqual([])
		})

		it("names nobody on the thread once it is resolved", async () => {
			const { namesAtWorkOn } = await mountPeople({
				authorship,
				heldOnStart: [workingTurnOf(ATLAS), workingTurnOf(JUNIPER)],
			})

			expect(namesAtWorkOn(threadOf(THREAD_ID, "resolved"))).toEqual([])
		})

		it("keeps only the agent still at work once the other has replied", async () => {
			const { namesAtWork, hearTurnsNow } = await mountPeople({
				authorship,
				heldOnStart: [workingTurnOf(ATLAS), workingTurnOf(JUNIPER)],
			})

			hearTurnsNow([workingTurnOf(JUNIPER)])

			await waitFor(() => expect(namesAtWork()).toEqual(["Juniper"]))
			expect(noticedAgentIds()).toEqual([])
		})

		it("drops the agent whose turn failed, keeps the other at work, and raises one notice for the failed agent", async () => {
			const { namesAtWork, hearTurnsNow } = await mountPeople({
				authorship,
				heldOnStart: [workingTurnOf(ATLAS), workingTurnOf(JUNIPER)],
			})

			hearTurnsNow([failedTurnOf(ATLAS), workingTurnOf(JUNIPER)])

			await waitFor(() => expect(namesAtWork()).toEqual(["Juniper"]))
			expect(noticedAgentIds()).toEqual([ATLAS.id])
		})
	},
)
