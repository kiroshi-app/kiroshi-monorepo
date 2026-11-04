// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import type { LibraryItem } from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = {
	name: string
	update: string
}

const SPACE_ID = "space"

const NOTES = "notes.md"

const TWO_PARAGRAPHS = "First paragraph\n\nSecond paragraph"

const FIRST_BOLD = "**First paragraph**\n\nSecond paragraph"

const common = i18n.getFixedT(null, "common")

const host = vi.hoisted(() => ({
	documents: new Map<string, Y.Doc>(),
}))

const documentOf = (name: string) => {
	const held = host.documents.get(name)
	if (held) {
		return held
	}
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, TWO_PARAGRAPHS)
	host.documents.set(name, doc)
	return doc
}

const LIBRARY_COMMANDS: Record<string, (call: LibraryCall) => unknown> = {
	library_list: (): LibraryItem[] => [
		{
			name: NOTES,
			kind: "document",
			path: `/library/${NOTES}`,
			bytes: 10,
			modifiedAt: 0,
			createdAt: null,
		},
	],
	library_open_document: ({ name }) => ({
		name,
		update: base64Of(Y.encodeStateAsUpdate(documentOf(name))),
	}),
	library_apply_update: ({ name, update }) => {
		Y.applyUpdate(documentOf(name), bytesOf(update))
		return null
	},
	library_share_caret: () => null,
}

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = async <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		const answer = LIBRARY_COMMANDS[command]
		return answer
			? (answer(args as LibraryCall) as T)
			: actual.invoke<T>(...call)
	}
	const listen: typeof actual.listen = () => Promise.resolve(() => undefined)
	return {
		...actual,
		invoke,
		listen,
		isDesktopHost: () => false,
		currentWindowLabel: () => "main",
	}
})

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

afterEach(() => {
	cleanup()
	host.documents.clear()
})

const signedInWrapper = () => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	queryClient.setQueryData(accountQueryKeys.state(), {
		kind: "signedIn",
		id: "account-me",
		email: "me@example.com",
		createdAt: "2026-01-01T00:00:00Z",
		plan: null,
	})
	return wrapper
}

const openNotes = async (isJoined: boolean) => {
	render(
		createElement(LibraryScreenHoldingOpening, {
			spaceId: SPACE_ID,
			isJoined,
			bots: [],
		}),
		{ wrapper: signedInWrapper() },
	)
	const tile = await waitFor(() => {
		const found = screen
			.getAllByRole("button")
			.find((button) => button.textContent?.includes("notes"))
		expect(found).toBeInstanceOf(HTMLElement)
		return found as HTMLElement
	})
	await act(async () => {
		fireEvent.click(tile, { detail: 1 })
	})
	const body = await screen.findByRole("group", {
		name: common("library.editor.body"),
	})
	await waitFor(() => expect(body.textContent).toContain("Second paragraph"))
	return body
}

const BLOCK_FIELD = "[data-slot='library-document-block-field']"

const openFirstBlock = async (body: HTMLElement) => {
	await act(async () => {
		body
			.querySelector<HTMLElement>(
				"[data-slot='library-document-block'] [tabindex]",
			)
			?.focus()
	})
	return waitFor(() => {
		const field = body.querySelector<HTMLElement>(BLOCK_FIELD)
		expect(document.activeElement).toBe(field)
		return field as HTMLElement
	})
}

const pressWithMod = async (body: HTMLElement, key: string) => {
	const isMac = /Mac/.test(navigator.platform)
	await act(async () => {
		fireEvent.keyDown(body, { key, metaKey: isMac, ctrlKey: !isMac })
	})
}

const storedMarkdown = () => documentOf(NOTES).getText("markdown").toString()

describe.each([
	{ place: "on the host", isJoined: false },
	{ place: "in a joined Space", isJoined: true },
])(
	"Mod-b on the text of a block of a document opened $place",
	({ isJoined }) => {
		it("stores the paragraph bold, then the original markdown on a second press", async () => {
			const body = await openNotes(isJoined)
			const field = await openFirstBlock(body)
			await act(async () => {
				document.getSelection()?.selectAllChildren(field)
			})

			await pressWithMod(field, "b")
			await waitFor(() => expect(storedMarkdown()).toBe(FIRST_BOLD))

			await pressWithMod(field, "b")
			await waitFor(() => expect(storedMarkdown()).toBe(TWO_PARAGRAPHS))
		})
	},
)
