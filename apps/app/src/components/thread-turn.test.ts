// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { type ComponentProps, type ContextType, createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import type { TurnState } from "@workspace/ui/components/turn"

import {
	ThreadBoardDrawers,
	ThreadDocumentsContext,
} from "@/components/thread-documents"
import { RefusedTurn, ThreadTurn } from "@/components/thread-turn"
import type { LibraryDocumentPresence, LibraryItem } from "@/lib/bindings"
import {
	type AnswerActions,
	AnswerActionsContext,
} from "@/lib/chat/answer-actions"
import { attachmentBlock } from "@/lib/chat/message-attachments"
import type { ReplyTarget, TranscriptRow } from "@/lib/chat/screen-model"
import {
	HOSTED_SIGNED_OUT,
	type MessageAuthorship,
	type ThreadAuthorship,
	ThreadAuthorshipContext,
} from "@/lib/chat/thread-authorship"
import type { TranscriptRole } from "@/lib/conversations/transcript-contract"
import type { ThreadLibraryItem } from "@/lib/library/use-followed-library-document"
import { openInBrowser } from "@/lib/links/use-external-links"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@/lib/links/use-external-links", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/links/use-external-links")>()),
	openInBrowser: vi.fn(() => Promise.resolve()),
}))

const openInNewTab = vi.hoisted(() => vi.fn())

const presence = vi.hoisted(() => ({
	hear: null as ((event: { payload: LibraryDocumentPresence }) => void) | null,
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: (
		_event: string,
		hear: (event: { payload: LibraryDocumentPresence }) => void,
	) => {
		presence.hear = hear
		return Promise.resolve(() => undefined)
	},
}))

vi.mock("@/lib/library/library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/library/library-reads")>()),
	readLibraryBoardSummary: (_spaceId: string, name: string) =>
		Promise.resolve({
			name,
			nodeCount: 3,
			nodes: [],
			bounds: null,
		}),
}))

vi.mock("@/lib/navigation/use-open-library-document", () => ({
	useOpenLibraryDocument: () => () => undefined,
	useOpenLibraryItemInNewTab: () => openInNewTab,
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(openInBrowser).mockClear()
	vi.mocked(raiseFailureNotice).mockClear()
	openInNewTab.mockClear()
	presence.hear = null
})

const FIRST_NAME = "0b7c6d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.png"
const SECOND_NAME = "1c8d7e2f-3a4b-4c5d-9e0f-1a2b3c4d5e6f.jpg"
const FIRST = `/root/attachments/c-1/${FIRST_NAME}`
const SECOND = `/root/attachments/c-1/${SECOND_NAME}`

const shownWith = (caption: string, paths: string[]) =>
	[caption, attachmentBlock(paths, new Date(0))].join("\n")

const rowOf = (role: TranscriptRole, text: string): TranscriptRow => ({
	messageId: "m-1",
	turnId: "t-1",
	continuesTurnId: null,
	quotedMessageId: null,
	replyLinks: [],
	documents: [],
	authorBotId: role === "assistant" ? "bot-1" : null,
	authorAccountId: null,
	authorName: null,
	role,
	text,
	timestamp: 1,
	completion: "complete",
})

type TurnSetup = {
	author?: MessageAuthorship
	authorship?: ThreadAuthorship
	state?: TurnState
	onRetry?: (messageId: string) => void
	onReply?: (target: ReplyTarget) => void
	actions?: AnswerActions
	documents?: ContextType<typeof ThreadDocumentsContext>
	names?: string[]
	workingAgentIds?: string[]
}

const renderTurn = (
	role: TranscriptRole,
	text: string,
	{
		author,
		authorship = HOSTED_SIGNED_OUT,
		state = "complete",
		onRetry,
		onReply = () => undefined,
		actions,
		documents = null,
		names = [],
		workingAgentIds = [],
	}: TurnSetup = {},
) => {
	const props: ComponentProps<typeof ThreadTurn> = {
		row: { ...rowOf(role, text), documents: names, ...author },
		anchor: "m-1",
		state,
		readerName: "Ada Moreau",
		onRetry,
		pinned: false,
		now: 0,
		toQuote: () => ({
			author: "",
			excerpt: "",
			from: "user",
			onJump: () => undefined,
		}),
		onPin: () => undefined,
		onReply,
	}
	const turnOf = (shown: ContextType<typeof ThreadDocumentsContext>) =>
		createElement(
			ThreadDocumentsContext,
			{ value: shown },
			createElement(
				AnswerActionsContext,
				{ value: actions ?? null },
				createElement(
					ThreadAuthorshipContext.Provider,
					{ value: authorship },
					createElement(
						ThreadBoardDrawers,
						{
							bots: [],
							conversationId: "conversation-on-screen",
							spaceId: shown?.spaceId,
							workingAgentIds,
						},
						createElement(ThreadTurn, props),
					),
				),
			),
		)
	const rendered = render(turnOf(documents), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	return {
		...rendered,
		showDocuments: (shown: ContextType<typeof ThreadDocumentsContext>) =>
			rendered.rerender(turnOf(shown)),
	}
}

const attachmentButtons = () =>
	within(screen.getByRole("list", { name: "Attachments" })).getAllByRole(
		"button",
	)

const previewOf = (name: string) =>
	within(screen.getByRole("button", { name: `Open ${name}` }))
		.getByRole("presentation", { hidden: true })
		.getAttribute("src")

describe("a companion bubble carrying attachments", () => {
	it("shows every image as an attachment and the caption as text, never the path", () => {
		renderTurn("assistant", shownWith("here are both", [FIRST, SECOND]))

		expect(attachmentButtons()).toHaveLength(2)
		expect(previewOf(FIRST_NAME)).toBeTruthy()
		expect(previewOf(SECOND_NAME)).toBeTruthy()
		expect(screen.getByText("here are both")).toBeTruthy()
		expect(document.body.textContent).not.toContain("/root/attachments")
		expect(document.body.textContent).not.toContain("Attached to this message")
	})

	it("shows the same previews as the person bubble for the same attachments", () => {
		const text = shownWith("look", [FIRST])
		renderTurn("user", text)
		const personPreview = previewOf(FIRST_NAME)
		cleanup()

		renderTurn("assistant", text)

		expect(previewOf(FIRST_NAME)).toBe(personPreview)
	})
})

const IMAGE_MENU_ENTRIES = ["Save to Library", "Copy image", "Open in viewer"]

const openImageMenuOf = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(screen.getByRole("button", { name: `Open ${name}` }))
	})
	return screen.findByRole("menu", { name: `Actions for ${name}` })
}

const pickInImageMenuOf = async (name: string, entry: string) => {
	const menu = await openImageMenuOf(name)
	await act(async () => {
		fireEvent.click(within(menu).getByRole("menuitem", { name: entry }), {
			detail: 1,
		})
	})
}

describe.each<TranscriptRole>(["user", "assistant"])(
	"the image menu of a %s bubble attachment",
	(role) => {
		it("opens on right-click with the image actions", async () => {
			renderTurn(role, shownWith("look", [FIRST, SECOND]), {
				actions: actionsSpy(),
			})

			const menu = await openImageMenuOf(SECOND_NAME)

			expect(
				within(menu)
					.getAllByRole("menuitem")
					.map((item) => item.textContent),
			).toEqual(IMAGE_MENU_ENTRIES)
		})

		it("opens the image in the viewer at its place among the attachments", async () => {
			const actions = actionsSpy()
			renderTurn(role, shownWith("look", [FIRST, SECOND]), { actions })

			await pickInImageMenuOf(SECOND_NAME, "Open in viewer")

			expect(actions.openImage).toHaveBeenCalledWith(
				[
					expect.objectContaining({ id: FIRST, name: FIRST_NAME }),
					expect.objectContaining({ id: SECOND, name: SECOND_NAME }),
				],
				1,
			)
		})

		it.each([
			["Save to Library", "onSaveToLibrary"],
			["Copy image", "onCopyImage"],
		] as const)(
			"hands the image with its path to %s",
			async (entry, handler) => {
				const actions = actionsSpy()
				renderTurn(role, shownWith("look", [FIRST, SECOND]), { actions })

				await pickInImageMenuOf(FIRST_NAME, entry)

				expect(actions.imageActions[handler]).toHaveBeenCalledWith(
					expect.objectContaining({
						name: FIRST_NAME,
						src: previewOf(FIRST_NAME),
						path: FIRST,
					}),
				)
			},
		)
	},
)

const SELF = "account-self"

const SIGNED_IN_HOSTING: ThreadAuthorship = {
	accountId: SELF,
	host: { kind: "hosted" },
}

const SIGNED_IN_JOINED: ThreadAuthorship = {
	accountId: SELF,
	host: {
		kind: "joined",
		members: [
			{
				userId: "account-lea",
				name: "Lea",
				role: "host",
				deviceId: "device-of-lea",
				fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
				isPresent: true,
			},
		],
	},
}

const writtenBy = (
	authorAccountId: string | null,
	authorName: string | null = null,
): MessageAuthorship => ({ authorAccountId, authorName })

const relayedBy = (
	authorAccountId: string,
	authorName: string | null = null,
): MessageAuthorship => ({ authorAccountId, authorName, writtenFrom: "relay" })

const shownBubble = () => screen.getByRole("article")

describe("whose user message a bubble shows", () => {
	it("draws the signed-in account's own message as mine", () => {
		renderTurn("user", "hello", {
			author: writtenBy(SELF, "Me"),
			authorship: SIGNED_IN_JOINED,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("user message")
	})

	it("draws the host's own stamped message as mine once signed out", () => {
		const signedOut: ThreadAuthorship = {
			...SIGNED_IN_HOSTING,
			accountId: null,
		}
		renderTurn("user", "hello", {
			author: writtenBy(SELF, "Me"),
			authorship: signedOut,
		})
		expect(shownBubble().getAttribute("aria-label")).toBe("user message")
		cleanup()

		renderTurn("user", "hello", {
			author: relayedBy("account-tom", "Tom"),
			authorship: signedOut,
		})
		expect(shownBubble().getAttribute("aria-label")).toBe("message from Tom")
	})

	it("draws an unattributed message in a hosted space as mine", () => {
		renderTurn("user", "hello", {
			author: writtenBy(null),
			authorship: SIGNED_IN_HOSTING,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("user message")
	})

	it("draws another account's message as that person, by name", () => {
		renderTurn("user", "hello", {
			author: relayedBy("account-tom", "Tom"),
			authorship: SIGNED_IN_HOSTING,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("message from Tom")
		expect(screen.getByText("Tom")).toBeTruthy()
	})

	it("draws a relayed message as that person even from the signed-in account", () => {
		renderTurn("user", "hello", {
			author: relayedBy(SELF, "Tom"),
			authorship: SIGNED_IN_HOSTING,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("message from Tom")
	})

	it("draws an unattributed message in a joined space as its host", () => {
		renderTurn("user", "hello", {
			author: writtenBy(null),
			authorship: SIGNED_IN_JOINED,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("message from Lea")
	})

	it("names a person with no name like an unnamed companion", () => {
		renderTurn("user", "hello", {
			author: relayedBy("account-tom"),
			authorship: SIGNED_IN_HOSTING,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe(
			"message from No name",
		)
	})

	it("offers retry on the signed-in account's failed message only", () => {
		const failing = (author: MessageAuthorship): TurnSetup => ({
			author,
			authorship: SIGNED_IN_HOSTING,
			state: "failed",
			onRetry: () => undefined,
		})
		renderTurn("user", "hello", failing(writtenBy(SELF)))
		expect(screen.queryByRole("button", { name: "Retry" })).toBeTruthy()
		cleanup()

		renderTurn("user", "hello", failing(relayedBy("account-tom", "Tom")))
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
	})

	it("draws a companion message the same in a joined space", () => {
		renderTurn("assistant", "hello", {
			author: writtenBy(null),
			authorship: SIGNED_IN_JOINED,
		})

		expect(shownBubble().getAttribute("aria-label")).toBe("assistant message")
	})
})

const actionsSpy = () => ({
	insert: vi.fn<AnswerActions["insert"]>(),
	openImage: vi.fn<AnswerActions["openImage"]>(),
	imageActions: {
		onSaveToLibrary: vi.fn(),
		onCopyImage: vi.fn(),
		isSavingImage: () => false,
	},
})

const OPTIONS_ANSWER = `Two ways forward.

\`\`\`options
question: How should the migration ship?
- title: One release
  text: Ten minutes of downtime.
- title: Dual write
  text: No downtime, two weeks of double writes.
\`\`\``

const GALLERY_ANSWER = `Two sofas.

\`\`\`gallery
- image: https://images.example.org/green.jpg
  alt: Green velvet sofa
  caption: 1,290 euros
- image: https://images.example.org/grey.jpg
  alt: Grey linen sofa
\`\`\``

describe("an agent answer carrying rich blocks", () => {
	it("puts a picked option into the conversation input", () => {
		const actions = actionsSpy()
		renderTurn("assistant", OPTIONS_ANSWER, { actions })

		fireEvent.click(screen.getByRole("button", { name: "Dual write" }))

		expect(actions.insert).toHaveBeenCalledWith("Dual write")
	})

	it("opens a gallery image in the viewer, with every image of the gallery", () => {
		const actions = actionsSpy()
		renderTurn("assistant", GALLERY_ANSWER, { actions })

		fireEvent.click(screen.getByRole("button", { name: "Grey linen sofa" }))

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					name: "Green velvet sofa",
					src: "https://images.example.org/green.jpg",
					detail: "1,290 euros",
				}),
				expect.objectContaining({ name: "Grey linen sofa" }),
			],
			1,
		)
	})

	it("opens a sourced image of the answer in the viewer", () => {
		const actions = actionsSpy()
		renderTurn(
			"assistant",
			"The waterfront.\n\n![The Lisbon waterfront](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com)",
			{ actions },
		)

		fireEvent.click(
			screen.getByRole("button", { name: "The Lisbon waterfront" }),
		)

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					name: "The Lisbon waterfront",
					src: "https://images.example.org/lisbon.jpg",
					detail: "Visit Lisboa",
				}),
			],
			0,
		)
	})

	it("opens a plain image of the answer in the viewer", () => {
		const actions = actionsSpy()
		renderTurn(
			"assistant",
			"This one: ![Green velvet sofa](https://images.example.org/green.jpg)",
			{ actions },
		)

		fireEvent.click(screen.getByRole("button", { name: "Green velvet sofa" }))

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					src: "https://images.example.org/green.jpg",
				}),
			],
			0,
		)
	})

	it("holds the pending frame while the agent is still writing the block", () => {
		renderTurn("assistant", OPTIONS_ANSWER.replace(/\n```$/, ""), {
			actions: actionsSpy(),
			state: "streaming",
		})

		expect(
			screen.getByRole("region", { name: "Options" }).getAttribute("aria-busy"),
		).toBe("true")
		expect(screen.queryByRole("button", { name: "Dual write" })).toBeNull()
	})
})

const webPageAnswer = (fields: string) =>
	`The rooms.\n\n\`\`\`web-page\n${fields}\n\`\`\``

const WEB_PAGE_FIELDS = `url: https://www.casadorio.pt/rooms
title: Casa do Rio, rooms and rates`

const WEB_PAGE_ANSWER = webPageAnswer(`${WEB_PAGE_FIELDS}
image: https://images.example.org/casa-do-rio.jpg
alt: Terrace of Casa do Rio over the river`)

const WEB_PAGE_WITHOUT_IMAGE_ANSWER = webPageAnswer(WEB_PAGE_FIELDS)

const openAsPage = () =>
	fireEvent.click(screen.getByRole("button", { name: "Open as page" }))

describe("an agent answer carrying a web page", () => {
	it("shows the page preview with its image and its alt", () => {
		renderTurn("assistant", WEB_PAGE_ANSWER, { actions: actionsSpy() })

		const preview = screen.getByRole("img", {
			name: "Terrace of Casa do Rio over the river",
		})
		expect(preview.getAttribute("src")).toBe(
			"https://images.example.org/casa-do-rio.jpg",
		)
	})

	it("shows the card with no image when the page has none", () => {
		const { container } = renderTurn(
			"assistant",
			WEB_PAGE_WITHOUT_IMAGE_ANSWER,
			{ actions: actionsSpy() },
		)

		expect(screen.getByText("Casa do Rio, rooms and rates")).toBeTruthy()
		expect(container.querySelector("img")).toBeNull()
	})

	it("opens the page address in the browser on Open as page", () => {
		renderTurn("assistant", WEB_PAGE_ANSWER, { actions: actionsSpy() })

		openAsPage()

		expect(openInBrowser).toHaveBeenCalledWith("https://www.casadorio.pt/rooms")
	})

	it("says the page did not open when the browser refuses it", async () => {
		vi.mocked(openInBrowser).mockRejectedValueOnce(new Error("refused"))
		renderTurn("assistant", WEB_PAGE_ANSWER, { actions: actionsSpy() })

		openAsPage()
		await vi.waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title:
						"Couldn’t open the page in the browser. Press Open as page again.",
				}),
			),
		)
	})
})

const selectAll = (text: string) => {
	const passage = screen.getByText(text)
	const range = document.createRange()
	range.selectNodeContents(passage)
	document.getSelection()?.removeAllRanges()
	document.getSelection()?.addRange(range)
	fireEvent.pointerUp(passage)
}

const pressOnSelection = (action: "Reply" | "Copy") =>
	fireEvent.click(
		within(screen.getByRole("toolbar", { name: "Selected text" })).getByRole(
			"button",
			{ name: action },
		),
	)

describe("a selection inside a message", () => {
	it("replies to the selected excerpt of an agent answer", () => {
		const onReply = vi.fn<(target: ReplyTarget) => void>()
		renderTurn("assistant", "The sync dedupes on the client id.", {
			actions: actionsSpy(),
			author: { authorAccountId: null, authorName: "Atlas", writtenFrom: null },
			onReply,
		})

		selectAll("The sync dedupes on the client id.")
		pressOnSelection("Reply")

		expect(onReply).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: "m-1",
				role: "assistant",
				excerpt: "The sync dedupes on the client id.",
				isExcerpt: true,
			}),
		)
	})

	it("replies to the selected excerpt of your own message", () => {
		const onReply = vi.fn<(target: ReplyTarget) => void>()
		renderTurn("user", "Ship it on Friday.", { onReply })

		selectAll("Ship it on Friday.")
		pressOnSelection("Reply")

		expect(onReply).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: "m-1",
				role: "user",
				excerpt: "Ship it on Friday.",
				isExcerpt: true,
			}),
		)
	})

	it("replies to the whole message from the author line", () => {
		const onReply = vi.fn<(target: ReplyTarget) => void>()
		renderTurn("user", "Ship it on Friday.", { onReply })

		fireEvent.click(screen.getByRole("button", { name: "Reply" }))

		expect(onReply).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: "m-1",
				excerpt: "Ship it on Friday.",
			}),
		)
		expect(onReply.mock.calls[0]?.[0].isExcerpt).toBeUndefined()
	})

	it("copies exactly the selected text and replies to nothing", async () => {
		const writeText = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue()
		const onReply = vi.fn<(target: ReplyTarget) => void>()
		renderTurn("assistant", "The sync dedupes on the client id.", {
			actions: actionsSpy(),
			onReply,
		})

		selectAll("The sync dedupes on the client id.")
		pressOnSelection("Copy")

		expect(writeText).toHaveBeenCalledWith("The sync dedupes on the client id.")
		expect(onReply).not.toHaveBeenCalled()
		writeText.mockRestore()
	})
})

describe("a message of yours that did not send", () => {
	it("shows it as not sent and sends that same message again on Retry", () => {
		const onSendAgain = vi.fn<(messageId: string) => void>()
		render(
			createElement(RefusedTurn, {
				message: {
					id: "m-9",
					text: "Book it for 20:00.",
					repliedToMessageId: null,
					replyLinks: [],
					documents: [],
				},
				readerName: "Ada Moreau",
				onSendAgain,
			}),
		)

		expect(screen.getByText("Not sent.")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))

		expect(onSendAgain).toHaveBeenCalledWith("m-9")
	})
})

const PLAN = "Launch plan.md"

const LAUNCH_BOARD: LibraryItem = {
	name: "Launch week.canvas",
	kind: "board",
	path: "/library/Launch week.canvas",
	bytes: 2_048,
	modifiedAt: 0,
	createdAt: null,
}

const boards = [LAUNCH_BOARD]

const threadDocumentsOf = (
	overrides: Partial<
		NonNullable<ContextType<typeof ThreadDocumentsContext>>
	> = {},
) => ({
	spaceId: "space-on-screen",
	isJoined: false,
	opened: null,
	open: vi.fn<(item: ThreadLibraryItem) => void>(),
	close: () => undefined,
	boardOf: (name: string) => boards.find((board) => board.name === name),
	...overrides,
})

const planChip = () => screen.getByRole("button", { name: /^Launch plan/ })

const paragraphHolding = (chip: HTMLElement) => chip.closest("p")?.textContent

describe("a Library document the agent wrote in its message", () => {
	it("shows the document as a chip where the text names it", () => {
		renderTurn("assistant", "I wrote Launch plan.md for the offsite.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		expect(paragraphHolding(planChip())).toBe(
			"I wrote Launch plan for the offsite.",
		)
		expect(screen.queryByText(/Launch plan\.md/)).toBeNull()
	})

	it("shows the document as a chip after the last sentence when the text never names it", () => {
		renderTurn("assistant", "Done. Tell me what to change.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		expect(paragraphHolding(planChip())).toBe(
			"Done. Tell me what to change. Launch plan",
		)
		expect(planChip().closest("p")?.lastElementChild).toBe(planChip())
	})

	it("shows the chip after a final link, outside it, when the text never names the document", () => {
		renderTurn(
			"assistant",
			"Booked it, details on [Visit Lisboa](https://www.visitlisboa.com)",
			{ documents: threadDocumentsOf(), names: [PLAN] },
		)
		const link = screen.getByRole("link", { name: /^Visit Lisboa/ })

		expect(planChip().closest("a")).toBeNull()
		expect(
			link.compareDocumentPosition(planChip()) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		expect(planChip().closest("p")?.lastElementChild).toBe(planChip())
	})

	it("shows the chip alone when the message carries only the document", () => {
		renderTurn("assistant", "", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		expect(
			screen.getAllByRole("button", { name: /^Launch plan/ }),
		).toHaveLength(1)
		expect(screen.queryByText(PLAN)).toBeNull()
	})

	it("keeps a file that is not one of the message's documents as plain text", () => {
		renderTurn("assistant", "Launch plan.md now quotes budget.md.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		expect(screen.getAllByRole("button", { name: /plan|budget/ })).toEqual([
			planChip(),
		])
		expect(paragraphHolding(planChip())).toBe(
			"Launch plan now quotes budget.md.",
		)
	})

	it("shows the chip as writing while the message streams", () => {
		renderTurn("assistant", "Writing Launch plan.md now.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
			state: "streaming",
		})

		expect(planChip().getAttribute("aria-busy")).toBe("true")
		expect(planChip().textContent).toContain("Writing…")
	})

	it("shows the chip at rest once the message is written", () => {
		renderTurn("assistant", "Wrote Launch plan.md.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		expect(planChip().getAttribute("aria-busy")).toBeNull()
		expect(planChip().getAttribute("aria-pressed")).toBe("false")
	})

	it.each([
		["the host", false],
		["a joined Space", true],
	])("opens the document in the panel on click in %s", (_, isJoined) => {
		const documents = threadDocumentsOf({ isJoined })
		renderTurn("assistant", "Wrote Launch plan.md.", {
			documents,
			names: [PLAN],
		})

		fireEvent.click(planChip())

		expect(documents.open).toHaveBeenCalledWith({
			kind: "document",
			name: PLAN,
		})
		expect(openInNewTab).not.toHaveBeenCalled()
	})

	it("shows the chip open while its document is in the panel, at rest once the panel closes", () => {
		const { showDocuments } = renderTurn("assistant", "Wrote Launch plan.md.", {
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		showDocuments(
			threadDocumentsOf({ opened: { kind: "document", name: PLAN } }),
		)
		expect(planChip().getAttribute("aria-pressed")).toBe("true")

		showDocuments(threadDocumentsOf({ opened: null }))
		expect(planChip().getAttribute("aria-pressed")).toBe("false")
	})

	it("opens the document in the Library in a new tab on middle click, leaving the panel as it was", () => {
		const documents = threadDocumentsOf()
		renderTurn("assistant", "Wrote Launch plan.md.", {
			documents,
			names: [PLAN],
		})

		fireEvent(
			planChip(),
			new MouseEvent("auxclick", { bubbles: true, button: 1, detail: 1 }),
		)

		expect(openInNewTab).toHaveBeenCalledWith({ kind: "document", name: PLAN })
		expect(documents.open).not.toHaveBeenCalled()
	})
})

const boardCard = () => screen.getByRole("article", { name: /^Launch week/ })

const drawingAgent = (id: string): LibraryDocumentPresence => ({
	spaceId: "space-on-screen",
	name: LAUNCH_BOARD.name,
	writers: [
		{
			id,
			kind: "agent",
			name: "Atlas",
			at: { kind: "board", point: { x: 40, y: 20 }, nodeId: "sticky-ship" },
		},
	],
})

const hearPresence = (payload: LibraryDocumentPresence) =>
	act(() => presence.hear?.({ payload }))

describe("a Library board the agent posted in its message", () => {
	it("shows the board as a card under the text, never as a chip", async () => {
		renderTurn("assistant", "I drew Launch week.canvas for the offsite.", {
			documents: threadDocumentsOf(),
			names: [LAUNCH_BOARD.name, PLAN],
		})

		await waitFor(() =>
			expect(within(boardCard()).getByText(/Board · 3 items/)).toBeTruthy(),
		)
		expect(within(boardCard()).getByText("Launch week")).toBeTruthy()
		expect(screen.getByText(/I drew Launch week\.canvas/)).toBeTruthy()
		expect(screen.queryByRole("button", { name: /^Launch week/ })).toBeNull()
		expect(planChip()).toBeTruthy()
	})

	it("opens the board beside the thread on Open", () => {
		const documents = threadDocumentsOf()
		renderTurn("assistant", "", {
			documents,
			names: [LAUNCH_BOARD.name],
		})

		fireEvent.click(within(boardCard()).getByRole("button", { name: "Open" }))

		expect(documents.open).toHaveBeenCalledWith({
			kind: "board",
			name: LAUNCH_BOARD.name,
		})
	})

	it("draws the card open while its board is beside the thread", () => {
		const { showDocuments } = renderTurn("assistant", "", {
			documents: threadDocumentsOf(),
			names: [LAUNCH_BOARD.name],
		})
		expect(boardCard().getAttribute("data-state")).toBe("rest")

		showDocuments(
			threadDocumentsOf({
				opened: { kind: "board", name: LAUNCH_BOARD.name },
			}),
		)
		expect(boardCard().getAttribute("data-state")).toBe("open")
	})

	it("says who draws while an agent of the thread draws on the board", async () => {
		renderTurn("assistant", "", {
			documents: threadDocumentsOf(),
			names: [LAUNCH_BOARD.name],
			workingAgentIds: ["bot-atlas"],
		})
		await waitFor(() => expect(presence.hear).not.toBeNull())

		hearPresence(drawingAgent("bot-elsewhere"))
		expect(within(boardCard()).queryByText(/is drawing/)).toBeNull()

		hearPresence(drawingAgent("bot-atlas"))
		expect(within(boardCard()).getByText(/Atlas is drawing/)).toBeTruthy()

		hearPresence({ ...drawingAgent("bot-atlas"), writers: [] })
		expect(within(boardCard()).queryByText(/is drawing/)).toBeNull()
	})
})

const TODO_ANSWER = `Before Friday:

- [ ] Book the venue
- [x] Send the invites`

describe("a to-do in an agent message", () => {
	it("ticks and unticks on click, leaving the conversation input untouched", () => {
		const actions = actionsSpy()
		renderTurn("assistant", TODO_ANSWER, { actions })
		const [venue] = screen.getAllByRole("checkbox")

		fireEvent.click(venue)
		expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(2)

		fireEvent.click(venue)
		expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(1)

		expect(actions.insert).not.toHaveBeenCalled()
	})

	it("leaves the conversation input untouched when any block of the message is clicked", () => {
		const actions = actionsSpy()
		renderTurn("assistant", `${TODO_ANSWER}\n\nWrote Launch plan.md.`, {
			actions,
			documents: threadDocumentsOf(),
			names: [PLAN],
		})

		fireEvent.click(screen.getByText("Before Friday:"))
		fireEvent.click(screen.getByText("Book the venue"))
		fireEvent.click(planChip())

		expect(actions.insert).not.toHaveBeenCalled()
	})
})
