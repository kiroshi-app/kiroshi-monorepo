// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useHomeSend } from "@/components/use-home-send"
import {
	type AttachmentsController,
	createAttachmentsController,
} from "@/lib/chat/attachments-controller"
import {
	createDraftsController,
	type DraftsController,
} from "@/lib/chat/drafts-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Conversation } from "@/lib/conversations/store-contract"

const PREVIEW = "blob:home-preview"

const SPACE_ID = "space-a"

const OTHER_SPACE_ID = "space-b"

const NEW_CONVERSATION_ID = "c-new"

const OPEN_CONVERSATION = { kind: "conversation", id: "c-open" } as const

const screenshot = () =>
	new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

const notes = () =>
	new File([new Uint8Array([1])], "notes.md", { type: "text/markdown" })

const newConversation = { id: NEW_CONVERSATION_ID } as Conversation

const runtimes = {
	runtimeFor: () => ({ open: () => Promise.resolve() }),
} as unknown as ConversationRuntimes

type Workspace = {
	attachments: AttachmentsController
	drafts: DraftsController
	openConversation: (conversationId: string) => void
}

const createWorkspace = (): Workspace => ({
	attachments: createAttachmentsController({
		store: (_owner, files) =>
			Promise.resolve(files.map((file) => `/data/${file.name}`)),
		send: () => true,
	}),
	drafts: createDraftsController(),
	openConversation: vi.fn(),
})

const mountHome = (workspace: Workspace, spaceId: string = SPACE_ID) =>
	renderHook(() =>
		useHomeSend({
			agentId: "agent",
			spaceId,
			attachments: workspace.attachments,
			drafts: workspace.drafts,
			runtimes,
			startConversation: () => Promise.resolve(newConversation),
			openConversation: workspace.openConversation,
		}),
	)

const namesOf = (attachments: { name: string }[]) =>
	attachments.map(({ name }) => name)

let revoked: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	vi.spyOn(URL, "createObjectURL").mockReturnValue(PREVIEW)
	revoked = vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("the Home composer", () => {
	it("shows the same text and file with its preview after a conversation is opened and closed", () => {
		const workspace = createWorkspace()
		const home = mountHome(workspace)
		act(() => {
			home.result.current.onDraftChange("half a thought")
			home.result.current.onAttach([screenshot()])
		})

		home.unmount()
		const back = mountHome(workspace)

		expect(back.result.current.draft).toBe("half a thought")
		expect(back.result.current.attachments).toEqual([
			expect.objectContaining({ name: "shot.png", previewUrl: PREVIEW }),
		])
		expect(revoked).not.toHaveBeenCalled()
	})

	it("keeps its files per Space and apart from every conversation", () => {
		const workspace = createWorkspace()
		const home = mountHome(workspace)
		act(() => {
			home.result.current.onAttach([screenshot()])
			workspace.attachments.stage(OPEN_CONVERSATION, [notes()])
		})
		home.unmount()

		const otherSpace = mountHome(workspace, OTHER_SPACE_ID)

		expect(otherSpace.result.current.attachments).toEqual([])
		otherSpace.unmount()
		expect(namesOf(mountHome(workspace).result.current.attachments)).toEqual([
			"shot.png",
		])
	})

	it("clears its own text and files on send and no other owner's", async () => {
		const workspace = createWorkspace()
		workspace.drafts.remember(OPEN_CONVERSATION.id, "room draft")
		const otherSpace = mountHome(workspace, OTHER_SPACE_ID)
		act(() => {
			otherSpace.result.current.onDraftChange("other space draft")
			otherSpace.result.current.onAttach([notes()])
			workspace.attachments.stage(OPEN_CONVERSATION, [notes()])
		})
		otherSpace.unmount()
		const home = mountHome(workspace)
		act(() => {
			home.result.current.onDraftChange("look")
			home.result.current.onAttach([screenshot()])
		})

		act(() => home.result.current.onSubmit("look"))

		await waitFor(() =>
			expect(workspace.openConversation).toHaveBeenCalledWith(
				NEW_CONVERSATION_ID,
			),
		)
		expect(home.result.current.draft).toBe("")
		expect(home.result.current.attachments).toEqual([])
		expect(workspace.drafts.read(OPEN_CONVERSATION.id)).toBe("room draft")
		expect(
			namesOf(
				workspace.attachments.getState().staged["conversation:c-open"] ?? [],
			),
		).toEqual(["notes.md"])
		home.unmount()
		const back = mountHome(workspace, OTHER_SPACE_ID)
		expect(back.result.current.draft).toBe("other space draft")
		expect(namesOf(back.result.current.attachments)).toEqual(["notes.md"])
	})
})
