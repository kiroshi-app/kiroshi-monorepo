// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { useHomeSend } from "@/components/use-home-send"
import {
	type AttachmentsController,
	type AttachmentsPort,
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

const NEW_CONVERSATION_ID = "c-new-1"

const OPEN_CONVERSATION = { kind: "conversation", id: "c-open" } as const

const screenshot = () =>
	new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

const notes = () =>
	new File([new Uint8Array([1])], "notes.md", { type: "text/markdown" })

const runtimes = {
	runtimeFor: () => ({ open: () => Promise.resolve() }),
} as unknown as ConversationRuntimes

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

const createConversationStore = () => {
	const conversationIds = new Set<string>()
	let minted = 0
	return {
		conversationIds: () => [...conversationIds],
		startConversation: () => {
			minted += 1
			const conversation = { id: `c-new-${minted}` } as Conversation
			conversationIds.add(conversation.id)
			return Promise.resolve(conversation)
		},
		discardConversation: (conversationId: string) => {
			conversationIds.delete(conversationId)
			return Promise.resolve()
		},
	}
}

type Workspace = {
	attachments: AttachmentsController
	drafts: DraftsController
	conversations: ReturnType<typeof createConversationStore>
	openConversation: (conversationId: string) => void
}

const storeEveryFile: AttachmentsPort["store"] = (_owner, files) =>
	Promise.resolve(files.map((file) => `/data/${file.name}`))

const createWorkspace = (port: Partial<AttachmentsPort> = {}): Workspace => ({
	attachments: createAttachmentsController({
		store: storeEveryFile,
		send: () => true,
		...port,
	}),
	drafts: createDraftsController(),
	conversations: createConversationStore(),
	openConversation: vi.fn(),
})

const mountHome = (workspace: Workspace, spaceId = SPACE_ID) =>
	renderHook(() =>
		useHomeSend({
			agentId: "agent",
			spaceId,
			attachments: workspace.attachments,
			drafts: workspace.drafts,
			runtimes,
			startConversation: workspace.conversations.startConversation,
			discardConversation: workspace.conversations.discardConversation,
			openConversation: workspace.openConversation,
		}),
	)

const noticeTitles = () =>
	vi.mocked(raiseFailureNotice).mock.calls.map(([notice]) => notice.title)

const deferredDelivery = () => {
	let deliver: (isTaken: boolean) => void = () => undefined
	const delivery = new Promise<boolean>((resolve) => {
		deliver = resolve
	})
	return { delivery, deliver }
}

const namesOf = (attachments: { name: string }[]) =>
	attachments.map(({ name }) => name)

beforeEach(() => {
	vi.spyOn(URL, "createObjectURL").mockReturnValue(PREVIEW)
	vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.clearAllMocks()
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
		expect(URL.revokeObjectURL).not.toHaveBeenCalled()
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

describe("a Home send", () => {
	it("leaves no new conversation behind when it fails, on the first try and on a retry", async () => {
		const send = vi
			.fn<AttachmentsPort["send"]>()
			.mockReturnValueOnce(false)
			.mockRejectedValueOnce(new Error("host gone"))
		vi.spyOn(console, "error").mockReturnValue(undefined)
		const workspace = createWorkspace({ send })
		const home = mountHome(workspace)

		act(() => home.result.current.onSubmit("look"))
		await waitFor(() => expect(noticeTitles()).toHaveLength(1))
		expect(workspace.conversations.conversationIds()).toEqual([])

		act(() => home.result.current.onSubmit("look"))
		await waitFor(() => expect(noticeTitles()).toHaveLength(2))
		expect(workspace.conversations.conversationIds()).toEqual([])
		expect(noticeTitles()).toEqual([
			"Couldn’t send that request",
			"Couldn’t send that request",
		])
		expect(workspace.openConversation).not.toHaveBeenCalled()
	})

	it("names the refused file once and not as a failed send", async () => {
		const workspace = createWorkspace({
			store: () => Promise.reject({ kind: "unreadable", name: "shot.png" }),
		})
		const home = mountHome(workspace)
		act(() => home.result.current.onAttach([screenshot()]))

		act(() => home.result.current.onSubmit("look"))

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t attach files",
				description: "Couldn’t read shot.png. Attach it again.",
			}),
		)
		expect(workspace.conversations.conversationIds()).toEqual([])
	})

	it("keeps the text and the files when it fails", async () => {
		const workspace = createWorkspace({ send: () => false })
		const home = mountHome(workspace)
		act(() => {
			home.result.current.onDraftChange("look")
			home.result.current.onAttach([screenshot()])
		})

		act(() => home.result.current.onSubmit("look"))

		await waitFor(() =>
			expect(noticeTitles()).toEqual(["Couldn’t send that request"]),
		)
		expect(home.result.current.draft).toBe("look")
		expect(namesOf(home.result.current.attachments)).toEqual(["shot.png"])
	})

	it("keeps the text typed while it was sending", async () => {
		const { delivery, deliver } = deferredDelivery()
		const workspace = createWorkspace({ send: () => delivery })
		const home = mountHome(workspace)
		act(() => home.result.current.onDraftChange("look"))
		act(() => home.result.current.onSubmit("look"))
		await waitFor(() =>
			expect(workspace.conversations.conversationIds()).toHaveLength(1),
		)

		act(() => home.result.current.onDraftChange("look again"))
		act(() => deliver(true))

		await waitFor(() =>
			expect(workspace.openConversation).toHaveBeenCalledWith(
				NEW_CONVERSATION_ID,
			),
		)
		expect(home.result.current.draft).toBe("look again")
		expect(workspace.drafts.read(`home:${SPACE_ID}`)).toBe("look again")
	})

	it("shows it is sending and ignores a second submit until it ends", async () => {
		const { delivery, deliver } = deferredDelivery()
		const workspace = createWorkspace({ send: () => delivery })
		const home = mountHome(workspace)

		act(() => {
			home.result.current.onSubmit("look")
			home.result.current.onSubmit("look")
		})

		expect(home.result.current.isSending).toBe(true)
		act(() => home.result.current.onSubmit("look"))
		act(() => deliver(true))
		await waitFor(() => expect(home.result.current.isSending).toBe(false))
		expect(workspace.conversations.conversationIds()).toEqual([
			NEW_CONVERSATION_ID,
		])
		expect(workspace.openConversation).toHaveBeenCalledOnce()
	})
})
