// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
	LibraryCommentAgent,
	LibraryCommentPerson,
} from "@workspace/ui/components/library-comment-author"

import { authorAmong, partyOf } from "./library-comment-people"
import type { SentComment } from "./library-comment-threads"
import { useLibraryBoardComments } from "./use-library-board-comments"
import type { LibraryCommentPeople } from "./use-library-comment-people"
import { useLibraryDocumentComments } from "./use-library-document-comments"
import { useLibraryImageComments } from "./use-library-image-comments"

import type {
	LibraryCommentThread,
	LibraryCommentThreadChanged,
} from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	invoke: vi.fn(),
	listen: vi.fn(),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	invoke: host.invoke,
	listen: host.listen,
}))

type Heard = (event: { payload: LibraryCommentThreadChanged }) => void

type AgentAtWork = { id: string }

type OpenThread = {
	id: string
	comments: { body: string }[]
}

type DocumentCardAgents = {
	workingAgent?: AgentAtWork
	workingAgents?: AgentAtWork[]
}

type Draft = {
	onValueChange: (text: string) => void
	onSubmit: () => void
}

type Surface = {
	isCommentMode: boolean | undefined
	openThread: OpenThread | undefined
	agentsAtWork: AgentAtWork[]
	draft: Draft | undefined
	startComment: () => void
	openThreadById: (threadId: string) => void
}

type UseSurface = (people: LibraryCommentPeople) => Surface

const SPACE_ID = "space-on-screen"
const ITEM = "launch"
const SENT_ID = "thread-sent"
const MONA: LibraryCommentPerson = { kind: "person", id: "host", name: "Mona" }
const ATLAS: LibraryCommentAgent = {
	kind: "agent",
	id: "bot-atlas",
	name: "Atlas",
}
const JUNIPER: LibraryCommentAgent = {
	kind: "agent",
	id: "bot-juniper",
	name: "Juniper",
}
const PARTICIPANTS = [ATLAS, JUNIPER, MONA]
const EMPTY_BOARD = { objects: [] }

const threadOf = (
	id: string,
	{ anchor, text, mentions }: SentComment,
): LibraryCommentThread => ({
	id,
	spaceId: SPACE_ID,
	itemName: ITEM,
	anchor,
	state: "open",
	comments: [{ author: partyOf(MONA), createdAt: 1_000, text, mentions }],
	targetMissing: false,
	resolvedBy: null,
	resolvedAt: null,
	lastBoardPoint: null,
})

const INTRO_THREAD = threadOf("thread-intro", {
	anchor: { kind: "block", blockId: "intro" },
	text: "Is this still true?",
	mentions: [],
})

const peopleWith = (
	workingThreadId?: string,
	agentsAtWork: LibraryCommentAgent[] = [ATLAS],
): LibraryCommentPeople => ({
	self: MONA,
	participants: PARTICIPANTS,
	authorOf: (party) => authorAmong(PARTICIPANTS, party, "Someone"),
	workingAgentsOf: ({ id }) => (id === workingThreadId ? agentsAtWork : []),
})

const agentsOnDocumentCard = ({
	workingAgent,
	workingAgents,
}: DocumentCardAgents) => workingAgents ?? (workingAgent ? [workingAgent] : [])

const useDocumentSurface: UseSurface = (people) => {
	const shown = useLibraryDocumentComments({
		spaceId: SPACE_ID,
		name: ITEM,
		hasOpened: true,
		people,
	})
	const openThread = shown.threads?.find(
		({ id }) => id === shown.openThread?.id,
	)
	return {
		isCommentMode: shown.comments?.isCommentMode,
		openThread,
		agentsAtWork: agentsOnDocumentCard({
			...shown.openThread,
			workingAgent: openThread?.workingAgent,
		}),
		draft: shown.commentDraft,
		startComment: () =>
			shown.onStartComment?.({ blockId: "outro", origin: "pointer" }),
		openThreadById: (threadId) => shown.onOpenThread?.(threadId),
	}
}

const useImageSurface: UseSurface = (people) => {
	const shown = useLibraryImageComments({
		spaceId: SPACE_ID,
		name: ITEM,
		people,
	})
	return {
		isCommentMode: shown.comments?.isCommentMode,
		openThread: shown.imageComments?.openThread,
		agentsAtWork: shown.imageComments?.openThread?.workingAgents ?? [],
		draft: shown.imageComments?.draft,
		startComment: () => shown.imageComments?.onStartComment({ x: 0.4, y: 0.6 }),
		openThreadById: (threadId) => shown.imageComments?.onOpenThread(threadId),
	}
}

const useBoardSurface: UseSurface = (people) => {
	const { bar, canvas } = useLibraryBoardComments({
		spaceId: SPACE_ID,
		name: ITEM,
		people,
		view: EMPTY_BOARD,
	})
	return {
		isCommentMode: bar?.isCommentMode,
		openThread: canvas.openCommentThread,
		agentsAtWork: canvas.openCommentThread?.workingAgents ?? [],
		draft: canvas.commentDraft,
		startComment: () => canvas.onStartComment?.({ x: 40, y: 60 }),
		openThreadById: (threadId) => canvas.onOpenCommentThread?.(threadId),
	}
}

const SURFACES_SHOWING_EVERY_AGENT = [
	{ surface: "image", use: useImageSurface },
	{ surface: "board", use: useBoardSurface },
]

const SURFACES = [
	{ surface: "document", use: useDocumentSurface },
	...SURFACES_SHOWING_EVERY_AGENT,
]

const settle = () => act(() => new Promise((flush) => setTimeout(flush, 0)))

const answersSentCommentWith = (
	answerOf: (thread: LibraryCommentThread) => Promise<LibraryCommentThread>,
) =>
	host.invoke.mockImplementation((command: string, sent: SentComment) =>
		command === "library_comment_create"
			? answerOf(threadOf(SENT_ID, sent))
			: Promise.resolve([INTRO_THREAD]),
	)

const answersAtOnce = () =>
	answersSentCommentWith((thread) => Promise.resolve(thread))

const answersLater = () => {
	let answer = () => {}
	answersSentCommentWith(
		(thread) =>
			new Promise((resolve) => {
				answer = () => resolve(thread)
			}),
	)
	return () => act(async () => answer())
}

const mount = async (use: UseSurface) => {
	let hear: Heard = () => {}
	host.listen.mockImplementation((_event: string, heard: Heard) => {
		hear = heard
		return Promise.resolve(vi.fn())
	})
	const hook = renderHook(use, {
		initialProps: peopleWith(),
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(hook.result.current.isCommentMode).toBe(false))
	const shown = () => hook.result.current
	return {
		shown,
		send: (text: string) => {
			act(() => shown().startComment())
			act(() => shown().draft?.onValueChange(text))
			act(() => shown().draft?.onSubmit())
		},
		showWorkingOn: (threadId: string, agentsAtWork?: LibraryCommentAgent[]) =>
			hook.rerender(peopleWith(threadId, agentsAtWork)),
		idsAtWork: () => shown().agentsAtWork.map(({ id }) => id),
		hear: (thread: LibraryCommentThread) =>
			act(() =>
				hear({ payload: { spaceId: SPACE_ID, itemName: ITEM, thread } }),
			),
		bodiesShown: () => shown().openThread?.comments.map(({ body }) => body),
	}
}

const pressC = (target: HTMLElement) => {
	const press = new KeyboardEvent("keydown", {
		key: "c",
		bubbles: true,
		cancelable: true,
	})
	act(() => {
		target.dispatchEvent(press)
	})
	return press
}

const textWithCaret = () => {
	const text = document.createElement("div")
	text.setAttribute("contenteditable", "true")
	document.body.append(text)
	return text
}

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
	vi.clearAllMocks()
})

describe.each(SURFACES)("comments on a Library $surface", ({ use }) => {
	it("enters comment mode on C, and leaves it on C again, when no text has the focus", async () => {
		answersAtOnce()
		const { shown } = await mount(use)

		const press = pressC(document.body)

		expect(shown().isCommentMode).toBe(true)
		expect(press.defaultPrevented).toBe(true)

		pressC(document.body)

		expect(shown().isCommentMode).toBe(false)
	})

	it("lets C be typed, and starts no comment, while the caret is in a text", async () => {
		answersAtOnce()
		const { shown } = await mount(use)

		const press = pressC(textWithCaret())

		expect(press.defaultPrevented).toBe(false)
		expect(shown().isCommentMode).toBe(false)
		expect(shown().draft).toBeUndefined()
	})

	it("leaves the thread of a sent comment that mentions an agent open", async () => {
		answersAtOnce()
		const { shown, send, bodiesShown } = await mount(use)

		send("Check this @Atlas")

		await waitFor(() => expect(shown().openThread?.id).toBe(SENT_ID))
		expect(bodiesShown()).toEqual(["Check this @Atlas"])
		expect(shown().draft).toBeUndefined()
	})

	it("shows the agent at work, then its reply, in the thread left open", async () => {
		answersAtOnce()
		const { shown, send, showWorkingOn, hear, bodiesShown, idsAtWork } =
			await mount(use)
		send("Check this @Atlas")
		await waitFor(() => expect(shown().openThread?.id).toBe(SENT_ID))
		const sent = host.invoke.mock.lastCall?.[1] as SentComment

		showWorkingOn(SENT_ID)

		expect(idsAtWork()).toEqual([ATLAS.id])

		const answered = threadOf(SENT_ID, sent)
		hear({
			...answered,
			comments: [
				...answered.comments,
				{
					author: partyOf(ATLAS),
					createdAt: 2_000,
					text: "Checked, it holds.",
					mentions: [],
				},
			],
		})

		await waitFor(() =>
			expect(bodiesShown()).toEqual([
				"Check this @Atlas",
				"Checked, it holds.",
			]),
		)
	})

	it("keeps the thread of a sent comment that mentions no agent closed", async () => {
		answersAtOnce()
		const { shown, send } = await mount(use)

		send("Check this @Mona")
		await waitFor(() =>
			expect(host.invoke).toHaveBeenCalledWith(
				"library_comment_create",
				expect.objectContaining({ mentions: [partyOf(MONA)] }),
			),
		)
		await settle()

		expect(shown().openThread).toBeUndefined()
		expect(shown().draft).toBeUndefined()
	})

	it("keeps a thread opened while the comment was being sent on screen", async () => {
		const answer = answersLater()
		const { shown, send } = await mount(use)

		send("Check this @Atlas")
		await waitFor(() =>
			expect(host.invoke).toHaveBeenCalledWith(
				"library_comment_create",
				expect.anything(),
			),
		)
		act(() => shown().openThreadById(INTRO_THREAD.id))
		await answer()
		await settle()

		expect(shown().openThread?.id).toBe(INTRO_THREAD.id)
	})
})

describe.each(SURFACES_SHOWING_EVERY_AGENT)(
	"agents at work on a Library $surface thread",
	({ use }) => {
		it("shows every agent at work on the open thread, then only the one still at work", async () => {
			answersAtOnce()
			const { shown, showWorkingOn, idsAtWork } = await mount(use)
			act(() => shown().openThreadById(INTRO_THREAD.id))

			showWorkingOn(INTRO_THREAD.id, [ATLAS, JUNIPER])

			expect(idsAtWork()).toEqual([ATLAS.id, JUNIPER.id])

			showWorkingOn(INTRO_THREAD.id, [JUNIPER])

			expect(idsAtWork()).toEqual([JUNIPER.id])
		})
	},
)

describe("agents at work on a Library document thread", () => {
	it("shows only the first of the agents at work on the open thread", async () => {
		answersAtOnce()
		const { shown, showWorkingOn, idsAtWork } = await mount(useDocumentSurface)
		act(() => shown().openThreadById(INTRO_THREAD.id))

		showWorkingOn(INTRO_THREAD.id, [ATLAS, JUNIPER])

		expect(idsAtWork()).toEqual([ATLAS.id])
	})
})
