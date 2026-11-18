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
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MarkdownSizeContext } from "@workspace/ui/components/markdown/size"
import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { AnswerBody, TurnBody } from "@/components/turn-body"
import type { LiveHtmlMeasured } from "@/lib/bindings"
import {
	type AnswerActions,
	AnswerActionsContext,
} from "@/lib/chat/answer-actions"
import {
	attachmentBlock,
	messageWithAttachments,
} from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"

type MeasuredHandler = (event: { payload: LiveHtmlMeasured }) => void

const host = vi.hoisted(() => ({
	saveCsvFile: vi.fn(),
	liveHtml: vi.fn(),
	isMacOs: false,
	measuredHandlers: new Set<MeasuredHandler>(),
}))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: async (command: string, args: unknown) => {
		if (command === "save_csv_file") return host.saveCsvFile(args)
		if (command.startsWith("live_html_")) return host.liveHtml(command, args)
		throw new Error(`unanswered host call ${command}`)
	},
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
	raiseTransientNotice: vi.fn(() => "notice"),
}))

vi.mock("@/lib/links/open-attachment", () => ({ openAttachment: vi.fn() }))

vi.mock("@/lib/host/window-listen", () => ({
	listenOnThisWindow: async (_event: string, handler: MeasuredHandler) => {
		host.measuredHandlers.add(handler)
		return () => host.measuredHandlers.delete(handler)
	},
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	assetSrc: (path: string) => `host-file://${encodeURIComponent(path)}`,
	showsLiveHtml: () => host.isMacOs,
}))

afterEach(() => {
	cleanup()
	vi.mocked(openAttachment).mockClear()
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(raiseTransientNotice).mockClear()
	host.saveCsvFile.mockReset()
	host.liveHtml.mockReset()
	host.isMacOs = false
	host.measuredHandlers.clear()
})

const fenced = (label: string, body: string) =>
	`Here it is.\n\n\`\`\`${label}\n${body}\n\`\`\``

type ImageSurface = {
	surface: string
	text: string
	name: string
	src: string
}

const SOURCED_IMAGE: ImageSurface = {
	surface: "a sourced image",
	text: "![The Lisbon waterfront](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)",
	name: "The Lisbon waterfront",
	src: "https://images.example.org/lisbon.jpg",
}

const IMAGE_SURFACES: ImageSurface[] = [
	{
		surface: "a gallery",
		text: fenced(
			"gallery",
			`- image: https://images.example.org/green.jpg
  alt: Green velvet sofa
- image: https://images.example.org/grey.jpg
  alt: Grey linen sofa`,
		),
		name: "Grey linen sofa",
		src: "https://images.example.org/grey.jpg",
	},
	{
		surface: "an inline markdown image",
		text: "Here: ![A green sofa](https://images.example.org/sofa.jpg)",
		name: "A green sofa",
		src: "https://images.example.org/sofa.jpg",
	},
	SOURCED_IMAGE,
	{
		surface: "an illustrated list",
		text: fenced(
			"illustrated-list",
			`- title: Lisbon
  image: https://images.example.org/lisbon.jpg
- title: Porto
  image: https://images.example.org/porto.jpg`,
		),
		name: "Porto",
		src: "https://images.example.org/porto.jpg",
	},
	{
		surface: "a web page card",
		text: fenced(
			"web-page",
			`url: https://www.casadorio.pt/rooms
title: Casa do Rio
image: https://images.example.org/casa-do-rio.jpg
alt: Terrace of Casa do Rio`,
		),
		name: "Terrace of Casa do Rio",
		src: "https://images.example.org/casa-do-rio.jpg",
	},
]

const IMAGE_MENU_ENTRIES = ["Save to Library", "Copy image", "Open in viewer"]

const actionsSpy = (): AnswerActions => ({
	insert: vi.fn(),
	openImage: vi.fn(),
	imageActions: {
		onSaveToLibrary: vi.fn(),
		onCopyImage: vi.fn(),
		isSavingImage: () => false,
	},
})

const renderAnswer = (text: string, actions: AnswerActions) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(AnswerBody, {
				attachments: [],
				text,
				agentName: "Ada",
				isWriting: false,
			}),
		),
	)

const imageNamed = (name: string) =>
	screen.queryByRole("button", { name }) ?? screen.getByRole("img", { name })

const openImageMenuOf = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(imageNamed(name))
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

describe.each(IMAGE_SURFACES)(
	"the image menu of $surface in an answer",
	({ text, name, src }) => {
		it("opens on right-click with the image actions", async () => {
			renderAnswer(text, actionsSpy())

			const menu = await openImageMenuOf(name)

			expect(
				within(menu)
					.getAllByRole("menuitem")
					.map((item) => item.textContent),
			).toEqual(IMAGE_MENU_ENTRIES)
		})

		it.each([
			["Save to Library", "onSaveToLibrary"],
			["Copy image", "onCopyImage"],
		] as const)("hands the image to %s", async (entry, handler) => {
			const actions = actionsSpy()
			renderAnswer(text, actions)

			await pickInImageMenuOf(name, entry)

			expect(actions.imageActions[handler]).toHaveBeenCalledWith(
				expect.objectContaining({ name, src }),
			)
		})

		it("opens the image in the answer image viewer", async () => {
			const actions = actionsSpy()
			renderAnswer(text, actions)

			await pickInImageMenuOf(name, "Open in viewer")

			expect(actions.openImage).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ name, src })]),
				expect.any(Number),
			)
		})
	},
)

describe("the Save button of a sourced image in an answer", () => {
	it("saves the image to the Library", async () => {
		const actions = actionsSpy()
		renderAnswer(SOURCED_IMAGE.text, actions)

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save the image" }))
		})

		expect(actions.imageActions.onSaveToLibrary).toHaveBeenCalledWith(
			expect.objectContaining({
				name: SOURCED_IMAGE.name,
				src: SOURCED_IMAGE.src,
			}),
		)
	})
})

const TABLE = `| City | Nights |
| --- | --- |
| Lisbon | 3 |
| Porto, north | 2 |`

const TABLE_CSV = 'City,Nights\r\nLisbon,3\r\n"Porto, north",2'

const TABLE_NOT_SAVED =
	"Couldn’t save the table. Press Download CSV to try again."

const renderBubblelessTableOf = (agentName: string) =>
	render(
		createElement(
			MarkdownSizeContext,
			{ value: "answer" },
			createElement(
				AnswerActionsContext,
				{ value: actionsSpy() },
				createElement(AnswerBody, {
					attachments: [],
					text: TABLE,
					agentName,
					isWriting: false,
				}),
			),
		),
	)

const downloadTableOf = async (agentName = "Ada") => {
	renderBubblelessTableOf(agentName)
	const download = await screen.findByRole("button", { name: "Download CSV" })
	await act(async () => {
		fireEvent.click(download)
	})
}

describe("the Download CSV button of a table in an answer", () => {
	it.each([
		["Ada", "ada-table.csv"],
		["Ada Lovelace!", "ada-lovelace-table.csv"],
		["Ada - Lovelace", "ada-lovelace-table.csv"],
		["--Ada--", "ada-table.csv"],
		["R2-D2", "r2-d2-table.csv"],
		["Éloïse", "éloïse-table.csv"],
		["E\u0301loi\u0308se", "éloïse-table.csv"],
		["日本 ✦", "日本-table.csv"],
		["Анна", "анна-table.csv"],
		["Ζωή", "ζωή-table.csv"],
		["हिंदी ४२!", "हिंदी-४२-table.csv"],
		["Ada ❤\ufe0f", "ada-table.csv"],
		['Ada\u0000\u001f\u007f"\\Lovelace', "ada-lovelace-table.csv"],
		["a".repeat(70), `${"a".repeat(64)}-table.csv`],
		[`${"a".repeat(63)} b`, `${"a".repeat(63)}-table.csv`],
		[`a${"𠀀".repeat(70)}`, `a${"𠀀".repeat(63)}-table.csv`],
		["/:*?<>|", "table.csv"],
	])("saves the table of %s as %s", async (agentName, name) => {
		host.saveCsvFile.mockResolvedValue(null)

		await downloadTableOf(agentName)

		expect(host.saveCsvFile).toHaveBeenCalledTimes(1)
		expect(host.saveCsvFile).toHaveBeenCalledWith({ name, text: TABLE_CSV })
	})

	it("raises no notice when the person cancels the picker", async () => {
		host.saveCsvFile.mockResolvedValue(null)

		await downloadTableOf()

		expect(host.saveCsvFile).toHaveBeenCalledTimes(1)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it.each([
		"/Users/ada/Desktop/lisbon-nights.csv",
		"C:\\Users\\ada\\Desktop\\lisbon-nights.csv",
	])("names the file saved at %s in a notice", async (path) => {
		host.saveCsvFile.mockResolvedValue(path)

		await downloadTableOf()

		await waitFor(() =>
			expect(raiseTransientNotice).toHaveBeenCalledWith({
				type: "success",
				title: "Table saved as lisbon-nights.csv",
			}),
		)
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it.each([
		[
			"the host refuses the name",
			{ kind: "invalidName", name: "ada-table.csv" },
		],
		["the file can’t be written", { kind: "unwritable", detail: "read-only" }],
		["the host call rejects", new Error("ipc down")],
	])("says the table was not saved when %s", async (_case, failure) => {
		host.saveCsvFile.mockRejectedValue(failure)

		await downloadTableOf()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({ title: TABLE_NOT_SAVED }),
			),
		)
		expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})
})

const MESSAGE_ATTACHMENTS = [
	{
		id: "/attachments/porto.jpg",
		name: "porto.jpg",
		previewUrl: "blob:porto",
	},
	{ id: "/attachments/brief.pdf", name: "brief.pdf" },
	{
		id: "/attachments/lisbon.jpg",
		name: "lisbon.jpg",
		previewUrl: "blob:lisbon",
	},
]

const renderMessage = (actions: AnswerActions | null) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(TurnBody, { attachments: MESSAGE_ATTACHMENTS, text: "" }),
		),
	)

const clickAttachment = (name: string) =>
	act(async () => {
		fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))
	})

describe("a left-click on an attachment of a message", () => {
	it("opens the message images in the viewer at the clicked image", async () => {
		const actions = actionsSpy()
		renderMessage(actions)

		await clickAttachment("lisbon.jpg")

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({ name: "porto.jpg", src: "blob:porto" }),
				expect.objectContaining({ name: "lisbon.jpg", src: "blob:lisbon" }),
			],
			1,
		)
		expect(openAttachment).not.toHaveBeenCalled()
	})

	it("opens a non-image attachment in its default app", async () => {
		const actions = actionsSpy()
		renderMessage(actions)

		await clickAttachment("brief.pdf")

		expect(openAttachment).toHaveBeenCalledWith("/attachments/brief.pdf")
		expect(actions.openImage).not.toHaveBeenCalled()
	})

	it("opens an image attachment in its default app outside a thread", async () => {
		renderMessage(null)

		await clickAttachment("lisbon.jpg")

		expect(openAttachment).toHaveBeenCalledWith("/attachments/lisbon.jpg")
	})
})

const STORE =
	"/Users/reader/Library/Application Support/com.kiroshi.app/attachments/conv-1"
const CITED_IMAGE = `${STORE}/0b1e7c52-6a1f-4c7e-9d3a-2f8e4b6c1a90.png`
const CITED_FILE = `${STORE}/5d2a9f31-8c4b-4e6d-a1f0-7b3c9e2d4a68.pdf`
const OUTSIDE_THE_STORE = "/Users/reader/Downloads/brief.pdf"

const renderCitation = (text: string, actions: AnswerActions | null) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(TurnBody, { attachments: [], text }),
		),
	)

const click = (element: HTMLElement) =>
	act(async () => {
		fireEvent.click(element, { detail: 1 })
	})

describe("a file an agent cites in its answer", () => {
	it("shows a cited image in place, resolved through the host file route", async () => {
		renderCitation(`The chart: ![Harbour chart](<${CITED_IMAGE}>)`, null)

		const image = await screen.findByRole("img", { name: "Harbour chart" })

		expect(image.getAttribute("src")).toBe(
			`host-file://${encodeURIComponent(CITED_IMAGE)}`,
		)
	})

	it("opens a clicked cited image in the viewer", async () => {
		const actions = actionsSpy()
		renderCitation(`![Harbour chart](<${CITED_IMAGE}>)`, actions)

		await click(await screen.findByRole("button", { name: "Harbour chart" }))

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					src: `host-file://${encodeURIComponent(CITED_IMAGE)}`,
					path: CITED_IMAGE,
				}),
			],
			0,
		)
		expect(openAttachment).not.toHaveBeenCalled()
	})

	it("opens a clicked cited file in its default app", async () => {
		const actions = actionsSpy()
		renderCitation(`Read [the brief](<${CITED_FILE}>) first.`, actions)

		await click(screen.getByRole("button", { name: "Open the brief" }))

		expect(openAttachment).toHaveBeenCalledWith(CITED_FILE)
		expect(actions.openImage).not.toHaveBeenCalled()
	})

	it("opens nothing for a path outside the attachment store", async () => {
		const actions = actionsSpy()
		renderCitation(
			`Read [the brief](<${OUTSIDE_THE_STORE}>) beside [the chart](<${CITED_IMAGE}>).`,
			actions,
		)

		expect(screen.queryByRole("button", { name: "Open the brief" })).toBeNull()

		await click(screen.getByRole("button", { name: "Open the chart" }))

		expect(openAttachment).not.toHaveBeenCalled()
		expect(actions.openImage).toHaveBeenCalledWith(
			[expect.objectContaining({ path: CITED_IMAGE })],
			0,
		)
	})

	it("leaves a path outside the attachment store without a chip", () => {
		renderCitation(
			`Read [the brief](<${OUTSIDE_THE_STORE}>) first.`,
			actionsSpy(),
		)

		expect(screen.queryByRole("button", { name: "Open the brief" })).toBeNull()
	})

	it("keeps an image outside the attachment store as its label", async () => {
		renderCitation(`![Harbour chart](<${OUTSIDE_THE_STORE}.png>)`, null)

		expect(await screen.findByText("Harbour chart")).toBeTruthy()
		expect(screen.queryByRole("img")).toBeNull()
	})
})

const attachmentChipOf = (path: string) =>
	screen.queryByRole("button", { name: `Open ${path.split("/").at(-1)}` })

describe("a message citing no stored attachment", () => {
	it("leaves a code path link without an attachment chip", () => {
		renderCitation("See [a.ts](src/a.ts) for the parser.", actionsSpy())

		expect(screen.queryByRole("button", { name: "Open a.ts" })).toBeNull()
		expect(screen.getByText("See a.ts for the parser.")).toBeTruthy()
	})
})

describe("a stored message carrying the attachments block", () => {
	it("still shows its files as chips in the attachments row", () => {
		const stored = `Have a look\n\n${attachmentBlock(
			[CITED_IMAGE, CITED_FILE],
			new Date("2026-09-18T10:15:30Z"),
		)}`
		render(createElement(TurnBody, messageWithAttachments(stored)))

		expect(attachmentChipOf(CITED_IMAGE)).toBeTruthy()
		expect(attachmentChipOf(CITED_FILE)).toBeTruthy()
		expect(screen.getByText("Have a look")).toBeTruthy()
		expect(screen.queryByText(/Attached to this message/)).toBeNull()
	})
})

const PAGE = "<h1>Lisbon by night</h1>"

const HTML_REPLY = fenced("html", PAGE)

const LIVE_VIEW_FAILED = "Couldn’t show the live view. Here’s the code instead."

const SLOT_VIEW_BOX = { x: 40, y: 120, width: 480, height: 320 }

const WINDOW_BOX = { x: 0, y: 0, width: 1280, height: 800 }

const boxOf = (element: HTMLElement) =>
	DOMRect.fromRect(
		element.dataset.slot === "live-html-slot-view" ? SLOT_VIEW_BOX : WINDOW_BOX,
	)

const layOutSlotViews = () => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			return boxOf(this)
		},
	)
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
		WINDOW_BOX.width,
	)
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
		WINDOW_BOX.height,
	)
}

const renderReply = (text: string, isWriting = false) =>
	render(
		createElement(
			MarkdownSizeContext,
			{ value: "answer" },
			createElement(
				AnswerActionsContext,
				{ value: actionsSpy() },
				createElement(AnswerBody, {
					attachments: [],
					text,
					agentName: "Ada",
					isWriting,
				}),
			),
		),
	)

const liveHtmlCallsOf = (command: string) =>
	host.liveHtml.mock.calls.flatMap(([called, args]) =>
		called === command ? [args] : [],
	)

const htmlCodeBlock = () =>
	screen.queryByRole("group", { name: "Code snippet, html" })

const liveView = () => screen.queryByRole("group", { name: "Live view" })

const measurePage = (id: string, height: number) =>
	act(() => {
		for (const handler of host.measuredHandlers) {
			handler({ payload: { id, width: SLOT_VIEW_BOX.width, height } })
		}
	})

const mountedViewId = async (command: string) => {
	await waitFor(() => expect(liveHtmlCallsOf(command)).toHaveLength(1))
	const [{ id }] = liveHtmlCallsOf(command) as { id: string }[]
	return id
}

const slotViewHeight = () =>
	document.querySelector<HTMLElement>('[data-slot="live-html-slot-view"]')
		?.style.height

const showOnMacOs = () => {
	host.isMacOs = true
	host.liveHtml.mockResolvedValue(null)
	layOutSlotViews()
}

describe("an html block of an agent reply", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("shows the page live at the place of its slot once the reply is written", async () => {
		showOnMacOs()

		renderReply(HTML_REPLY)

		expect(liveView()).toBeTruthy()
		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_place")).toEqual([
				{
					id: expect.any(String),
					rectangle: SLOT_VIEW_BOX,
					clip: SLOT_VIEW_BOX,
				},
			]),
		)
		expect(liveHtmlCallsOf("live_html_mount")).toEqual([
			{
				id: expect.any(String),
				html: PAGE,
				rectangle: SLOT_VIEW_BOX,
				theme: { appearance: "light", hue: null },
			},
		])
		expect(htmlCodeBlock()).toBeNull()
	})

	it.each([
		["while the reply is writing", true, true],
		["off macOS", false, false],
	])("stays a code block %s", (_case, isMacOs, isWriting) => {
		showOnMacOs()
		host.isMacOs = isMacOs

		renderReply(HTML_REPLY, isWriting)

		expect(htmlCodeBlock()).toBeTruthy()
		expect(liveView()).toBeNull()
		expect(host.liveHtml).not.toHaveBeenCalled()
	})

	it("raises a notice and falls back to the code block when a command fails", async () => {
		showOnMacOs()
		host.liveHtml.mockRejectedValue({ kind: "mainWindowMissing" })

		renderReply(HTML_REPLY)

		await waitFor(() => expect(htmlCodeBlock()).toBeTruthy())
		expect(liveView()).toBeNull()
		expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({ title: LIVE_VIEW_FAILED }),
		)
	})

	it("gives two identical blocks a view each", async () => {
		showOnMacOs()

		renderReply(`${HTML_REPLY}\n\n${HTML_REPLY}`)

		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_mount")).toHaveLength(2),
		)
		const [first, second] = liveHtmlCallsOf("live_html_mount")
		expect(first.id).not.toBe(second.id)
	})

	it("keeps the default height until the host measures the page, then takes it", async () => {
		showOnMacOs()
		renderReply(HTML_REPLY)
		const id = await mountedViewId("live_html_mount")

		expect(slotViewHeight()).toBe("")

		measurePage(id, 1840)
		expect(slotViewHeight()).toBe("1840px")

		measurePage("another-view", 400)
		expect(slotViewHeight()).toBe("1840px")
	})

	it("removes its view when the reply leaves the screen", async () => {
		showOnMacOs()
		const { unmount } = renderReply(HTML_REPLY)
		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_place")).toHaveLength(1),
		)
		const [{ id }] = liveHtmlCallsOf("live_html_mount")

		unmount()

		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_remove")).toEqual([{ id }]),
		)
	})

	it("hides its view while a dialog is open, and shows it once it closes", async () => {
		showOnMacOs()
		renderReply(HTML_REPLY)
		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_place")).toHaveLength(1),
		)
		const [{ id }] = liveHtmlCallsOf("live_html_mount")
		const dialog = document.createElement("div")
		dialog.setAttribute("role", "dialog")
		dialog.setAttribute("data-open", "")

		document.body.append(dialog)
		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_hide")).toEqual([{ id }]),
		)
		dialog.remove()

		await waitFor(() =>
			expect(liveHtmlCallsOf("live_html_show")).toEqual([{ id }]),
		)
	})
})

const STORED_PAGE = `${STORE}/9c4e2b7a-1d3f-4a6b-8e5c-2f7a9d1b3c64.html`

const STORED_PAGE_CHIP = `Open ${STORED_PAGE.split("/").at(-1)}`

const CITING_REPLY = `Here is the map: [the night map](<${STORED_PAGE}>)`

const ATTACHING_REPLY = `Here is the map.\n\n${attachmentBlock(
	[STORED_PAGE],
	new Date("2026-11-17T10:15:30Z"),
)}`

const renderStoredReply = (stored: string, isWriting = false) =>
	render(
		createElement(
			MarkdownSizeContext,
			{ value: "answer" },
			createElement(
				AnswerActionsContext,
				{ value: actionsSpy() },
				createElement(AnswerBody, {
					...messageWithAttachments(stored),
					agentName: "Ada",
					isWriting,
				}),
			),
		),
	)

describe("an html file an agent attaches to its reply", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it.each([
		["cites in the text", CITING_REPLY, "Open the night map"],
		["lists in the attachments row", ATTACHING_REPLY, STORED_PAGE_CHIP],
	])(
		"shows the stored page live when the reply %s",
		async (_case, reply, open) => {
			showOnMacOs()

			renderStoredReply(reply)

			expect(liveView()).toBeTruthy()
			await waitFor(() =>
				expect(liveHtmlCallsOf("live_html_place")).toEqual([
					{
						id: expect.any(String),
						rectangle: SLOT_VIEW_BOX,
						clip: SLOT_VIEW_BOX,
					},
				]),
			)
			expect(liveHtmlCallsOf("live_html_mount_attachment")).toEqual([
				{
					id: expect.any(String),
					path: STORED_PAGE,
					rectangle: SLOT_VIEW_BOX,
					theme: { appearance: "light", hue: null },
				},
			])
			expect(screen.getByRole("button", { name: open })).toBeTruthy()
		},
	)

	it("opens the file from the Open control under the view", async () => {
		showOnMacOs()
		renderStoredReply(CITING_REPLY)

		await click(screen.getByRole("button", { name: "Open the night map" }))

		expect(openAttachment).toHaveBeenCalledWith(STORED_PAGE)
	})

	it("grows to the height the host measured for the stored page", async () => {
		showOnMacOs()
		renderStoredReply(ATTACHING_REPLY)
		const id = await mountedViewId("live_html_mount_attachment")

		measurePage(id, 2640)

		expect(slotViewHeight()).toBe("2640px")
	})

	it.each([
		["while the reply is writing", true, true],
		["off macOS", false, false],
	])("stays a file chip %s", (_case, isMacOs, isWriting) => {
		showOnMacOs()
		host.isMacOs = isMacOs

		renderStoredReply(ATTACHING_REPLY, isWriting)

		expect(attachmentChipOf(STORED_PAGE)).toBeTruthy()
		expect(liveView()).toBeNull()
		expect(host.liveHtml).not.toHaveBeenCalled()
	})

	it("keeps a stored file that is not html as a chip", () => {
		showOnMacOs()

		renderStoredReply(`Read [the brief](<${CITED_FILE}>) first.`)

		expect(screen.getByRole("button", { name: "Open the brief" })).toBeTruthy()
		expect(liveView()).toBeNull()
		expect(host.liveHtml).not.toHaveBeenCalled()
	})

	it.each([
		["answers a refusal", { kind: "notHtml" }],
		["rejects", new Error("ipc closed")],
	])(
		"raises one notice and shows the chip again when the host %s",
		async (_case, failure) => {
			showOnMacOs()
			host.liveHtml.mockRejectedValue(failure)

			renderStoredReply(ATTACHING_REPLY)

			await waitFor(() => expect(liveView()).toBeNull())
			expect(attachmentChipOf(STORED_PAGE)).toBeTruthy()
			expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({ title: LIVE_VIEW_FAILED }),
			)
		},
	)
})
