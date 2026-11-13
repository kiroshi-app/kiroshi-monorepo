import { type ReactNode, useState } from "react"
import {
	expect,
	fireEvent,
	fn,
	mocked,
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
	resolvedRootColor,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_STORED_IMAGES,
	LIBRARY_WRITERS,
	resolvedLibraryImageOf,
} from "@workspace/ui/components/library.fixtures"
import {
	fieldSelectionOf,
	selectInField,
} from "@workspace/ui/components/library-block-text"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"
import {
	DOCUMENT_PAGE,
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
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

const GALLERY_DOCUMENT = [
	"The sofas we kept for the lobby.",
	[
		"```gallery",
		"- image: https://images.example.org/sofa-green.jpg",
		"  alt: Green velvet sofa",
		"- image: https://images.example.org/sofa-grey.jpg",
		"  alt: Grey linen sofa",
		"  caption: Grey linen, 990 euros",
		"- image: https://images.example.org/armchair-rust.jpg",
		"  alt: Rust armchair",
		"```",
	].join("\n"),
].join("\n\n")

const GALLERY_ITEMS = {
	green:
		"- image: https://images.example.org/sofa-green.jpg\n  alt: Green velvet sofa",
	grey: "- image: https://images.example.org/sofa-grey.jpg\n  alt: Grey linen sofa\n  caption: Grey linen, 990 euros",
	rust: "- image: https://images.example.org/armchair-rust.jpg\n  alt: Rust armchair",
}

const galleryWith = (...items: string[]) =>
	[
		"The sofas we kept for the lobby.",
		["```gallery", ...items, "```"].join("\n"),
	].join("\n\n")

const MORE_GALLERY_ITEMS = [
	"lamp-brass",
	"rug-wool",
	"table-oak",
	"shelf-pine",
].map(
	(name) =>
		`- image: https://images.example.org/${name}.jpg\n  alt: ${name.replace("-", " ")}`,
)

const [LAMP, RUG, TABLE, SHELF] = MORE_GALLERY_ITEMS

const SEVEN_IMAGES = galleryWith(
	GALLERY_ITEMS.green,
	GALLERY_ITEMS.grey,
	GALLERY_ITEMS.rust,
	...MORE_GALLERY_ITEMS,
)

const STORED_IMAGES = LIBRARY_STORED_IMAGES

const STORED_ITEMS = STORED_IMAGES.map(
	({ src, alt }) => `- image: ${src}\n  alt: ${alt}`,
)

const STORED_GALLERY = galleryWith(...STORED_ITEMS)

const [, STORED_GREY, , , , STORED_OAK] = STORED_IMAGES

const resolveAllBut =
	(srcs: readonly string[], outcome: () => Promise<string>) =>
	(asked: string) =>
		srcs.includes(asked)
			? outcome()
			: Promise.resolve(resolvedLibraryImageOf(asked))

const resolvedImgIn = (gallery: HTMLElement, alt: string) =>
	waitFor(() => {
		const img = within(gallery).getByRole<HTMLImageElement>("img", {
			name: alt,
		})
		expect(img.getAttribute("src")).toBe(
			resolvedLibraryImageOf(
				STORED_IMAGES.find((image) => image.alt === alt)?.src ?? "",
			),
		)
		return img
	})

const ADDED_IMAGES = [
	{ src: "https://images.example.org/lamp-brass.jpg", alt: "Brass lamp" },
]

const TABLE_DOCUMENT = [
	"Rooms held for the offsite:",
	"| Room | Seats |\n| --- | --- |\n| Atlas | 12 |\n| Mira |  |",
].join("\n\n")

const WIDE_TABLE_DOCUMENT = [
	"| Room | Seats | Floor | Projector | Notes for the team |",
	"| --- | --- | --- | --- | --- |",
	"| Atlas | 12 | 3 | Epson | Book a week early |",
].join("\n")

const CODE_DOCUMENT = [
	"Run this once the build is green:",
	"```ts\nconst launch = await ship()\n```",
].join("\n\n")

const WEB_PAGE_DOCUMENT = [
	"Where the team sleeps:",
	"```web-page\nurl: https://www.example.org/rooms\ntitle: Casa do Rio, rooms and rates\n```",
].join("\n\n")

const SUITES_PREVIEW = {
	url: "https://www.example.org/suites",
	title: "Casa do Rio, suites",
	site: "Casa do Rio",
}

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

const EVERY_MARK =
	"Ship **bold** with *italic*, ~~struck~~, `code` and a [link](https://kiroshi.app) today."

const IDENTIFIED_DOCUMENT = [
	"# Launch plan ^launch",
	"The spring launch ships on the 14th. ^spring",
	"- Book the room\n- Send the invite\n\n^rooms1",
	"The call starts at ten. ^call10",
].join("\n\n")

const MARKED_DOCUMENT = [
	"## Launch plan",
	"- Book the **room**\n- Send the invite",
	"> The export keeps the archived rooms too.",
	"- [ ] Print the **badges**\n- [x] Order the cake",
	EVERY_MARK,
].join("\n\n")

const MARKDOWN_SIGNS = /[#*_~`<>[\]\\]|^[ \t]*(?:[-+]|\d+[.)])[ \t]/m

const RICH_TEXT_DOCUMENT = [
	"Costs \\$5 to \\$9 \\(tax included\\) for the room.",
	"Write to <ada@kiroshi.app> or <https://kiroshi.app/help>.",
	"See ![Green velvet sofa](https://images.example.org/sofa-green.jpg) in the lobby.",
	"- Rooms\n  - Atlas\n  - Mira\n- Food",
	"> [!NOTE]\n> Keep the **archived** rooms and the *export* too.",
	"| Room | Seats |\n| --- | --- |\n| **Atlas** | 12 |",
].join("\n\n")

const EMPTIED_DOCUMENT = [
	"Before the call:",
	"## Risks",
	"- Venue",
	"> Quoted",
].join("\n\n")

const EMPTIED_PLACEHOLDERS = ["## Risks", "- Venue", "> Quoted"].map(
	(block, index) => ({
		at: EMPTIED_DOCUMENT.indexOf(block),
		text: ["Name the risk", "Add an item", "Add a quote"][index],
	}),
)

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
			<ScreenLayout
				className={DOCUMENT_PAGE}
				header={
					<LibraryDocumentBar
						item={{ name: LIBRARY_AGENT_DOCUMENT.name }}
						onBack={fn()}
					/>
				}
				isHeaderFloating
				scroller={() => (
					<LibraryDocumentColumn
						detail={LIBRARY_AGENT_DOCUMENT.detail}
						heading={
							<h1 className={DOCUMENT_TITLE}>{LIBRARY_AGENT_DOCUMENT.name}</h1>
						}
					>
						{children}
					</LibraryDocumentColumn>
				)}
			/>
		</ContentCard>
	</div>
)

const ID_MARKER = /(?:\n\n\^| \^)[a-z0-9]{6}$/gm

type BodyArgs = { onBodyChange: (markdown: string) => void }

const writtenIn = ({ onBodyChange }: BodyArgs) =>
	mocked(onBodyChange).mock.lastCall?.[0]

const bodyIn = (args: BodyArgs) => writtenIn(args)?.replace(ID_MARKER, "")

const idsIn = (markdown = "") =>
	[...markdown.matchAll(/(?:^| )\^([a-z0-9]{6})$/gm)].map(([, id]) => id)

const FRESH_ID = /^[a-z0-9]{6}$/

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
	const field = root.querySelector<HTMLElement>(
		'[data-slot="library-document-block-field"]',
	)
	if (!field) throw new Error("No field")
	return field
}

const shownIn = (field: HTMLElement) => field.textContent ?? ""

const nextFrame = () =>
	new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

const inputInto = async (
	field: HTMLElement,
	inputType: string,
	data: string | null = null,
) => {
	field.dispatchEvent(
		new InputEvent("beforeinput", {
			inputType,
			data,
			bubbles: true,
			cancelable: true,
		}),
	)
	await nextFrame()
}

const typeInto = async (field: HTMLElement, text: string) => {
	for (const character of text) await inputInto(field, "insertText", character)
}

const selectShown = (field: HTMLElement, text: string) => {
	const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const at = node.textContent?.indexOf(text) ?? -1
		if (at === -1) continue
		document.getSelection()?.setBaseAndExtent(node, at, node, at + text.length)
		return
	}
	throw new Error(`No ${text} shown`)
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

const blockOfType = (root: HTMLElement, type: string) => {
	const block = blocksIn(root).find((each) => each.dataset.type === type)
	if (!block) throw new Error(`No ${type} block`)
	return block
}

const focusTextBlock = async (root: HTMLElement, type: string) => {
	const shown = blockOfType(root, type).querySelector<HTMLElement>("[tabindex]")
	if (!shown) throw new Error(`No ${type} to focus`)
	shown.focus()
	return focusedFieldIn(root)
}

const expectNoMarkdownIn = (field: HTMLElement) =>
	expect(shownIn(field)).not.toMatch(MARKDOWN_SIGNS)

const expectMark = (field: HTMLElement, tag: string, text: string) =>
	expect(field.querySelector(tag)).toHaveTextContent(new RegExp(`^${text}$`))

const openBlock = async (root: HTMLElement, type: string) => {
	const shown = blockOfType(root, type).querySelector<HTMLElement>("[tabindex]")
	if (!shown) throw new Error(`No ${type} to focus`)
	shown.focus()
	return waitFor(() => {
		const block = blockOfType(root, type)
		partOf(block, "library-document-block-editing")
		return block
	})
}

const centreOf = (element: HTMLElement) => {
	const { left, top, width, height } = element.getBoundingClientRect()
	return { clientX: left + width / 2, clientY: top + height / 2 }
}

const fieldsOf = (block: HTMLElement) =>
	slotsIn(block, "library-document-block-field")

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
					"A Library document edited block by block. The markdown is cut into its top-level blocks, each drawn by `Markdown`, the component the message bubble uses, at the reading density of the document view. A paragraph, heading, list or quote is edited in place in its rendered look when clicked or focused, every markdown marker hidden: the caret lands where the press fell, a typed closing marker turns the text into its mark, and a heading, list or quote prefix typed at the start of a line turns the block into that type once its space lands. An empty line opens the / menu, a hovered block shows its handle at its leading edge: + adds a line below, the six dots open the block menu or drag the block. Every change leaves through `onBodyChange` as markdown, and an untouched document serializes back to the exact string it came in as.",
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
	await typeInto(field, typed)
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
					"The same rich blocks, a callout, a web page card, a table and collapsible sections, in a message bubble and in a document. Check each side mounts the same component while no block is edited.",
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

type Theme = "light" | "dark"

type FocusedState = {
	story: string
	play: (root: HTMLElement) => Promise<void>
}

const focusedStory =
	({ story, play }: FocusedState) =>
	(theme: Theme) => ({
		args: { body: MARKED_DOCUMENT },
		globals: { theme },
		parameters: { docs: { description: { story } } },
		play: ({ canvasElement }: { canvasElement: HTMLElement }) =>
			play(canvasElement),
	})

const focusedHeading = focusedStory({
	story:
		"A heading focused from the keyboard. Check it stays in the heading look, its text editable in place with no hash on screen, and the field is named Heading.",
	play: async (root) => {
		const field = await focusTextBlock(root, "heading")
		await expect(field).toHaveAccessibleName("Heading")
		await expect(field).toHaveAttribute("role", "textbox")
		await expectMark(field, "h2", "Launch plan")
		await expectNoMarkdownIn(field)
	},
})

const focusedListItem = focusedStory({
	story:
		"A bulleted list focused. Check each item keeps its bullet, no dash is typed in the text, and the bold word of the first item stays bold with no asterisk.",
	play: async (root) => {
		const field = await focusTextBlock(root, "list")
		await expect(field).toHaveAccessibleName("List")
		const items = field.querySelectorAll("ul > li")
		await expect([...items].map((item) => item.textContent)).toEqual([
			"Book the room",
			"Send the invite",
		])
		await expect(getComputedStyle(items[0]).listStyleType).toBe("disc")
		await expectMark(field, "strong", "room")
		await expectNoMarkdownIn(field)
	},
})

const focusedToDoItem = focusedStory({
	story:
		"A checklist opened, the caret in its last item. Check every item keeps its checkbox, no dash or bracket is typed in the text, and the bold word of the first item stays bold with no asterisk.",
	play: async (root) => {
		const editing = await openBlock(root, "checklist")
		const fields = fieldsOf(editing)
		await waitFor(() => expect(fields.at(-1)).toHaveFocus())
		await expect(within(editing).getAllByRole("checkbox")).toHaveLength(2)
		await expect(fields.map(shownIn)).toEqual([
			"Print the badges",
			"Order the cake",
		])
		await expectMark(fields[0], "strong", "badges")
		for (const field of fields) await expectNoMarkdownIn(field)
	},
})

const focusedQuote = focusedStory({
	story:
		"A quote focused. Check it keeps its quote bar and no chevron is typed in the text.",
	play: async (root) => {
		const field = await focusTextBlock(root, "quote")
		await expect(field).toHaveAccessibleName("Quote")
		const quote = field.querySelector("blockquote")
		await expect(quote).toHaveTextContent(
			/^The export keeps the archived rooms too\.$/,
		)
		await expect(
			getComputedStyle(quote as HTMLElement).borderInlineStartWidth,
		).toBe("2px")
		await expectNoMarkdownIn(field)
	},
})

const focusedEveryMark = focusedStory({
	story:
		"A paragraph holding bold, italic, strikethrough, inline code and a link, focused with the caret inside the bold word. Check each one renders as its mark and no asterisk, tilde, backtick or bracket is shown.",
	play: async (root) => {
		const field = await focusTextBlock(root, "paragraph")
		selectInField(field, EVERY_MARK.indexOf("bold") + 2)
		await expect(field).toHaveAccessibleName("Text")
		await expect(shownIn(field)).toBe(
			"Ship bold with italic, struck, code and a link today.",
		)
		await expectMark(field, "strong", "bold")
		await expectMark(field, "em", "italic")
		await expectMark(field, "del", "struck")
		await expectMark(field, "code", "code")
		await expectMark(field, "a", "link")
		await expectNoMarkdownIn(field)
	},
})

export const FocusedHeading = meta.story(focusedHeading("light"))

export const FocusedHeadingDark = meta.story(focusedHeading("dark"))

export const FocusedListItem = meta.story(focusedListItem("light"))

export const FocusedListItemDark = meta.story(focusedListItem("dark"))

export const FocusedToDoItem = meta.story(focusedToDoItem("light"))

export const FocusedToDoItemDark = meta.story(focusedToDoItem("dark"))

export const FocusedQuote = meta.story(focusedQuote("light"))

export const FocusedQuoteDark = meta.story(focusedQuote("dark"))

export const FocusedEveryInlineMark = meta.story(focusedEveryMark("light"))

export const FocusedEveryInlineMarkDark = meta.story(focusedEveryMark("dark"))

const blockAfter = (source: string, replaced: string, by: string) =>
	MARKED_DOCUMENT.replace(source, source.replace(replaced, by))

export const TypingKeepsTheRenderedLook = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusTextBlock(canvasElement, "paragraph")
		selectInField(field, EVERY_MARK.indexOf("bold") + 4)
		for (const character of "er") {
			await typeInto(field, character)
			await expectMark(field, "strong", character === "e" ? "bolde" : "bolder")
			await expectNoMarkdownIn(field)
		}
		await expect(bodyIn(args)).toBe(
			blockAfter(EVERY_MARK, "**bold**", "**bolder**"),
		)
		selectShown(field, "italic")
		await expect(document.getSelection()?.toString()).toBe("italic")
		await expectMark(field, "em", "italic")
		await expectNoMarkdownIn(field)
		await inputInto(field, "deleteContentBackward")
		await expect(bodyIn(args)).toBe(
			blockAfter(EVERY_MARK, "**bold**", "**bolder**").replace(
				" with *italic*,",
				" with ,",
			),
		)
		await expectNoMarkdownIn(field)
	},
})

export const FormatShortcutRendersTheMark = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusTextBlock(canvasElement, "paragraph")
		selectShown(field, "today")
		fireEvent.keyDown(field, {
			key: "b",
			...(isMacPlatform() ? { metaKey: true } : { ctrlKey: true }),
		})
		await expect(bodyIn(args)).toBe(
			blockAfter(EVERY_MARK, "today", "**today**"),
		)
		await waitFor(() =>
			expect(field.querySelectorAll("strong")).toHaveLength(2),
		)
		await expect(field.querySelectorAll("strong")[1]).toHaveTextContent(
			/^today$/,
		)
		await expectNoMarkdownIn(field)
	},
})

export const EnterInsideAMarkKeepsBothHalves = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusTextBlock(canvasElement, "paragraph")
		selectInField(field, EVERY_MARK.indexOf("bold") + 2)
		fireEvent.keyDown(field, { key: "Enter" })
		await expect(bodyIn(args)).toBe(
			MARKED_DOCUMENT.replace(
				EVERY_MARK,
				`Ship **bo**\n\n${EVERY_MARK.replace("Ship **bo", "**")}`,
			),
		)
		const next = await focusedFieldIn(
			blocksIn(canvasElement).at(-1) as HTMLElement,
		)
		await expectMark(next, "strong", "ld")
		await expect(fieldSelectionOf(next)?.start).toBe(2)
	},
})

export const BackspaceAtTheStartTurnsIntoText = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusTextBlock(canvasElement, "quote")
		selectInField(field, 2)
		fireEvent.keyDown(field, { key: "Backspace" })
		await expect(bodyIn(args)).toBe(
			MARKED_DOCUMENT.replace("> The export", "The export"),
		)
		await expect(
			blockWith(canvasElement, "The export keeps").dataset.type,
		).toBe("paragraph")
		await expect(fieldIn(canvasElement)).toHaveFocus()
	},
})

export const TurnIntoKeepsTheCaretInTheBlock = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ canvasElement }) => {
		await focusTextBlock(canvasElement, "quote")
		const menu = await openHandleMenu(blockOfType(canvasElement, "quote"))
		fireEvent.click(within(menu).getByRole("menuitem", { name: "Turn into" }))
		const kinds = await screen.findAllByRole("menuitemradio")
		fireEvent.click(kinds[1])
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		const field = await focusedFieldIn(
			blockWith(canvasElement, "The export keeps"),
		)
		await expect(field).toHaveAccessibleName("Heading")
		await expectMark(field, "h2", "The export keeps the archived rooms too.")
		await expectNoMarkdownIn(field)
	},
})

const blockWithText = (root: HTMLElement, text: string) =>
	blockWith(root, text).querySelector<HTMLElement>("[tabindex]")

const focusBlockWith = async (root: HTMLElement, text: string) => {
	const shown = blockWithText(root, text)
	if (!shown) throw new Error(`No ${text} to focus`)
	shown.focus()
	return focusedFieldIn(blockWith(root, text))
}

const richTextStory = (story: string) => ({
	args: { body: RICH_TEXT_DOCUMENT },
	globals: { theme: "light" },
	parameters: { docs: { description: { story } } },
})

export const CalloutBodyShowsItsMarks = meta.story({
	...richTextStory(
		"A callout being edited. Check its body is edited in its rendered look, the bold word bold and the italic word italic, with no asterisk or chevron shown.",
	),
	play: async ({ args, canvasElement }) => {
		const callout = await openBlock(canvasElement, "callout")
		const [field] = fieldsOf(callout)
		await expect(shownIn(field)).toBe(
			"Keep the archived rooms and the export too.",
		)
		await expectMark(field, "strong", "archived")
		await expectMark(field, "em", "export")
		await expectNoMarkdownIn(field)
		selectInField(field, "Keep the **archived**".length)
		await typeInto(field, "!")
		await expect(bodyIn(args)).toBe(
			RICH_TEXT_DOCUMENT.replace("**archived**", "**archived**!"),
		)
		await expectNoMarkdownIn(field)
	},
})

export const TableCellShowsItsMarks = meta.story({
	...richTextStory(
		"A table being edited. Check a cell holding bold text shows it bold with no asterisk.",
	),
	play: async ({ canvasElement }) => {
		const table = await openBlock(canvasElement, "table")
		const atlas = within(table).getByRole("textbox", {
			name: "Row 2, column 1",
		})
		await expect(shownIn(atlas)).toBe("Atlas")
		await expectMark(atlas, "strong", "Atlas")
		for (const cell of fieldsOf(table)) await expectNoMarkdownIn(cell)
	},
})

export const EscapeShowsTheCharacter = meta.story({
	...richTextStory(
		"A paragraph holding backslash escapes, focused. Check each backslash is hidden and the escaped character shows, as the reading view shows it.",
	),
	play: async ({ canvasElement }) => {
		const shown = blockWith(canvasElement, "Costs").textContent
		const field = await focusBlockWith(canvasElement, "Costs")
		await expect(shownIn(field)).toBe(
			"Costs $5 to $9 (tax included) for the room.",
		)
		await expect(shownIn(field)).toBe(shown)
		await expectNoMarkdownIn(field)
	},
})

export const AutolinkShowsItsText = meta.story({
	...richTextStory(
		"A paragraph holding an email and a web autolink, focused. Check each shows as a link with no angle bracket.",
	),
	play: async ({ canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "Write to")
		await expect(shownIn(field)).toBe(
			"Write to ada@kiroshi.app or https://kiroshi.app/help.",
		)
		await expect(
			[...field.querySelectorAll("a")].map((link) => link.textContent),
		).toEqual(["ada@kiroshi.app", "https://kiroshi.app/help"])
		await expectNoMarkdownIn(field)
	},
})

const SOFA = "![Green velvet sofa](https://images.example.org/sofa-green.jpg)"

export const InlineImageIsOneNode = meta.story({
	...richTextStory(
		"A paragraph holding an inline image, focused. Check the image shows as in the reading view, the caret never lands inside it, and Backspace after it deletes it whole.",
	),
	play: async ({ args, canvasElement }) => {
		const paragraph = `See ${SOFA} in the lobby.`
		const field = await focusBlockWith(canvasElement, "in the lobby")
		const image = within(field).getByRole("img", { name: "Green velvet sofa" })
		await expect(image).toHaveAttribute(
			"src",
			"https://images.example.org/sofa-green.jpg",
		)
		await expect(shownIn(field)).toBe("See  in the lobby.")
		await expectNoMarkdownIn(field)
		const after = paragraph.indexOf(" in the lobby")
		selectInField(field, "See ".length + 6)
		await expect(["See ".length, after]).toContain(
			fieldSelectionOf(field)?.start,
		)
		selectInField(field, after)
		if (isInBrowserRunner()) {
			const press = async (key: string) => {
				await (await realPointer()).keyboard(`{${key}}`)
				return fieldSelectionOf(field)?.start
			}
			const leftward = [await press("ArrowLeft"), await press("ArrowLeft")]
			await expect(leftward.at(-1)).toBe("See ".length)
			const rightward = [await press("ArrowRight"), await press("ArrowRight")]
			await expect(rightward.at(-1)).toBe(after)
			for (const caret of [...leftward, ...rightward])
				await expect(["See ".length, after]).toContain(caret)
		}
		await inputInto(field, "deleteContentBackward")
		await expect(bodyIn(args)).toBe(RICH_TEXT_DOCUMENT.replace(SOFA, ""))
		await expect(field.querySelector("img")).toBeNull()
		await expectNoMarkdownIn(field)
	},
})

export const NestedListKeepsItsIndent = meta.story({
	...richTextStory(
		"A nested list focused. Check each item sits at the indent and wears the bullet of its level, exactly where the reading view draws it, with no dash typed in the text.",
	),
	play: async ({ canvasElement }) => {
		const readItems = () =>
			[...blockWith(canvasElement, "Rooms").querySelectorAll("li")].map(
				(item) => ({
					text: item.firstChild?.textContent?.trim(),
					left: Math.round(item.getBoundingClientRect().left),
					bullet: getComputedStyle(item.parentElement as HTMLElement)
						.listStyleType,
				}),
			)
		const reading = readItems()
		const field = await focusBlockWith(canvasElement, "Rooms")
		await expect(readItems()).toEqual(reading)
		await expect(reading.map(({ bullet }) => bullet)).toEqual([
			"disc",
			"circle",
			"circle",
			"disc",
		])
		await expectNoMarkdownIn(field)
	},
})

export const EmptiedBlocksKeepTheirType = meta.story({
	globals: { theme: "light" },
	args: { body: EMPTIED_DOCUMENT, placeholders: EMPTIED_PLACEHOLDERS },
	parameters: {
		docs: {
			description: {
				story:
					"A heading, a list item and a quote each emptied by deleting every character. Check each keeps its type, its look and its placeholder, with no hash, dash or chevron shown.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		let body = EMPTIED_DOCUMENT
		for (const [text, type, tag, emptied] of [
			["Venue", "list", "li", "- "],
			["Quoted", "quote", "blockquote", "> "],
			["Risks", "heading", "h2", "## "],
		]) {
			const field = await focusTextBlock(canvasElement, type)
			selectShown(field, text)
			await inputInto(field, "deleteContentBackward")
			body = body.replace(
				EMPTIED_DOCUMENT.split("\n\n").find((block) => block.includes(text)) ??
					"",
				emptied,
			)
			await expect(bodyIn(args)).toBe(body)
			await expect(blockOfType(canvasElement, type)).toContainElement(field)
			await expect(field.querySelector(tag)).not.toBeNull()
			await expect(shownIn(field)).toBe("")
			await expect(
				partOf(field, "library-document-placeholder"),
			).toHaveAttribute(
				"data-placeholder",
				EMPTIED_PLACEHOLDERS.find(({ at }) =>
					EMPTIED_DOCUMENT.startsWith(emptied.trim(), at),
				)?.text,
			)
			await expectNoMarkdownIn(field)
		}
	},
})

export const DragMovesText = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusTextBlock(canvasElement, "paragraph")
		selectShown(field, "today")
		field.dispatchEvent(
			new InputEvent("beforeinput", {
				inputType: "deleteByDrag",
				bubbles: true,
				cancelable: true,
			}),
		)
		selectInField(field, 0)
		const dropped = new DataTransfer()
		dropped.setData("text/plain", "today ")
		field.dispatchEvent(
			new InputEvent("beforeinput", {
				inputType: "insertFromDrop",
				dataTransfer: dropped,
				bubbles: true,
				cancelable: true,
			}),
		)
		await expect(bodyIn(args)).toBe(
			MARKED_DOCUMENT.replace(
				EVERY_MARK,
				`today ${EVERY_MARK.replace(" today.", " .")}`,
			),
		)
		await new Promise((resolve) => setTimeout(resolve, 20))
		await expect(args.onBodyChange).toHaveBeenCalledTimes(1)
		await expectNoMarkdownIn(field)
	},
})

const clickOn = async (element: Element, text: string, at: number) => {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const index = node.textContent?.indexOf(text) ?? -1
		if (index === -1) continue
		const range = document.createRange()
		range.setStart(node, index + at)
		range.setEnd(node, index + at + 1)
		const glyph = range.getBoundingClientRect()
		const box = (node.parentElement as HTMLElement).getBoundingClientRect()
		await (await realPointer()).click(node.parentElement as HTMLElement, {
			position: {
				x: glyph.left - box.left + 1,
				y: glyph.top - box.top + glyph.height / 2,
			},
		})
		return
	}
	throw new Error(`No ${text} to click`)
}

export const ClickPutsTheCaretOnTheCharacter = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const cases: [type: string, text: string, caret: number][] = [
			["heading", "Launch plan", "## Launch ".length],
			["list", "Send the invite", "- Book the **room**\n- Send the ".length],
			["checklist", "Order the cake", "Order the ".length],
		]
		for (const [type, text, caret] of cases) {
			const word = text.split(" ").at(-1) ?? ""
			await clickOn(
				blockOfType(canvasElement, type),
				text,
				text.length - word.length,
			)
			const field = await waitFor(() => {
				const focused = document.activeElement as HTMLElement
				expect(focused).toHaveAttribute(
					"data-slot",
					"library-document-block-field",
				)
				expect(blockOfType(canvasElement, type)).toContainElement(focused)
				return focused
			})
			await expect(fieldSelectionOf(field)?.start).toBe(caret)
			await expectNoMarkdownIn(field)
		}
	},
})

export const PointerDragSelectsAcrossAMark = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const field = await focusTextBlock(canvasElement, "paragraph")
		const [ship, , withText] = [...field.querySelectorAll("[data-from]")]
		const shipBox = ship.getBoundingClientRect()
		await (await realPointer()).dragAndDrop(ship, withText, {
			sourcePosition: { x: 1, y: shipBox.height / 2 },
			targetPosition: {
				x: withText.getBoundingClientRect().width - 2,
				y: shipBox.height / 2,
			},
		})
		await waitFor(() =>
			expect(document.getSelection()?.toString()).toMatch(/^Ship bold w/),
		)
		await waitFor(() =>
			expect(
				canvasElement.querySelector('[data-slot="selection-toolbar"]'),
			).not.toBeNull(),
		)
		await expect(fieldSelectionOf(field)?.start).toBe(0)
		await expect(fieldSelectionOf(field)?.end).toBeGreaterThan(
			"Ship **bold** w".length,
		)
		await expectNoMarkdownIn(field)
	},
})

export const TypedPrefixTurnsTheBlock = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		fireEvent.click(
			partOf(
				blocksIn(canvasElement).at(-1) as HTMLElement,
				"library-block-insert",
			),
		)
		const field = await focusedFieldIn(
			blocksIn(canvasElement).at(-1) as HTMLElement,
		)
		await typeInto(field, "#")
		await expect(shownIn(field)).toBe("#")
		await typeInto(field, " Risks")
		await expect(bodyIn(args)).toBe(`${MARKED_DOCUMENT}\n\n# Risks`)
		await expect(blocksIn(canvasElement).at(-1)?.dataset.type).toBe("heading")
		await expectMark(field, "h1", "Risks")
		await expectNoMarkdownIn(field)
	},
})

export const ClickPlacesTheCaret = meta.story({
	tags: ["test-only"],
	args: { body: MARKED_DOCUMENT },
	play: async ({ canvasElement }) => {
		const heading = blockOfType(canvasElement, "heading")
		const shown = heading.querySelector<HTMLElement>("[tabindex]")
		const words = heading.querySelector("h2")?.firstChild
		if (!shown || !words) throw new Error("No heading text")
		const range = document.createRange()
		range.setStart(words, "Launch ".length)
		range.setEnd(words, "Launch p".length)
		const { left, top, height } = range.getBoundingClientRect()
		fireEvent.pointerDown(shown, {
			button: 0,
			clientX: left + 1,
			clientY: top + height / 2,
		})
		shown.focus()
		const field = await focusedFieldIn(canvasElement)
		await expect(fieldSelectionOf(field)?.start).toBe("## Launch ".length)
		await expectMark(field, "h2", "Launch plan")
		await expectNoMarkdownIn(field)
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
		await expect(shownIn(field)).toBe(
			"Copy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.",
		)
		selectShown(field, "7th")
		await typeInto(field, "8th")
		await expect(bodyIn(args)).toBe(
			BRIEF.replace("final on the 7th", "final on the 8th"),
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
		await typeInto(fieldIn(canvasElement), "hea")
		await expect(optionNamesIn(panel)).toEqual(["Heading#"])
		fireEvent.keyDown(fieldIn(canvasElement), { key: "Enter" })
		await waitFor(() => expect(slashPanelIn(canvasElement)).toBeNull())
		await expect(bodyIn(args)).toBe(`${BRIEF}\n\n## `)
		await expect(shownIn(fieldIn(canvasElement))).toBe("")
		await expect(fieldIn(canvasElement).querySelector("h2")).not.toBeNull()
		await expect(fieldIn(canvasElement)).toHaveFocus()
		await typeInto(fieldIn(canvasElement), "Risks")
		await expect(bodyIn(args)).toBe(`${BRIEF}\n\n## Risks`)
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
		await expect(shownIn(fieldIn(canvasElement))).toBe("/cal")
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
		await expect(bodyIn(args)).toBe(`${BRIEF}\n\n> [!NOTE]\n> `)
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
		await expect(shownIn(field)).toBe("")
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
		await expect(bodyIn(args)).toBe(BRIEF)
	},
})

export const HandleMenuDuplicates = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(blockWith(canvasElement, "What changes"), /^Duplicate/)
		await expect(bodyIn(args)).toBe(
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
		await expect(bodyIn(args)).toBe(BRIEF.replace("## Timeline\n\n", ""))
		await waitFor(() => expect(isInDocument(canvasElement)).toBe(true))
	},
})

const freshIdIn = (written = "", kept: string[]) => {
	const fresh = idsIn(written).filter((id) => !kept.includes(id))
	expect(fresh).toHaveLength(1)
	expect(fresh[0]).toMatch(FRESH_ID)
	return fresh[0]
}

export const BlockIdKeptThroughAnEdit = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The spring launch")
		selectShown(field, "14th")
		await typeInto(field, "15th")
		await expect(writtenIn(args)).toBe(
			IDENTIFIED_DOCUMENT.replace("14th", "15th"),
		)
	},
})

export const BlockIdKeptOnTheFirstHalfOfASplit = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The spring launch")
		selectInField(field, "The spring launch ".length)
		fireEvent.keyDown(field, { key: "Enter" })
		const written = writtenIn(args)
		const kept = ["launch", "spring", "rooms1", "call10"]
		const fresh = freshIdIn(written, kept)
		await expect(idsIn(written)).toEqual([
			"launch",
			"spring",
			fresh,
			"rooms1",
			"call10",
		])
		await expect(written).toMatch(/^The spring launch\s+\^spring$/m)
		await expect(written).toMatch(
			new RegExp(`^ships on the 14th\\. \\^${fresh}$`, "m"),
		)
	},
})

export const BlockIdTravelsWithAMovedBlock = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(
			blockWith(canvasElement, "The spring launch"),
			/^Move down/,
		)
		await expect(writtenIn(args)).toBe(
			[
				"# Launch plan ^launch",
				"- Book the room\n- Send the invite\n\n^rooms1",
				"The spring launch ships on the 14th. ^spring",
				"The call starts at ten. ^call10",
			].join("\n\n"),
		)
	},
})

export const BlockIdLeavesWithADeletedBlock = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
	},
	play: async ({ args, canvasElement }) => {
		await chooseInMenu(blockWith(canvasElement, "Book the room"), /^Delete/)
		await expect(writtenIn(args)).toBe(
			[
				"# Launch plan ^launch",
				"The spring launch ships on the 14th. ^spring",
				"The call starts at ten. ^call10",
			].join("\n\n"),
		)
	},
})

export const BlockIdFreshForANewBlock = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	play: async ({ args, canvasElement }) => {
		fireEvent.click(
			partOf(
				blockWith(canvasElement, "The spring launch"),
				"library-block-insert",
			),
		)
		const field = await focusedFieldIn(canvasElement)
		await typeInto(field, "Agenda first.")
		const written = writtenIn(args)
		const fresh = freshIdIn(written, ["launch", "spring", "rooms1", "call10"])
		await expect(written).toBe(
			IDENTIFIED_DOCUMENT.replace(
				"^spring\n\n",
				`^spring\n\nAgenda first. ^${fresh}\n\n`,
			),
		)
	},
})

const MARKED_INSERT = " Bring the deck. ^abc123"

const expectInsertedWithoutMarker = async (
	args: BodyArgs,
	root: HTMLElement,
	insert: (field: HTMLElement) => Promise<unknown>,
) => {
	const kept = "The call starts at ten."
	const shown = `${kept} Bring the deck.`
	const field = await focusBlockWith(root, kept)
	selectInField(field, kept.length)
	await insert(field)
	await waitFor(() => expect(shownIn(field)).toBe(shown))
	await expect(fieldSelectionOf(field)?.start).toBe(shown.length)
	await expect(writtenIn(args)).toBe(IDENTIFIED_DOCUMENT.replace(kept, shown))
	field.blur()
	await waitFor(() =>
		expect(blockWith(root, "Bring the deck")).toHaveTextContent(
			new RegExp(`^${shown}$`),
		),
	)
}

export const PastedMarkerNeverShows = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	play: ({ args, canvasElement, userEvent }) =>
		expectInsertedWithoutMarker(args, canvasElement, () =>
			userEvent.paste(MARKED_INSERT),
		),
})

export const DroppedMarkerNeverShows = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT },
	play: ({ args, canvasElement }) =>
		expectInsertedWithoutMarker(args, canvasElement, (field) =>
			inputInto(field, "insertFromDrop", MARKED_INSERT),
		),
})

const PLAIN_DOCUMENT = IDENTIFIED_DOCUMENT.replace(ID_MARKER, "")

export const PlainOpensWithoutAWrite = meta.story({
	tags: ["test-only"],
	args: { body: PLAIN_DOCUMENT, format: "plain" },
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The spring launch")
		field.blur()
		await waitFor(() =>
			expect(blockWith(canvasElement, "The spring launch")).toHaveTextContent(
				/^The spring launch ships on the 14th\.$/,
			),
		)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const PlainEditWritesNoMarker = meta.story({
	tags: ["test-only"],
	args: { body: PLAIN_DOCUMENT, format: "plain" },
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The spring launch")
		selectShown(field, "14th")
		await typeInto(field, "15th")
		await expect(writtenIn(args)).toBe(PLAIN_DOCUMENT.replace("14th", "15th"))
	},
})

export const PlainSplitWritesNoMarker = meta.story({
	tags: ["test-only"],
	args: { body: PLAIN_DOCUMENT, format: "plain" },
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The spring launch")
		selectInField(field, "The spring launch ".length)
		fireEvent.keyDown(field, { key: "Enter" })
		await expect(writtenIn(args)).toBe(
			PLAIN_DOCUMENT.replace("launch ships", "launch \n\nships"),
		)
		const second = await focusedFieldIn(blockWith(canvasElement, "ships on"))
		await expect(fieldSelectionOf(second)?.start).toBe(0)
	},
})

export const PlainPasteWritesNoMarker = meta.story({
	tags: ["test-only"],
	args: { body: PLAIN_DOCUMENT, format: "plain" },
	play: async ({ args, canvasElement, userEvent }) => {
		const kept = "The call starts at ten."
		const shown = `${kept} Bring the deck.`
		const field = await focusBlockWith(canvasElement, kept)
		selectInField(field, kept.length)
		await userEvent.paste(MARKED_INSERT)
		await waitFor(() => expect(shownIn(field)).toBe(shown))
		await expect(fieldSelectionOf(field)?.start).toBe(shown.length)
		await expect(writtenIn(args)).toBe(PLAIN_DOCUMENT.replace(kept, shown))
	},
})

export const PlainDropsLegacyMarkersAtTheFirstEdit = meta.story({
	tags: ["test-only"],
	args: { body: IDENTIFIED_DOCUMENT, format: "plain" },
	play: async ({ args, canvasElement }) => {
		await expect(
			blockWith(canvasElement, "The spring launch"),
		).toHaveTextContent(/^The spring launch ships on the 14th\.$/)
		await expect(canvasElement).not.toHaveTextContent(/\^[a-z0-9]{6}/)
		const field = await focusBlockWith(canvasElement, "The spring launch")
		selectShown(field, "14th")
		await typeInto(field, "15th")
		await expect(writtenIn(args)).toBe(PLAIN_DOCUMENT.replace("14th", "15th"))
	},
})

type AgentWritingFrameProps = BodyArgs & { body: string }

const AGENT_BLOCK = "The agent adds a line. ^agent1"

const AgentWritingFrame = ({ body, onBodyChange }: AgentWritingFrameProps) => {
	const [shown, setShown] = useState(body)
	return (
		<DocumentFrame>
			<button
				onClick={() =>
					setShown((current) =>
						current.replace(/^The call/m, `${AGENT_BLOCK}\n\nThe call`),
					)
				}
				type="button"
			>
				Agent inserts a block
			</button>
			<LibraryDocumentBlockEditor
				body={shown}
				onBodyChange={(markdown) => {
					setShown(markdown)
					onBodyChange(markdown)
				}}
			/>
		</DocumentFrame>
	)
}

export const BlockIdKeptWhenAnAgentInsertsBefore = meta.story({
	tags: ["test-only"],
	args: {
		body: "The spring launch ships on the 14th.\n\nThe call starts at ten.",
	},
	render: (args) => <AgentWritingFrame {...args} />,
	play: async ({ args, canvasElement }) => {
		const field = await focusBlockWith(canvasElement, "The call starts")
		selectShown(field, "ten")
		await typeInto(field, "nine")
		const [spring, call] = idsIn(writtenIn(args))
		await expect([spring, call]).toEqual([
			expect.stringMatching(FRESH_ID),
			expect.stringMatching(FRESH_ID),
		])
		fireEvent.click(
			within(canvasElement).getByRole("button", {
				name: "Agent inserts a block",
			}),
		)
		await waitFor(() =>
			expect(blockWith(canvasElement, "The agent adds")).toBeVisible(),
		)
		const again = await focusedFieldIn(
			blockWith(canvasElement, "The call starts"),
		)
		selectShown(again, "nine")
		await typeInto(again, "noon")
		await expect(writtenIn(args)).toBe(
			[
				`The spring launch ships on the 14th. ^${spring}`,
				AGENT_BLOCK,
				`The call starts at noon. ^${call}`,
			].join("\n\n"),
		)
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
		await expect(bodyIn(args)).toBe(
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
		await expect(bodyIn(args)).toBe(BRIEF)
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
		await expect(bodyIn(args)).toBe(BRIEF)
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
		await expect(bodyIn(args)).toBe(
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
					"A checklist, the [] item of the Text group. Check a box toggles in the markdown without opening the editor, focusing the checklist opens one field per item with the caret at the end of the last, and Backspace on an empty line under it puts the caret back there.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const checklist = blockWith(canvasElement, "Book the room")
		const [room] = within(checklist).getAllByRole("checkbox")
		fireEvent.click(room)
		await expect(bodyIn(args)).toBe(
			CHECKLIST_DOCUMENT.replace("- [ ] Book", "- [x] Book"),
		)
		await expect(
			canvasElement.querySelector('[data-slot="library-document-block-field"]'),
		).toBeNull()

		const editing = await openBlock(canvasElement, "checklist")
		const last = await waitFor(() => {
			const field = fieldsOf(editing).at(-1)
			expect(field).toHaveFocus()
			return field as HTMLElement
		})
		await expect(fieldsOf(editing).map(shownIn)).toEqual([
			"Book the room",
			"Send the invite",
		])
		await expect(fieldSelectionOf(last)?.head).toBe("Send the invite".length)

		fireEvent.click(partOf(editing, "library-block-insert"))
		const empty = await focusedFieldIn(canvasElement)
		await expect(shownIn(empty)).toBe("")
		fireEvent.keyDown(empty, { key: "Backspace" })
		await waitFor(() => {
			const back = document.activeElement as HTMLElement
			expect(shownIn(back)).toBe("Send the invite")
			expect(fieldSelectionOf(back)?.head).toBe("Send the invite".length)
		})
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
					"The document column at its narrowest, the article narrower than 794 and only the 40px padding left of the text. Check the whole handle, + and the six dots, stays inside the visible column, overlapping the text by no more than the 6px the measured handle cannot fit.",
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
		await expect(text.width).toBeLessThan(794)
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

const galleryEditingStory = (theme: "light" | "dark") => ({
	globals: { theme },
	args: {
		body: GALLERY_DOCUMENT,
		onAddImages: fn(async () => ADDED_IMAGES),
	},
	parameters: {
		docs: {
			description: {
				story: `Paper 3d${theme === "dark" ? ", dark" : ""}: a gallery being edited. Check the pill Add images and the hint over the grid, the grid ringed in the page background then the Space colour, a remove button and a caption field on every tile, and Add images appending what \`onAddImages\` returns after the last tile.`,
			},
		},
	},
	play: async ({
		args,
		canvasElement,
	}: {
		args: { onBodyChange: (body: string) => void; onAddImages?: () => void }
		canvasElement: HTMLElement
	}) => {
		const gallery = await openBlock(canvasElement, "gallery")
		const add = partOf(gallery, "library-gallery-add")
		await expect(add).toHaveAccessibleName("Add images")
		await expect(
			within(gallery).getByText("Drag to reorder. The first image leads."),
		).toBeVisible()
		await expect(slotsIn(gallery, "library-gallery-remove")).toHaveLength(3)
		await expect(
			within(gallery).getByRole("textbox", { name: "Caption of image 2" }),
		).toHaveValue("Grey linen, 990 euros")
		await expect(colourTransitionsOf(add)).toEqual([])
		fireEvent.click(add)
		await expect(args.onAddImages).toHaveBeenCalledOnce()
		await waitFor(() =>
			expect(bodyIn(args)).toBe(
				galleryWith(
					GALLERY_ITEMS.green,
					GALLERY_ITEMS.grey,
					GALLERY_ITEMS.rust,
					"- image: https://images.example.org/lamp-brass.jpg\n  alt: Brass lamp",
				),
			),
		)
		await waitFor(() =>
			expect(slotsIn(gallery, "library-gallery-remove")).toHaveLength(4),
		)
	},
})

export const GalleryEditing = meta.story(galleryEditingStory("light"))

export const GalleryEditingDark = meta.story(galleryEditingStory("dark"))

export const GalleryTileDragged = meta.story({
	globals: { theme: "light" },
	args: { body: GALLERY_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3d: the first tile held and carried onto the third. Check the lifted copy, 240 by 170 and turned 2 degrees, follows the pointer, the dashed Space colour slot marks where it lands, release writes the new order, and the arrow keys on a focused tile move it the same way.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		const [first, , third] = slotsIn(gallery, "library-gallery-tile")
		fireEvent.pointerDown(first, { button: 0, ...centreOf(first) })
		const target = centreOf(third)
		fireEvent.pointerMove(third, target)
		const lifted = await waitFor(() =>
			partOf(gallery, "library-gallery-lifted"),
		)
		await expect(lifted.getBoundingClientRect().width).toBeGreaterThan(230)
		await expect(getComputedStyle(lifted).rotate).toBe("-2deg")
		const [slot] = slotsIn(gallery, "library-gallery-slot")
		await expect(slot).toBeDefined()
		await expect(
			getComputedStyle(slot.firstElementChild as Element).borderStyle,
		).toBe("dashed")
		fireEvent.pointerUp(window, target)
		await expect(bodyIn(args)).toBe(
			galleryWith(GALLERY_ITEMS.grey, GALLERY_ITEMS.rust, GALLERY_ITEMS.green),
		)
		await expect(slotsIn(gallery, "library-gallery-lifted")).toHaveLength(0)

		const moved = await waitFor(() => {
			const tile = slotsIn(gallery, "library-gallery-tile")[2]
			expect(tile).toHaveFocus()
			return tile
		})
		fireEvent.keyDown(moved, { key: "ArrowLeft" })
		await expect(bodyIn(args)).toBe(
			galleryWith(GALLERY_ITEMS.grey, GALLERY_ITEMS.green, GALLERY_ITEMS.rust),
		)
	},
})

export const GalleryRemoveAndCaption = meta.story({
	tags: ["test-only"],
	args: { body: GALLERY_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"A caption typed on a tile and every tile removed. Check the caption lands in the gallery source, each remove drops its image, and the gallery block goes with its last image.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		fireEvent.change(
			within(gallery).getByRole("textbox", { name: "Caption of image 1" }),
			{ target: { value: "Green velvet, 1,290 euros" } },
		)
		await expect(bodyIn(args)).toBe(
			galleryWith(
				`${GALLERY_ITEMS.green}\n  caption: Green velvet, 1,290 euros`,
				GALLERY_ITEMS.grey,
				GALLERY_ITEMS.rust,
			),
		)
		fireEvent.click(
			within(gallery).getByRole("button", { name: "Remove image 2" }),
		)
		await expect(bodyIn(args)).toBe(
			galleryWith(
				`${GALLERY_ITEMS.green}\n  caption: Green velvet, 1,290 euros`,
				GALLERY_ITEMS.rust,
			),
		)
		for (const name of ["Remove image 2", "Remove image 1"])
			fireEvent.click(
				await within(blockOfType(canvasElement, "gallery")).findByRole(
					"button",
					{ name },
				),
			)
		await expect(bodyIn(args)).toBe("The sofas we kept for the lobby.")
		await expect(typesIn(canvasElement)).toEqual(["paragraph"])
	},
})

export const GalleryImagesResolved = meta.story({
	globals: { theme: "light" },
	args: {
		body: STORED_GALLERY,
		resolveImage: fn(async (src: string) => resolvedLibraryImageOf(src)),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A gallery of Library images stored as paths, each turned into a displayable address by `resolveImage`. Check every tile, the five of the grid and the one of the overflow row, shows its resolved image, the lifted tile carries it while dragging, each path is resolved once by the read-only gallery and once by the editor it opens into, and a caption edit writes the stored path back to the source.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		for (const { alt } of STORED_IMAGES) await resolvedImgIn(gallery, alt)
		await expect(slotsIn(gallery, "library-gallery-overflow")).toHaveLength(1)
		await expect(slotsIn(gallery, "gallery-resolving")).toHaveLength(0)

		const [first] = slotsIn(gallery, "library-gallery-tile")
		fireEvent.pointerDown(first, { button: 0, ...centreOf(first) })
		const { clientX, clientY } = centreOf(first)
		fireEvent.pointerMove(first, { clientX: clientX + 20, clientY })
		const lifted = await waitFor(() =>
			partOf(gallery, "library-gallery-lifted"),
		)
		await expect(lifted.style.backgroundImage).toBe(
			`url("${resolvedLibraryImageOf("images/sofa-green.jpg")}")`,
		)
		fireEvent.pointerCancel(window)
		await waitFor(() =>
			expect(slotsIn(gallery, "library-gallery-lifted")).toHaveLength(0),
		)

		fireEvent.change(
			within(gallery).getByRole("textbox", { name: "Caption of image 1" }),
			{ target: { value: "Green velvet, 1,290 euros" } },
		)
		const [green, ...rest] = STORED_ITEMS
		await expect(bodyIn(args)).toBe(
			galleryWith(`${green}\n  caption: Green velvet, 1,290 euros`, ...rest),
		)
		await resolvedImgIn(gallery, "Green velvet sofa")
		await expect(args.resolveImage).toHaveBeenCalledTimes(
			STORED_IMAGES.length * 2,
		)
	},
})

export const GalleryImageResolving = meta.story({
	globals: { theme: "light" },
	args: {
		body: STORED_GALLERY,
		resolveImage: fn(
			resolveAllBut([STORED_GREY.src], () => new Promise<string>(() => {})),
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The second image still resolving. Check its tile is the broken image surface without its icon, marked busy, every other tile shows its resolved image, and its caption field and remove button still work.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		for (const { alt } of STORED_IMAGES.filter(
			(image) => image !== STORED_GREY,
		))
			await resolvedImgIn(gallery, alt)
		const [resolving] = slotsIn(gallery, "gallery-resolving")
		await expect(resolving).toHaveAttribute("aria-busy", "true")
		await expect(resolving).toHaveAccessibleName(STORED_GREY.alt)
		await expect(resolving.querySelector("svg")).toBeNull()
		await expect(slotsIn(gallery, "gallery-resolving")).toHaveLength(1)
		await expect(slotsIn(gallery, "gallery-broken")).toHaveLength(0)

		const [green, grey, ...rest] = STORED_ITEMS
		fireEvent.change(
			within(gallery).getByRole("textbox", { name: "Caption of image 2" }),
			{ target: { value: "Grey linen, 990 euros" } },
		)
		await expect(bodyIn(args)).toBe(
			galleryWith(green, `${grey}\n  caption: Grey linen, 990 euros`, ...rest),
		)
		fireEvent.click(
			within(gallery).getByRole("button", { name: "Remove image 2" }),
		)
		await expect(bodyIn(args)).toBe(galleryWith(green, ...rest))
		await waitFor(() =>
			expect(slotsIn(gallery, "gallery-resolving")).toHaveLength(0),
		)
	},
})

export const GalleryImageFailing = meta.story({
	globals: { theme: "light" },
	args: {
		body: galleryWith(
			...STORED_ITEMS.slice(0, -1),
			`- image: ${STORED_OAK.src}`,
		),
		resolveImage: fn(
			resolveAllBut([STORED_GREY.src, STORED_OAK.src], () =>
				Promise.reject(new Error("The image file is missing")),
			),
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The second image and the sixth, in the overflow row and with no alt text, failing to resolve. Check both tiles are the broken image tile with its icon, the sixth named photo 6 like the grid names an image without alt text, and every other tile still shows its resolved image.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		const [broken, overflowBroken] = await waitFor(() => {
			const tiles = slotsIn(gallery, "gallery-broken")
			expect(tiles).toHaveLength(2)
			return tiles
		})
		await expect(broken).toHaveAccessibleName(STORED_GREY.alt)
		await expect(
			partOf(gallery, "library-gallery-overflow").contains(overflowBroken),
		).toBe(true)
		await expect(overflowBroken).toHaveAccessibleName(", photo 6")
		for (const tile of [broken, overflowBroken]) {
			await expect(tile.querySelector("svg")).not.toBeNull()
			await expect(tile).not.toHaveAttribute("aria-busy")
		}
		for (const { alt } of STORED_IMAGES.filter(
			(image) => image !== STORED_GREY && image !== STORED_OAK,
		))
			await resolvedImgIn(gallery, alt)
		await expect(slotsIn(gallery, "gallery-resolving")).toHaveLength(0)
	},
})

export const ChecklistEditing = meta.story({
	globals: { theme: "light" },
	args: { body: CHECKLIST_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3e: a checklist being edited. Check each item is a 16 box and a 15/24 field 10 apart, the done item muted and struck through in a Space colour box, the focused row's box ringed in the Space colour, Enter at the end of an item opening an empty unchecked item under it with the caret, and a box toggling in the source.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const checklist = await openBlock(canvasElement, "checklist")
		const [room, invite] = fieldsOf(checklist)
		const [first, second] = slotsIn(checklist, "library-checklist-row")
		await expect(
			second.getBoundingClientRect().top - first.getBoundingClientRect().top,
		).toBe(30)
		await expect(getComputedStyle(invite).textDecorationLine).toBe(
			"line-through",
		)
		room.focus()
		selectInField(room, "Book the room".length)
		const [box] = slotsIn(checklist, "library-checklist-box")
		await expect(["1px", "1.5px"]).toContain(
			getComputedStyle(box).borderTopWidth,
		)
		await expect(getComputedStyle(box).borderTopColor).toBe(
			resolvedRootColor("--primary"),
		)
		fireEvent.keyDown(room, { key: "Enter" })
		await expect(bodyIn(args)).toBe(
			CHECKLIST_DOCUMENT.replace(
				"- [ ] Book the room\n",
				"- [ ] Book the room\n- [ ] \n",
			),
		)
		await waitFor(() => {
			const added = fieldsOf(blockOfType(canvasElement, "checklist"))[1]
			expect(added).toHaveFocus()
			expect(shownIn(added)).toBe("")
		})
		fireEvent.click(
			slotsIn(
				blockOfType(canvasElement, "checklist"),
				"library-checklist-box",
			)[0],
		)
		await expect(bodyIn(args)).toBe(
			CHECKLIST_DOCUMENT.replace(
				"- [ ] Book the room\n",
				"- [x] Book the room\n- [ ] \n",
			),
		)
		await expect(colourTransitionsOf(box)).toEqual([])
	},
})

export const ChecklistItemMoved = meta.story({
	globals: { theme: "light" },
	args: {
		body: [
			"Before the launch call:",
			"- [ ] Book the room\n- [x] Send the invite\n- [ ] Print the agenda",
		].join("\n\n"),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3e: the pointer on an item shows its six dot grip 26 left of the box. Check dragging the grip below the last item moves it there, and the arrow keys on a focused grip move it one row at a time.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const checklist = await openBlock(canvasElement, "checklist")
		const rows = slotsIn(checklist, "library-checklist-row")
		const [grip] = slotsIn(checklist, "library-checklist-grip")
		const [box] = slotsIn(checklist, "library-checklist-box")
		if (isInBrowserRunner()) await (await realPointer()).hover(rows[0])
		await expect(
			box.getBoundingClientRect().left - grip.getBoundingClientRect().left,
		).toBe(26)
		const handle = partOf(
			checklist,
			"library-block-handle",
		).getBoundingClientRect()
		for (const each of slotsIn(checklist, "library-checklist-grip"))
			await expect(each.getBoundingClientRect().left).toBeGreaterThanOrEqual(
				handle.right,
			)
		fireEvent.pointerDown(grip, { button: 0, ...centreOf(grip) })
		const below = rows[2].getBoundingClientRect().bottom + 4
		fireEvent.pointerMove(rows[2], { clientY: below })
		await waitFor(() =>
			expect(
				slotsIn(checklist, "library-checklist-drop-indicator"),
			).toHaveLength(1),
		)
		fireEvent.pointerUp(rows[2], { clientY: below })
		await expect(bodyIn(args)).toBe(
			[
				"Before the launch call:",
				"- [x] Send the invite\n- [ ] Print the agenda\n- [ ] Book the room",
			].join("\n\n"),
		)
		const moved = await waitFor(() => {
			const last = slotsIn(
				blockOfType(canvasElement, "checklist"),
				"library-checklist-grip",
			)[2]
			expect(last).toHaveFocus()
			return last
		})
		fireEvent.keyDown(moved, { key: "ArrowUp" })
		await expect(bodyIn(args)).toBe(
			[
				"Before the launch call:",
				"- [x] Send the invite\n- [ ] Book the room\n- [ ] Print the agenda",
			].join("\n\n"),
		)
	},
})

export const CalloutToneSwitch = meta.story({
	globals: { theme: "light" },
	args: { body: CALLOUT_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3e: a callout being edited, its text under the caret and under it the Note, Tip and Warning segments on a translucent white track. Check the chosen segment is white with a hairline, and each choice switches the tone in place and writes its alert marker.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const callout = await openBlock(canvasElement, "callout")
		const tones = partOf(callout, "library-callout-tones")
		await expect(tones).toHaveAccessibleName("Callout tone")
		const note = within(tones).getByRole("button", { name: "Note" })
		await expect(note).toHaveAttribute("aria-pressed", "true")
		await expect(shownIn(fieldsOf(callout)[0])).toBe(
			"The export keeps the archived rooms too.",
		)
		fireEvent.click(within(tones).getByRole("button", { name: "Tip" }))
		await expect(bodyIn(args)).toBe(
			CALLOUT_DOCUMENT.replace("[!NOTE]", "[!TIP]"),
		)
		await waitFor(() =>
			expect(
				partOf(blockOfType(canvasElement, "callout"), "callout"),
			).toHaveAttribute("data-tone", "tip"),
		)
		fireEvent.click(
			within(
				partOf(blockOfType(canvasElement, "callout"), "library-callout-tones"),
			).getByRole("button", { name: "Warning" }),
		)
		await expect(bodyIn(args)).toBe(
			CALLOUT_DOCUMENT.replace("[!NOTE]", "[!WARNING]"),
		)
		await expect(colourTransitionsOf(note)).toEqual([])
	},
})

const tableEditingStory = (theme: "light" | "dark") => ({
	globals: { theme },
	args: { body: TABLE_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story: `Paper 3f${theme === "dark" ? ", dark" : ""}: a table being edited. Check the focused cell rings in the Space colour on the page background with the column grip above it, an empty cell reads Empty, Tab and Shift Tab walk the cells, and Add row and Add column append an empty row or column with the caret in its first cell.`,
			},
		},
	},
	play: async ({
		args,
		canvasElement,
	}: {
		args: { onBodyChange: (body: string) => void }
		canvasElement: HTMLElement
	}) => {
		const table = blockOfType(canvasElement, "table")
		const atlas = within(table).getByText("Atlas")
		fireEvent.pointerDown(atlas)
		partOf(table, "markdown-table")
			.querySelector<HTMLElement>("[tabindex]")
			?.focus()
		const editing = await waitFor(() => {
			const block = blockOfType(canvasElement, "table")
			expect(fieldsOf(block)[2]).toHaveFocus()
			return block
		})
		await expect(partOf(editing, "library-table-column-grip")).toBeVisible()
		const cell = getComputedStyle(slotsIn(editing, "library-table-cell")[2])
		await expect([cell.paddingTop, cell.paddingInlineStart]).toEqual([
			"10px",
			"10px",
		])
		await expect(
			partOf(
				within(editing).getByRole("textbox", { name: "Row 3, column 2" }),
				"library-document-placeholder",
			),
		).toHaveAttribute("data-placeholder", "Empty")
		await inputInto(fieldsOf(editing)[2], "insertText", " North")
		await expect(bodyIn(args)).toBe(
			TABLE_DOCUMENT.replace("| Atlas |", "| Atlas North |"),
		)
		fireEvent.keyDown(fieldsOf(editing)[2], { key: "Tab" })
		await waitFor(() => expect(fieldsOf(editing)[3]).toHaveFocus())
		fireEvent.keyDown(fieldsOf(editing)[3], { key: "Tab", shiftKey: true })
		await waitFor(() => expect(fieldsOf(editing)[2]).toHaveFocus())

		fireEvent.click(partOf(editing, "library-table-add-row"))
		await expect(bodyIn(args)).toBe(
			`${TABLE_DOCUMENT.replace("| Atlas |", "| Atlas North |")}\n|  |  |`,
		)
		await waitFor(() => expect(fieldsOf(editing)[6]).toHaveFocus())
		fireEvent.click(partOf(editing, "library-table-add-column"))
		await expect(bodyIn(args)).toBe(
			[
				"Rooms held for the offsite:",
				"| Room | Seats |  |\n| --- | --- | --- |\n| Atlas North | 12 |  |\n| Mira |  |  |\n|  |  |  |",
			].join("\n\n"),
		)
		await waitFor(() =>
			expect(
				within(editing).getByRole("textbox", { name: "Row 1, column 3" }),
			).toHaveFocus(),
		)
		await expect(
			colourTransitionsOf(partOf(editing, "library-table-add-row")),
		).toEqual([])
	},
})

export const TableEditing = meta.story(tableEditingStory("light"))

export const TableEditingDark = meta.story(tableEditingStory("dark"))

export const CodeLanguageChosen = meta.story({
	globals: { theme: "light" },
	args: { body: CODE_DOCUMENT },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Paper 3g: the language trigger of a code block opened. Check the 200 wide list opens under the trigger with Search languages, then Plain text, Shell, JSON, TypeScript and Python first, TypeScript ticked in the Space colour, typing filters it, and Enter writes the chosen language into the fence.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const code = await openBlock(canvasElement, "code")
		const trigger = partOf(code, "library-code-language")
		await expect(trigger).toHaveAccessibleName("Language, TypeScript")
		fireEvent.click(trigger)
		const list = await screen.findByRole("listbox")
		const names = within(list)
			.getAllByRole("option")
			.map((option) => option.textContent)
		await expect(names.slice(0, 5)).toEqual([
			"Plain text",
			"Shell",
			"JSON",
			"TypeScript",
			"Python",
		])
		await expect(
			within(list).getByRole("option", { selected: true }),
		).toHaveTextContent("TypeScript")
		const search = screen.getByRole("combobox", { name: "Search languages" })
		await waitFor(() => expect(search).toHaveFocus())
		fireEvent.change(search, { target: { value: "py" } })
		await expect(optionNamesIn(list)).toEqual(["Python"])
		fireEvent.keyDown(search, { key: "Enter" })
		await expect(bodyIn(args)).toBe(CODE_DOCUMENT.replace("```ts", "```python"))
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
		await expect(isInDocument(canvasElement)).toBe(true)
	},
})

export const CodeBodyEdited = meta.story({
	tags: ["test-only"],
	args: { body: CODE_DOCUMENT },
	parameters: {
		docs: {
			description: {
				story:
					"The body of a code block typed into. Check the field keeps the monospace face of the block, the fence takes the new body, and Copy code copies it.",
			},
		},
	},
	beforeEach: () => {
		const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue()
		return () => write.mockRestore()
	},
	play: async ({ args, canvasElement }) => {
		const code = await openBlock(canvasElement, "code")
		const [body] = fieldsOf(code)
		const pre = code.querySelector("pre") as HTMLElement
		await expect(getComputedStyle(body).fontFamily).toBe(
			getComputedStyle(pre).fontFamily,
		)
		fireEvent.change(body, {
			target: { value: "const launch = await ship()\nawait announce(launch)" },
		})
		await expect(bodyIn(args)).toBe(
			CODE_DOCUMENT.replace(
				"await ship()\n",
				"await ship()\nawait announce(launch)\n",
			),
		)
		fireEvent.click(within(code).getByRole("button", { name: "Copy code" }))
		await waitFor(() =>
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
				"const launch = await ship()\nawait announce(launch)",
			),
		)
	},
})

export const WebPageLinkUpdated = meta.story({
	globals: { theme: "light" },
	args: {
		body: WEB_PAGE_DOCUMENT,
		onLinkPreview: fn(async () => SUITES_PREVIEW),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3h: the link field over a web page card, ringed in the Space colour, Return Update at its end. Check Return hands the new link to `onLinkPreview` and the card redraws with what it returns, and Escape puts back the link the card shows.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const card = await openBlock(canvasElement, "web-page")
		const [link] = fieldsOf(card)
		await waitFor(() => expect(link).toHaveFocus())
		await expect(link).toHaveAccessibleName("Link")
		await expect(link).toHaveValue("https://www.example.org/rooms")
		fireEvent.change(link, {
			target: { value: "https://www.example.org/suites" },
		})
		fireEvent.keyDown(link, { key: "Enter" })
		await expect(args.onLinkPreview).toHaveBeenCalledWith(
			"https://www.example.org/suites",
		)
		await waitFor(() =>
			expect(bodyIn(args)).toBe(
				[
					"Where the team sleeps:",
					"```web-page\nurl: https://www.example.org/suites\ntitle: Casa do Rio, suites\nsite: Casa do Rio\n```",
				].join("\n\n"),
			),
		)
		await waitFor(() =>
			expect(
				partOf(blockOfType(canvasElement, "web-page"), "web-page-card"),
			).toHaveAccessibleName("Casa do Rio, suites"),
		)
		fireEvent.change(link, { target: { value: "https://www.example.org/bar" } })
		fireEvent.keyDown(link, { key: "Escape" })
		await expect(link).toHaveValue("https://www.example.org/suites")
		await expect(link).toHaveFocus()
	},
})

export const WebPageLinkFailed = meta.story({
	globals: { theme: "light" },
	args: {
		body: WEB_PAGE_DOCUMENT,
		onLinkPreview: fn(() => Promise.reject(new Error("offline"))),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Paper 3h, the preview refused: `onLinkPreview` rejects. Check the card keeps the previous page, the source is untouched, and the line under the field says what failed and what to do.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const card = await openBlock(canvasElement, "web-page")
		const [link] = fieldsOf(card)
		fireEvent.change(link, {
			target: { value: "https://www.example.org/nowhere" },
		})
		fireEvent.keyDown(link, { key: "Enter" })
		const failure = await waitFor(() =>
			partOf(
				blockOfType(canvasElement, "web-page"),
				"library-web-page-failure",
			),
		)
		await expect(failure).toHaveTextContent(
			"Couldn’t load a preview of this link. Check the address, then press Return to try again.",
		)
		await expect(link).toHaveAttribute("aria-describedby", failure.id)
		await expect(
			partOf(blockOfType(canvasElement, "web-page"), "web-page-card"),
		).toHaveAccessibleName("Casa do Rio, rooms and rates")
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const GalleryBeyondFive = meta.story({
	globals: { theme: "light" },
	args: { body: SEVEN_IMAGES },
	parameters: {
		docs: {
			description: {
				story:
					"A gallery of seven images being edited. The bubble shows five tiles and +2; while editing, the sixth image onward sits in tiles under the grid, inside the same ring. Check every image has its tile, remove button and caption field, the seventh moves to first place with the arrow keys, and the image left seventh can be captioned and removed.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openBlock(canvasElement, "gallery")
		await expect(slotsIn(gallery, "library-gallery-tile")).toHaveLength(7)
		await expect(slotsIn(gallery, "library-gallery-remove")).toHaveLength(7)
		await expect(slotsIn(gallery, "gallery-more")).toHaveLength(0)
		const seventh = slotsIn(gallery, "library-gallery-tile")[6]
		await expect(seventh).toHaveAccessibleName(
			"Image 7 of 7, arrow keys move it",
		)
		seventh.focus()
		for (let position = 6; position > 0; position -= 1) {
			const tile = await waitFor(() => {
				const focused = slotsIn(gallery, "library-gallery-tile")[position]
				expect(focused).toHaveFocus()
				return focused
			})
			fireEvent.keyDown(tile, { key: "ArrowLeft" })
		}
		await expect(bodyIn(args)).toBe(
			galleryWith(
				SHELF,
				GALLERY_ITEMS.green,
				GALLERY_ITEMS.grey,
				GALLERY_ITEMS.rust,
				LAMP,
				RUG,
				TABLE,
			),
		)
		fireEvent.change(
			within(gallery).getByRole("textbox", { name: "Caption of image 7" }),
			{ target: { value: "Oak table" } },
		)
		await expect(bodyIn(args)).toBe(
			galleryWith(
				SHELF,
				GALLERY_ITEMS.green,
				GALLERY_ITEMS.grey,
				GALLERY_ITEMS.rust,
				LAMP,
				RUG,
				`${TABLE}\n  caption: Oak table`,
			),
		)
		fireEvent.click(
			within(gallery).getByRole("button", { name: "Remove image 7" }),
		)
		await expect(bodyIn(args)).toBe(
			galleryWith(
				SHELF,
				GALLERY_ITEMS.green,
				GALLERY_ITEMS.grey,
				GALLERY_ITEMS.rust,
				LAMP,
				RUG,
			),
		)
	},
})

const narrowStory = (body: string, type: string) => ({
	tags: ["test-only"],
	args: { body },
	parameters: {
		docs: {
			description: {
				story: `The ${type} editor in a 320 wide window. Check neither the document column nor the page scrolls sideways.`,
			},
		},
	},
	render: (args: Parameters<typeof LibraryDocumentBlockEditor>[0]) => (
		<DocumentFrame isNarrow>
			<LibraryDocumentBlockEditor {...args} />
		</DocumentFrame>
	),
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await openBlock(canvasElement, type)
		const frame = canvasElement.firstElementChild as HTMLElement
		const column = slotIn(frame, "library-document-column")
		frame.style.width = "320px"
		try {
			await waitFor(() =>
				expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth),
			)
			await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
				document.documentElement.clientWidth,
			)
		} finally {
			frame.style.width = ""
		}
	},
})

export const GalleryEditingAt320 = meta.story(
	narrowStory(SEVEN_IMAGES, "gallery"),
)

export const TableEditingAt320 = meta.story(
	narrowStory(WIDE_TABLE_DOCUMENT, "table"),
)
