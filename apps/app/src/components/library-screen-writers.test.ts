// @vitest-environment happy-dom

import type { QueryClient } from "@tanstack/react-query"
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

import {
	fieldSelectionOf,
	selectInField,
} from "@workspace/ui/components/library-block-text"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import {
	type Bot,
	type CancelOutcome,
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryItem,
	type LibraryPresenceAt,
	type LibraryWriter,
} from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { markdownWithIds } from "@/lib/library/block-ids-test-pattern"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import {
	LIBRARY_DOCUMENT_PRESENCE_EVENT,
	LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
} from "@/lib/library/library-document-writers"
import { libraryQueryKeys } from "@/lib/library/library-query-keys"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = {
	spaceId: string
	name: string
	update: string
	content: string
	at: LibraryPresenceAt | null
	agentId: string | null
}

type StopCall = Pick<LibraryCall, "spaceId" | "name" | "agentId">

type StopAnswer = CancelOutcome | "refused"

type SharedCaret = Pick<LibraryCall, "spaceId" | "name"> & {
	caret: string | null
}

type Heard = (event: Event<unknown>, hostId: string | null) => void

const SPACE_ID = "space"

const NOTES = "notes.md"

const PLAN = "plan.md"

const OPENING = "Intro line\n\n## Rollout\n\nWe ship in May."

const NAMED_OPENING =
	"Intro line ^intro1\n\n## Rollout ^rollot\n\nWe ship in May. ^shipme"

const TRAILING_ID = /(?: \^[a-z0-9]{6})?$/

const OPENING_WITH_IDS =
	"Intro line ^ID\n\n## Rollout ^ID\n\nWe ship in May. ^ID"

const AGENT_TEXT = " Atlas adds a sentence. Then a second one."

const EARLY_RUN = " early"

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
	stops: [] as StopCall[],
	stopAnswer: { kind: "cancelled" } as StopAnswer,
	readLinkPreview: vi.fn(),
	images: [] as LibraryItem[],
	lists: 0,
	listGate: null as Promise<void> | null,
	imageReads: [] as string[],
	pickImages: vi.fn(),
	importPaths: vi.fn(),
	readPickedImage: vi.fn(),
	importContent: vi.fn(),
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
	library_list: async () => {
		host.lists += 1
		await host.listGate
		return [itemNamed(NOTES), itemNamed(PLAN), ...host.images]
	},
	library_read_image: ({ name }) => {
		host.imageReads.push(name)
		if (!host.images.some((image) => image.name === name)) {
			throw { kind: "missing", name }
		}
		return { name, mimeType: "image/jpeg", content: `${name}-bytes` }
	},
	library_import: (call) => host.importContent(call),
	library_open_document: ({ name }) => ({
		name,
		update: base64Of(Y.encodeStateAsUpdate(documentOf(name))),
	}),
	library_comment_threads: () => [],
	library_comment_agent_turns: () => [],
	library_apply_update: ({ name, update }) => {
		host.appliedUpdates += 1
		Y.applyUpdate(documentOf(name), bytesOf(update))
		return null
	},
	library_share_presence: ({ spaceId, name, at }) => {
		if (host.refusesCaretShares) {
			host.caretRefusals += 1
			throw { kind: "unreachable", detail: "host gone" }
		}
		host.sharedCarets.push({
			spaceId,
			name,
			caret: at?.kind === "text" ? at.anchor : null,
		})
		return null
	},
	library_create_document: ({ name }) => {
		if (host.refusesCreates) {
			throw { kind: "unwritable", detail: "disk full" }
		}
		return itemNamed(name)
	},
	library_stop_writers: ({ spaceId, name, agentId }) => {
		host.stops.push({ spaceId, name, agentId })
		if (host.stopAnswer === "refused") {
			throw { kind: "unreachable", detail: "host gone" }
		}
		return host.stopAnswer
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

vi.mock("@/lib/bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/bindings")>()
	return {
		...actual,
		commands: {
			...actual.commands,
			libraryReadLinkPreview: host.readLinkPreview,
			libraryImportPaths: host.importPaths,
			libraryReadPickedImage: host.readPickedImage,
		},
	}
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: host.pickImages,
	save: vi.fn(),
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
	host.stops = []
	host.stopAnswer = { kind: "cancelled" }
	host.readLinkPreview.mockReset()
	host.images = []
	host.lists = 0
	host.listGate = null
	host.imageReads = []
	host.pickImages.mockReset()
	host.importPaths.mockReset()
	host.readPickedImage.mockReset()
	host.importContent.mockReset()
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
): LibraryWriter => ({ id, kind, name, at: { kind: "text", anchor: caret } })

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

const agentWritesAt = (
	name: string,
	start: number,
	text: string,
	hostId: string | null,
) => {
	const doc = documentOf(name)
	const markdown = doc.getText("markdown")
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

const agentWritesAtEnd = (name: string, text: string, hostId: string | null) =>
	agentWritesAt(name, markdownOnHost(name).search(TRAILING_ID), text, hostId)

const ATLAS = {
	id: ATLAS_ID,
	name: "Atlas",
	avatarBlot: ATLAS_HUE,
	avatarImagePath: null,
} as Bot

let screenQueryClient: QueryClient

const signedInWrapper = () => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	screenQueryClient = queryClient
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
	block.querySelector<HTMLElement>("[data-slot='library-document-block-field']")

const openIn = (block: HTMLElement) => {
	act(() => {
		;(fieldOf(block) ?? block.querySelector<HTMLElement>("[tabindex]"))?.focus()
	})
	return fieldOf(block) as HTMLElement
}

const selectIn = (block: HTMLElement, start: number, end = start) => {
	const field = openIn(block)
	act(() => {
		selectInField(field, start, end)
		fireEvent(document, new Event("selectionchange"))
	})
	return field
}

const inputInto = (field: HTMLElement, data: string) =>
	field.dispatchEvent(
		Object.assign(
			new InputEvent("beforeinput", {
				inputType: "insertText",
				data,
				bubbles: true,
				cancelable: true,
			}),
			{ getTargetRanges: () => [] },
		),
	)

const replaceIn = (field: HTMLElement, text: string) => {
	document.getSelection()?.selectAllChildren(field)
	inputInto(field, text)
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
		seedDocument(NOTES, NAMED_OPENING)
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
		expect(fieldSelectionOf(field)).toMatchObject({ start: 2, end: 5 })

		await act(async () => {
			replaceIn(field, "Intro line, edited")
		})

		await waitFor(() =>
			expect(documentOf(NOTES).getText("markdown").toString()).toBe(
				`Intro line, edited ^intro1\n\n## Rollout ^rollot\n\nWe ship in May.${AGENT_TEXT} ^shipme`,
			),
		)
		expect(shownRuns()).toEqual([AGENT_TEXT])
	})

	it("keeps its text in place on both sides when it lands during the first edit of a document without ids", async () => {
		await renderLibraryScreen(isJoined)
		const [intro] = await openDocument(NOTES)
		const field = selectIn(intro as HTMLElement, 0)

		await act(async () => {
			replaceIn(field, "Intro line, edited")
		})
		expect(host.appliedUpdates).toBe(0)
		const caret = agentWritesAt(
			NOTES,
			OPENING.indexOf(" in May"),
			EARLY_RUN,
			hostId,
		)
		announcePresence(
			NOTES,
			[writerOf(ATLAS_ID, "agent", caret, "Atlas")],
			hostId,
		)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				markdownWithIds(
					`Intro line, edited ^ID\n\n## Rollout ^ID\n\nWe ship${EARLY_RUN} in May. ^ID`,
				),
			),
		)
		expect(blockWith("in May.").textContent).toContain(`We ship${EARLY_RUN}`)
		expect(shownRuns()).toEqual([EARLY_RUN])
		expect(atlasCaret()).toBeInstanceOf(HTMLElement)
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
	{
		spaceId = SPACE_ID,
		agentId = ATLAS_ID,
		agentName = "atlas",
		hostId = null as string | null,
	} = {},
) =>
	emit(
		LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT,
		{ spaceId, name, agentId, agentName, outcome },
		hostId,
	)

const atlasWritesThenFinishes = async (
	name: string,
	hostId: string | null = null,
) => {
	const caret = agentWritesAtEnd(name, AGENT_TEXT, hostId)
	announcePresence(name, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], hostId)
	await waitFor(() => expect(shownRuns()).toEqual([AGENT_TEXT]))
	announcePresence(name, [], hostId)
	finishWriting(name, "finished", { hostId })
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
					at: { kind: "text", anchor: caretAt(NOTES, 3) },
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
					{
						...(placed as LibraryWriter),
						at: { kind: "text", anchor: caretAt(NOTES, 3) },
					},
					{
						...(lost as LibraryWriter),
						at: { kind: "text", anchor: caretFromAnotherDocument() },
					},
				],
				hostId,
			)

			await waitFor(() => expect(shownPeople()).toEqual([placed?.name]))
		})
	},
)

const PLACES = [
	{ place: "on the host", isJoined: false, hostId: null },
	{ place: "in a joined Space", isJoined: true, hostId: "host-1" },
]

const atlasWritingIn = async (isJoined: boolean, hostId: string | null) => {
	await renderLibraryScreen(isJoined)
	await openDocument(NOTES)
	const caret = agentWritesAtEnd(NOTES, AGENT_TEXT, hostId)
	announcePresence(NOTES, [writerOf(ATLAS_ID, "agent", caret, "Atlas")], hostId)
	await waitFor(() => expect(atlasCaret()).toBeInstanceOf(HTMLElement))
}

const settleStop = async () => {
	await waitFor(() => expect(host.stops).toHaveLength(1))
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
}

const pressStopAll = async () => {
	await act(async () => {
		fireEvent.click(
			screen.getByRole("button", {
				name: common("library.document.agents.stopAll"),
			}),
		)
	})
	await settleStop()
}

const pressStopAtlas = async () => {
	act(() => {
		fireEvent.click(atlasCaret() as HTMLElement)
	})
	const stop = await screen.findByRole("button", {
		name: common("library.document.agents.stop", { name: "Atlas" }),
	})
	await act(async () => {
		fireEvent.click(stop)
	})
	await settleStop()
}

const STOP_ALL_FAILED = common("library.failure.document.stopAll")

const STOP_ATLAS_FAILED = common("library.failure.document.stop", {
	name: "Atlas",
})

const FAILED_STOP: CancelOutcome = {
	kind: "failed",
	failures: [
		{
			botId: ATLAS_ID,
			reason: { source: "session", error: { kind: "notAuthenticated" } },
		},
	],
}

describe.each(PLACES)(
	"a person stopping the agents writing in the open document $place",
	({ isJoined, hostId }) => {
		it("stops every agent writing in it with Stop all", async () => {
			await atlasWritingIn(isJoined, hostId)

			await pressStopAll()

			expect(host.stops).toEqual([
				{ spaceId: SPACE_ID, name: NOTES, agentId: null },
			])
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		})

		it("stops only the agent whose Stop was pressed", async () => {
			await atlasWritingIn(isJoined, hostId)

			await pressStopAtlas()

			expect(host.stops).toEqual([
				{ spaceId: SPACE_ID, name: NOTES, agentId: ATLAS_ID },
			])
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		})

		it.each([
			{ answer: "an error", stopAnswer: "refused" as StopAnswer },
			{ answer: "a failed outcome", stopAnswer: FAILED_STOP },
		])(
			"names the failed stop and the gesture to retry when it answers $answer",
			async ({ stopAnswer }) => {
				host.stopAnswer = stopAnswer
				await atlasWritingIn(isJoined, hostId)

				await pressStopAll()
				await waitFor(() =>
					expect(raiseFailureNotice).toHaveBeenCalledWith(
						expect.objectContaining({ title: STOP_ALL_FAILED }),
					),
				)

				vi.mocked(raiseFailureNotice).mockClear()
				host.stops = []
				await pressStopAtlas()
				await waitFor(() =>
					expect(raiseFailureNotice).toHaveBeenCalledWith(
						expect.objectContaining({ title: STOP_ATLAS_FAILED }),
					),
				)
			},
		)

		it("raises no notice when there was nothing left to stop", async () => {
			host.stopAnswer = { kind: "nothingToCancel" }
			await atlasWritingIn(isJoined, hostId)

			await pressStopAll()

			expect(raiseFailureNotice).not.toHaveBeenCalled()
		})
	},
)

describe("an agent that finishes writing in the open document", () => {
	it.each(PLACES)(
		"drops its caret, shows no finished bar and holds the run it wrote $place",
		async ({ isJoined, hostId }) => {
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			await waitFor(() => expect(finishedListenerCount()).toBe(1))

			await atlasWritesThenFinishes(NOTES, hostId)

			await waitFor(() => expect(atlasCaret()).toBeNull())
			expect(finishedBar()).toBeNull()
			expect(shownRuns()).toEqual([])
			expect(heldRuns()).toEqual([AGENT_TEXT])
		},
	)

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

const TABLE = "| Room | Seats |\n| --- | --- |\n| Atlas | 12 |"

const galleryOf = (...items: string[]) =>
	["```gallery", ...items, "```"].join("\n")

const SOFA = "- image: https://images.example.org/sofa.jpg\n  alt: Green sofa"

const LAMP = "- image: https://images.example.org/lamp.jpg\n  alt: Brass lamp"

const documentAround = (block: string) =>
	["# Venue", "The rooms we kept.", block, "We ship in May."].join("\n\n")

const writtenAround = (block: string) =>
	markdownWithIds(
		[
			"# Venue ^ID",
			"The rooms we kept. ^ID",
			`${block}\n\n^ID`,
			"We ship in May. ^ID",
		].join("\n\n"),
	)

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

const openBlockOfType = async (
	type: string,
	name: string,
	role: "textbox" | "button" = "textbox",
) => {
	act(() => {
		document
			.querySelector<HTMLElement>(`[data-type='${type}'] [tabindex]`)
			?.focus()
	})
	const block = document.querySelector<HTMLElement>(`[data-type='${type}']`)
	return within(block as HTMLElement).findByRole(role, { name })
}

const typeEach = (typed: string) => {
	for (const character of typed) {
		const field = document.activeElement as HTMLElement
		act(() => {
			inputInto(field, character)
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

const pasteLinkInWebCard = async (isJoined: boolean) => {
	await renderLibraryScreen(isJoined)
	await openDocument(NOTES)
	await addBlockBelow("We ship in May.", "/web")
	const link = await openBlockOfType(
		"web-page",
		common("library.editor.blocks.webPage.link"),
	)
	await act(async () => {
		fireEvent.change(link, { target: { value: LINK } })
		fireEvent.keyDown(link, { key: "Enter" })
	})
	return link
}

describe.each(PLACES)(
	"a person editing a Library document $place",
	({ isJoined }) => {
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
				expect(markdownOnHost(NOTES)).toMatch(
					markdownWithIds(
						"Intro line ^ID\n\n## Risks ^ID\n\n## Rollout ^ID\n\nWe ship in May. ^ID",
					),
				),
			)
		})

		it("keeps the id of an edited paragraph and gives a paragraph added below it its own", async () => {
			seedDocument(NOTES, NAMED_OPENING)
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			const field = selectIn(blockWith("We ship in May."), 0)

			await act(async () => {
				replaceIn(field, "We ship in June.")
			})
			act(() => {
				fireEvent.keyDown(field, { key: "Enter" })
			})
			typeEach("Risks are low.")

			await waitFor(() =>
				expect(markdownOnHost(NOTES)).toMatch(
					markdownWithIds(
						"Intro line ^intro1\n\n## Rollout ^rollot\n\nWe ship in June. ^shipme\n\nRisks are low. ^ID",
					),
				),
			)
			expect(new Set(markdownOnHost(NOTES).match(/\^[a-z0-9]{6}/g)).size).toBe(
				4,
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
				expect(markdownOnHost(NOTES)).toMatch(
					markdownWithIds(
						"Intro line ^ID\n\nWe ship in May. ^ID\n\n## Rollout ^ID",
					),
				),
			)
		})

		it("fills the web card of a pasted link with the preview the host reads", async () => {
			host.readLinkPreview.mockResolvedValue({
				status: "ok",
				data: {
					url: LINK,
					title: "Rates",
					site: "example.org",
					image: "https://www.example.org/rates.jpg",
					alt: "The rates table",
				},
			})
			await pasteLinkInWebCard(isJoined)

			await waitFor(() =>
				expect(markdownOnHost(NOTES)).toMatch(
					markdownWithIds(
						`${OPENING_WITH_IDS}\n\n\`\`\`web-page\nurl: ${LINK}\ntitle: Rates\nsite: example.org\nimage: https://www.example.org/rates.jpg\nalt: The rates table\n\`\`\`\n\n^ID`,
					),
				),
			)
			expect(host.readLinkPreview).toHaveBeenCalledWith(LINK)
		})

		it.each([
			{
				answer: "an error",
				read: () =>
					host.readLinkPreview.mockResolvedValue({
						status: "error",
						error: { kind: "notAPage" },
					}),
			},
			{
				answer: "a rejection",
				read: () => host.readLinkPreview.mockRejectedValue(new Error("gone")),
			},
		])(
			"keeps the bare link pasted into a web card when the preview read answers $answer",
			async ({ read }) => {
				read()
				const link = await pasteLinkInWebCard(isJoined)

				await waitFor(() =>
					expect(markdownOnHost(NOTES)).toMatch(
						markdownWithIds(
							`${OPENING_WITH_IDS}\n\n\`\`\`web-page\nurl: ${LINK}\n\`\`\`\n\n^ID`,
						),
					),
				)
				expect(link).toHaveProperty("value", LINK)
				expect(link.getAttribute("aria-invalid")).toBe("false")
				expect(raiseFailureNotice).not.toHaveBeenCalled()
			},
		)

		it("saves a table cell edited in place and leaves every other block as it was", async () => {
			seedDocument(NOTES, documentAround(TABLE))
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			const cell = await openBlockOfType(
				"table",
				common("library.editor.blocks.table.cell", { row: 2, column: 1 }),
			)

			act(() => {
				replaceIn(cell, "Atlas North")
			})

			await waitFor(() =>
				expect(markdownOnHost(NOTES)).toMatch(
					writtenAround(TABLE.replace("| Atlas |", "| Atlas North |")),
				),
			)
		})

		it("saves a gallery caption typed in place and leaves every other block as it was", async () => {
			seedDocument(NOTES, documentAround(galleryOf(SOFA, LAMP)))
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			const caption = await openBlockOfType(
				"gallery",
				common("library.editor.blocks.gallery.caption", { position: 2 }),
			)

			act(() => {
				fireEvent.change(caption, { target: { value: "Brass, 90 euros" } })
			})

			await waitFor(() =>
				expect(markdownOnHost(NOTES)).toMatch(
					writtenAround(galleryOf(SOFA, `${LAMP}\n  caption: Brass, 90 euros`)),
				),
			)
		})

		it("saves gallery images reordered in place and leaves every other block as it was", async () => {
			seedDocument(NOTES, documentAround(galleryOf(SOFA, LAMP)))
			await renderLibraryScreen(isJoined)
			await openDocument(NOTES)
			const tile = await openBlockOfType(
				"gallery",
				common("library.editor.blocks.gallery.tile", { position: 1, count: 2 }),
				"button",
			)

			act(() => {
				tile.focus()
				fireEvent.keyDown(tile, { key: "ArrowRight" })
			})

			await waitFor(() =>
				expect(markdownOnHost(NOTES)).toMatch(
					writtenAround(galleryOf(LAMP, SOFA)),
				),
			)
		})
	},
)

const imageNamed = (name: string): LibraryItem => ({
	...itemNamed(name),
	kind: "image",
})

const STORED_SOFA = "- image: sofa-green.jpg\n  alt: Green sofa"

const UNLISTED_LAMP = "- image: lamp.jpg\n  alt: Brass lamp"

const openGallery = async () => {
	await openBlockOfType(
		"gallery",
		common("library.editor.blocks.gallery.tile", { position: 1, count: 1 }),
		"button",
	)
	return document.querySelector<HTMLElement>(
		"[data-type='gallery']",
	) as HTMLElement
}

const shownSources = (gallery: HTMLElement) =>
	[...gallery.querySelectorAll("img")].map((image) => image.getAttribute("src"))

const importedAs = (name: string) => ({
	status: "imported",
	item: imageNamed(name),
})

const addImagesTo = async (gallery: HTMLElement) => {
	await act(async () => {
		fireEvent.click(
			within(gallery).getByRole("button", {
				name: common("library.editor.blocks.gallery.add"),
			}),
		)
	})
}

describe.each([
	{
		place: "on the host",
		isJoined: false,
		shown: "asset:///library/sofa-green.jpg",
	},
	{
		place: "in a joined Space",
		isJoined: true,
		shown: "data:image/jpeg;base64,sofa-green.jpg-bytes",
	},
])("a gallery of stored images $place", ({ isJoined, shown }) => {
	it("shows a stored image at its displayable address", async () => {
		host.images = [imageNamed("sofa-green.jpg")]
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		const gallery = await openGallery()

		await waitFor(() => expect(shownSources(gallery)).toEqual([shown]))
	})

	it("shows an image that names no Library item as broken after one fresh read of the list", async () => {
		seedDocument(NOTES, documentAround(galleryOf(UNLISTED_LAMP)))
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		const listsBefore = host.lists
		const gallery = await openGallery()

		await waitFor(() =>
			expect(
				gallery.querySelector("[data-slot='gallery-broken']"),
			).toBeInstanceOf(HTMLElement),
		)
		expect(shownSources(gallery)).toEqual([])
		expect(host.lists - listsBefore).toBe(1)
	})

	it("shows an image added to the Library after the list was read", async () => {
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		host.images = [imageNamed("sofa-green.jpg")]
		const gallery = await openGallery()

		await waitFor(() => expect(shownSources(gallery)).toEqual([shown]))
	})

	it("waits for the list when the gallery opens with no list in the cache", async () => {
		let releaseList = () => {}
		host.images = [imageNamed("sofa-green.jpg")]
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(isJoined)
		await openDocument(NOTES)
		await screen.findByRole("button", { name: "Comment" })
		screenQueryClient.removeQueries({
			queryKey: libraryQueryKeys.itemsOf(SPACE_ID),
		})
		host.listGate = new Promise((release) => {
			releaseList = release
		})
		const gallery = await openGallery()

		expect(shownSources(gallery)).toEqual([])
		await act(async () => releaseList())

		await waitFor(() => expect(shownSources(gallery)).toEqual([shown]))
	})
})

describe("images added to a gallery on the host", () => {
	const openStoredGallery = async () => {
		host.images = [imageNamed("sofa-green.jpg")]
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(false)
		await openDocument(NOTES)
		return openGallery()
	}

	it("opens the image picker of the computer, several files at once", async () => {
		host.pickImages.mockResolvedValue(null)
		const gallery = await openStoredGallery()

		await addImagesTo(gallery)

		expect(host.pickImages).toHaveBeenCalledWith({
			multiple: true,
			directory: false,
			filters: [
				{
					name: common("library.filters.images"),
					extensions: ["png", "jpg", "jpeg", "gif", "webp"],
				},
			],
		})
	})

	it("imports each picked image, adds it as a tile and relists the Library", async () => {
		host.pickImages.mockResolvedValue([
			"/Users/me/lamp.jpg",
			"/Users/me/rug.png",
		])
		host.importPaths.mockImplementation((_spaceId, [path]: string[]) => {
			const name = path === "/Users/me/lamp.jpg" ? "lamp.jpg" : "rug-2.png"
			host.images = [...host.images, imageNamed(name)]
			return Promise.resolve({ status: "ok", data: [importedAs(name)] })
		})
		const gallery = await openStoredGallery()
		const listsBefore = host.lists

		await addImagesTo(gallery)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				writtenAround(
					galleryOf(
						STORED_SOFA,
						"- image: lamp.jpg\n  alt: lamp",
						"- image: rug-2.png\n  alt: rug",
					),
				),
			),
		)
		expect(host.importPaths).toHaveBeenCalledWith(SPACE_ID, [
			"/Users/me/lamp.jpg",
		])
		expect(host.importPaths).toHaveBeenCalledWith(SPACE_ID, [
			"/Users/me/rug.png",
		])
		expect(host.lists).toBeGreaterThan(listsBefore)
		await waitFor(() =>
			expect(shownSources(gallery)).toEqual([
				"asset:///library/sofa-green.jpg",
				"asset:///library/lamp.jpg",
				"asset:///library/rug-2.png",
			]),
		)
	})

	it("adds nothing when the person cancels the picker", async () => {
		host.pickImages.mockResolvedValue(null)
		const gallery = await openStoredGallery()

		await addImagesTo(gallery)
		await new Promise((resolve) => setTimeout(resolve, 50))

		expect(host.importPaths).not.toHaveBeenCalled()
		expect(markdownOnHost(NOTES)).toBe(documentAround(galleryOf(STORED_SOFA)))
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises the import failure of a refused image and still adds the others", async () => {
		host.pickImages.mockResolvedValue([
			"/Users/me/huge.jpg",
			"/Users/me/lamp.jpg",
		])
		host.importPaths.mockImplementation((_spaceId, [path]: string[]) =>
			Promise.resolve(
				path === "/Users/me/huge.jpg"
					? {
							status: "ok",
							data: [
								{
									status: "refused",
									error: {
										kind: "tooLarge",
										name: "huge.jpg",
										bytes: 30_000_000,
										limit: 20_971_520,
									},
								},
							],
						}
					: { status: "ok", data: [importedAs("lamp.jpg")] },
			),
		)
		const gallery = await openStoredGallery()

		await addImagesTo(gallery)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				writtenAround(galleryOf(STORED_SOFA, "- image: lamp.jpg\n  alt: lamp")),
			),
		)
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: common("library.failure.import.title", { name: "huge.jpg" }),
				description: common("library.failure.import.tooLarge"),
			}),
		)
	})
})

describe("a gallery in a joined Space", () => {
	it("reads a stored image over the relay once however often it is shown", async () => {
		host.images = [imageNamed("sofa-green.jpg")]
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(true)
		await openDocument(NOTES)
		const gallery = await openGallery()

		await waitFor(() =>
			expect(shownSources(gallery)).toEqual([
				"data:image/jpeg;base64,sofa-green.jpg-bytes",
			]),
		)
		expect(host.imageReads).toEqual(["sofa-green.jpg"])
	})

	const openJoinedGallery = async () => {
		host.images = [imageNamed("sofa-green.jpg")]
		seedDocument(NOTES, documentAround(galleryOf(STORED_SOFA)))
		await renderLibraryScreen(true)
		await openDocument(NOTES)
		return openGallery()
	}

	const pickedImageAt = (path: string) => {
		const name = path.split("/").pop() ?? path
		return {
			status: "ok",
			data: { name, mimeType: "image/png", content: `${name}-picked` },
		}
	}

	it("opens the image picker of this computer, several files at once", async () => {
		host.pickImages.mockResolvedValue(null)
		const gallery = await openJoinedGallery()

		await addImagesTo(gallery)

		expect(host.pickImages).toHaveBeenCalledWith({
			multiple: true,
			directory: false,
			filters: [
				{
					name: common("library.filters.images"),
					extensions: ["png", "jpg", "jpeg", "gif", "webp"],
				},
			],
		})
	})

	it("reads each picked image here, imports it to the host, adds it as a tile and relists the Library", async () => {
		host.pickImages.mockResolvedValue([
			"/Users/me/lamp.png",
			"/Users/me/rug.png",
		])
		host.readPickedImage.mockImplementation((path: string) =>
			Promise.resolve(pickedImageAt(path)),
		)
		host.importContent.mockImplementation(({ name }: LibraryCall) => {
			const stored = name === "lamp.png" ? "lamp.png" : "rug-2.png"
			host.images = [...host.images, imageNamed(stored)]
			return imageNamed(stored)
		})
		const gallery = await openJoinedGallery()
		const listsBefore = host.lists

		await addImagesTo(gallery)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				writtenAround(
					galleryOf(
						STORED_SOFA,
						"- image: lamp.png\n  alt: lamp",
						"- image: rug-2.png\n  alt: rug",
					),
				),
			),
		)
		expect(host.readPickedImage).toHaveBeenCalledWith("/Users/me/lamp.png")
		expect(host.readPickedImage).toHaveBeenCalledWith("/Users/me/rug.png")
		expect(host.importContent).toHaveBeenCalledWith({
			spaceId: SPACE_ID,
			name: "lamp.png",
			content: "lamp.png-picked",
		})
		expect(host.importContent).toHaveBeenCalledWith({
			spaceId: SPACE_ID,
			name: "rug.png",
			content: "rug.png-picked",
		})
		expect(host.importPaths).not.toHaveBeenCalled()
		expect(host.lists).toBeGreaterThan(listsBefore)
		await waitFor(() =>
			expect(shownSources(gallery)).toEqual([
				"data:image/jpeg;base64,sofa-green.jpg-bytes",
				"data:image/jpeg;base64,lamp.png-bytes",
				"data:image/jpeg;base64,rug-2.png-bytes",
			]),
		)
	})

	it("imports nothing and raises no notice when the person cancels the picker", async () => {
		host.pickImages.mockResolvedValue(null)
		const gallery = await openJoinedGallery()

		await addImagesTo(gallery)
		await new Promise((resolve) => setTimeout(resolve, 50))

		expect(host.readPickedImage).not.toHaveBeenCalled()
		expect(host.importContent).not.toHaveBeenCalled()
		expect(markdownOnHost(NOTES)).toBe(documentAround(galleryOf(STORED_SOFA)))
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises the tooLarge failure of an image over the relayed limit, sends it nothing and still adds the others", async () => {
		host.pickImages.mockResolvedValue([
			"/Users/me/huge.png",
			"/Users/me/lamp.png",
		])
		host.readPickedImage.mockImplementation((path: string) =>
			Promise.resolve(
				path === "/Users/me/huge.png"
					? {
							status: "error",
							error: {
								kind: "tooLarge",
								name: "huge.png",
								bytes: 9_000_000,
								limit: 8_388_608,
							},
						}
					: pickedImageAt(path),
			),
		)
		host.importContent.mockImplementation(({ name }: LibraryCall) => {
			host.images = [...host.images, imageNamed(name)]
			return imageNamed(name)
		})
		const gallery = await openJoinedGallery()

		await addImagesTo(gallery)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				writtenAround(galleryOf(STORED_SOFA, "- image: lamp.png\n  alt: lamp")),
			),
		)
		expect(host.importContent).toHaveBeenCalledTimes(1)
		expect(host.importContent).toHaveBeenCalledWith(
			expect.objectContaining({ name: "lamp.png" }),
		)
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: common("library.failure.import.title", { name: "huge.png" }),
				description: common("library.failure.import.tooLarge"),
			}),
		)
	})

	it("raises the import failure of an image the host refuses and still adds the others", async () => {
		host.pickImages.mockResolvedValue([
			"/Users/me/taken.png",
			"/Users/me/lamp.png",
		])
		host.readPickedImage.mockImplementation((path: string) =>
			Promise.resolve(pickedImageAt(path)),
		)
		host.importContent.mockImplementation(({ name }: LibraryCall) => {
			if (name === "taken.png") {
				throw { kind: "unwritable", detail: "disk full" }
			}
			host.images = [...host.images, imageNamed(name)]
			return imageNamed(name)
		})
		const gallery = await openJoinedGallery()

		await addImagesTo(gallery)

		await waitFor(() =>
			expect(markdownOnHost(NOTES)).toMatch(
				writtenAround(galleryOf(STORED_SOFA, "- image: lamp.png\n  alt: lamp")),
			),
		)
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: common("library.failure.import.title", { name: "taken.png" }),
				description: common("library.failure.import.unwritable"),
			}),
		)
	})
})
