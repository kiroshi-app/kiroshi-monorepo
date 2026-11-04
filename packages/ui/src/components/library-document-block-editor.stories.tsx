import type { ReactNode } from "react"
import {
	expect,
	fireEvent,
	fn,
	screen,
	spyOn,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SUBMENU_PORTAL_GUARD,
	colourTransitionsOf,
	hueScopeOf,
	isInBrowserRunner,
	mergeA11y,
	realPointer,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_WRITERS,
} from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"
import {
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

const BRIEF = LIBRARY_AGENT_DOCUMENT.body

const LONG_BRIEF = [
	BRIEF,
	"## Open questions",
	"Whether the import strip ships with the build or a week after it is still open, and support wants a say before the 10th.",
	"The pricing page waits on the new screenshots, so its copy may slip to the release notes.",
].join("\n\n")

const RICH_BLOCKS = [
	"> [!NOTE]",
	"> The export keeps the archived rooms too.",
	"",
	"```web-page",
	"url: https://www.example.org/rooms",
	"title: Casa do Rio, rooms and rates",
	"```",
	"",
	"| Room | Seats |",
	"| --- | --- |",
	"| Atlas | 12 |",
	"",
	"```collapsible",
	"title: Full list of the rooms",
	"",
	"- Atlas, 12 seats",
	"- Mira, 6 seats",
	"```",
].join("\n")

const CHECKLIST_DOCUMENT = [
	"Before the launch call:",
	"- [ ] Book the room\n- [x] Send the invite",
	"The call starts at ten.",
].join("\n\n")

const PEOPLE = [
	{ id: "ada", name: "Ada Martin", caret: BRIEF.indexOf("## What changes") },
	{
		id: "noe",
		name: "Noé Petit",
		caret: BRIEF.indexOf("\n\nWe also count"),
	},
]

const MAC_SHORTCUTS = ["Duplicate⌘D", "Move up⌥⇧↑", "Move down⌥⇧↓", "Delete⌫"]

const OTHER_SHORTCUTS = [
	"DuplicateCtrl+D",
	"Move upAlt+Shift+↑",
	"Move downAlt+Shift+↓",
	"DeleteBackspace",
]

const WINDOWS_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

const CALLOUT_DOCUMENT = [
	"The export is ready.",
	"> [!NOTE]\n> The export keeps the archived rooms too.",
].join("\n\n")

type DocumentFrameProps = {
	children: ReactNode
	isNarrow?: boolean
}

const DocumentFrame = ({ children, isNarrow = false }: DocumentFrameProps) => (
	<div
		className={cn(
			"flex h-[832px] bg-background ps-15 pe-1.5 pt-2 pb-2",
			isNarrow ? "w-[560px]" : "w-[1280px]",
		)}
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>
			<div className="flex size-full min-h-0 flex-col">
				<LibraryDocumentBar
					item={{ name: LIBRARY_AGENT_DOCUMENT.name }}
					onBack={fn()}
				/>
				<LibraryDocumentColumn
					detail={LIBRARY_AGENT_DOCUMENT.detail}
					heading={
						<h1 className={DOCUMENT_TITLE}>{LIBRARY_AGENT_DOCUMENT.name}</h1>
					}
				>
					{children}
				</LibraryDocumentColumn>
			</div>
		</ContentCard>
	</div>
)

const blocksIn = (root: HTMLElement) => slotsIn(root, "library-document-block")

const blockWith = (root: HTMLElement, text: string) => {
	const block = blocksIn(root).find((each) => each.textContent?.includes(text))
	if (!block) throw new Error(`No block with ${text}`)
	return block
}

const partOf = (block: HTMLElement, slot: string) => {
	const part = block.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
	if (!part) throw new Error(`No ${slot}`)
	return part
}

const fieldIn = (root: HTMLElement) => {
	const field = root.querySelector<HTMLTextAreaElement>(
		'[data-slot="library-document-block-field"]',
	)
	if (!field) throw new Error("No field")
	return field
}

const focusedFieldIn = (root: HTMLElement) =>
	waitFor(() => {
		const field = fieldIn(root)
		expect(field).toHaveFocus()
		return field
	})

const itemNamesIn = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("menuitem")
		.map((item) => item.textContent)

const typesIn = (root: HTMLElement) =>
	blocksIn(root).map((block) => block.dataset.type)

const isInDocument = (root: HTMLElement) =>
	root.contains(document.activeElement)

const slashPanelIn = (root: HTMLElement) =>
	root.querySelector<HTMLElement>('[data-slot="library-slash-menu-panel"]')

const optionNamesIn = (root: HTMLElement) =>
	within(root)
		.getAllByRole("option")
		.map((option) => option.textContent)

const groupNamesIn = (root: HTMLElement) =>
	slotsIn(root, "library-slash-menu-group").map(
		(group) => group.firstElementChild?.textContent,
	)

const openHandleMenu = async (block: HTMLElement) => {
	const handle = partOf(block, "library-block-drag")
	if (isInBrowserRunner()) await (await realPointer()).hover(block)
	fireEvent.pointerDown(handle, { button: 0, clientY: 0 })
	fireEvent.pointerUp(handle, { button: 0, clientY: 0 })
	fireEvent.click(handle)
	return screen.findByRole("menu")
}

const chooseInMenu = async (block: HTMLElement, name: RegExp) => {
	const menu = await openHandleMenu(block)
	fireEvent.click(within(menu).getByRole("menuitem", { name }))
	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
}

const meta = preview.meta({
	title: "Navigation/LibraryDocumentBlockEditor",
	component: LibraryDocumentBlockEditor,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A Library document edited block by block. The markdown is cut into its top-level blocks, each drawn by `Markdown`, the component the message bubble uses, at the reading density of the document view. A paragraph, heading, list or quote turns into its markdown source in place when clicked or focused. An empty line opens the / menu, a hovered block shows its handle at its leading edge: + adds a line below, the six dots open the block menu or drag the block. Every change leaves through `onBodyChange` as markdown, and an untouched document serializes back to the exact string it came in as.",
			},
		},
	},
	args: { body: BRIEF, onBodyChange: fn() },
	render: (args) => (
		<DocumentFrame>
			<LibraryDocumentBlockEditor {...args} />
		</DocumentFrame>
	),
})

const openSlashBelow = async (
	root: HTMLElement,
	text: string,
	typed: string,
) => {
	fireEvent.click(partOf(blockWith(root, text), "library-block-insert"))
	const field = fieldIn(root)
	await waitFor(() => expect(field).toHaveFocus())
	for (const character of typed)
		fireEvent.change(fieldIn(root), {
			target: { value: fieldIn(root).value + character },
		})
	return fieldIn(root)
}

const slashMenuStory = (theme: "light" | "dark") => ({
	args: { body: LONG_BRIEF },
	globals: { theme },
	parameters: {
		docs: {
			description: {
				story: `Paper 3a${theme === "dark" ? " dark" : ""}: / typed on an empty line near the bottom of the column. Check the menu opens above the line, Text first with Heading, List, Checklist and Quote and their markdown shortcut, then Rich blocks ending on Collapsible sections, and the footer of keys. Pick 3b for a filtered menu.`,
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await openSlashBelow(canvasElement, "copy may slip", "/")
		const panel = await waitFor(() => {
			const shown = slashPanelIn(canvasElement)
			expect(shown).not.toBeNull()
			return shown as HTMLElement
		})
		await expect(panel.dataset.side).toBe("top")
		await expect(groupNamesIn(canvasElement)).toEqual(["Text", "Rich blocks"])
		await expect(optionNamesIn(panel)).toEqual([
			"Heading#",
			"List-",
			"Checklist[]",
			"Quote>",
			"Gallery",
			"Callout",
			"Table",
			"Code```",
			"Web page card",
			"Collapsible sections",
		])
		const highlighted = within(panel).getByRole("option", { selected: true })
		await expect(highlighted).toHaveTextContent("Heading")
		await expect(colourTransitionsOf(highlighted)).toEqual([])
	},
})

export const SlashMenuNearBottom = meta.story(slashMenuStory("light"))

export const SlashMenuNearBottomDark = meta.story(slashMenuStory("dark"))

export const SlashMenuFiltered = meta.story({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3b: /cal typed on an empty line in the middle of the document. Check Callout is the only item left, under Rich blocks, the Text group hidden, and the menu opens below the line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await openSlashBelow(canvasElement, "Every document opens", "/cal")
		const panel = await waitFor(() => {
			const shown = slashPanelIn(canvasElement)
			expect(shown).not.toBeNull()
			return shown as HTMLElement
		})
		await expect(panel.dataset.side).toBe("bottom")
		await expect(groupNamesIn(canvasElement)).toEqual(["Rich blocks"])
		await expect(optionNamesIn(panel)).toEqual(["Callout"])
	},
})

export const BlockHandleMenu = meta.story({
	globals: { theme: "light" },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"Paper 3c: the pointer on a paragraph shows its handle at the block's leading edge, level with its first line, and the six dots open the block menu: the type as header, Turn into, Duplicate, Move up, Move down, then Delete under a hairline. Check the pressed handle sits on the hover overlay and no colour transitions.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = blockWith(canvasElement, "Weekly active Spaces")
		const menu = await openHandleMenu(block)
		const handle = partOf(block, "library-block-handle")
		const firstLine = partOf(block, "markdown").getBoundingClientRect()
		await expect(handle.getBoundingClientRect().top).toBe(firstLine.top)
		await expect(handle.getBoundingClientRect().right).toBeLessThanOrEqual(
			firstLine.left,
		)
		await expect(within(menu).getByText("Text")).toBeVisible()
		await expect(itemNamesIn(menu)).toEqual([
			"Turn into",
			...(isMacPlatform() ? MAC_SHORTCUTS : OTHER_SHORTCUTS),
		])
		const drag = partOf(block, "library-block-drag")
		await expect(drag).toHaveAttribute("aria-expanded", "true")
		await expect(colourTransitionsOf(drag)).toEqual([])
	},
})

export const DragWithDropIndicator = meta.story({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"A block held by its six dots and carried down the column. No artboard draws it: the drop indicator is a 2px line in the Space colour (`bg-primary`) between the two blocks where the block will land. Check it sits between What we measure and the paragraph under it while the first paragraph is held.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const held = blockWith(canvasElement, "The spring launch puts")
		const target = blockWith(canvasElement, "Weekly active Spaces")
		const handle = partOf(held, "library-block-drag")
		const from = handle.getBoundingClientRect().top
		fireEvent.pointerDown(handle, { button: 0, clientY: from })
		fireEvent.pointerMove(target, {
			clientY: target.getBoundingClientRect().top + 2,
		})
		const indicator = await waitFor(() =>
			partOf(target, "library-block-drop-indicator"),
		)
		await expect(indicator.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			target.getBoundingClientRect().top,
		)
		await expect(
			slotsIn(canvasElement, "library-block-drop-indicator"),
		).toHaveLength(1)
	},
})

export const BubbleAndDocumentParity = meta.story({
	globals: { theme: "light" },
	args: { body: RICH_BLOCKS },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The same rich blocks, a callout, a web page card, a table and collapsible sections, in a message bubble and in a document. Check each side mounts the same component, read-only in the document until OPE-1798.",
			},
		},
	},
	render: (args) => (
		<div className="grid w-[1280px] grid-cols-2 gap-6 bg-background p-6">
			<div data-testid="bubble-side">
				<MessageBubble variant="soft">
					<MessageBubbleContent>
						<Markdown>{RICH_BLOCKS}</Markdown>
					</MessageBubbleContent>
				</MessageBubble>
			</div>
			<div className="ps-14" data-testid="document-side">
				<LibraryDocumentBlockEditor {...args} />
			</div>
		</div>
	),
	play: async ({ canvas }) => {
		const bubble = canvas.getByTestId("bubble-side")
		const documentSide = canvas.getByTestId("document-side")
		for (const slot of ["callout", "web-page-card", "collapsible-sections"]) {
			const [inBubble] = slotsIn(bubble, slot)
			const [inDocument] = slotsIn(documentSide, slot)
			await expect(inBubble).toBeDefined()
			await expect(inDocument).toBeDefined()
			await expect(inDocument.className).toBe(inBubble.className)
		}
		await expect(within(documentSide).getByRole("table")).toBeVisible()
		await expect(typesIn(documentSide)).toEqual([
			"callout",
			"web-page",
			"table",
			"collapsible",
		])
	},
})

export const AgentsWriting = meta.story({
	globals: { theme: "light" },
	args: { writers: LIBRARY_WRITERS, onStop: fn(), onOpenConversation: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Two agents writing while the document is open, the named carets of Paper section 4. Check each run and its caret land in the block its offsets point at: Atlas in the list under What changes, Mira in the paragraph under What we measure.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const list = blockWith(canvasElement, "Every document opens")
		const paragraph = blockWith(canvasElement, "We also count")
		await expect(slotsIn(list, "library-document-run")).toHaveLength(1)
		await expect(slotsIn(list, "library-document-run")[0]).toHaveTextContent(
			"and the agent says why it asks",
		)
		await expect(slotsIn(paragraph, "library-document-caret")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "library-document-caret")).toHaveLength(
			2,
		)
	},
})

export const ClickEditsInPlace = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const block = blockWith(canvasElement, "Copy is final on the 7th")
		const shown = block.querySelector<HTMLElement>("[tabindex]")
		if (!shown) throw new Error("No text block")
		shown.focus()
		const field = await focusedFieldIn(canvasElement)
		await expect(field.value).toBe(
			"Copy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.",
		)
		fireEvent.change(field, { target: { value: "Copy is final on the 8th." } })
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			BRIEF.replace(
				/Copy is final on the 7th[^\n]*$/,
				"Copy is final on the 8th.",
			),
		)
	},
})

export const SlashEnterInsertsHeading = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const field = await openSlashBelow(
			canvasElement,
			"morning of the 14th",
			"/",
		)
		fireEvent.keyDown(field, { key: "ArrowDown" })
		fireEvent.keyDown(field, { key: "ArrowDown" })
		fireEvent.keyDown(field, { key: "ArrowUp" })
		const panel = slashPanelIn(canvasElement) as HTMLElement
		await expect(
			within(panel).getByRole("option", { selected: true }),
		).toHaveTextContent("List")
		fireEvent.change(fieldIn(canvasElement), { target: { value: "/hea" } })
		await expect(optionNamesIn(panel)).toEqual(["Heading#"])
		fireEvent.keyDown(fieldIn(canvasElement), { key: "Enter" })
		await waitFor(() => expect(slashPanelIn(canvasElement)).toBeNull())
		await expect(fieldIn(canvasElement).value).toBe("## ")
		await expect(fieldIn(canvasElement)).toHaveFocus()
		fireEvent.change(fieldIn(canvasElement), {
			target: { value: "## Risks" },
		})
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			`${BRIEF}\n\n## Risks`,
		)
	},
})

export const SlashEscapeKeepsText = meta.story({
	tags: ["test-only"],
	play: async ({ canvasElement }) => {
		const field = await openSlashBelow(
			canvasElement,
			"morning of the 14th",
			"/cal",
		)
		await waitFor(() => expect(slashPanelIn(canvasElement)).not.toBeNull())
		fireEvent.keyDown(field, { key: "Escape" })
		await waitFor(() => expect(slashPanelIn(canvasElement)).toBeNull())
		await expect(fieldIn(canvasElement).value).toBe("/cal")
		await expect(fieldIn(canvasElement)).toHaveFocus()
	},
})

export const SlashInsertsRichBlock = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const field = await openSlashBelow(
			canvasElement,
			"morning of the 14th",
			"/cal",
		)
		fireEvent.keyDown(field, { key: "Enter" })
		await waitFor(() => expect(typesIn(canvasElement).at(-1)).toBe("callout"))
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			`${BRIEF}\n\n> [!NOTE]\n> `,
		)
		await expect(isInDocument(canvasElement)).toBe(true)
	},
})

export const InsertBelowPutsCaret = meta.story({
	tags: ["test-only"],
	play: async ({ canvasElement }) => {
		const block = blockWith(canvasElement, "The spring launch puts")
		const before = blocksIn(canvasElement).length
		fireEvent.click(partOf(block, "library-block-insert"))
		const field = fieldIn(canvasElement)
		await waitFor(() => expect(field).toHaveFocus())
		await expect(field.value).toBe("")
		await expect(blocksIn(canvasElement)).toHaveLength(before + 1)
		await expect(blocksIn(canvasElement)[1]).toContainElement(field)
	},
})

export const HandleMenuMovesBlock = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(
			blockWith(canvasElement, "The spring launch puts"),
			/^Move down/,
		)
		await expect(typesIn(canvasElement).slice(0, 2)).toEqual([
			"heading",
			"paragraph",
		])
		await waitFor(() => expect(isInDocument(canvasElement)).toBe(true))
		await chooseInMenu(
			blockWith(canvasElement, "The spring launch puts"),
			/^Move up/,
		)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(BRIEF)
	},
})

export const HandleMenuDuplicates = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(blockWith(canvasElement, "What changes"), /^Duplicate/)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			BRIEF.replace("## What changes", "## What changes\n\n## What changes"),
		)
		await waitFor(() => expect(isInDocument(canvasElement)).toBe(true))
	},
})

export const HandleMenuDeletes = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(blockWith(canvasElement, "Timeline"), /^Delete/)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			BRIEF.replace("## Timeline\n\n", ""),
		)
		await waitFor(() => expect(isInDocument(canvasElement)).toBe(true))
	},
})

export const HandleMenuTurnsInto = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		const menu = await openHandleMenu(blockWith(canvasElement, "We also count"))
		fireEvent.click(within(menu).getByRole("menuitem", { name: "Turn into" }))
		const kinds = await screen.findAllByRole("menuitemradio")
		await expect(kinds.map((kind) => kind.textContent)).toEqual([
			"Text",
			"Heading",
			"List",
			"Checklist",
			"Quote",
		])
		await expect(kinds[0]).toHaveAttribute("aria-checked", "true")
		fireEvent.click(kinds[4])
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			BRIEF.replace("\n\nWe also count", "\n\n> We also count"),
		)
		await expect(blockWith(canvasElement, "We also count").dataset.type).toBe(
			"quote",
		)
	},
})

export const TurnIntoRichBlockOffersItself = meta.story({
	tags: ["test-only"],
	args: { body: CALLOUT_DOCUMENT },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ canvasElement }) => {
		const menu = await openHandleMenu(
			blockWith(canvasElement, "archived rooms"),
		)
		fireEvent.click(within(menu).getByRole("menuitem", { name: "Turn into" }))
		const kinds = await screen.findAllByRole("menuitemradio")
		await expect(kinds.map((kind) => kind.textContent)).toEqual(["Callout"])
		await expect(kinds[0]).toHaveAttribute("aria-checked", "true")
	},
})

export const ShortcutsOnFocusedBlock = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const count = blocksIn(canvasElement).length
		const handle = partOf(
			blockWith(canvasElement, "The spring launch puts"),
			"library-block-drag",
		)
		handle.focus()
		fireEvent.keyDown(handle, {
			key: "ArrowDown",
			altKey: true,
			shiftKey: true,
		})
		await expect(typesIn(canvasElement)[1]).toBe("paragraph")
		await waitFor(() =>
			expect(document.activeElement).toBe(
				partOf(
					blockWith(canvasElement, "The spring launch puts"),
					"library-block-drag",
				),
			),
		)
		const moved = document.activeElement as HTMLElement
		fireEvent.keyDown(moved, { key: "ArrowUp", altKey: true, shiftKey: true })
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(BRIEF)
		const command = navigator.userAgent.includes("Mac")
			? { metaKey: true }
			: { ctrlKey: true }
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "d",
			...command,
		})
		await expect(blocksIn(canvasElement)).toHaveLength(count + 1)
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "Backspace",
		})
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(BRIEF)
		await waitFor(() => expect(isInDocument(canvasElement)).toBe(true))
		await expect(document.activeElement).toHaveAttribute(
			"data-slot",
			"library-block-drag",
		)
	},
})

export const DragMovesBlock = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const held = blockWith(canvasElement, "The spring launch puts")
		const target = blockWith(canvasElement, "Weekly active Spaces")
		const handle = partOf(held, "library-block-drag")
		fireEvent.pointerDown(handle, {
			button: 0,
			clientY: handle.getBoundingClientRect().top,
		})
		const y = target.getBoundingClientRect().top + 2
		fireEvent.pointerMove(target, { clientY: y })
		fireEvent.pointerUp(target, { clientY: y })
		await waitFor(() =>
			expect(
				slotsIn(canvasElement, "library-block-drop-indicator"),
			).toHaveLength(0),
		)
		const [first, ...rest] = BRIEF.split("\n\n")
		const landing = rest.indexOf("## What we measure") + 1
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			[...rest.slice(0, landing), first, ...rest.slice(landing)].join("\n\n"),
		)
	},
})

export const HandleMenuShortcutsOffMac = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"The block menu on Windows or Linux. Check every shortcut reads with Ctrl, Alt and Shift names and Backspace, never the Mac glyphs, and Ctrl+D duplicates the block.",
			},
		},
	},
	beforeEach: () => {
		const agent = spyOn(navigator, "userAgent", "get").mockReturnValue(
			WINDOWS_AGENT,
		)
		return () => agent.mockRestore()
	},
	play: async ({ canvasElement }) => {
		const block = blockWith(canvasElement, "We also count")
		const menu = await openHandleMenu(block)
		await expect(itemNamesIn(menu)).toEqual(["Turn into", ...OTHER_SHORTCUTS])
		fireEvent.keyDown(menu, { key: "Escape" })
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		const count = blocksIn(canvasElement).length
		const handle = partOf(block, "library-block-drag")
		handle.focus()
		fireEvent.keyDown(handle, { key: "d", ctrlKey: true })
		await expect(blocksIn(canvasElement)).toHaveLength(count + 1)
	},
})

export const ChecklistEditsInPlace = meta.story({
	tags: ["test-only"],
	args: { body: CHECKLIST_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"A checklist, the [] item of the Text group. Check a box toggles in the markdown without opening the field, focusing the checklist opens its source with the caret at the end, and Backspace on an empty line under it puts the caret back at the end of the checklist.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const checklist = blockWith(canvasElement, "Book the room")
		const [room] = within(checklist).getAllByRole("checkbox")
		fireEvent.click(room)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			CHECKLIST_DOCUMENT.replace("- [ ] Book", "- [x] Book"),
		)
		await expect(canvasElement.querySelector("textarea")).toBeNull()

		const shown = checklist.querySelector<HTMLElement>("[tabindex]")
		if (!shown) throw new Error("No checklist")
		shown.focus()
		const field = await focusedFieldIn(canvasElement)
		await expect(field.value).toBe("- [x] Book the room\n- [x] Send the invite")
		await expect(field.selectionStart).toBe(field.value.length)

		fireEvent.click(
			partOf(blockWith(canvasElement, "Book the room"), "library-block-insert"),
		)
		const empty = await focusedFieldIn(canvasElement)
		await expect(empty.value).toBe("")
		fireEvent.keyDown(empty, { key: "Backspace" })
		const back = await waitFor(() => {
			const field = fieldIn(canvasElement)
			expect(field.value).toContain("Book the room")
			return field
		})
		await expect(back).toHaveFocus()
		await expect(back.selectionStart).toBe(back.value.length)
	},
})

export const PersonCaretAtBlockEdges = meta.story({
	globals: { theme: "light" },
	args: { people: PEOPLE },
	parameters: {
		docs: {
			description: {
				story:
					"Two people whose carets sit on the edges of a block: Ada on the first offset of What changes, Noé on the last offset of the paragraph under What we measure. Check each named caret renders on its block, Ada before the heading text and Noé after the last word.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const heading = blockWith(canvasElement, "What changes")
		const paragraph = blockWith(canvasElement, "Weekly active Spaces")
		const [ada] = slotsIn(heading, "library-document-person-caret")
		const [noe] = slotsIn(paragraph, "library-document-person-caret")
		await expect(ada).toBeDefined()
		await expect(noe).toBeDefined()
		await expect(ada).toHaveTextContent("Ada Martin")
		await expect(noe).toHaveTextContent("Noé Petit")
		await expect(heading.textContent?.indexOf("Ada Martin")).toBeLessThan(
			heading.textContent?.indexOf("What changes") ?? 0,
		)
		await expect(paragraph.textContent?.trimEnd().endsWith("Noé Petit")).toBe(
			true,
		)
		await expect(
			slotsIn(canvasElement, "library-document-person-caret"),
		).toHaveLength(2)
	},
})

export const NarrowColumn = meta.story({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document column at its narrowest, the article narrower than 640 and only the 40px padding left of the text. Check the whole handle, + and the six dots, stays inside the visible column, overlapping the text by no more than the 6px the measured handle cannot fit.",
			},
		},
	},
	render: (args) => (
		<DocumentFrame isNarrow>
			<LibraryDocumentBlockEditor {...args} />
		</DocumentFrame>
	),
	play: async ({ canvasElement }) => {
		const block = blockWith(canvasElement, "The spring launch puts")
		partOf(block, "library-block-drag").focus()
		const column = slotsIn(canvasElement, "library-document-column")[0]
		const visible = column.getBoundingClientRect()
		const text = partOf(block, "markdown").getBoundingClientRect()
		await expect(text.width).toBeLessThan(640)
		for (const slot of ["library-block-insert", "library-block-drag"]) {
			const part = partOf(block, slot).getBoundingClientRect()
			await expect(part.left).toBeGreaterThanOrEqual(visible.left)
			await expect(part.right).toBeLessThanOrEqual(text.left + 6)
		}
		await expect(
			getComputedStyle(partOf(block, "library-block-handle")).opacity,
		).toBe("1")
	},
})
