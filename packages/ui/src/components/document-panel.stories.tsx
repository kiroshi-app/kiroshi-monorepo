import { type CSSProperties, type ReactNode, useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	hueScopeOf,
	LAPTOP_WINDOW,
	MarkdownProse,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AGENT_AUTHOR,
	BOARD_CARD_TITLE,
	DRAWING_AGENT,
	DRAWING_AGENT_POINTER,
	PERSON_AUTHOR,
	PLANNING_BOARD_SNAPSHOT,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import { BoardCard } from "@workspace/ui/components/board/board-card"
import type { BoardPresenceOwner } from "@workspace/ui/components/board/board-presence"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardSticky } from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	DOCUMENT_PANEL_DEFAULT_WIDTH,
	DOCUMENT_PANEL_MIN_WIDTH,
	DOCUMENT_PANEL_OPENING_WIDTH,
	DocumentPanel,
	type DocumentPanelProps,
	THREAD_MIN_WIDTH,
} from "@workspace/ui/components/document-panel"
import {
	DOCUMENT_BODY,
	DOCUMENT_TITLE,
	DOCUMENT_WRITERS,
} from "@workspace/ui/components/document-panel.fixtures"
import { FileReferenceChip } from "@workspace/ui/components/file-reference-chip"
import { LIBRARY_AGENTS } from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { LibraryDocumentBody } from "@workspace/ui/components/library-document-view"
import { Markdown } from "@workspace/ui/components/markdown"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { RESIZE_STEP } from "@workspace/ui/components/resize-handle"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "@workspace/ui/components/sidebar-resize"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import {
	Sidebar,
	SidebarContent,
	SidebarInset,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const ATLAS: RosterBot = {
	id: LIBRARY_AGENTS.atlas.id,
	name: LIBRARY_AGENTS.atlas.name,
	blot: BLOT_HUES.blue,
}

type BriefAnswerProps = {
	isOpen: boolean
	onOpen: () => void
}

const BriefAnswer = ({ isOpen, onOpen }: BriefAnswerProps) => (
	<MarkdownProse>
		<p>
			I drafted{" "}
			<FileReferenceChip
				onOpen={onOpen}
				onOpenInNewTab={fn()}
				state={isOpen ? "open" : "rest"}
				title={DOCUMENT_TITLE}
			/>{" "}
			for the launch on the 14th.
		</p>
	</MarkdownProse>
)

const ROWS: TranscriptItem[] = [
	{
		key: "question",
		render: () => <UserTurn>Draft the spring launch brief.</UserTurn>,
	},
	{
		key: "answer",
		render: () => (
			<AssistantTurn identity={ATLAS}>
				<BriefAnswer isOpen onOpen={fn()} />
			</AssistantTurn>
		),
	},
]

const EARLIER_QUESTIONS = [
	"Who reads the brief first?",
	"Which teams launch on the 14th?",
	"Where do the screenshots live?",
	"Who signs off the release notes?",
	"When is the copy final?",
	"Which messages repeat on every page?",
	"What do we measure on launch day?",
	"Who owns the timeline?",
	"Where does the Library sit in the app?",
	"What changes for teams of five?",
]

const SCROLLED_TOP = 160

const afterTwoFrames = () =>
	new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(resolve)),
	)

const LONG_ROWS: TranscriptItem[] = EARLIER_QUESTIONS.map((question) => ({
	key: question,
	render: () => <UserTurn>{question}</UserTurn>,
}))

const ToggledPanel = () => {
	const [isPanelOpen, setPanelOpen] = useState(true)
	const rows: TranscriptItem[] = [
		...LONG_ROWS,
		{
			key: "answer",
			render: () => (
				<AssistantTurn identity={ATLAS}>
					<BriefAnswer isOpen={isPanelOpen} onOpen={() => setPanelOpen(true)} />
				</AssistantTurn>
			),
		},
	]

	return (
		<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
			<ThreadLayout
				aside={
					isPanelOpen ? (
						<DocumentPanel
							onClose={() => setPanelOpen(false)}
							onOpenInLibrary={fn()}
							title={DOCUMENT_TITLE}
						>
							<LibraryDocumentBody body={DOCUMENT_BODY} />
						</DocumentPanel>
					) : null
				}
				composer={<PromptInput onSubmit={fn()} />}
				rows={rows}
			>
				{null}
			</ThreadLayout>
		</div>
	)
}

const HANDLE_LABEL = "Resize document panel"

const DRAGGED = 120

const verticalCentreOf = (element: Element) => {
	const { top, bottom } = element.getBoundingClientRect()
	return (top + bottom) / 2
}

const pointerAt = (type: string, clientX: number) =>
	new PointerEvent(type, { bubbles: true, button: 0, clientX })

const meta = preview.meta({
	globals: LAPTOP_WINDOW,
	title: "Navigation/DocumentPanel",
	component: DocumentPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A Library document opened beside the thread, full height, 600 wide by default and resized from its leading edge with the same grip as the sidebar: a drag, an arrow key step of 16px, a double press back to the default, always between 400 and the room left beside a thread kept at 400, with no other maximum. The width is the panel's own unless the caller passes `width`, and `onWidthChange` hears each committed drag or step, never a pointer move. The bar, as tall as the thread header beside it, carries the document's title, the presence chip of whoever writes in it, Open in Library and Close; the column below scrolls and holds the title, then the editor, which the app passes as children. ThreadLayout takes it through its `aside` slot.",
			},
		},
	},
	args: {
		title: DOCUMENT_TITLE,
		presence: <LibraryDocumentPresence writers={DOCUMENT_WRITERS} />,
		onOpenInLibrary: fn(),
		onClose: fn(),
		children: (
			<LibraryDocumentBody body={DOCUMENT_BODY} writers={DOCUMENT_WRITERS} />
		),
	},
	render: (args) => (
		<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
			<ThreadLayout
				aside={<DocumentPanel {...args} />}
				composer={<PromptInput onSubmit={fn()} />}
				rows={ROWS}
			>
				{null}
			</ThreadLayout>
		</div>
	),
})

export const InThread = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document a message names open beside the conversation that posted it, as artboard 2d draws it. Check that the file chip in the message wears the Space colour, that the panel sits at the end of the thread at full height, that the bar shows one agent writing, and that Open in Library and Close call their callbacks.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const thread = canvasElement.querySelector<HTMLElement>(
			'[data-slot="chat-layout"]',
		)
		if (!thread) throw new Error("No thread drawn")
		const panelBox = panel.getBoundingClientRect()
		await expect(panelBox.width).toBe(DOCUMENT_PANEL_DEFAULT_WIDTH)
		await expect(panelBox.left).toBe(thread.getBoundingClientRect().right)
		await expect(panelBox.height).toBe(thread.getBoundingClientRect().height)

		await expect(
			canvas.getByRole("button", { name: DOCUMENT_TITLE, pressed: true }),
		).toBeVisible()

		await expect(canvas.getByText("1 agent writing")).toBeVisible()
		await userEvent.click(
			canvas.getByRole("button", { name: "Open in Library" }),
		)
		await expect(args.onOpenInLibrary).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Close" }))
		await expect(args.onClose).toHaveBeenCalledOnce()
	},
})

export const KeepsTheThreadWhenToggled = meta.story({
	render: () => <ToggledPanel />,
	parameters: {
		docs: {
			description: {
				story:
					"A conversation scrolled up while the panel is open, then the panel closed with Close and opened again from the file chip. Check that the thread keeps the same transcript and the same scroll position through both changes: the panel must never remount the thread beside it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const viewportOf = () =>
			canvasElement.querySelector<HTMLElement>(
				'[data-slot="message-scroller-viewport"]',
			)
		const viewport = viewportOf()
		if (!viewport) throw new Error("No transcript drawn")
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
		)
		viewport.dispatchEvent(
			new WheelEvent("wheel", { bubbles: true, deltaY: -200 }),
		)
		viewport.scrollTop = SCROLLED_TOP
		await waitFor(() => expect(viewport.scrollTop).toBe(SCROLLED_TOP))

		await userEvent.click(canvas.getByRole("button", { name: "Close" }))
		await expect(canvas.queryByRole("complementary")).toBeNull()
		await afterTwoFrames()
		await expect(viewportOf()).toBe(viewport)
		await expect(viewport.scrollTop).toBe(SCROLLED_TOP)

		canvas.getByRole("button", { name: DOCUMENT_TITLE }).click()
		await expect(
			await canvas.findByRole("complementary", { name: DOCUMENT_TITLE }),
		).toBeVisible()
		await afterTwoFrames()
		await expect(viewportOf()).toBe(viewport)
		await expect(viewport.scrollTop).toBe(SCROLLED_TOP)
	},
})

export const AfterADrag = meta.story({
	args: { onWidthChange: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The panel's leading edge dragged 120px toward the thread, then 240px away from it, then pressed twice. Check that the panel widens by exactly the distance dragged and narrows the same way, that the cursor stays col-resize and no text gets selected anywhere in the thread or the panel while the edge moves, that the width is reported once per drag rather than on every move, and that the double press brings back 600.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const row = canvasElement.querySelector<HTMLElement>(
			'[data-slot="thread-with-aside"]',
		)
		const composer = canvasElement.querySelector<HTMLElement>("textarea")
		if (!row || !composer) throw new Error("No thread drawn")
		const originX = handle.getBoundingClientRect().left
		const widerX = originX - DRAGGED

		handle.dispatchEvent(pointerAt("pointerdown", originX))
		window.dispatchEvent(pointerAt("pointermove", originX - DRAGGED / 2))
		window.dispatchEvent(pointerAt("pointermove", widerX))
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(
				DOCUMENT_PANEL_DEFAULT_WIDTH + DRAGGED,
			)
		}, FRAME_POLL)
		await expect(getComputedStyle(row).userSelect).toBe("none")
		await expect(getComputedStyle(composer).cursor).toBe("col-resize")
		await expect(getComputedStyle(panel).cursor).toBe("col-resize")
		await expect(args.onWidthChange).not.toHaveBeenCalled()

		window.dispatchEvent(pointerAt("pointerup", widerX))
		await waitFor(async () => {
			await expect(args.onWidthChange).toHaveBeenCalledOnce()
			await expect(args.onWidthChange).toHaveBeenCalledWith(
				DOCUMENT_PANEL_DEFAULT_WIDTH + DRAGGED,
			)
		}, FRAME_POLL)
		await expect(getComputedStyle(row).userSelect).not.toBe("none")
		await expect(handle).toHaveAttribute(
			"aria-valuenow",
			String(DOCUMENT_PANEL_DEFAULT_WIDTH + DRAGGED),
		)

		const narrowerX = widerX + 2 * DRAGGED
		handle.dispatchEvent(pointerAt("pointerdown", widerX))
		window.dispatchEvent(pointerAt("pointermove", narrowerX))
		window.dispatchEvent(pointerAt("pointerup", narrowerX))
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(
				DOCUMENT_PANEL_DEFAULT_WIDTH - DRAGGED,
			)
		}, FRAME_POLL)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(2)

		await userEvent.dblClick(handle)
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(
				DOCUMENT_PANEL_DEFAULT_WIDTH,
			)
		}, FRAME_POLL)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			DOCUMENT_PANEL_DEFAULT_WIDTH,
		)
	},
})

export const HandleWithKeyboardFocus = meta.story({
	args: { onWidthChange: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The panel's grip reached from the keyboard. Check that it is a separator named Resize document panel announcing 600 between 400 and 880, the 1280 room less the 400 kept for the thread, that the grip lights up under focus, and that `ArrowLeft` widens the panel by 16px and `ArrowRight` narrows it back, each step reported once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		await expect(handle).toHaveAttribute(
			"aria-valuemin",
			String(DOCUMENT_PANEL_MIN_WIDTH),
		)
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuemax",
				String(LAPTOP_WIDTH - THREAD_MIN_WIDTH),
			)
		}, FRAME_POLL)

		handle.focus()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(handle).toHaveFocus()
		await expect(handle.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(handle, "::after").backgroundColor).not.toBe(
			"rgba(0, 0, 0, 0)",
		)
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(
				DOCUMENT_PANEL_DEFAULT_WIDTH + RESIZE_STEP,
			)
		}, FRAME_POLL)
		await expect(args.onWidthChange).toHaveBeenCalledOnce()
		await expect(args.onWidthChange).toHaveBeenCalledWith(
			DOCUMENT_PANEL_DEFAULT_WIDTH + RESIZE_STEP,
		)

		await userEvent.keyboard("{ArrowRight}")
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(DOCUMENT_PANEL_DEFAULT_WIDTH),
			)
		}, FRAME_POLL)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			DOCUMENT_PANEL_DEFAULT_WIDTH,
		)
	},
})

const InThreadWithItsHeader = (args: DocumentPanelProps) => (
	<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
		<ThreadLayout
			aside={<DocumentPanel {...args} />}
			composer={<PromptInput onSubmit={fn()} />}
			header={<AppHeader leading="Spring launch" />}
			rows={ROWS}
		>
			{null}
		</ThreadLayout>
	</div>
)

const expectHeaderAlignedWithTheThreadHeader = async (
	canvasElement: HTMLElement,
) => {
	const threadHeader = slotIn(canvasElement, "app-header")
	const panelHeader = slotIn(canvasElement, "document-panel-header")
	await expect(panelHeader.getBoundingClientRect().bottom).toBe(
		threadHeader.getBoundingClientRect().bottom,
	)
	await expect(panelHeader.getBoundingClientRect().top).toBe(
		threadHeader.getBoundingClientRect().top,
	)

	const threadTitle = within(canvasElement).getByText("Spring launch")
	const panelTitle = panelHeader.querySelector("p")
	if (!panelTitle) throw new Error("No panel title drawn")
	await expect(verticalCentreOf(panelTitle)).toBe(verticalCentreOf(threadTitle))
}

export const HeaderAlignedWithTheThreadHeader = meta.story({
	render: InThreadWithItsHeader,
	parameters: {
		docs: {
			description: {
				story:
					"The panel open beside a conversation that wears its header. Check that the panel's bar is exactly as tall as the thread header, so the two bottom borders run as one line across the screen, and that the panel's title sits on the same horizontal centre as the thread's.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectHeaderAlignedWithTheThreadHeader(canvasElement),
})

const CONTROLLED_WIDTH = 640

export const ControlledWidth = meta.story({
	tags: ["test-only"],
	args: { width: CONTROLLED_WIDTH, onWidthChange: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"A caller holding the width and not answering the change. Check that the panel opens at the width it was handed, that an arrow step reports the asked width, and that the panel stays where the caller keeps it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		await expect(panel.getBoundingClientRect().width).toBe(CONTROLLED_WIDTH)

		handle.focus()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onWidthChange).toHaveBeenCalledOnce()
		await expect(args.onWidthChange).toHaveBeenCalledWith(
			CONTROLLED_WIDTH + RESIZE_STEP,
		)
		await expect(panel.getBoundingClientRect().width).toBe(CONTROLLED_WIDTH)
	},
})

const NARROW_WINDOW = 1024
const LAPTOP_WIDTH = 1280
const WIDE_WINDOW = 1536

const BLUE_SCOPE = hueScopeOf("blue")

type BesideTheSidebarProps = DocumentPanelProps & {
	windowWidth: number
	sidebarWidth?: number
}

const BesideTheSidebar = ({
	windowWidth,
	sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
	...panel
}: BesideTheSidebarProps) => (
	<div
		className="flex h-200"
		data-testid="window"
		{...BLUE_SCOPE}
		style={{ ...BLUE_SCOPE.style, width: windowWidth }}
	>
		<SidebarProvider
			style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
		>
			<Sidebar collapsible="icon">
				<SidebarContent />
			</Sidebar>
			<SidebarInset className="min-w-0">
				<ThreadLayout
					aside={<DocumentPanel {...panel} />}
					composer={<PromptInput onSubmit={fn()} />}
					header={<AppHeader leading="Spring launch" />}
					rows={ROWS}
				>
					{null}
				</ThreadLayout>
			</SidebarInset>
		</SidebarProvider>
	</div>
)

const threadOf = (canvasElement: HTMLElement) => {
	const thread = canvasElement.querySelector<HTMLElement>(
		'[data-slot="chat-layout"]',
	)
	if (!thread) throw new Error("No thread drawn")
	return thread
}

const sidebarWrapperOf = (canvasElement: HTMLElement) => {
	const wrapper = canvasElement.querySelector<HTMLElement>(
		'[data-slot="sidebar-wrapper"]',
	)
	if (!wrapper) throw new Error("No sidebar drawn")
	return wrapper
}

const ASKED_UNDER_THE_ROOM = 432

export const AskedUnderTheRoomLeft = meta.story({
	args: { defaultWidth: ASKED_UNDER_THE_ROOM },
	render: (args: DocumentPanelProps) => (
		<BesideTheSidebar
			{...args}
			sidebarWidth={SIDEBAR_MAX_WIDTH}
			windowWidth={LAPTOP_WIDTH}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel asked at 432 in the laptop window beside the widest sidebar, with room to spare. Check that the panel draws the 432 it was asked for, that the thread takes the rest, and that the grip announces 400 as its minimum and 464, the room left beside a 400px thread, as its maximum.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const room = LAPTOP_WIDTH - SIDEBAR_MAX_WIDTH
		const reachableMaxWidth = room - THREAD_MIN_WIDTH

		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuemax",
				String(reachableMaxWidth),
			)
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute(
			"aria-valuemin",
			String(DOCUMENT_PANEL_MIN_WIDTH),
		)
		await expect(handle).toHaveAttribute(
			"aria-valuenow",
			String(ASKED_UNDER_THE_ROOM),
		)
		await expect(panel.getBoundingClientRect().width).toBe(ASKED_UNDER_THE_ROOM)
		await expect(threadOf(canvasElement).getBoundingClientRect().width).toBe(
			room - ASKED_UNDER_THE_ROOM,
		)
	},
})

export const CappedByTheRoomLeft = meta.story({
	args: { defaultWidth: DOCUMENT_PANEL_OPENING_WIDTH },
	render: (args: DocumentPanelProps) => (
		<BesideTheSidebar {...args} windowWidth={LAPTOP_WIDTH} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel asked at 800 in the laptop window beside the default sidebar. Check that the thread keeps 400px and the panel gives up the rest, 576 here, that the grip announces the 576 it draws as both its value and its maximum with 400 as its minimum, and that widening the window to 1536 brings the panel back to the 800 it was asked for, with the same panel, a 432px thread and 832 as its new maximum.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const thread = threadOf(canvasElement)
		const cappedWidth = LAPTOP_WIDTH - SIDEBAR_DEFAULT_WIDTH - THREAD_MIN_WIDTH

		await waitFor(async () => {
			await expect(handle).toHaveAttribute("aria-valuenow", String(cappedWidth))
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute("aria-valuemax", String(cappedWidth))
		await expect(handle).toHaveAttribute(
			"aria-valuemin",
			String(DOCUMENT_PANEL_MIN_WIDTH),
		)
		await expect(thread.getBoundingClientRect().width).toBe(THREAD_MIN_WIDTH)
		await expect(panel.getBoundingClientRect().width).toBe(cappedWidth)

		canvas.getByTestId("window").style.width = `${WIDE_WINDOW}px`
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(DOCUMENT_PANEL_OPENING_WIDTH),
			)
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute(
			"aria-valuemax",
			String(WIDE_WINDOW - SIDEBAR_DEFAULT_WIDTH - THREAD_MIN_WIDTH),
		)
		await expect(
			canvas.getByRole("complementary", { name: DOCUMENT_TITLE }),
		).toBe(panel)
		await expect(panel.getBoundingClientRect().width).toBe(
			DOCUMENT_PANEL_OPENING_WIDTH,
		)
		await expect(thread.getBoundingClientRect().width).toBe(
			WIDE_WINDOW - SIDEBAR_DEFAULT_WIDTH - DOCUMENT_PANEL_OPENING_WIDTH,
		)
	},
})

export const HeldAtItsFloorInTheSmallestWindow = meta.story({
	args: { defaultWidth: DOCUMENT_PANEL_DEFAULT_WIDTH },
	render: (args: DocumentPanelProps) => (
		<BesideTheSidebar
			{...args}
			sidebarWidth={SIDEBAR_MAX_WIDTH}
			windowWidth={NARROW_WINDOW}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel in the 1024 window the app opens at its smallest, beside the widest sidebar, where 400 for the panel and 400 for the thread cannot both hold. Check that the panel keeps 400, that the thread gives way to the 208 left, that the grip announces 400 as its value, minimum and maximum, that narrowing the sidebar to 224 gives the thread its 400 back beside a 400 panel, and that widening the window to 1536 then brings the panel back to its asked 600 without redrawing it, with 912 as its new maximum.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const thread = threadOf(canvasElement)
		const floor = String(DOCUMENT_PANEL_MIN_WIDTH)

		await waitFor(async () => {
			await expect(handle).toHaveAttribute("aria-valuemax", floor)
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute("aria-valuenow", floor)
		await expect(handle).toHaveAttribute("aria-valuemin", floor)
		await expect(panel.getBoundingClientRect().width).toBe(
			DOCUMENT_PANEL_MIN_WIDTH,
		)
		await expect(thread.getBoundingClientRect().width).toBe(
			NARROW_WINDOW - SIDEBAR_MAX_WIDTH - DOCUMENT_PANEL_MIN_WIDTH,
		)

		sidebarWrapperOf(canvasElement).style.setProperty(
			"--sidebar-width",
			`${SIDEBAR_MIN_WIDTH}px`,
		)
		const cappedWidth = NARROW_WINDOW - SIDEBAR_MIN_WIDTH - THREAD_MIN_WIDTH
		await waitFor(async () => {
			await expect(thread.getBoundingClientRect().width).toBe(THREAD_MIN_WIDTH)
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute("aria-valuenow", String(cappedWidth))
		await expect(handle).toHaveAttribute("aria-valuemax", String(cappedWidth))

		canvas.getByTestId("window").style.width = `${WIDE_WINDOW}px`
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(DOCUMENT_PANEL_DEFAULT_WIDTH),
			)
		}, FRAME_POLL)
		await expect(handle).toHaveAttribute(
			"aria-valuemax",
			String(WIDE_WINDOW - SIDEBAR_MIN_WIDTH - THREAD_MIN_WIDTH),
		)
		await expect(
			canvas.getByRole("complementary", { name: DOCUMENT_TITLE }),
		).toBe(panel)
		await expect(panel.getBoundingClientRect().width).toBe(
			DOCUMENT_PANEL_DEFAULT_WIDTH,
		)
	},
})

export const DraggedToItsMaximumOnAWideWindow = meta.story({
	args: { onWidthChange: fn() },
	render: (args: DocumentPanelProps) => (
		<BesideTheSidebar {...args} windowWidth={WIDE_WINDOW} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel's edge dragged toward the thread in the 1536 window beside the default sidebar, past where the thread would drop under 400. Check that the panel stops at 832, past the former 800 cap, with the thread at 400, that the grip announces 832 as its value and its maximum and reports it once, and that one more arrow step toward the thread leaves the thread at 400 and the panel at 832.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const thread = threadOf(canvasElement)
		const reachableMaxWidth =
			WIDE_WINDOW - SIDEBAR_DEFAULT_WIDTH - THREAD_MIN_WIDTH
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuemax",
				String(reachableMaxWidth),
			)
		}, FRAME_POLL)

		const originX = handle.getBoundingClientRect().left
		const pastTheFloorX = originX - thread.getBoundingClientRect().width
		handle.dispatchEvent(pointerAt("pointerdown", originX))
		window.dispatchEvent(pointerAt("pointermove", pastTheFloorX))
		window.dispatchEvent(pointerAt("pointerup", pastTheFloorX))
		await waitFor(async () => {
			await expect(thread.getBoundingClientRect().width).toBe(THREAD_MIN_WIDTH)
		}, FRAME_POLL)
		await expect(panel.getBoundingClientRect().width).toBe(reachableMaxWidth)
		await expect(handle).toHaveAttribute(
			"aria-valuenow",
			String(reachableMaxWidth),
		)
		await expect(args.onWidthChange).toHaveBeenCalledOnce()
		await expect(args.onWidthChange).toHaveBeenCalledWith(reachableMaxWidth)

		handle.focus()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(reachableMaxWidth)
		await afterTwoFrames()
		await expect(thread.getBoundingClientRect().width).toBe(THREAD_MIN_WIDTH)
		await expect(panel.getBoundingClientRect().width).toBe(reachableMaxWidth)
		await expect(handle).toHaveAttribute(
			"aria-valuenow",
			String(reachableMaxWidth),
		)
	},
})

export const MovesFromTheCappedEdge = meta.story({
	tags: ["test-only"],
	args: { defaultWidth: DOCUMENT_PANEL_OPENING_WIDTH, onWidthChange: fn() },
	render: (args: DocumentPanelProps) => (
		<BesideTheSidebar {...args} windowWidth={LAPTOP_WIDTH} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel asked at 800 and held at 576 by the room left in the laptop window. Check that a drag away from the thread moves the edge from where it is drawn on the first pixels, with no dead zone while the asked width falls back to the drawn one, and that an arrow step starts from the drawn width too.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const cappedWidth = LAPTOP_WIDTH - SIDEBAR_DEFAULT_WIDTH - THREAD_MIN_WIDTH
		await waitFor(async () => {
			await expect(handle).toHaveAttribute("aria-valuenow", String(cappedWidth))
		}, FRAME_POLL)

		const originX = handle.getBoundingClientRect().left
		const narrowedWidth = cappedWidth - DRAGGED / 3
		const narrowerX = originX + DRAGGED / 3
		handle.dispatchEvent(pointerAt("pointerdown", originX))
		window.dispatchEvent(pointerAt("pointermove", narrowerX))
		window.dispatchEvent(pointerAt("pointerup", narrowerX))
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(narrowedWidth)
		}, FRAME_POLL)
		await expect(args.onWidthChange).toHaveBeenCalledWith(narrowedWidth)

		handle.focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(narrowedWidth - RESIZE_STEP),
			)
		}, FRAME_POLL)
	},
})

export const HandleWithKeyboardFocusDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The panel's grip reached from the keyboard in the dark theme. Check that the grip lights up in the dark sidebar ring rather than staying transparent or wearing the light one.",
			},
		},
	},
	play: async ({ canvas }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		await expect(document.documentElement).toHaveClass("dark")

		handle.focus()
		await expect(handle).toHaveFocus()
		await expect(handle.matches(":focus-visible")).toBe(true)

		const ringProbe = document.createElement("span")
		ringProbe.style.backgroundColor = "var(--sidebar-ring)"
		handle.append(ringProbe)
		const darkRing = getComputedStyle(ringProbe).backgroundColor
		ringProbe.remove()
		await expect(darkRing).not.toBe("rgba(0, 0, 0, 0)")
		await expect(getComputedStyle(handle, "::after").backgroundColor).toBe(
			darkRing,
		)
	},
})

const LONG_ANSWER = [
	"The brief opens on the people it serves: the five teams that ship on the 14th, each with a lead who signs off the page they own before the copy freezes.",
	"Screenshots live in the Library under Launch, one folder per team, named by the page they illustrate so the release notes can link them without a second pass.",
	"Launch day measures three things only: sign ups in the first hour, the share of new Spaces that invite a second person, and the support threads opened before noon.",
].join("\n\n")

const WRITER: RosterBot = { ...ATLAS, title: "Launch writer" }

const READ_AT = Date.UTC(2026, 10, 4, 10)

const CONSECUTIVE_ANSWERS: TranscriptItem[] = Array.from(
	{ length: 8 },
	(_, index) => ({
		key: `answer-${index}`,
		render: () => (
			<AssistantTurn
				copyText={LONG_ANSWER}
				identity={WRITER}
				now={READ_AT}
				sentAt={READ_AT - (8 - index) * 60_000}
			>
				<Markdown>{LONG_ANSWER}</Markdown>
			</AssistantTurn>
		),
	}),
)

type InTheShellProps = DocumentPanelProps & {
	windowWidth: number
}

const InTheShell = ({ windowWidth, ...panel }: InTheShellProps) => (
	<div
		className="flex h-200"
		data-testid="window"
		{...BLUE_SCOPE}
		style={{ ...BLUE_SCOPE.style, width: windowWidth }}
	>
		<SidebarProvider
			style={
				{ "--sidebar-width": `${SIDEBAR_DEFAULT_WIDTH}px` } as CSSProperties
			}
		>
			<Sidebar collapsible="icon">
				<SidebarContent />
			</Sidebar>
			<ContentCard>
				<ThreadLayout
					aside={<DocumentPanel {...panel} />}
					composer={<PromptInput onSubmit={fn()} />}
					header={<AppHeader leading="Spring launch" />}
					rows={CONSECUTIVE_ANSWERS}
				>
					{null}
				</ThreadLayout>
			</ContentCard>
		</SidebarProvider>
	</div>
)

const expectThreadAtItsFloor = async (thread: HTMLElement) => {
	await waitFor(async () => {
		await expect(thread.getBoundingClientRect().width).toBe(THREAD_MIN_WIDTH)
	}, FRAME_POLL)
}

const transcriptOf = (canvasElement: HTMLElement) => {
	const viewport = canvasElement.querySelector<HTMLElement>(
		'[data-slot="message-scroller-viewport"]',
	)
	if (!viewport) throw new Error("No transcript drawn")
	return viewport
}

const expectEachMessageClearsTheNext = async (canvasElement: HTMLElement) => {
	const messages = Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="message-scroller-item"]',
		),
	)
	await expect(messages).toHaveLength(CONSECUTIVE_ANSWERS.length)
	for (const [index, message] of messages.entries()) {
		const box = message.getBoundingClientRect()
		const bubble = message.querySelector<HTMLElement>(
			'[data-slot="message-bubble-content"]',
		)
		const text = message.querySelector('[data-slot="message-bubble-text"]')
		const authorLine = message.querySelector('[data-slot="author-line"]')
		if (!bubble || !text || !authorLine) throw new Error("No bubble drawn")
		await expect(text.scrollHeight).toBe(text.clientHeight)
		await expect(text.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			bubble.getBoundingClientRect().bottom,
		)
		const line = authorLine.getBoundingClientRect()
		await expect(line.top).toBeGreaterThanOrEqual(box.top)
		await expect(line.bottom).toBeLessThanOrEqual(box.bottom)
		const next = messages[index + 1]
		if (next) {
			await expect(next.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				box.bottom,
			)
		}
	}
}

const SCROLL_STEPS = 3

const scrollUpHalfAScreen = async (viewport: HTMLElement) => {
	const target = viewport.scrollTop - viewport.clientHeight / 2
	viewport.dispatchEvent(
		new WheelEvent("wheel", { bubbles: true, deltaY: -viewport.clientHeight }),
	)
	viewport.scrollTop = target
	await waitFor(() => expect(viewport.scrollTop).toBe(target), FRAME_POLL)
	await afterTwoFrames()
}

export const ConsecutiveAnswersAtTheThreadFloor = meta.story({
	args: { defaultWidth: DOCUMENT_PANEL_OPENING_WIDTH },
	render: (args: DocumentPanelProps) => (
		<InTheShell {...args} windowWidth={LAPTOP_WIDTH} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Eight long answers in a row from one agent, each signed by its author line with a title badge and a time, beside the document panel with the thread held at its 400px floor. Check that every answer holds its whole text, that each author line stays inside its own message, and that every message ends above the next one.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectThreadAtItsFloor(threadOf(canvasElement))
		const viewport = transcriptOf(canvasElement)
		await waitFor(
			() =>
				expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
			FRAME_POLL,
		)
		await expectEachMessageClearsTheNext(canvasElement)
	},
})

export const NarrowedToTheThreadFloorThenScrolled = meta.story({
	tags: ["test-only"],
	args: { defaultWidth: DOCUMENT_PANEL_MIN_WIDTH },
	render: (args: DocumentPanelProps) => (
		<InTheShell {...args} windowWidth={LAPTOP_WIDTH} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same answers in a wide thread, the panel's edge then dragged toward the thread until the thread stops at its 400px floor, then the thread scrolled up three half screens. Check that after every step each message still ends above the next one and every answer still holds its whole text.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const thread = threadOf(canvasElement)
		const viewport = transcriptOf(canvasElement)
		await waitFor(
			() =>
				expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
			FRAME_POLL,
		)
		await expectEachMessageClearsTheNext(canvasElement)

		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const originX = handle.getBoundingClientRect().left
		const pastTheFloorX = originX - thread.getBoundingClientRect().width
		handle.dispatchEvent(pointerAt("pointerdown", originX))
		window.dispatchEvent(pointerAt("pointermove", pastTheFloorX))
		window.dispatchEvent(pointerAt("pointerup", pastTheFloorX))
		await expectThreadAtItsFloor(thread)
		await afterTwoFrames()
		await expectEachMessageClearsTheNext(canvasElement)

		for (let step = 0; step < SCROLL_STEPS; step++) {
			await scrollUpHalfAScreen(viewport)
			await expectEachMessageClearsTheNext(canvasElement)
		}
	},
})

const MIRA: BoardPresenceOwner = {
	kind: "agent",
	id: LIBRARY_AGENTS.mira.id,
	name: LIBRARY_AGENTS.mira.name,
	hue: LIBRARY_AGENTS.mira.hue,
}

const boardItem = (
	id: string,
	kind: BoardItem["kind"],
	x: number,
	y: number,
	width: number,
	height: number,
): BoardItem => ({
	id,
	kind,
	position: { x, y },
	size: { width, height },
	zOrder: 1,
	text: "",
})

const PANEL_BOARD: BoardView = {
	objects: [
		boardItem("heading", "text", 0, 0, 300, 96),
		boardItem("sticky-plan", "sticky", 0, 120, 160, 160),
		boardItem("sticky-copy", "sticky", 192, 120, 160, 160),
		boardItem("planning-ship", "shape", 384, 144, 160, 96),
	],
}

const PANEL_VIEWPORT: BoardViewport = { offset: { x: 32, y: 32 }, zoom: 0.8 }

const panelBoardObject = (id: string): ReactNode => {
	switch (id) {
		case "heading":
			return <BoardText body="Three steps to Friday." heading="Launch plan" />
		case "sticky-plan":
			return (
				<BoardSticky author={AGENT_AUTHOR} colour="yellow" text={STICKY_TEXT} />
			)
		case "sticky-copy":
			return (
				<BoardSticky
					author={PERSON_AUTHOR}
					colour="pink"
					text="Ask Ada for the final copy"
				/>
			)
		default:
			return (
				<BoardShape
					height={96}
					kind="rounded-rectangle"
					label="Ship"
					width={160}
				/>
			)
	}
}

type PanelBoardProps = {
	drawers: readonly BoardPresenceOwner[]
}

const DRAWN_OBJECT: Record<string, string> = {
	[DRAWING_AGENT.id]: "planning-ship",
	[MIRA.id]: "sticky-copy",
}

const POINTER_AT: Record<string, { x: number; y: number }> = {
	[DRAWING_AGENT.id]: { x: 530, y: 228 },
	[MIRA.id]: { x: 340, y: 262 },
}

const PanelBoard = ({ drawers }: PanelBoardProps) => {
	const [viewport, setViewport] = useState(PANEL_VIEWPORT)
	return (
		<BoardCanvas
			libraryItems={[]}
			onDropFiles={fn()}
			onDropUrl={fn()}
			onIntent={fn()}
			onLibraryItemDrop={fn()}
			onLibraryItemPick={fn()}
			onPaste={fn()}
			onToolChange={fn()}
			onViewportChange={setViewport}
			outlines={drawers.map((owner) => ({
				objectId: DRAWN_OBJECT[owner.id],
				owner,
				state: "drawing",
			}))}
			pointers={drawers.map((owner) => ({
				owner,
				position: POINTER_AT[owner.id],
			}))}
			renderObject={(object) => panelBoardObject(object.id)}
			tool="select"
			view={PANEL_BOARD}
			viewport={viewport}
		/>
	)
}

const BOARD_ROWS: TranscriptItem[] = [
	{
		key: "question",
		render: () => <UserTurn>Plan the launch week on a board.</UserTurn>,
	},
	{
		key: "answer",
		render: () => (
			<AssistantTurn identity={ATLAS}>
				<BoardCard
					drawing={{ agent: DRAWING_AGENT, objectId: "planning-ship" }}
					editedLabel="edited just now"
					isOpenBeside
					onOpen={fn()}
					pointers={[DRAWING_AGENT_POINTER]}
					summary={{
						status: "loaded",
						itemCount: PLANNING_BOARD_SNAPSHOT.objects.length,
						snapshot: PLANNING_BOARD_SNAPSHOT,
					}}
					title={BOARD_CARD_TITLE}
				/>
			</AssistantTurn>
		),
	},
]

const boardPanelArgs = (drawers: readonly BoardPresenceOwner[]) => ({
	variant: "board" as const,
	title: BOARD_CARD_TITLE,
	presence: (
		<LibraryDocumentPresence
			activity="drawing"
			writers={drawers.map((agent) => ({ agent }))}
		/>
	),
	children: <PanelBoard drawers={drawers} />,
})

const BoardInThread = (args: DocumentPanelProps) => (
	<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
		<ThreadLayout
			aside={<DocumentPanel {...args} />}
			composer={<PromptInput onSubmit={fn()} />}
			rows={BOARD_ROWS}
		>
			{null}
		</ThreadLayout>
	</div>
)

const expectBoardPanel = async (
	canvasElement: HTMLElement,
	chipLabel: string,
	drawerCount: number,
) => {
	const canvas = within(canvasElement)
	const panel = canvas.getByRole("complementary", { name: BOARD_CARD_TITLE })
	const header = slotIn(panel, "document-panel-header")
	await expect(slotIn(header, "board-glyph")).toBeVisible()
	await expect(header.querySelector('[data-slot="document-glyph"]')).toBeNull()
	await expect(
		within(slotIn(panel, "library-document-presence")).getByText(chipLabel),
	).toBeVisible()
	await expect(
		within(header)
			.getAllByRole("button")
			.map((button) => button.getAttribute("aria-label")),
	).toEqual(["Open in Library", "Close"])
	await expect(panel.querySelector("h2")).toBeNull()
	const board = slotIn(panel, "document-panel-board")
	await expect(board.getBoundingClientRect().width).toBe(
		panel.getBoundingClientRect().width - 1,
	)
	await expect(getComputedStyle(board).padding).toBe("0px")
	await expect(slotsIn(board, "board-pointer")).toHaveLength(drawerCount)
	await expect(slotIn(canvasElement, "board-card")).toHaveAttribute(
		"data-state",
		"open",
	)
}

const expectBoardPanelCallbacks = async (
	canvasElement: HTMLElement,
	args: DocumentPanelProps,
) => {
	const panel = within(canvasElement).getByRole("complementary", {
		name: BOARD_CARD_TITLE,
	})
	const openInLibrary = within(panel).getByRole("button", {
		name: "Open in Library",
	})
	await userEvent.hover(openInLibrary)
	await expect(await screen.findByRole("tooltip")).toHaveTextContent(
		"Open in Library",
	)
	await userEvent.click(openInLibrary)
	await expect(args.onOpenInLibrary).toHaveBeenCalledOnce()
	await userEvent.click(within(panel).getByRole("button", { name: "Close" }))
	await expect(args.onClose).toHaveBeenCalledOnce()
}

export const BoardOneAgent = meta.story({
	args: boardPanelArgs([DRAWING_AGENT]),
	render: (args: DocumentPanelProps) => <BoardInThread {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A board open beside the thread that posted it. Check the card in the message wearing the Space colour ring, the panel wearing the document panel header with the board glyph, the title, 1 agent drawing, Open in Library with its tooltip and Close, and the board filling the panel edge to edge with no title above it. Open in Library and Close each call back once.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectBoardPanel(canvasElement, "1 agent drawing", 1)
		await expectBoardPanelCallbacks(canvasElement, args)
	},
})

export const BoardOneAgentDark = meta.story({
	args: boardPanelArgs([DRAWING_AGENT]),
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	render: (args: DocumentPanelProps) => <BoardInThread {...args} />,
	play: ({ canvasElement }) =>
		expectBoardPanel(canvasElement, "1 agent drawing", 1),
})

export const BoardSeveralAgents = meta.story({
	args: boardPanelArgs([DRAWING_AGENT, MIRA]),
	render: (args: DocumentPanelProps) => <BoardInThread {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira both draw on the open board. Check the chip reading 2 agents drawing with both avatars, both pointers on the board in the shared document panel header, and Open in Library and Close each calling back once.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectBoardPanel(canvasElement, "2 agents drawing", 2)
		await expectBoardPanelCallbacks(canvasElement, args)
	},
})

export const BoardSeveralAgentsDark = meta.story({
	args: boardPanelArgs([DRAWING_AGENT, MIRA]),
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	render: (args: DocumentPanelProps) => <BoardInThread {...args} />,
	play: ({ canvasElement }) =>
		expectBoardPanel(canvasElement, "2 agents drawing", 2),
})

export const BoardHeaderAlignedWithTheThreadHeader = meta.story({
	args: boardPanelArgs([DRAWING_AGENT]),
	render: InThreadWithItsHeader,
	parameters: {
		docs: {
			description: {
				story:
					"The board panel open beside a conversation that wears its header. Check that the shared document panel header is exactly as tall as the thread header, so the two bottom borders run as one line, and that the board title sits on the same horizontal centre as the thread's.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectHeaderAlignedWithTheThreadHeader(canvasElement),
})

const headerBoxOf = (panel: HTMLElement) => {
	const header = slotIn(panel, "document-panel-header")
	const style = getComputedStyle(header)
	return {
		height: header.getBoundingClientRect().height,
		padding: style.padding,
		borderBottom: `${style.borderBottomWidth} ${style.borderBottomStyle} ${style.borderBottomColor}`,
		buttons: within(header)
			.getAllByRole("button")
			.map((button) => button.getAttribute("aria-label")),
	}
}

export const BoardAndDocumentShareOneHeader = meta.story({
	tags: ["test-only"],
	render: (args: DocumentPanelProps) => (
		<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
			<DocumentPanel {...args} />
			<DocumentPanel
				{...boardPanelArgs([DRAWING_AGENT])}
				onClose={fn()}
				onOpenInLibrary={fn()}
			/>
		</div>
	),
	play: async ({ canvas }) => {
		const documentPanel = canvas.getByRole("complementary", {
			name: DOCUMENT_TITLE,
		})
		const boardPanel = canvas.getByRole("complementary", {
			name: BOARD_CARD_TITLE,
		})
		await expect(headerBoxOf(boardPanel)).toEqual(headerBoxOf(documentPanel))
		await expect(slotIn(documentPanel, "document-glyph")).toBeVisible()
		await expect(slotIn(boardPanel, "board-glyph")).toBeVisible()
	},
})
