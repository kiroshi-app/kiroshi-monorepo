import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	hueScopeOf,
	LAPTOP_WINDOW,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { DocumentCard } from "@workspace/ui/components/document-card"
import {
	DOCUMENT_CARD_BODY,
	DOCUMENT_CARD_DETAIL,
	DOCUMENT_CARD_EXCERPT,
	DOCUMENT_CARD_TITLE,
	DOCUMENT_CARD_WRITERS,
} from "@workspace/ui/components/document-card.fixtures"
import {
	DOCUMENT_PANEL_DEFAULT_WIDTH,
	DOCUMENT_PANEL_MAX_WIDTH,
	DOCUMENT_PANEL_MIN_WIDTH,
	DocumentPanel,
} from "@workspace/ui/components/document-panel"
import { LIBRARY_AGENTS } from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { LibraryDocumentBody } from "@workspace/ui/components/library-document-view"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { RESIZE_STEP } from "@workspace/ui/components/resize-handle"
import type { RosterBot } from "@workspace/ui/components/roster"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"

const ATLAS: RosterBot = {
	id: LIBRARY_AGENTS.atlas.id,
	name: LIBRARY_AGENTS.atlas.name,
	blot: BLOT_HUES.blue,
}

const onOpenCard = fn()

const ROWS: TranscriptItem[] = [
	{
		key: "question",
		render: () => <UserTurn>Draft the spring launch brief.</UserTurn>,
	},
	{
		key: "answer",
		render: () => (
			<AssistantTurn identity={ATLAS}>
				<DocumentCard
					detail={DOCUMENT_CARD_DETAIL}
					excerpt={DOCUMENT_CARD_EXCERPT}
					isSelected
					onOpen={onOpenCard}
					title={DOCUMENT_CARD_TITLE}
					writer={{ kind: "agent", agent: LIBRARY_AGENTS.atlas }}
				>
					<LibraryDocumentBody body={DOCUMENT_CARD_BODY} />
				</DocumentCard>
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
					<DocumentCard
						detail={DOCUMENT_CARD_DETAIL}
						excerpt={DOCUMENT_CARD_EXCERPT}
						isSelected={isPanelOpen}
						onOpen={() => setPanelOpen(true)}
						title={DOCUMENT_CARD_TITLE}
					>
						<LibraryDocumentBody body={DOCUMENT_CARD_BODY} />
					</DocumentCard>
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
							title={DOCUMENT_CARD_TITLE}
						>
							<LibraryDocumentBody body={DOCUMENT_CARD_BODY} />
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
					"A Library document opened beside the thread, full height, 600 wide by default and resized from its leading edge with the same grip as the sidebar: a drag, an arrow key step of 16px, a double press back to the default, always between 400 and 800. The width is the panel's own unless the caller passes `width`, and `onWidthChange` hears each committed drag or step, never a pointer move. The bar, as tall as the thread header beside it, carries the document's title, the presence chip of whoever writes in it, Open in Library and Close; the column below scrolls and holds the title, then the editor, which the app passes as children. ThreadLayout takes it through its `aside` slot.",
			},
		},
	},
	args: {
		title: DOCUMENT_CARD_TITLE,
		presence: <LibraryDocumentPresence writers={DOCUMENT_CARD_WRITERS} />,
		onOpenInLibrary: fn(),
		onClose: fn(),
		children: (
			<LibraryDocumentBody
				body={DOCUMENT_CARD_BODY}
				writers={DOCUMENT_CARD_WRITERS}
			/>
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
					"The document of a card open beside the conversation that posted it, as artboard 2d draws it. Check that the card wears the Space accent ring, that the panel sits at the end of the thread at full height, that the bar shows one agent writing, and that Open in Library and Close call their callbacks.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_CARD_TITLE,
		})
		const thread = canvasElement.querySelector<HTMLElement>(
			'[data-slot="chat-layout"]',
		)
		if (!thread) throw new Error("No thread drawn")
		const panelBox = panel.getBoundingClientRect()
		await expect(panelBox.width).toBe(DOCUMENT_PANEL_DEFAULT_WIDTH)
		await expect(panelBox.left).toBe(thread.getBoundingClientRect().right)
		await expect(panelBox.height).toBe(thread.getBoundingClientRect().height)

		const card = canvasElement.querySelector<HTMLElement>(
			'[data-slot="document-card"]',
		)
		await expect(card).toHaveAttribute("data-selected", "true")
		await expect(card ? getComputedStyle(card).boxShadow : "none").not.toBe(
			"none",
		)

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
					"A conversation scrolled up while the panel is open, then the panel closed with Close and opened again from the card. Check that the thread keeps the same transcript and the same scroll position through both changes: the panel must never remount the thread beside it.",
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

		canvas.getByRole("button", { name: "Open" }).click()
		await expect(
			await canvas.findByRole("complementary", { name: DOCUMENT_CARD_TITLE }),
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
			name: DOCUMENT_CARD_TITLE,
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
					"The panel's grip reached from the keyboard. Check that it is a separator named Resize document panel announcing 600 between 400 and 800, that the grip lights up under focus, and that `ArrowLeft` widens the panel by 16px and `ArrowRight` narrows it back, each step reported once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_CARD_TITLE,
		})
		await expect(handle).toHaveAttribute(
			"aria-valuemin",
			String(DOCUMENT_PANEL_MIN_WIDTH),
		)
		await expect(handle).toHaveAttribute(
			"aria-valuemax",
			String(DOCUMENT_PANEL_MAX_WIDTH),
		)

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

export const HeaderAlignedWithTheThreadHeader = meta.story({
	render: (args) => (
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
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel open beside a conversation that wears its header. Check that the panel's bar is exactly as tall as the thread header, so the two bottom borders run as one line across the screen.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const threadHeader = canvasElement.querySelector<HTMLElement>(
			'[data-slot="app-header"]',
		)
		const panelHeader = canvasElement.querySelector<HTMLElement>(
			'[data-slot="document-panel-header"]',
		)
		if (!threadHeader || !panelHeader) throw new Error("No header drawn")
		await expect(panelHeader.getBoundingClientRect().bottom).toBe(
			threadHeader.getBoundingClientRect().bottom,
		)
		await expect(panelHeader.getBoundingClientRect().top).toBe(
			threadHeader.getBoundingClientRect().top,
		)
	},
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
			name: DOCUMENT_CARD_TITLE,
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
