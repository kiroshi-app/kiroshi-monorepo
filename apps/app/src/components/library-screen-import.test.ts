// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement, Fragment } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import type { LibraryItem } from "@/lib/bindings"
import { HostRefused } from "@/lib/host/host-refused"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type ImportCall = { spaceId: string; name: string; content: string }

type ImportAnswer = (call: ImportCall) => Promise<LibraryItem>

type Harness = {
	listed: LibraryItem[]
	imports: ImportCall[]
	answerImport: ImportAnswer
}

const SPACE_ID = "space"

const MIB = 1024 * 1024

const itemNamed = (name: string, kind: LibraryItem["kind"]): LibraryItem => ({
	name,
	kind,
	path: `/library/${name}`,
	bytes: 5,
	modifiedAt: 0,
	createdAt: null,
})

const harness = vi.hoisted(
	(): Harness => ({
		listed: [],
		imports: [],
		answerImport: () => Promise.reject(new Error("unanswered")),
	}),
)

const LIBRARY_ANSWERS: Record<string, (args: unknown) => unknown> = {
	library_list: () => harness.listed,
	library_comment_agent_turns: () => [],
	library_read_document: (args) => ({
		name: (args as ImportCall).name,
		format: "text",
		content: "",
	}),
	library_read_image: (args) => ({
		name: (args as ImportCall).name,
		mimeType: "image/png",
		content: "",
	}),
	library_import: (args) => {
		harness.imports.push(args as ImportCall)
		return harness.answerImport(args as ImportCall)
	},
}

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = async <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		const answer = LIBRARY_ANSWERS[command]
		return answer ? ((await answer(args)) as T) : actual.invoke<T>(...call)
	}
	return { ...actual, invoke, isDesktopHost: () => false }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
	raiseTransientNotice: vi.fn(() => "notice"),
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

const common = i18n.getFixedT(null, "common")

const OUTSIDE = "Outside the Library"

const renderLibraryScreen = async (isJoined: boolean) => {
	const { container } = render(
		createElement(
			Fragment,
			null,
			createElement("button", { type: "button" }, OUTSIDE),
			createElement(LibraryScreenHoldingOpening, {
				spaceId: SPACE_ID,
				isJoined,
				bots: [],
			}),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	const shown = within(container)
	const heading = await shown.findByRole("heading", {
		level: 1,
		name: common("library.title"),
	})
	return {
		shown,
		heading,
		outside: shown.getByRole("button", { name: OUTSIDE }),
	}
}

type DragLoad = { types?: string[]; files?: File[] }

const dataTransferOf = ({ types = ["Files"], files = [] }: DragLoad) => ({
	types,
	files,
	items: files.map((file) => ({ kind: "file", type: file.type })),
})

const dragInto = (target: Element, load: DragLoad) =>
	fireEvent.dragEnter(target, { dataTransfer: dataTransferOf(load) })

const dropOn = (target: Element, load: DragLoad) =>
	fireEvent.drop(target, { dataTransfer: dataTransferOf(load) })

const textFile = (name: string, text = "hello") =>
	new File([text], name, { type: "text/plain" })

const imageFile = (name: string, bytes = 5) =>
	new File([new Uint8Array(bytes)], name, { type: "image/png" })

const dropTitleOf = (count: number) => common("library.drop.title", { count })

const importingLabelOf = (name: string) =>
	common("library.importing.label", { name })

const importFailureOf = (name: string, description: string) =>
	expect.objectContaining({
		title: common("library.failure.import.title", { name }),
		description,
	})

const answerWith =
	(added: LibraryItem): ImportAnswer =>
	async () => {
		harness.listed = [added, ...harness.listed]
		return added
	}

beforeEach(() => {
	harness.listed = [itemNamed("notes.txt", "document")]
	harness.imports = []
	harness.answerImport = () => Promise.reject(new Error("unanswered"))
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(raiseTransientNotice).mockClear()
})

afterEach(cleanup)

describe("files dragged over the Library", () => {
	it("shows the drop overlay with the file count until the drag leaves the panel", async () => {
		const { shown, heading, outside } = await renderLibraryScreen(false)
		const files = [textFile("a.txt"), textFile("b.txt")]

		dragInto(heading, { files })
		expect(await shown.findByText(dropTitleOf(2))).toBeInstanceOf(HTMLElement)

		dragInto(outside, { files })
		await waitFor(() => expect(shown.queryByText(dropTitleOf(2))).toBeNull())

		dragInto(heading, { files })
		await shown.findByText(dropTitleOf(2))
		fireEvent.dragEnd(heading)
		await waitFor(() => expect(shown.queryByText(dropTitleOf(2))).toBeNull())
	})

	it("shows nothing and imports nothing for a drag that carries no file", async () => {
		const { shown, heading } = await renderLibraryScreen(false)
		const textDrag = { types: ["text/plain", "text/uri-list"] }

		dragInto(heading, textDrag)
		dropOn(heading, textDrag)

		expect(shown.queryByRole("status")).toBeNull()
		expect(harness.imports).toEqual([])
	})
})

describe("files dropped on the Library", () => {
	it("imports each file, draws it importing first, then lists it and says how many were added", async () => {
		const { shown, heading } = await renderLibraryScreen(true)
		let finishImport = () => {}
		harness.answerImport = (call) =>
			new Promise((resolve) => {
				finishImport = () =>
					void answerWith(itemNamed(call.name, "image"))(call).then(resolve)
			})

		dragInto(heading, { files: [imageFile("chart.png")] })
		await shown.findByText(dropTitleOf(1))
		dropOn(heading, { files: [imageFile("chart.png")] })

		const progress = await shown.findByRole("progressbar", {
			name: importingLabelOf("chart.png"),
		})
		expect(shown.queryByText(dropTitleOf(1))).toBeNull()
		const listed = shown.getByRole("button", { name: /notes/ })
		expect(
			progress.compareDocumentPosition(listed) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		expect(shown.queryByRole("button", { name: /chart\.png/ })).toBeNull()
		await waitFor(() =>
			expect(harness.imports).toEqual([
				{ spaceId: SPACE_ID, name: "chart.png", content: "AAAAAAA=" },
			]),
		)

		finishImport()

		expect(
			await shown.findByRole("button", { name: /chart\.png/ }),
		).toBeInstanceOf(HTMLElement)
		expect(shown.queryByRole("progressbar")).toBeNull()
		await waitFor(() =>
			expect(raiseTransientNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.added.title", { count: 1 }),
				}),
			),
		)
		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("sends the base64 content of every file on the host", async () => {
		const { shown, heading } = await renderLibraryScreen(false)
		harness.answerImport = (call) =>
			answerWith(itemNamed(call.name, "document"))(call)

		dropOn(heading, {
			files: [textFile("a.txt", "hello"), textFile("b.md", "hi")],
		})

		await shown.findByRole("button", { name: /^b/ })
		expect(harness.imports).toEqual(
			expect.arrayContaining([
				{ spaceId: SPACE_ID, name: "a.txt", content: btoa("hello") },
				{ spaceId: SPACE_ID, name: "b.md", content: btoa("hi") },
			]),
		)
		await waitFor(() =>
			expect(raiseTransientNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.added.title", { count: 2 }),
				}),
			),
		)
		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
	})

	it("removes the tile of a file the host refuses and names it in a failure notice", async () => {
		const { shown, heading } = await renderLibraryScreen(false)
		harness.answerImport = (call) =>
			call.name === "clip.gif"
				? Promise.reject({ kind: "unsupported", name: call.name })
				: new Promise(() => {})

		dropOn(heading, { files: [imageFile("clip.gif"), imageFile("slow.png")] })

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureOf(
					"clip.gif",
					common("library.failure.import.unsupported"),
				),
			),
		)
		await waitFor(() =>
			expect(
				shown.queryByRole("progressbar", {
					name: importingLabelOf("clip.gif"),
				}),
			).toBeNull(),
		)
		expect(
			shown.getByRole("progressbar", { name: importingLabelOf("slow.png") }),
		).toBeInstanceOf(HTMLElement)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("words the reason a joined host relays for a refused file", async () => {
		const { heading } = await renderLibraryScreen(true)
		harness.answerImport = (call) =>
			Promise.reject(
				new HostRefused("notUtf8", { kind: "notUtf8", name: call.name }),
			)

		dropOn(heading, { files: [textFile("latin.txt")] })

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureOf("latin.txt", common("library.failure.import.notUtf8")),
			),
		)
	})

	it("words a refusal it does not know with the refused sentence, never its code", async () => {
		const { heading } = await renderLibraryScreen(false)
		harness.answerImport = () =>
			Promise.reject({ kind: "clipboardRefused", detail: "denied" })

		dropOn(heading, { files: [textFile("odd.txt")] })

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureOf("odd.txt", common("library.failure.import.refused")),
			),
		)
	})

	it("refuses a file over 8 MiB in a joined Space before sending it", async () => {
		const { shown, heading } = await renderLibraryScreen(true)
		harness.answerImport = (call) =>
			answerWith(itemNamed(call.name, "document"))(call)

		dropOn(heading, {
			files: [imageFile("huge.png", 8 * MIB + 1), textFile("small.txt")],
		})

		await shown.findByRole("button", { name: /small/ })
		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureOf("huge.png", common("library.failure.import.tooLarge")),
			),
		)
		expect(harness.imports.map(({ name }) => name)).toEqual(["small.txt"])
		expect(shown.queryByRole("progressbar")).toBeNull()
	})

	it("sends a file over 8 MiB to the host of its own Space", async () => {
		const { heading } = await renderLibraryScreen(false)
		harness.answerImport = (call) =>
			answerWith(itemNamed(call.name, "image"))(call)

		dropOn(heading, { files: [imageFile("huge.png", 8 * MIB + 1)] })

		await waitFor(() =>
			expect(harness.imports.map(({ name }) => name)).toEqual(["huge.png"]),
		)
	})

	it("refuses a file over 20 MiB on the host before sending it", async () => {
		const { shown, heading } = await renderLibraryScreen(false)
		harness.answerImport = (call) =>
			answerWith(itemNamed(call.name, "image"))(call)

		dropOn(heading, { files: [imageFile("vast.png", 20 * MIB + 1)] })

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureOf("vast.png", common("library.failure.import.tooLarge")),
			),
		)
		expect(harness.imports).toEqual([])
		expect(shown.queryByRole("progressbar")).toBeNull()
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})
})
