// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react"
import { type ComponentProps, createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import type { TurnState } from "@workspace/ui/components/turn"

import { ThreadTurn } from "@/components/thread-turn"
import { attachmentBlock } from "@/lib/chat/message-attachments"
import type { TranscriptRow } from "@/lib/chat/screen-model"
import {
	HOSTED_SIGNED_OUT,
	type MessageAuthorship,
	type ThreadAuthorship,
	ThreadAuthorshipContext,
} from "@/lib/chat/thread-authorship"
import type { TranscriptRole } from "@/lib/conversations/transcript-contract"

afterEach(cleanup)

const FIRST_NAME = "0b7c6d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.png"
const SECOND_NAME = "1c8d7e2f-3a4b-4c5d-9e0f-1a2b3c4d5e6f.jpg"
const FIRST = `/root/attachments/c-1/${FIRST_NAME}`
const SECOND = `/root/attachments/c-1/${SECOND_NAME}`

const shownWith = (caption: string, paths: string[]) =>
	[caption, attachmentBlock(paths, new Date(0))].join("\n")

const rowOf = (role: TranscriptRole, text: string): TranscriptRow => ({
	messageId: "m-1",
	turnId: "t-1",
	blockIndex: 0,
	quotedMessageId: null,
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
}

const renderTurn = (
	role: TranscriptRole,
	text: string,
	{
		author,
		authorship = HOSTED_SIGNED_OUT,
		state = "complete",
		onRetry,
	}: TurnSetup = {},
) => {
	const props: ComponentProps<typeof ThreadTurn> = {
		row: { ...rowOf(role, text), ...author },
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
		onReply: () => undefined,
	}
	return render(
		createElement(
			ThreadAuthorshipContext.Provider,
			{ value: authorship },
			createElement(ThreadTurn, props),
		),
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
