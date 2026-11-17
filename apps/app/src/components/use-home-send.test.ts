// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	type HomeConversationStart,
	useHomeSend,
} from "@/components/use-home-send"
import {
	type AttachmentsController,
	type AttachmentsPort,
	createAttachmentsController,
} from "@/lib/chat/attachments-controller"
import { createAttachmentsPort } from "@/lib/chat/attachments-port"
import {
	createDraftsController,
	type DraftsController,
} from "@/lib/chat/drafts-controller"
import {
	type ConversationRuntimes,
	createConversationRuntimes,
} from "@/lib/conversations/conversation-runtimes"
import { createFakeReconnections } from "@/lib/conversations/fake-reconnections"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import { createScriptedDriver } from "@/lib/conversations/scripted-driver"
import type { Conversation } from "@/lib/conversations/store-contract"
import { seatBots } from "@/lib/conversations/transcript-fixtures"
import { nameCallOnFailure } from "@/lib/host/failed-call"
import { hostOfflineOf } from "@/lib/host/host-offline"

const PREVIEW = "blob:home-preview"

const SPACE_ID = "space-a"

const OTHER_SPACE_ID = "space-b"

const HOST_SPACE_ID = "personal"

const NEW_CONVERSATION_ID = "c-new-1"

const OPEN_CONVERSATION = { kind: "conversation", id: "c-open" } as const

const screenshot = () =>
	new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

const notes = () =>
	new File([new Uint8Array([1])], "notes.md", { type: "text/markdown" })

const runtimes = {
	runtimeFor: () => ({ open: () => Promise.resolve() }),
	release: () => Promise.resolve(),
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

type HomeWorkspace = {
	attachments: AttachmentsController
	drafts: DraftsController
	runtimes: ConversationRuntimes
	conversations: Pick<
		HomeConversationStart,
		"startConversation" | "discardConversation"
	>
	openConversation: (conversationId: string) => void
}

type Workspace = HomeWorkspace & {
	conversations: ReturnType<typeof createConversationStore>
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
	runtimes,
	conversations: createConversationStore(),
	openConversation: vi.fn(),
})

const createMemberWorkspace = async () => {
	const host = createFakeTranscriptStore()
	const [agent] = await seatBots(host, HOST_SPACE_ID, ["Ada"])
	const loadPage = vi.fn(host.loadPage)
	const relay = createFakeReconnections()
	const driver = createScriptedDriver()
	const memberRuntimes = createConversationRuntimes(
		driver,
		{
			...host,
			loadPage,
			sendUserMessage: () => Promise.reject(hostOfflineOf("relay lost")),
		},
		{ onReconnected: relay.onReconnected },
	)
	const startedIds: string[] = []
	return {
		attachments: createAttachmentsController(
			createAttachmentsPort({
				chat: { storeAttachments: vi.fn(), sendTo: vi.fn() },
				driver,
				runtimes: memberRuntimes,
			}),
		),
		drafts: createDraftsController(),
		runtimes: memberRuntimes,
		conversations: {
			startConversation: async () => {
				const conversation = await host.createConversation({
					spaceId: HOST_SPACE_ID,
					sectionId: null,
					title: "",
					botIds: [agent.id],
				})
				startedIds.push(conversation.id)
				return conversation
			},
			discardConversation: host.deleteConversation,
		},
		openConversation: vi.fn(),
		startedIds,
		listedIds: async () =>
			(await host.conversations(HOST_SPACE_ID)).map(({ id }) => id),
		pageReadIds: () => loadPage.mock.calls.map(([id]) => id),
		forgetPageReads: () => loadPage.mockClear(),
		reconnectRelay: relay.reconnect,
	}
}

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

const mountHome = (workspace: HomeWorkspace, spaceId = SPACE_ID) =>
	renderHook(() =>
		useHomeSend({
			agentId: "agent",
			spaceId,
			attachments: workspace.attachments,
			drafts: workspace.drafts,
			runtimes: workspace.runtimes,
			startConversation: workspace.conversations.startConversation,
			discardConversation: workspace.conversations.discardConversation,
			openConversation: workspace.openConversation,
		}),
	)

const noticeTitles = () =>
	vi.mocked(raiseFailureNotice).mock.calls.map(([notice]) => notice.title)

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
		const delivery = Promise.withResolvers<boolean>()
		const workspace = createWorkspace({ send: () => delivery.promise })
		const home = mountHome(workspace)
		act(() => home.result.current.onDraftChange("look"))
		act(() => home.result.current.onSubmit("look"))
		await waitFor(() =>
			expect(workspace.conversations.conversationIds()).toHaveLength(1),
		)

		act(() => home.result.current.onDraftChange("look again"))
		act(() => delivery.resolve(true))

		await waitFor(() =>
			expect(workspace.openConversation).toHaveBeenCalledWith(
				NEW_CONVERSATION_ID,
			),
		)
		expect(home.result.current.draft).toBe("look again")
		expect(workspace.drafts.read(`home:${SPACE_ID}`)).toBe("look again")
	})

	it("shows it is sending and ignores a second submit until it ends", async () => {
		const delivery = Promise.withResolvers<boolean>()
		const workspace = createWorkspace({ send: () => delivery.promise })
		const home = mountHome(workspace)

		act(() => {
			home.result.current.onSubmit("look")
			home.result.current.onSubmit("look")
		})

		expect(home.result.current.isSending).toBe(true)
		act(() => home.result.current.onSubmit("look"))
		act(() => delivery.resolve(true))
		await waitFor(() => expect(home.result.current.isSending).toBe(false))
		expect(workspace.conversations.conversationIds()).toEqual([
			NEW_CONVERSATION_ID,
		])
		expect(workspace.openConversation).toHaveBeenCalledOnce()
	})
})

describe("a Home send whose conversation the store refuses", () => {
	it("raises the failed send with the refused call and its error kind", async () => {
		vi.spyOn(console, "error").mockReturnValue(undefined)
		const workspace = createWorkspace()
		const home = mountHome({
			...workspace,
			conversations: {
				...workspace.conversations,
				startConversation: () =>
					nameCallOnFailure(
						"conversation_create",
						Promise.reject({ kind: "storage" }),
					),
			},
		})

		act(() => home.result.current.onSubmit("look"))

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					title: "Couldn’t send that request",
					report: expect.objectContaining({
						context: expect.objectContaining({
							command: "conversation_create",
							errorKind: "storage",
						}),
					}),
				}),
			),
		)
		expect(workspace.openConversation).not.toHaveBeenCalled()
	})
})

const NEVER_SETTLED = new Promise<void>(() => undefined)

describe("a Home send whose runtime cannot be let go", () => {
	it.each([
		["hangs", () => NEVER_SETTLED],
		["fails", () => Promise.reject(new Error("stuck"))],
	])(
		"still discards the conversation and says the send failed when the release %s",
		async (_outcome, release) => {
			vi.spyOn(console, "error").mockReturnValue(undefined)
			const released = vi.fn(release)
			const workspace = {
				...createWorkspace({ send: () => false }),
				runtimes: { ...runtimes, release: released },
			}
			const home = mountHome(workspace)
			act(() => home.result.current.onDraftChange("look"))

			act(() => home.result.current.onSubmit("look"))

			await waitFor(() =>
				expect(noticeTitles()).toEqual(["Couldn’t send that request"]),
			)
			expect(released).toHaveBeenCalledWith(NEW_CONVERSATION_ID)
			expect(workspace.conversations.conversationIds()).toEqual([])
			expect(home.result.current.draft).toBe("look")
			expect(workspace.openConversation).not.toHaveBeenCalled()
		},
	)
})

describe("a Home send on a member device", () => {
	it("never reads the discarded conversation from the host again once the relay reconnects", async () => {
		const member = await createMemberWorkspace()
		const home = mountHome(member)
		act(() => home.result.current.onDraftChange("look"))

		act(() => home.result.current.onSubmit("look"))
		await waitFor(() =>
			expect(noticeTitles()).toEqual(["Couldn’t send that request"]),
		)
		const [discardedId] = member.startedIds
		expect(member.pageReadIds()).toContain(discardedId)
		member.forgetPageReads()

		await act(async () => {
			member.reconnectRelay()
			await settled()
		})

		expect(member.pageReadIds()).not.toContain(discardedId)
		expect(await member.listedIds()).toEqual([])
		expect(home.result.current.draft).toBe("look")
		expect(member.openConversation).not.toHaveBeenCalled()
	})
})
