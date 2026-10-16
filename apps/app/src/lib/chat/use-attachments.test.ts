// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { createElement, useRef } from "react"
import { afterEach, describe, expect, it } from "vitest"

import type {
	AttachmentsController,
	AttachmentsState,
} from "@/lib/chat/attachments-controller"
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

const EMPTY_STATE: AttachmentsState = { staged: {}, refusals: {} }

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
	refusedMessage: null,
	pendingPrompt: null,
	latestError: null,
	reportedCauses: new Map(),
	unresolvedMentions: [],
}

const unseatedThread: LoadedConversationThread = {
	kind: "conversation",
	conversation: unseatedConversation,
	runtimes: {} as ConversationRuntimes,
	isSettingsOpen: false,
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
		remove: () => undefined,
		dismissRefusal: () => undefined,
		submit: () => Promise.resolve(true),
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
