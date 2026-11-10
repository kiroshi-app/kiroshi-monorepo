// @vitest-environment happy-dom

import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
} from "@testing-library/react"
import { createElement, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type AttachmentsController,
	type AttachmentsState,
	createAttachmentsController,
} from "@/lib/chat/attachments-controller"
import {
	createDraftsController,
	type DraftsController,
} from "@/lib/chat/drafts-controller"
import {
	factsOf,
	type LoadedConversationThread,
} from "@/lib/chat/thread-contract"
import { useAttachments } from "@/lib/chat/use-attachments"
import type {
	ConversationController,
	ConversationState,
} from "@/lib/conversations/conversation-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Conversation } from "@/lib/conversations/store-contract"

const CONVERSATION_ID = "c-1"

const OWNER = { kind: "conversation", id: CONVERSATION_ID } as const

const EMPTY_STATE: AttachmentsState = {
	staged: {},
	documents: {},
	refusals: {},
}

const unseatedConversation: Conversation = {
	id: CONVERSATION_ID,
	spaceId: "personal",
	sectionId: null,
	pinPosition: null,
	title: "Launch",
	instructions: "",
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
	participants: [],
}

const conversationState: ConversationState = {
	conversationId: CONVERSATION_ID,
	messages: [],
	arrivals: [],
	hasOlder: false,
	isLoadingOlder: false,
	hasNewer: false,
	isLoadingNewer: false,
	isFirstLoadPending: false,
	speakers: [],
	waitingBotIds: [],
	failedBotIds: [],
	refusedMessage: null,
	pendingPrompt: null,
	latestError: null,
	reportedCauses: new Map(),
}

const unseatedThread: LoadedConversationThread = {
	kind: "conversation",
	conversation: unseatedConversation,
	runtimes: {} as ConversationRuntimes,
	onOpenSettings: () => undefined,
	state: conversationState,
	controller: {} as ConversationController,
}

const watchedController = () => {
	const staged: string[][] = []
	const controller: AttachmentsController = {
		getState: () => EMPTY_STATE,
		subscribe: () => () => undefined,
		stage: (_owner, files) => staged.push(files.map((file) => file.name)),
		stageDocument: () => undefined,
		remove: () => undefined,
		dismissRefusal: () => undefined,
		submit: () => Promise.resolve(true),
		submitTo: () => Promise.resolve(true),
		forget: () => undefined,
		release: () => undefined,
	}
	return { staged, controller }
}

type ThreadFixture = {
	controller: AttachmentsController
	canAttach: boolean
}

const Thread = ({ controller, canAttach }: ThreadFixture) => {
	const rootRef = useRef<HTMLDivElement>(null)
	useAttachments(controller, OWNER, canAttach, rootRef)
	return createElement("div", { ref: rootRef, role: "region" })
}

const dropOnWindow = (name: string) => {
	const event = new Event("drop", { bubbles: true, cancelable: true })
	Object.defineProperty(event, "dataTransfer", {
		value: { types: ["Files"], files: [new File(["x"], name)] },
	})
	screen.getByRole("region").dispatchEvent(event)
}

describe("a file dropped on the window of a thread", () => {
	afterEach(cleanup)

	it("is staged on a conversation no companion is seated in", () => {
		const { staged, controller } = watchedController()
		render(
			createElement(Thread, {
				controller,
				canAttach: factsOf(unseatedThread).canAttach,
			}),
		)

		dropOnWindow("screenshot.png")

		expect(staged).toEqual([["screenshot.png"]])
	})

	it("is left alone while the composer of that thread is disabled", () => {
		const { staged, controller } = watchedController()
		render(createElement(Thread, { controller, canAttach: false }))

		dropOnWindow("screenshot.png")

		expect(staged).toEqual([])
	})
})

const PREVIEW = "blob:conversation-preview"

const HOME = { kind: "home", id: "space-a" } as const

const screenshot = () =>
	new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

type Composer = {
	controller: AttachmentsController
	drafts: DraftsController
}

const createComposer = (): Composer => ({
	controller: createAttachmentsController({
		store: () => Promise.resolve([]),
		send: () => true,
	}),
	drafts: createDraftsController(),
})

const mountConversation = ({ controller, drafts }: Composer) =>
	renderHook(() => {
		const rootRef = useRef<HTMLDivElement>(null)
		return {
			staged: useAttachments(controller, OWNER, true, rootRef),
			draft: drafts.read(CONVERSATION_ID),
			rememberDraft: (draft: string) => drafts.remember(CONVERSATION_ID, draft),
		}
	})

describe("a conversation composer left and come back to", () => {
	beforeEach(() => {
		vi.spyOn(URL, "createObjectURL").mockReturnValue(PREVIEW)
		vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
	})

	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it("shows the same text and file with its preview", () => {
		const composer = createComposer()
		const conversation = mountConversation(composer)
		act(() => {
			conversation.result.current.rememberDraft("half a thought")
			conversation.result.current.staged.stage([screenshot()])
		})

		conversation.unmount()
		const back = mountConversation(composer)

		expect(back.result.current.draft).toBe("half a thought")
		expect(back.result.current.staged.items).toEqual([
			expect.objectContaining({ name: "shot.png", previewUrl: PREVIEW }),
		])
		expect(URL.revokeObjectURL).not.toHaveBeenCalled()
	})

	it("leaves the files staged on the Home untouched when it unmounts", () => {
		const composer = createComposer()
		composer.controller.stage(HOME, [screenshot()])
		const conversation = mountConversation(composer)

		conversation.unmount()

		expect(composer.controller.getState().staged["home:space-a"]).toEqual([
			expect.objectContaining({ name: "shot.png", previewUrl: PREVIEW }),
		])
		expect(URL.revokeObjectURL).not.toHaveBeenCalled()
	})
})
