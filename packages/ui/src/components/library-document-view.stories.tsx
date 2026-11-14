import {
	expect,
	fn,
	screen,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_LONG_NAME_WRITERS,
	LIBRARY_STORED_IMAGES,
	LIBRARY_WRITERS,
	resolvedLibraryImageOf,
} from "@workspace/ui/components/library.fixtures"
import {
	type LibraryDocument,
	LibraryDocumentBar,
	LibraryDocumentView,
	type LibraryDocumentViewProps,
} from "@workspace/ui/components/library-document-view"

const SPRING_BRIEF: LibraryDocument = {
	id: "brief",
	name: "Spring launch brief",
	detail: "1,240 words · Edited today at 10:41",
	body: [
		"The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats, so the copy, the screenshots and the release notes say the same thing.",
		"## Audience",
		"Teams of five to twenty who already keep their notes and references in a shared folder, and lose them there. They don't want another tool; they want the folder to stop forgetting.",
		"## Messages",
		"- Everything the Space holds, in one place.\n- Images and documents side by side, searchable by name.\n- Nothing to set up: drop files in and they're there.",
		"## Timeline",
		"Copy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.",
	].join("\n\n"),
}

const DOCUMENT_ACTIONS = {
	onOpen: fn(),
	onOpenInNewTab: fn(),
	onRename: fn(),
	onCopy: fn(),
	onDownload: fn(),
	onShowInFolder: fn(),
	onDelete: fn(),
}

const NO_DOCUMENT_ACTIONS = {
	onOpen: undefined,
	onOpenInNewTab: undefined,
	onRename: undefined,
	onCopy: undefined,
	onDownload: undefined,
	onShowInFolder: undefined,
	onDelete: undefined,
}

const COLLABORATORS = [
	{ id: "lea", name: "Lea Martin" },
	{ id: "noor", name: "Noor Haddad" },
]

const BAR_ACTION_NAMES = ["Download", "Copy"]

const barButtonNames = (bar: HTMLElement) =>
	within(bar)
		.getAllByRole("button")
		.map((button) => button.getAttribute("aria-label") ?? button.textContent)

const barIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "library-document-bar")

const islandsIn = (canvasElement: HTMLElement) => {
	const [context, actions] = slotsIn(barIn(canvasElement), "header-island")
	if (!context || !actions)
		throw new Error("The document bar does not draw its two islands")
	return { context, actions }
}

const TITLE_TARGET_ID = "library-document-title-target"

const barAboveTitle =
	(menuFinalFocus: () => HTMLElement | boolean) =>
	({ document: item, onBack, onRename }: LibraryDocumentViewProps) => (
		<div className="flex w-[1280px] flex-col gap-4 bg-background p-4">
			<LibraryDocumentBar
				item={item}
				menuFinalFocus={menuFinalFocus}
				onBack={onBack}
				onRename={onRename}
			/>
			<input
				aria-label="Document title"
				defaultValue={item.name}
				id={TITLE_TARGET_ID}
			/>
		</div>
	)

const pickRename = async (more: HTMLElement, userEvent: UserEventObject) => {
	await userEvent.click(more)
	const menu = await screen.findByRole("menu")
	await userEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }))
}

const meta = preview.meta({
	title: "Navigation/LibraryDocumentView",
	component: LibraryDocumentView,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"One document of the Library, read-only, in place of the grid. Two islands float over it: the context island carries the back button, named Library, then the document name; the actions island carries the people who have the document open, when `people` names any, then the image viewer's actions: Download and Copy, each drawn only when its callback is given, More, drawn only when an item action is left that the island does not already show as a button, then a rule and Close, which calls `onBack` like the back button. The body is the document's markdown, rendered by the repo renderer in a 794 wide column that starts below the islands and scrolls under them. Once the column is taller than its card it becomes a Tab stop, wears a focus ring and scrolls from the arrow, Page and Space keys.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		document: SPRING_BRIEF,
		onBack: fn(),
		...DOCUMENT_ACTIONS,
	},
	render: (args) => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryDocumentView {...args} />
			</ContentCard>
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A document open from the Library. Check that the back button, named Library, calls `onBack`, that More names itself in a tooltip, and that the body keeps 15/24 paragraphs with 17/24 headings.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Library" }))
		await expect(args.onBack).toHaveBeenCalledOnce()

		const more = canvas.getByRole("button", { name: "More" })
		await userEvent.hover(more)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("More")

		const body = slotIn(canvasElement, "markdown")
		const paragraph = body.querySelector("p") as HTMLElement
		const heading = body.querySelector("h2") as HTMLElement
		await expect(getComputedStyle(paragraph).fontSize).toBe("15px")
		await expect(getComputedStyle(paragraph).lineHeight).toBe("24px")
		await expect(getComputedStyle(heading).fontSize).toBe("17px")
		await expect(getComputedStyle(heading).lineHeight).toBe("24px")
		await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
			"Spring launch brief",
		)
	},
})

const ISLAND_INSET = 8

const ISLAND_HEIGHT = 40

const CONTENT_START = ISLAND_INSET + ISLAND_HEIGHT + ISLAND_INSET

type IslandSkin = {
	surface: string
	rule: string
}

const LIGHT_SKIN: IslandSkin = {
	surface: "rgb(255, 255, 255)",
	rule: "rgb(229, 229, 229)",
}

const DARK_SKIN: IslandSkin = {
	surface: "rgb(24, 24, 26)",
	rule: "rgba(255, 255, 255, 0.12)",
}

const DUPLICATE_GLYPH_CORNER = "2.625"

const expectIslandsAtTheEdges = async (canvasElement: HTMLElement) => {
	const page = slotIn(
		canvasElement,
		"library-document-view",
	).getBoundingClientRect()
	const { context, actions } = islandsIn(canvasElement)
	const start = context.getBoundingClientRect()
	const end = actions.getBoundingClientRect()
	await expect(start.top - page.top).toBe(ISLAND_INSET)
	await expect(end.top - page.top).toBe(ISLAND_INSET)
	await expect(start.left - page.left).toBe(ISLAND_INSET)
	await expect(page.right - end.right).toBe(ISLAND_INSET)
	await expect(start.height).toBe(ISLAND_HEIGHT)
	await expect(end.height).toBe(ISLAND_HEIGHT)
	await expect(end.left - start.right).toBeGreaterThanOrEqual(ISLAND_INSET)
}

const expectIslandsAtRest = async (
	canvasElement: HTMLElement,
	skin: IslandSkin,
) => {
	await expectIslandsAtTheEdges(canvasElement)
	const { context, actions } = islandsIn(canvasElement)
	for (const island of [context, actions])
		await expect(getComputedStyle(island).backgroundColor).toBe(skin.surface)
	await expect(
		getComputedStyle(within(actions).getByRole("separator")).backgroundColor,
	).toBe(skin.rule)

	const collaborators = slotIn(actions, "library-document-people")
	await expect(actions.firstElementChild).toBe(collaborators)
	await expect(collaborators.children).toHaveLength(COLLABORATORS.length)
	await expect(barButtonNames(actions)).toEqual([
		...BAR_ACTION_NAMES,
		"More",
		"Close",
	])
	await expect(
		within(actions)
			.getByRole("button", { name: "Copy" })
			.querySelector("svg rect"),
	).toHaveAttribute("rx", DUPLICATE_GLYPH_CORNER)

	const back = within(context).getByRole("button", { name: "Library" })
	await expect(back).toHaveTextContent(/^$/)
	await expect(context).toHaveTextContent(SPRING_BRIEF.name)
	for (const control of [back, ...within(actions).getAllByRole("button")])
		await expect(getComputedStyle(control).transitionDuration).toBe("0s")

	const title = context.querySelector('[aria-current="page"]') as HTMLElement
	await expect(getComputedStyle(title).fontSize).toBe("14px")
	await expect(getComputedStyle(title).fontWeight).toBe("500")
	await expect(getComputedStyle(title).lineHeight).toBe("16px")

	const page = slotIn(canvasElement, "library-document-view")
	const heading = within(page).getByRole("heading", { level: 1 })
	await expect(
		heading.getBoundingClientRect().top - page.getBoundingClientRect().top,
	).toBe(CONTENT_START)
	await expect(slotsIn(canvasElement, "screen-layout-fade")).toEqual([])
	await expect(
		slotIn(canvasElement, "library-document-column"),
	).not.toHaveAttribute("tabindex")
}

export const Light = meta.story({
	args: { people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document at rest in the light theme, as artboard 6a draws it. Check that the two islands sit 8 from the top and from either side, 40 tall on the card surface, that the back button is the chevron alone, named Library, before the 14/16 medium document name, that the actions island reads the two collaborators, Download, Copy drawn as two rounded squares, More, then a 1 px rule in the border colour and Close, that no control fades its colour in, that the heading starts 56 below the top with no fade over it, and that the column, fitting its card, is not a Tab stop.",
			},
		},
	},
	play: ({ canvasElement }) => expectIslandsAtRest(canvasElement, LIGHT_SKIN),
})

export const Dark = meta.story({
	...Light.input,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same document in the dark theme, as artboard 6b draws it. Check that the islands wear the raised card surface, that the rule before Close is white at 12 percent, and that the geometry is the light one.",
			},
		},
	},
	play: ({ canvasElement }) => expectIslandsAtRest(canvasElement, DARK_SKIN),
})

const LONG_BRIEF: LibraryDocument = {
	...SPRING_BRIEF,
	body: Array.from({ length: 4 }, () => SPRING_BRIEF.body).join("\n\n"),
}

const SCROLLED_AWAY = 240

const FADE_HEIGHT = 64

export const Scrolled = meta.story({
	args: { document: LONG_BRIEF, people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document scrolled away from its top, as artboard 6c draws it. Check that a 64 tall fade in the card surface covers the top of the column, that the text passes under the two islands, which stay where they were and on top, and that the fade goes once the document is back at its top.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "library-document-view")
		const column = slotIn(canvasElement, "library-document-column")
		await expect(slotsIn(canvasElement, "screen-layout-fade")).toEqual([])

		column.scrollTo({ top: SCROLLED_AWAY })
		const fade = await waitFor(() =>
			slotIn(canvasElement, "screen-layout-fade"),
		)
		const fadeBox = fade.getBoundingClientRect()
		await expect(fadeBox.top).toBe(page.getBoundingClientRect().top)
		await expect(fadeBox.height).toBe(FADE_HEIGHT)
		await expect(getComputedStyle(fade).pointerEvents).toBe("none")

		await expectIslandsAtTheEdges(canvasElement)
		const { context, actions } = islandsIn(canvasElement)
		const heading = within(page).getByRole("heading", { level: 1 })
		await expect(heading.getBoundingClientRect().top).toBeLessThan(
			context.getBoundingClientRect().top,
		)
		for (const island of [context, actions]) {
			const box = island.getBoundingClientRect()
			const drawn = document.elementFromPoint(
				box.left + box.width / 2,
				box.top + box.height / 2,
			)
			await expect(island.contains(drawn)).toBe(true)
		}

		column.scrollTo({ top: 0 })
		await waitFor(() =>
			expect(slotsIn(canvasElement, "screen-layout-fade")).toEqual([]),
		)
		column.scrollTo({ top: SCROLLED_AWAY })
		await waitFor(() =>
			expect(slotsIn(canvasElement, "screen-layout-fade")).toHaveLength(1),
		)
	},
})

const SCROLL_KEYS = ["{ArrowDown}", "{PageDown}", " "]

export const ScrolledFromTheKeyboard = meta.story({
	args: { document: LONG_BRIEF, people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The read-only document taller than its card, reached from the keyboard. Check that Tab moves from Close to the document column, that the column wears a 2 px ring in the ring colour just inside its edge while it holds keyboard focus, and that the down arrow, Page Down and Space each scroll it further.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const column = slotIn(canvasElement, "library-document-column")
		await waitFor(() => expect(column).toHaveAttribute("tabindex", "0"))
		if (!isInBrowserRunner()) return
		const keys = await realPointer()

		within(canvasElement).getByRole("button", { name: "Close" }).focus()
		await keys.tab()
		await expect(column).toHaveFocus()
		await expect(column.matches(":focus-visible")).toBe(true)
		const ring = getComputedStyle(column)
		await expect(ring.outlineStyle).toBe("solid")
		await expect(ring.outlineWidth).toBe("2px")
		await expect(ring.outlineOffset).toBe("-2px")

		for (const key of SCROLL_KEYS) {
			const from = column.scrollTop
			await keys.keyboard(key)
			await waitFor(() => expect(column.scrollTop).toBeGreaterThan(from))
		}
	},
})

const LONG_NAMED_BRIEF: LibraryDocument = {
	...SPRING_BRIEF,
	name: "Spring launch brief for every team joining the Library on the 14th, final draft",
}

const CONTROL_SIZE = 32

export const NarrowLongTitle = meta.story({
	args: { document: LONG_NAMED_BRIEF, people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"A long document name in a 480 wide document, as artboard 6d draws it. Check that the context island shrinks and ends its name with an ellipsis on one line, that every control of the actions island keeps its 32 px, and that the two islands stay 8 from either side with a gap between them.",
			},
		},
	},
	render: (args) => (
		<div
			className="flex h-[832px] w-[480px] bg-background"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryDocumentView {...args} />
			</ContentCard>
		</div>
	),
	play: async ({ canvasElement }) => {
		await expectIslandsAtTheEdges(canvasElement)
		const { context, actions } = islandsIn(canvasElement)
		const title = context.querySelector('[aria-current="page"]') as HTMLElement
		await expect(title).toHaveTextContent(LONG_NAMED_BRIEF.name)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(title.getBoundingClientRect().height).toBe(CONTROL_SIZE)

		await expect(barButtonNames(actions)).toEqual([
			"Download",
			"Copy",
			"More",
			"Close",
		])
		for (const control of [
			...within(context).getAllByRole("button"),
			...within(actions).getAllByRole("button"),
		]) {
			const box = control.getBoundingClientRect()
			await expect(box.width).toBe(CONTROL_SIZE)
			await expect(box.height).toBe(CONTROL_SIZE)
		}
	},
})

export const BarMatchesImageBar = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document islands given the same item actions as the image viewer's Default story. Check that both islands are 40 tall like the image islands, that Download, Copy, More then Close follow the back button in the image islands' order, each a 32 px button that changes colour instantly and names itself in a tooltip, and that the rule between More and Close is 16 tall and centred on its island. Pick it to compare the two headers side by side with Overlays/LibraryLightbox Default.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = barIn(canvasElement)
		const { context, actions } = islandsIn(canvasElement)
		await expect(context.getBoundingClientRect().height).toBe(40)
		await expect(actions.getBoundingClientRect().height).toBe(40)
		const actionNames = ["Library", "Download", "Copy", "More", "Close"]
		await expect(barButtonNames(bar)).toEqual(actionNames)
		for (const name of actionNames) {
			const action = within(bar).getByRole("button", { name })
			await expect(action.getBoundingClientRect().width).toBe(32)
			await expect(action.getBoundingClientRect().height).toBe(32)
			await expect(getComputedStyle(action).transitionDuration).toBe("0s")
			await userEvent.hover(action)
			await expect(await screen.findByRole("tooltip")).toHaveTextContent(name)
			await userEvent.unhover(action)
			await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))
		}

		const divider = within(bar).getByRole("separator")
		const box = divider.getBoundingClientRect()
		const row = divider.parentElement?.getBoundingClientRect()
		await expect(box.height).toBe(16)
		await expect(box.top + box.height / 2).toBeCloseTo(
			(row?.top ?? 0) + (row?.height ?? 0) / 2,
			0,
		)

		await userEvent.click(within(bar).getByRole("button", { name: "Download" }))
		await expect(args.onDownload).toHaveBeenCalledWith(SPRING_BRIEF)
		await userEvent.click(within(bar).getByRole("button", { name: "Copy" }))
		await expect(args.onCopy).toHaveBeenCalledWith(SPRING_BRIEF)
		await userEvent.click(within(bar).getByRole("button", { name: "Close" }))
		await expect(args.onBack).toHaveBeenCalledOnce()
		await expect(slotIn(canvasElement, "library-document-view")).toBeVisible()
	},
})

export const MoreMenu = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"More pressed on a document, every item action given. Check that the menu lists Open, Open in new tab, Rename, Show in folder, then Delete under its rule, that neither Download nor Copy, already buttons of the bar, appears in it, and that an entry hands the document to its callback.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "More" }))
		const menu = await screen.findByRole("menu", {
			name: "Actions for Spring launch brief",
		})
		await expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((entry) => entry.textContent),
		).toEqual(["Open", "Open in new tab", "Rename", "Show in folder", "Delete"])
		for (const name of BAR_ACTION_NAMES)
			await expect(within(menu).queryByRole("menuitem", { name })).toBe(null)

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Show in folder" }),
		)
		await expect(args.onShowInFolder).toHaveBeenCalledWith(SPRING_BRIEF)
	},
})

const WHITESPACE_NAMED_BRIEF: LibraryDocument = {
	...SPRING_BRIEF,
	name: "   ",
}

export const WhitespaceNameReadsUntitled = meta.story({
	args: { document: WHITESPACE_NAMED_BRIEF },
	parameters: {
		docs: {
			description: {
				story:
					"A document whose name holds only spaces. Check that the context island, the heading and the More menu all say Untitled, and that an entry still hands the document its own name.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByRole("heading", { level: 1, name: "Untitled" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("navigation").querySelector('[aria-current="page"]'),
		).toHaveTextContent("Untitled")

		await userEvent.click(canvas.getByRole("button", { name: "More" }))
		const menu = await screen.findByRole("menu", {
			name: "Actions for Untitled",
		})
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Show in folder" }),
		)
		await expect(args.onShowInFolder).toHaveBeenCalledWith(
			WHITESPACE_NAMED_BRIEF,
		)
	},
})

export const RenameWithFocusTarget = meta.story({
	tags: ["test-only"],
	render: barAboveTitle(
		() => document.getElementById(TITLE_TARGET_ID) ?? false,
	),
	parameters: {
		docs: {
			description: {
				story:
					"Rename picked from More while `menuFinalFocus` returns the title field. Check that the title holds focus once the menu closes and that More does not.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const more = canvas.getByRole("button", { name: "More" })
		await pickRename(more, userEvent)
		await expect(args.onRename).toHaveBeenCalledWith(SPRING_BRIEF)
		const title = canvas.getByRole("textbox", { name: "Document title" })
		await waitFor(() => expect(title).toHaveFocus())
		await expect(more).not.toHaveFocus()
	},
})

export const RenameWithFocusLeftInPlace = meta.story({
	tags: ["test-only"],
	render: barAboveTitle(() => false),
	args: {
		onRename: fn(() => {
			requestAnimationFrame(() =>
				document.getElementById(TITLE_TARGET_ID)?.focus(),
			)
		}),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Rename picked from More while `menuFinalFocus` returns `false`, Rename itself focusing the title field on the next frame. Check that the title keeps the focus Rename gave it once the menu closes.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const more = canvas.getByRole("button", { name: "More" })
		await pickRename(more, userEvent)
		const title = canvas.getByRole("textbox", { name: "Document title" })
		await waitFor(() => expect(title).toHaveFocus())
		await expect(more).not.toHaveFocus()
	},
})

export const RenameWithoutFocusTarget = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Rename picked from More with no `menuFinalFocus`. Check that More holds focus once the menu closes, and again once it closes on Escape.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const more = canvas.getByRole("button", { name: "More" })
		await pickRename(more, userEvent)
		await expect(args.onRename).toHaveBeenCalledWith(SPRING_BRIEF)
		await waitFor(() => expect(more).toHaveFocus())

		await userEvent.click(more)
		await screen.findByRole("menu")
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))
		await expect(more).toHaveFocus()
	},
})

export const OnlyBarActionsGiven = meta.story({
	tags: ["test-only"],
	args: { ...NO_DOCUMENT_ACTIONS, onCopy: fn(), onDownload: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Only Download and Copy given, both already buttons of the actions island. Check that the island draws them and no More, since its menu would have nothing left to list.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(barButtonNames(barIn(canvasElement))).toEqual([
			"Library",
			"Download",
			"Copy",
			"Close",
		])
	},
})

export const Member = meta.story({
	args: NO_DOCUMENT_ACTIONS,
	parameters: {
		docs: {
			description: {
				story:
					"A document open in a joined Space, where no item action is given for a member. Check that the islands keep the back button and Close and draw neither Download, Copy nor More.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(barButtonNames(barIn(canvasElement))).toEqual([
			"Library",
			"Close",
		])
	},
})

const AGENT_CALLBACKS = {
	onStopAll: fn(),
	onStop: fn(),
	onOpenConversation: fn(),
}

const flagNamed = (name: string) =>
	screen.getByRole("button", { name: `${name} is writing` })

const textRectsIn = (root: HTMLElement, outside: HTMLElement) => {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const rects: DOMRect[] = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (outside.contains(node) || !node.textContent?.trim()) continue
		const range = document.createRange()
		range.selectNodeContents(node)
		rects.push(...range.getClientRects())
	}
	return rects
}

const coversText = (flag: HTMLElement, root: HTMLElement) => {
	const box = flag.getBoundingClientRect()
	return textRectsIn(root, flag).some(
		(rect) =>
			rect.left < box.right &&
			rect.right > box.left &&
			rect.top < box.bottom &&
			rect.bottom > box.top,
	)
}

const blurActiveElement = () =>
	(document.activeElement as HTMLElement | null)?.blur()

const isTruncatedOnOneLine = (element: HTMLElement) =>
	element.scrollWidth > element.clientWidth &&
	element.offsetHeight ===
		Number.parseFloat(getComputedStyle(element).lineHeight)

const PRESENCE_AVATAR_SIZE = 22

export const AgentsWriting = meta.story({
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		writers: LIBRARY_WRITERS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira writing in the document, as artboard 10 draws it, Mira's hover card open. Check that the presence pill sits in the actions island with a padding of 4 around 22 px avatars set 2 apart, that it counts the writers and reports Stop all, that each added run and its named caret paint in the agent's own colour, and that the card reports Stop Mira and Open conversation with Mira.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
		await expect(islandsIn(canvasElement).actions).toContainElement(presence)
		await expect(getComputedStyle(presence).padding).toBe("4px")
		await expect(getComputedStyle(presence).columnGap).toBe("2px")
		const avatars = Array.from(
			presence.firstElementChild?.children ?? [],
			(avatar) => avatar.getBoundingClientRect(),
		)
		await expect(avatars).toHaveLength(LIBRARY_WRITERS.length)
		for (const [index, avatar] of avatars.entries()) {
			await expect(avatar.width).toBe(PRESENCE_AVATAR_SIZE)
			await expect(avatar.height).toBe(PRESENCE_AVATAR_SIZE)
			const previous = avatars[index - 1]
			if (previous) await expect(avatar.left - previous.right).toBe(2)
		}
		await userEvent.click(canvas.getByRole("button", { name: "Stop all" }))
		await expect(args.onStopAll).toHaveBeenCalledOnce()

		const [atlasRun, miraRun] = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-run']",
		)
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).not.toBe(getComputedStyle(miraRun as HTMLElement).backgroundColor)
		await expect((miraRun as HTMLElement).getBoundingClientRect().height).toBe(
			24,
		)
		const caret = slotIn(canvasElement, "library-document-caret")
		await expect(caret.getBoundingClientRect()).toMatchObject({
			width: 2,
			height: 24,
		})

		const markdown = slotIn(canvasElement, "markdown")
		await expect(coversText(flagNamed("Atlas"), markdown)).toBe(false)
		await expect(coversText(flagNamed("Mira"), markdown)).toBe(false)

		const flag = flagNamed("Mira")
		await expect(flag).toHaveTextContent("Mira")
		await expect(flag.getBoundingClientRect().height).toBe(20)
		await userEvent.hover(flag)
		const card = await screen.findByRole("dialog", {
			name: "Mira is writing…",
		})
		await expect(card).toHaveAttribute(
			"data-hue",
			String(LIBRARY_AGENTS.mira.hue),
		)
		await expect(card).toHaveTextContent("1m 04s")
		await expect(card).toHaveTextContent(
			"1 sentence added to “What we measure”",
		)
		await expect(flag).toHaveAttribute("data-popup-open")

		const stop = screen.getByRole("button", { name: "Stop Mira" })
		await userEvent.click(stop)
		await expect(args.onStop).toHaveBeenCalledWith(LIBRARY_AGENTS.mira)
		const openConversation = screen.getByRole("button", {
			name: "Open conversation",
		})
		await userEvent.click(openConversation)
		await expect(args.onOpenConversation).toHaveBeenCalledWith(
			LIBRARY_AGENTS.mira,
		)
		blurActiveElement()
		await userEvent.hover(canvas.getByRole("heading", { level: 1 }))
		await userEvent.hover(flag)
		await screen.findByRole("dialog", { name: "Mira is writing…" })
		await expect(document.activeElement).toBe(document.body)
	},
})

export const OneAgentWriting = meta.story({
	tags: ["test-only"],
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		writers: LIBRARY_WRITERS.slice(1),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Mira alone writing. Check that the pill reads 1 agent writing, and that the keyboard reaches Stop all, then the bar actions, then the flag, which opens the card on focus, then Stop Mira inside it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(
			slotIn(canvasElement, "library-document-presence"),
		).toHaveTextContent("1 agent writing")

		await userEvent.tab()
		await expect(canvas.getByRole("button", { name: "Library" })).toHaveFocus()
		await userEvent.tab()
		await expect(canvas.getByRole("button", { name: "Stop all" })).toHaveFocus()
		for (const name of ["Download", "Copy", "More", "Close"]) {
			await userEvent.tab()
			await expect(canvas.getByRole("button", { name })).toHaveFocus()
		}
		await userEvent.tab()
		const flag = flagNamed("Mira")
		await expect(flag).toHaveFocus()
		await expect(getComputedStyle(flag).outlineStyle).toBe("solid")
		await screen.findByRole("dialog", { name: "Mira is writing…" })

		await userEvent.tab()
		await expect(
			screen.getByRole("button", { name: "Stop Mira" }),
		).toHaveFocus()
	},
})

const NarrowColumn = (props: LibraryDocumentViewProps) => (
	<div
		className="flex h-[640px] w-[400px] bg-background"
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>
			<LibraryDocumentView {...props} />
		</ContentCard>
	</div>
)

export const LongAgentNameWriting = meta.story({
	tags: ["test-only"],
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		writers: LIBRARY_LONG_NAME_WRITERS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A 40-character agent name writing in a 320 wide document column. Check that the flag name and the card title each stay on one line, truncated.",
			},
		},
	},
	render: (args) => <NarrowColumn {...args} />,
	play: async ({ userEvent }) => {
		const flag = flagNamed(LIBRARY_AGENTS.longName.name)
		await expect(
			isTruncatedOnOneLine(flag.lastElementChild as HTMLElement),
		).toBe(true)

		await userEvent.hover(flag)
		const card = await screen.findByRole("dialog", {
			name: `${LIBRARY_AGENTS.longName.name} is writing…`,
		})
		await expect(
			isTruncatedOnOneLine(
				card.querySelector("[data-slot='popover-title']") as HTMLElement,
			),
		).toBe(true)
	},
})

const STORED_IMAGES = LIBRARY_STORED_IMAGES.slice(0, 3)

const LOBBY_MOODBOARD: LibraryDocument = {
	id: "moodboard",
	name: "Lobby moodboard",
	detail: "12 words · Edited today at 11:02",
	body: [
		"The sofas we kept for the lobby.",
		[
			"```gallery",
			...STORED_IMAGES.map(({ src, alt }) => `- image: ${src}\n  alt: ${alt}`),
			"```",
		].join("\n"),
	].join("\n\n"),
}

export const GalleryOfStoredImages = meta.story({
	args: {
		document: LOBBY_MOODBOARD,
		resolveImage: fn(async (src: string) => resolvedLibraryImageOf(src)),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document whose gallery stores its images as Library paths, each turned into a displayable address by `resolveImage`. Check the resolver runs once per image and every tile shows the address it resolved to.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = slotIn(canvasElement, "gallery")

		await waitFor(() =>
			expect(
				[...gallery.querySelectorAll("img")].map((img) =>
					img.getAttribute("src"),
				),
			).toEqual(STORED_IMAGES.map(({ src }) => resolvedLibraryImageOf(src))),
		)
		await expect(args.resolveImage).toHaveBeenCalledTimes(STORED_IMAGES.length)
		for (const { src } of STORED_IMAGES)
			await expect(args.resolveImage).toHaveBeenCalledWith(src)
	},
})
