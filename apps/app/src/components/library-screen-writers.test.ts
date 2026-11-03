// @vitest-environment happy-dom

import type { Event } from "@tauri-apps/api/event"
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreen } from "@/components/library-screen"
import {
	type Bot,
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryItem,
	type LibraryWriter,
} from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "@/lib/library/library-document-writers"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = { name: string; update: string }

type Heard = (event: Event<unknown>, hostId: string | null) => void

const SPACE_ID = "space"

const NOTES = "notes.md"

const PLAN = "plan.md"

const OPENING = "Intro line\n\n## Rollout\n\nWe ship in May."

const AGENT_TEXT = " Atlas adds a sentence. Then a second one."

const ATLAS_ID = "bot-atlas"

const ATLAS_HUE = 210

const common = i18n.getFixedT(null, "common")

const PARAGRAPH_FIELD = common("library.editor.paragraph")

const host = vi.hoisted(() => ({
	documents: new Map<string, unknown>(),
	listeners: new Map<string, Set<Heard>>(),
	refusesCreates: false,
}))

const itemNamed = (name: string): LibraryItem => ({
	name,
	kind: "document",
	path: `/library/${name}`,
	bytes: 10,
	modifiedAt: 0,
	createdAt: null,
})

const documentOf = (name: string) => {
	const held = host.documents.get(name) as Y.Doc | undefined
	if (held) {
		return held
	}
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, OPENING)
	host.documents.set(name, doc)
	return doc
}

const LIBRARY_COMMANDS: Record<string, (call: LibraryCall) => unknown> = {
	library_list: () => [itemNamed(NOTES), itemNamed(PLAN)],
	library_open_document: ({ name }) => ({
		name,
		update: base64Of(Y.encodeStateAsUpdate(documentOf(name))),
	}),
	library_apply_update: ({ name, update }) => {
		Y.applyUpdate(documentOf(name), bytesOf(update))
		return null
	},
	library_create_document: ({ name }) => {
		if (host.refusesCreates) {
			throw { kind: "unwritable", detail: "disk full" }
		}
		return itemNamed(name)
	},
}

const heardOn = (event: string) => {
	const held = host.listeners.get(event) ?? new Set<Heard>()
	host.listeners.set(event, held)
	return held
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
	const listen = ((event: string, handler: Heard) => {
		heardOn(event).add(handler)
		return Promise.resolve(() => {
			heardOn(event).delete(handler)
		})
	}) as typeof actual.listen
	return { ...actual, invoke, listen, isDesktopHost: () => false }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

afterEach(() => {
	cleanup()
	host.documents.clear()
	host.listeners.clear()
	host.refusesCreates = false
	vi.mocked(raiseFailureNotice).mockClear()
})

const emit = (event: string, payload: unknown, hostId: string | null) => {
	act(() => {
		for (const heard of heardOn(event)) {
			heard({ event, id: 0, payload } as Event<unknown>, hostId)
		}
	})
}

const caretAt = (name: string, index: number) =>
	base64Of(
		Y.encodeRelativePosition(
			Y.createRelativePositionFromTypeIndex(
				documentOf(name).getText("markdown"),
				index,
				-1,
			),
		),
	)

const writerOf = (
	id: string,
	kind: LibraryWriter["kind"],
	caret: string,
	name: string | null = null,
): LibraryWriter => ({ id, kind, name, caret })

const announcePresence = (
	name: string,
	writers: LibraryWriter[],
	hostId: string | null,
) =>
	emit(
		LIBRARY_DOCUMENT_PRESENCE_EVENT,
		{ spaceId: SPACE_ID, name, writers },
		hostId,
	)

const agentWritesAtEnd = (
	name: string,
	text: string,
	hostId: string | null,
) => {
	const doc = documentOf(name)
	const markdown = doc.getText("markdown")
	const start = markdown.length
	announcePresence(
		name,
		[writerOf(ATLAS_ID, "agent", caretAt(name, start), "Atlas")],
		hostId,
	)
	const before = Y.encodeStateVector(doc)
	markdown.insert(start, text)
	emit(
		LIBRARY_DOCUMENT_UPDATED_EVENT,
		{
			spaceId: SPACE_ID,
			name,
			update: base64Of(Y.encodeStateAsUpdate(doc, before)),
		},
		hostId,
	)
	return caretAt(name, start + text.length)
}

const ATLAS = {
	id: ATLAS_ID,
	name: "Atlas",
	avatarBlot: ATLAS_HUE,
	avatarImagePath: null,
} as Bot

const renderLibraryScreen = async (isJoined: boolean) => {
	const rendered = render(
		createElement(LibraryScreen, {
			spaceId: SPACE_ID,
			isJoined,
			bots: [ATLAS],
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await screen.findByRole("heading", {
		level: 1,
		name: common("library.title"),
	})
	return rendered
}

const openDocument = async (name: string) => {
	const tile = await waitFor(() => {
		const found = screen
			.getAllByRole("button")
			.find((button) => button.textContent?.includes(name.replace(".md", "")))
		expect(found).toBeInstanceOf(HTMLElement)
		return found as HTMLElement
	})
	await act(async () => {
		fireEvent.click(tile, { detail: 1 })
	})
	return waitFor(
		() =>
			screen.getAllByRole("textbox", {
				name: PARAGRAPH_FIELD,
			}) as HTMLTextAreaElement[],
	)
}

const goBack = async () => {
	await act(async () => {
		fireEvent.click(
			screen.getByRole("button", { name: common("library.document.back") }),
		)
	})
}

const shownRuns = () =>
	[...document.querySelectorAll("[data-slot='library-document-run']")].map(
		(run) => run.textContent,
	)

const atlasCaret = () =>
	screen.queryByRole("button", {
		name: common("library.document.agents.caret", { name: "Atlas" }),
	})

const presenceListenerCount = () =>
	heardOn(LIBRARY_DOCUMENT_PRESENCE_EVENT).size

describe.each([
	{ place: "on the host", isJoined: false, hostId: null },
	{ place: "in a joined Space", isJoined: true, hostId: "host-1" },
])("an agent writing in the open document $place", ({ isJoined, hostId }) => {
	it("draws its text arriving live under its named caret while the person keeps typing and selecting elsewhere", async () => {
		await renderLibraryScreen(isJoined)
		const [intro] = await openDocument(NOTES)
		const field = intro as HTMLTextAreaElement
		act(() => {
			field.focus()
			field.setSelectionRange(2, 5)
		})

		const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, hostId)
		announcePresence(
			NOTES,
			[writerOf(ATLAS_ID, "agent", caret, "Atlas")],
			hostId,
		)

		await waitFor(() => expect(shownRuns()).toEqual([AGENT_TEXT]))
		expect(atlasCaret()).toBeInstanceOf(HTMLElement)
		expect(document.activeElement).toBe(field)
		expect([field.selectionStart, field.selectionEnd]).toEqual([2, 5])

		await act(async () => {
			fireEvent.change(field, { target: { value: "Intro line, edited" } })
		})

		await waitFor(() =>
			expect(documentOf(NOTES).getText("markdown").toString()).toBe(
				`Intro line, edited\n\n## Rollout\n\nWe ship in May.${AGENT_TEXT}`,
			),
		)
		expect(shownRuns()).toEqual([AGENT_TEXT])
	})
})

describe("the carets of the open document", () => {
	it("paints an agent in the hue of its roster entry, and shows no caret for the person or a member", async () => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)

		const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, null)
		announcePresence(
			NOTES,
			[
				writerOf("main", "person", caretAt(NOTES, 0), "Shoto"),
				writerOf("account-ines", "member", caretAt(NOTES, 3), "Ines"),
				writerOf(ATLAS_ID, "agent", caret, "Atlas"),
			],
			null,
		)

		const shown = await waitFor(() => atlasCaret() as HTMLElement)
		expect(shown.closest("[data-hue]")?.getAttribute("data-hue")).toBe(
			String(ATLAS_HUE),
		)
		expect(
			document.querySelectorAll("[data-slot='library-document-caret']"),
		).toHaveLength(1)
		expect(
			screen.getByText(common("library.document.agents.writing", { count: 1 })),
		).toBeInstanceOf(HTMLElement)
	})

	it("drops the caret of an agent the host no longer seats", async () => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)
		const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, null)
		announcePresence(NOTES, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], null)
		await waitFor(() => expect(atlasCaret()).toBeInstanceOf(HTMLElement))

		announcePresence(NOTES, [], null)

		await waitFor(() => expect(atlasCaret()).toBeNull())
		expect(shownRuns()).toEqual([])
	})

	it("ignores the presence of another document", async () => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)

		agentWritesAtEnd(PLAN, AGENT_TEXT, null)

		expect(atlasCaret()).toBeNull()
	})
})

describe("the presence listener of the open document", () => {
	it("listens only while a document is open, and starts afresh on the next one", async () => {
		await renderLibraryScreen(false)
		expect(presenceListenerCount()).toBe(0)

		await openDocument(NOTES)
		await waitFor(() => expect(presenceListenerCount()).toBe(1))
		const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, null)
		announcePresence(NOTES, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], null)
		await waitFor(() => expect(atlasCaret()).toBeInstanceOf(HTMLElement))

		await goBack()
		await waitFor(() => expect(presenceListenerCount()).toBe(0))

		await openDocument(PLAN)
		await waitFor(() => expect(presenceListenerCount()).toBe(1))
		expect(atlasCaret()).toBeNull()
	})

	it("stops listening when the screen unmounts", async () => {
		const { unmount } = await renderLibraryScreen(true)
		await openDocument(NOTES)
		await waitFor(() => expect(presenceListenerCount()).toBe(1))

		unmount()

		await waitFor(() => expect(presenceListenerCount()).toBe(0))
	})
})

describe("a document the host fails to create", () => {
	it("raises the create failure and stays on the Library", async () => {
		host.refusesCreates = true
		await renderLibraryScreen(false)

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: common("library.newDocument") }),
			)
		})
		const dialog = await screen.findByRole("dialog")
		await act(async () => {
			fireEvent.click(
				within(dialog).getByRole("button", {
					name: common("library.picker.create"),
				}),
			)
		})

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.failure.document.create"),
				}),
			),
		)
		expect(screen.queryByRole("textbox", { name: PARAGRAPH_FIELD })).toBeNull()
	})
})
