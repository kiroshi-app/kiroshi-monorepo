// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { type ComponentProps, createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import type { TurnState } from "@workspace/ui/components/turn"

import { ThreadDocumentsContext } from "@/components/thread-documents"
import { RefusedTurn, ThreadTurn } from "@/components/thread-turn"
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
import { openInBrowser } from "@/lib/links/use-external-links"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@/lib/links/use-external-links", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/links/use-external-links")>()),
	openInBrowser: vi.fn(() => Promise.resolve()),
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
	documents?: string[]
}

const THREAD_DOCUMENTS = {
	spaceId: "space-on-screen",
	isJoined: false,
	openedName: null,
	open: () => undefined,
	close: () => undefined,
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
		documents,
	}: TurnSetup = {},
) => {
	const props: ComponentProps<typeof ThreadTurn> = {
		row: { ...rowOf(role, text), ...author, documents: documents ?? [] },
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
	return render(
		createElement(
			AnswerActionsContext,
			{ value: actions ?? null },
			createElement(
				ThreadAuthorshipContext.Provider,
				{ value: authorship },
				createElement(
					ThreadDocumentsContext,
					{ value: documents ? THREAD_DOCUMENTS : null },
					createElement(ThreadTurn, props),
				),
			),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
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

	it("keeps the documents it carries under its bubble", () => {
		render(
			createElement(
				ThreadDocumentsContext,
				{ value: THREAD_DOCUMENTS },
				createElement(RefusedTurn, {
					message: {
						id: "m-9",
						text: "Here is the brief.",
						repliedToMessageId: null,
						replyLinks: [],
						documents: ["brief.md"],
					},
					readerName: "Ada Moreau",
					onSendAgain: () => undefined,
				}),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		const card = screen.getByRole("article", { name: "brief" })
		expect(card.closest('[data-slot="turn-footer"]')).not.toBeNull()
		expect(card.closest('[data-slot="message-bubble-content"]')).toBeNull()
	})
})

describe("a person message carrying Library documents", () => {
	const RELAYED: MessageAuthorship = {
		authorAccountId: "account-zoe",
		authorName: "Zoe",
		writtenFrom: "relay",
	}

	const footerOf = (text: string) =>
		screen
			.getByText(text)
			.closest('[data-slot="message"]')
			?.querySelector('[data-slot="turn-footer"]') ?? null

	it.each([
		["the reader", undefined],
		["another person", RELAYED],
	])(
		"draws the card under the bubble of %s, never inside it",
		(_who, author) => {
			renderTurn("user", "Here is the brief.", {
				author,
				documents: ["brief.md"],
			})

			const card = screen.getByRole("article", { name: "brief" })
			expect(footerOf("Here is the brief.")?.contains(card)).toBe(true)
			expect(card.closest('[data-slot="message-bubble-content"]')).toBeNull()
		},
	)
})
