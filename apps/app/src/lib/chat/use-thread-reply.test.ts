// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { useComposerFocus, useThreadReply } from "./use-thread-reply"

type FocusProps = {
	threadId: string | null
}

const mountComposer = (): HTMLTextAreaElement => {
	const composer = document.createElement("textarea")
	document.body.append(composer)
	return composer
}

const renderThread = (
	composer: HTMLTextAreaElement,
	initialProps: FocusProps,
) =>
	renderHook(
		({ threadId }: FocusProps) => {
			const { focusComposer } = useThreadReply({
				composerRef: { current: composer },
				scrollerRef: { current: null },
				send: async () => true,
			})
			useComposerFocus({
				threadId,
				isPromptPending: false,
				isOverlayOpen: false,
				focusComposer,
			})
		},
		{ initialProps },
	)

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
})

it("focuses the input on a conversation, then on a mission thread of the same companion, and never steals it back", () => {
	const composer = mountComposer()
	const elsewhere = mountComposer()
	const { rerender } = renderThread(composer, {
		threadId: "conversation-1",
	})

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "mission-1" })

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "mission-1" })

	expect(document.activeElement).toBe(elsewhere)
})

it("focuses the input again when a shared companion's solo thread switches to another space", () => {
	const composer = mountComposer()
	const elsewhere = mountComposer()
	const { rerender } = renderThread(composer, { threadId: null })

	expect(document.activeElement).not.toBe(composer)

	rerender({ threadId: "solo-in-space-1" })

	expect(document.activeElement).toBe(composer)

	elsewhere.focus()
	rerender({ threadId: "solo-in-space-2" })

	expect(document.activeElement).toBe(composer)
})

it("takes no focus on a closed mission whose input is disabled", () => {
	const composer = mountComposer()
	composer.disabled = true

	expect(() => renderThread(composer, { threadId: "mission-1" })).not.toThrow()
	expect(document.activeElement).not.toBe(composer)
})
