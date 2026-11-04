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

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import {
	type Bot,
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryItem,
	type LibraryWriter,
} from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import {
	LIBRARY_DOCUMENT_PRESENCE_EVENT,
	LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
} from "@/lib/library/library-document-writers"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = {
	spaceId: string
	name: string
	update: string
	caret: string | null
}

type SharedCaret = Pick<LibraryCall, "spaceId" | "name" | "caret">

type Heard = (event: Event<unknown>, hostId: string | null) => void

const SPACE_ID = "space"

const NOTES = "notes.md"

const PLAN = "plan.md"

const OPENING = "Intro line\n\n## Rollout\n\nWe ship in May."

const AGENT_TEXT = " Atlas adds a sentence. Then a second one."

const ATLAS_ID = "bot-atlas"

const ATLAS_HUE = 210

const OWN_WINDOW = "main"

const OWN_ACCOUNT = "account-me"

const common = i18n.getFixedT(null, "common")

const BODY_FIELD = common("library.editor.body")

const host = vi.hoisted(() => ({
	documents: new Map<string, Y.Doc>(),
	listeners: new Map<string, Set<Heard>>(),
	sharedCarets: [] as SharedCaret[],
	refusesCreates: false,
	refusesCaretShares: false,
	caretRefusals: 0,
	appliedUpdates: 0,
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
	const held = host.documents.get(name)
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
		host.appliedUpdates += 1
		Y.applyUpdate(documentOf(name), bytesOf(update))
		return null
	},
	library_share_caret: ({ spaceId, name, caret }) => {
		if (host.refusesCaretShares) {
			host.caretRefusals += 1
			throw { kind: "unreachable", detail: "host gone" }
		}
		host.sharedCarets.push({ spaceId, name, caret })
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
	return {
		...actual,
		invoke,
		listen,
		isDesktopHost: () => false,
		currentWindowLabel: () => OWN_WINDOW,
	}
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
	host.sharedCarets = []
	host.refusesCreates = false
	host.refusesCaretShares = false
	host.caretRefusals = 0
	host.appliedUpdates = 0
	vi.mocked(raiseFailureNotice).mockClear()
	vi.restoreAllMocks()
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

const signedInWrapper = () => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	queryClient.setQueryData(accountQueryKeys.state(), {
		kind: "signedIn",
		id: OWN_ACCOUNT,
		email: "me@example.com",
		createdAt: "2026-01-01T00:00:00Z",
		plan: null,
	})
	return wrapper
}

const renderLibraryScreen = async (isJoined: boolean) => {
	const rendered = render(
		createElement(LibraryScreenHoldingOpening, {
			spaceId: SPACE_ID,
			isJoined,
			bots: [ATLAS],
		}),
		{ wrapper: signedInWrapper() },
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
	return waitFor(() => {
		const blocks = [
			...screen
				.getByRole("group", { name: BODY_FIELD })
				.querySelectorAll<HTMLElement>("[data-slot='library-document-block']"),
		]
		expect(blocks.length).toBeGreaterThan(0)
		return blocks
	})
}

const fieldOf = (block: HTMLElement) =>
	block.querySelector<HTMLTextAreaElement>(
		"[data-slot='library-document-block-field']",
	)

const openIn = (block: HTMLElement) => {
	act(() => {
		;(fieldOf(block) ?? block.querySelector<HTMLElement>("[tabindex]"))?.focus()
	})
	return fieldOf(block) as HTMLTextAreaElement
}

const selectIn = (block: HTMLElement, start: number, end = start) => {
	const field = openIn(block)
	act(() => {
		field.setSelectionRange(start, end)
		fireEvent(document, new Event("selectionchange"))
	})
	return field
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

const shownPeople = () =>
	[
		...document.querySelectorAll("[data-slot='library-document-person-caret']"),
	].map((caret) => caret.getAttribute("aria-label"))

const presenceListenerCount = () =>
	heardOn(LIBRARY_DOCUMENT_PRESENCE_EVENT).size

describe.each([
	{ place: "on the host", isJoined: false, hostId: null },
	{ place: "in a joined Space", isJoined: true, hostId: "host-1" },
])("an agent writing in the open document $place", ({ isJoined, hostId }) => {
	it("draws its text arriving live under its named caret while the person keeps typing and selecting elsewhere", async () => {
		await renderLibraryScreen(isJoined)
		const [intro] = await openDocument(NOTES)
		const field = selectIn(intro as HTMLElement, 2, 5)

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
	it("paints an agent in the hue of its roster entry, apart from the people carets", async () => {
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
		expect(shownPeople()).toEqual(["Ines"])
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
		expect(screen.queryByRole("group", { name: BODY_FIELD })).toBeNull()
	})
})

const offsetOnHost = (name: string, caret: string) =>
	Y.createAbsolutePositionFromRelativePosition(
		Y.decodeRelativePosition(bytesOf(caret)),
		documentOf(name),
	)?.index

const placeCaret = (block: HTMLElement, offset: number) => {
	selectIn(block, offset)
}

const nullCaretsShared = () =>
	host.sharedCarets.filter(({ caret }) => caret === null)

const finishWriting = (
	name: string,
	outcome: "finished" | "failed",
	{ spaceId = SPACE_ID, agentId = ATLAS_ID, agentName = "atlas" } = {},
) =>
	emit(
		LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
		{ spaceId, name, agentId, agentName, outcome },
		null,
	)

const atlasWritesThenFinishes = async (name: string) => {
	const caret = agentWritesAtEnd(name, AGENT_TEXT, null)
	announcePresence(name, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], null)
	await waitFor(() => expect(shownRuns()).toEqual([AGENT_TEXT]))
	announcePresence(name, [], null)
	finishWriting(name, "finished")
}

const heldRuns = () =>
	[...document.querySelectorAll("[data-slot='library-document-held-run']")].map(
		(run) => run.textContent,
	)

const finishedBar = () =>
	document.querySelector("[data-slot='library-document-finished']")

const finishedListenerCount = () =>
	heardOn(LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT).size

const caretFromAnotherDocument = () =>
	base64Of(
		Y.encodeRelativePosition(
			Y.createRelativePositionFromTypeIndex(
				(() => {
					const stranger = new Y.Doc()
					stranger.getText("markdown").insert(0, "elsewhere")
					return stranger.getText("markdown")
				})(),
				4,
			),
		),
	)

describe("the caret the person shares", () => {
	it("shares the relative position of the caret the editor reports", async () => {
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)

		placeCaret(intro as HTMLElement, 5)

		await waitFor(() =>
			expect(
				offsetOnHost(NOTES, host.sharedCarets.at(-1)?.caret as string),
			).toBe(5),
		)
		expect(host.sharedCarets.at(-1)).toMatchObject({
			spaceId: SPACE_ID,
			name: NOTES,
		})
	})

	it("shares a null caret when the editor reports none", async () => {
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)
		placeCaret(intro as HTMLElement, 5)

		await act(async () => {
			fieldOf(intro as HTMLElement)?.blur()
			await new Promise((resolve) => setTimeout(resolve))
		})

		await waitFor(() => expect(host.sharedCarets.at(-1)?.caret).toBeNull())
	})

	it("withdraws the caret exactly once when the document closes", async () => {
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)
		placeCaret(intro as HTMLElement, 5)

		await goBack()
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve))
		})

		await waitFor(() =>
			expect(nullCaretsShared()).toEqual([
				{ spaceId: SPACE_ID, name: NOTES, caret: null },
			]),
		)
	})

	it("withdraws the caret once when the editor already reported none before closing", async () => {
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)
		placeCaret(intro as HTMLElement, 5)
		await act(async () => {
			fieldOf(intro as HTMLElement)?.blur()
			await new Promise((resolve) => setTimeout(resolve))
		})

		await goBack()

		await waitFor(() => expect(host.sharedCarets.at(-1)?.caret).toBeNull())
		expect(nullCaretsShared()).toHaveLength(1)
	})

	it("withdraws the caret exactly once when the screen unmounts", async () => {
		const { unmount } = await renderLibraryScreen(true)
		const [intro] = await openDocument(NOTES)
		placeCaret(intro as HTMLElement, 5)

		unmount()
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve))
		})

		expect(nullCaretsShared()).toEqual([
			{ spaceId: SPACE_ID, name: NOTES, caret: null },
		])
	})
})

const caretNotices = () =>
	vi
		.mocked(raiseFailureNotice)
		.mock.calls.map(([notice]) => notice)
		.filter(
			({ title, report }) =>
				title === common("library.failure.document.caret") &&
				report?.context?.raisedIn === "use-library-document-session",
		)

const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve))
	})

const refuseCaretSharesAt = async (block: HTMLElement, offsets: number[]) => {
	openIn(block)
	await settle()
	host.refusesCaretShares = true
	const refusedBefore = host.caretRefusals
	for (const offset of offsets) {
		placeCaret(block, offset)
		await settle()
	}
	await waitFor(() =>
		expect(host.caretRefusals - refusedBefore).toBe(offsets.length),
	)
}

const silenceConsoleErrors = () =>
	vi.spyOn(console, "error").mockImplementation(() => undefined)

describe("a caret the host refuses to share", () => {
	it("raises one notice for a burst of refusals and logs each of them", async () => {
		const consoleError = silenceConsoleErrors()
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)

		await refuseCaretSharesAt(intro as HTMLElement, [2, 5, 8])

		await waitFor(() => expect(caretNotices()).toHaveLength(1))
		expect(caretNotices()[0]?.title).toBe(
			"Couldn’t show others where you are in the document. Keep editing to try again.",
		)
		expect(caretNotices()[0]?.report?.context?.space).toBe(SPACE_ID)
		expect(
			consoleError.mock.calls.filter(
				([line]) => line === "library: the caret could not be shared",
			),
		).toHaveLength(3)
	})

	it("raises a new notice on the first refusal after a share succeeds", async () => {
		silenceConsoleErrors()
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)
		const field = intro as HTMLElement
		await refuseCaretSharesAt(field, [2, 5])
		await waitFor(() => expect(caretNotices()).toHaveLength(1))

		host.refusesCaretShares = false
		const sharedBefore = host.sharedCarets.length
		placeCaret(field, 7)
		await waitFor(() =>
			expect(host.sharedCarets).toHaveLength(sharedBefore + 1),
		)
		await refuseCaretSharesAt(field, [3, 9])

		await waitFor(() => expect(caretNotices()).toHaveLength(2))
	})

	it("starts a new burst when another document opens", async () => {
		silenceConsoleErrors()
		await renderLibraryScreen(false)
		const [intro] = await openDocument(NOTES)
		await refuseCaretSharesAt(intro as HTMLElement, [2, 5])
		await goBack()
		await settle()
		await waitFor(() => expect(caretNotices()).toHaveLength(1))

		const [plan] = await openDocument(PLAN)
		await refuseCaretSharesAt(plan as HTMLElement, [4])

		await waitFor(() => expect(caretNotices()).toHaveLength(2))
	})
})

describe.each([
	{
		place: "on the host",
		isJoined: false,
		hostId: null,
		own: writerOf(OWN_WINDOW, "person", "", "Me"),
		others: [
			writerOf("window-2", "person", "", "Second window"),
			writerOf("account-ines", "member", "", "Ines"),
		],
	},
	{
		place: "in a joined Space",
		isJoined: true,
		hostId: "host-1",
		own: writerOf(OWN_ACCOUNT, "member", "", "Me"),
		others: [
			writerOf(OWN_WINDOW, "person", "", "Host"),
			writerOf("account-ines", "member", "", "Ines"),
		],
	},
])(
	"the people seated in the open document $place",
	({ isJoined, hostId, own, others }) => {
		it("draws every other person at their caret, never the caller own seat", async () => {
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)

			announcePresence(
				NOTES,
				[own, ...others].map((writer) => ({
					...writer,
					caret: caretAt(NOTES, 3),
				})),
				hostId,
			)

			await waitFor(() =>
				expect(new Set(shownPeople())).toEqual(
					new Set(others.map(({ name }) => name)),
				),
			)
		})

		it("leaves out a person whose caret no longer resolves", async () => {
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			const [placed, lost] = others

			announcePresence(
				NOTES,
				[
					{ ...(placed as LibraryWriter), caret: caretAt(NOTES, 3) },
					{ ...(lost as LibraryWriter), caret: caretFromAnotherDocument() },
				],
				hostId,
			)

			await waitFor(() => expect(shownPeople()).toEqual([placed?.name]))
		})
	},
)

describe("an agent that finishes writing in the open document", () => {
	it("shows no finished bar and holds the run it wrote", async () => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)
		await waitFor(() => expect(finishedListenerCount()).toBe(1))

		await atlasWritesThenFinishes(NOTES)

		expect(finishedBar()).toBeNull()
		expect(heldRuns()).toEqual([AGENT_TEXT])
	})

	it.each([
		{
			about: "a known bot by its roster name",
			agentName: "atlas",
			shown: "Atlas",
		},
		{
			about: "an unknown agent by its own name",
			agentName: "Nova",
			shown: "Nova",
		},
	])("raises the write failure naming $about", async ({ agentName, shown }) => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)

		finishWriting(NOTES, "failed", {
			agentId: shown === "Atlas" ? ATLAS_ID : "bot-nova",
			agentName,
		})

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.failure.document.write", { name: shown }),
				}),
			),
		)
	})

	it("ignores an agent finishing in another space or another document", async () => {
		await renderLibraryScreen(false)
		await openDocument(NOTES)
		const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, null)
		announcePresence(NOTES, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], null)

		finishWriting(PLAN, "finished")
		finishWriting(NOTES, "finished", { spaceId: "other-space" })
		finishWriting(PLAN, "failed")
		finishWriting(NOTES, "failed", { spaceId: "other-space" })

		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("listens once per open document however often the screen renders", async () => {
		await renderLibraryScreen(false)
		expect(finishedListenerCount()).toBe(0)

		await openDocument(NOTES)
		await waitFor(() => expect(finishedListenerCount()).toBe(1))
		const listened = [...heardOn(LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT)]
		await atlasWritesThenFinishes(NOTES)
		expect([...heardOn(LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT)]).toEqual(
			listened,
		)

		await goBack()
		await waitFor(() => expect(finishedListenerCount()).toBe(0))
	})
})

const RICH_DOCUMENT = [
	"# Venue",
	"The rooms we kept.",
	"- Atlas\n- Mira",
	"> [!NOTE]\n> The export keeps the archived rooms too.",
	"| Room | Seats |\n| --- | --- |\n| Atlas | 12 |",
	"```web-page\nurl: https://www.example.org/rooms\ntitle: Casa do Rio\n```",
	"```gallery\n- image: https://images.example.org/sofa.jpg\n  alt: Green sofa\n```",
].join("\n\n")

const LINK = "https://www.example.org/rates"

const seedDocument = (name: string, markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	host.documents.set(name, doc)
}

const markdownOnHost = (name: string) =>
	documentOf(name).getText("markdown").toString()

const shownBlocks = () => [
	...document.querySelectorAll<HTMLElement>(
		"[data-slot='library-document-block']",
	),
]

const blockTypes = () => shownBlocks().map((block) => block.dataset.type)

const blockWith = (text: string) => {
	const block = shownBlocks().find((each) => each.textContent?.includes(text))
	expect(block).toBeInstanceOf(HTMLElement)
	return block as HTMLElement
}

const typeEach = (typed: string) => {
	for (const character of typed) {
		const field = document.activeElement as HTMLTextAreaElement
		act(() => {
			fireEvent.change(field, { target: { value: field.value + character } })
		})
	}
}

const addBlockBelow = async (text: string, slash: string) => {
	act(() => {
		fireEvent.click(
			within(blockWith(text)).getByRole("button", {
				name: common("library.editor.blocks.handle.insert"),
			}),
		)
	})
	await waitFor(() =>
		expect(document.activeElement?.getAttribute("data-slot")).toBe(
			"library-document-block-field",
		),
	)
	typeEach(slash)
	act(() => {
		fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" })
	})
}

describe.each([
	{ place: "on the host", isJoined: false },
	{ place: "in a joined Space", isJoined: true },
])("a person editing a Library document $place", ({ isJoined }) => {
	it("shows every block of an untouched document and writes nothing to it", async () => {
		seedDocument(NOTES, RICH_DOCUMENT)
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)

		expect(blockTypes()).toEqual([
			"heading",
			"paragraph",
			"list",
			"callout",
			"table",
			"web-page",
			"gallery",
		])
		await goBack()
		await new Promise((resolve) => setTimeout(resolve, 50))

		expect(host.appliedUpdates).toBe(0)
		expect(markdownOnHost(NOTES)).toBe(RICH_DOCUMENT)
	})

	it("saves a block added with the slash menu in its place", async () => {
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)

		await addBlockBelow("Intro line", "/hea")
		typeEach("Risks")

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toBe(
				"Intro line\n\n## Risks\n\n## Rollout\n\nWe ship in May.",
			),
		)
	})

	it("saves a block moved with its handle in its new place", async () => {
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		const handle = blockWith("We ship in May.").querySelector<HTMLElement>(
			"[data-slot='library-block-drag']",
		) as HTMLElement

		act(() => {
			handle.focus()
			fireEvent.keyDown(handle, {
				key: "ArrowUp",
				altKey: true,
				shiftKey: true,
			})
		})

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toBe(
				"Intro line\n\nWe ship in May.\n\n## Rollout",
			),
		)
	})

	it("keeps the bare link pasted into a web card while no preview can be read", async () => {
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		await addBlockBelow("We ship in May.", "/web")
		act(() => {
			document
				.querySelector<HTMLElement>("[data-type='web-page'] [tabindex]")
				?.focus()
		})
		const link = await screen.findByRole("textbox", {
			name: common("library.editor.blocks.webPage.link"),
		})

		await act(async () => {
			fireEvent.change(link, { target: { value: LINK } })
			fireEvent.keyDown(link, { key: "Enter" })
		})

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toBe(
				`${OPENING}\n\n\`\`\`web-page\nurl: ${LINK}\n\`\`\``,
			),
		)
		expect(link).toHaveProperty("value", LINK)
		expect(link.getAttribute("aria-invalid")).toBe("false")
	})
})
