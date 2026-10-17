// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	ThreadComposer,
	type ThreadMenuSlot,
} from "@/components/thread-composer"
import type { StagedAttachment } from "@/lib/chat/attachments"
import {
	type OpenJoinedHost,
	OpenJoinedHostContext,
} from "@/lib/spaces/open-joined-host"

const NO_ATTACHMENTS: StagedAttachment[] = []

type ComposerFixture = {
	onSubmitPrompt: (text: string) => Promise<boolean>
	canAttach?: boolean
	onAttach?: (files: File[]) => void
	queryIn?: (prompt: string) => string | null
	menu?: (slot: ThreadMenuSlot) => ReactNode
}

const composerOf = ({
	onSubmitPrompt,
	canAttach = true,
	onAttach = () => undefined,
	queryIn = () => null,
	menu = (slot) => slot.children,
}: ComposerFixture) =>
	createElement(ThreadComposer, {
		attachments: NO_ATTACHMENTS,
		canAttach,
		composerRef: { current: null },
		isDisabled: false,
		isDropTarget: false,
		menu,
		onAttach,
		onPromptChange: () => undefined,
		onRemoveAttachment: () => undefined,
		onSubmitPrompt,
		placeholder: "Ask Nyx to do something…",
		queryIn,
		readDraft: () => "",
	})

const field = () => screen.getByRole("textbox") as HTMLTextAreaElement

const type = (text: string) => {
	fireEvent.change(field(), { target: { value: text } })
}

const send = async () => {
	fireEvent.click(screen.getByRole("button", { name: "Send" }))
	await act(async () => {
		await Promise.resolve()
	})
}

describe("ThreadComposer", () => {
	afterEach(cleanup)

	it("clears the field once the prompt is sent", async () => {
		render(composerOf({ onSubmitPrompt: () => Promise.resolve(true) }))

		type("ship it")
		await send()

		expect(field().value).toBe("")
	})

	it("keeps what the reader typed while the send was in flight", async () => {
		let release: (sent: boolean) => void = () => undefined
		render(
			composerOf({
				onSubmitPrompt: () =>
					new Promise<boolean>((resolve) => {
						release = resolve
					}),
			}),
		)

		type("ship it")
		fireEvent.click(screen.getByRole("button", { name: "Send" }))
		type("and then this")
		await act(async () => {
			release(true)
		})

		expect(field().value).toBe("and then this")
	})

	it("keeps the prompt when the send is refused", async () => {
		render(composerOf({ onSubmitPrompt: () => Promise.resolve(false) }))

		type("ship it")
		await send()

		expect(field().value).toBe("ship it")
	})

	it("keeps the menu closed once dismissed until the query stops matching", () => {
		const opened: boolean[] = []
		render(
			composerOf({
				menu: (slot) => {
					opened.push(slot.isOpen)
					return createElement(
						"div",
						null,
						createElement(
							"button",
							{ onClick: slot.onDismiss, type: "button" },
							"Dismiss menu",
						),
						slot.children,
					)
				},
				onSubmitPrompt: () => Promise.resolve(true),
				queryIn: (prompt) => (prompt.startsWith("/") ? prompt.slice(1) : null),
			}),
		)

		type("/re")
		expect(opened.at(-1)).toBe(true)

		fireEvent.click(screen.getByRole("button", { name: "Dismiss menu" }))
		type("/rev")
		expect(opened.at(-1)).toBe(false)

		type("plain text")
		type("/re")
		expect(opened.at(-1)).toBe(true)
	})

	it("rewrites the prompt with the entry the reader picked", () => {
		render(
			composerOf({
				menu: (slot) =>
					createElement(
						"div",
						null,
						createElement(
							"button",
							{ onClick: () => slot.onPick("/review "), type: "button" },
							"Pick review",
						),
						slot.children,
					),
				onSubmitPrompt: () => Promise.resolve(true),
				queryIn: (prompt) => (prompt.startsWith("/") ? prompt.slice(1) : null),
			}),
		)

		type("/re")
		fireEvent.click(screen.getByRole("button", { name: "Pick review" }))

		expect(field().value).toBe("/review ")
	})

	it("stages an image pasted into the composer while attaching stands", () => {
		const staged: File[][] = []
		render(
			composerOf({
				onAttach: (files) => staged.push(files),
				onSubmitPrompt: () => Promise.resolve(true),
			}),
		)

		const image = new File(["binary"], "screenshot.png", { type: "image/png" })
		fireEvent.paste(field(), {
			clipboardData: { files: [image], types: ["Files"] },
		})

		expect(staged).toEqual([[image]])
		expect(
			screen
				.getByRole("button", { name: "Attach files" })
				.hasAttribute("disabled"),
		).toBe(false)
	})

	it("disables the attach button while attaching is refused", () => {
		render(
			composerOf({
				canAttach: false,
				onSubmitPrompt: () => Promise.resolve(true),
			}),
		)

		expect(
			screen
				.getByRole("button", { name: "Attach files" })
				.hasAttribute("disabled"),
		).toBe(true)
	})

	describe("in a joined space", () => {
		const OFFLINE_NOTICE =
			"Studio Nord is offline. You can write again once Lea’s computer is back."

		const hostOf = (isOnline: boolean): OpenJoinedHost => ({
			spaceName: "Studio Nord",
			hostName: "Lea",
			isOnline,
			isDown: !isOnline,
		})

		const composerIn = (host: OpenJoinedHost) =>
			createElement(
				OpenJoinedHostContext.Provider,
				{ value: host },
				composerOf({ onSubmitPrompt: () => Promise.resolve(true) }),
			)

		it("shows the offline composer while the host is offline", () => {
			render(composerIn(hostOf(false)))

			expect(screen.getByText(OFFLINE_NOTICE)).toBeTruthy()
			expect(screen.queryByRole("textbox")).toBeNull()
		})

		it("keeps the field while the host is still connecting", () => {
			render(composerIn({ ...hostOf(false), isDown: false }))

			expect(screen.queryByText(OFFLINE_NOTICE)).toBeNull()
			expect(screen.queryByRole("textbox")).toBeTruthy()
		})

		it("gives the field back once the host is online again", () => {
			const { rerender } = render(composerIn(hostOf(false)))

			rerender(composerIn(hostOf(true)))

			expect(screen.queryByText(OFFLINE_NOTICE)).toBeNull()
			type("back again")
			expect(field().value).toBe("back again")
		})
	})
})
