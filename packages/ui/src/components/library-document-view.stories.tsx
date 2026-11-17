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
	expectBarDragsTheWindow,
	expectBarLeavesTheWindowInPlace,
	expectHeaderTitleStep,
	expectLibrarySkeletonBar,
	expectSkeletonFilledTo,
	expectStaticHeaderBar,
	findHoverTooltip,
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
	tokenStyleIn,
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
	COMMENT_COUNTS,
	OPEN_THREADS,
} from "@workspace/ui/components/library-comments.fixtures"
import { LibraryCommentsList } from "@workspace/ui/components/library-comments-list"
import {
	type LibraryDocument,
	LibraryDocumentBar,
	LibraryDocumentView,
	type LibraryDocumentViewProps,
} from "@workspace/ui/components/library-document-view"
import type { LibraryBarComments } from "@workspace/ui/components/library-item-menu"
import { LibraryDocumentSkeleton } from "@workspace/ui/components/library-tab-states"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

const SPRING_BRIEF: LibraryDocument = {
	id: "brief",
	name: "Spring launch brief",
	detail: "MD · 4 KB · 12 min ago",
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
	onDuplicate: fn(),
	onCopy: fn(),
	onDownload: fn(),
	onShowInFolder: fn(),
	onDelete: fn(),
}

const NO_DOCUMENT_ACTIONS = {
	onOpen: undefined,
	onOpenInNewTab: undefined,
	onRename: undefined,
	onDuplicate: undefined,
	onCopy: undefined,
	onDownload: undefined,
	onShowInFolder: undefined,
	onDelete: undefined,
}

const COLLABORATORS = [
	{ id: "lea", name: "Lea Martin" },
	{ id: "noor", name: "Noor Haddad" },
]

const BAR_ACTION_NAMES = ["Download", "Duplicate"]

const barButtonNames = (bar: HTMLElement) =>
	within(bar)
		.getAllByRole("button")
		.map((button) => button.getAttribute("aria-label") ?? button.textContent)

const barIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "app-header")

const actionsIn = (canvasElement: HTMLElement) =>
	slotIn(barIn(canvasElement), "library-bar-actions")

const barTitleIn = (canvasElement: HTMLElement) =>
	barIn(canvasElement).querySelector('[aria-current="page"]') as HTMLElement

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

const openMoreIn = async (actions: HTMLElement, userEvent: UserEventObject) => {
	await userEvent.click(within(actions).getByRole("button", { name: "More" }))
	return screen.findByRole("menu", { name: "Actions for Spring launch brief" })
}

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
					"One document of the Library, read-only, in place of the grid. One static bar sits above it, 56 tall on the card surface with a 1 px rule under it: on its top line the Library path link, which calls `onBack`, a separator and the document details, over the document name; on the right, 8 apart, the people who have the document open, when `people` names any, the capsule of the image viewer's actions, Download and Duplicate, each drawn only when its callback is given, and More, drawn only when an item action is left that the capsule does not already show as a button, then the round Close, which calls `onBack` like the path link. The body is the document's markdown, rendered by the repo renderer in a 794 wide column that starts 24 below the bar and scrolls under its rule. Once the column is taller than its card it becomes a Tab stop, wears a focus ring and scrolls from the arrow, Page and Space keys.",
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
					"A document open from the Library. Check that the Library path link calls `onBack`, that More names itself in a tooltip, and that the body keeps 15/24 paragraphs with 17/24 headings.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectBarLeavesTheWindowInPlace(barIn(canvasElement))

		await userEvent.click(canvas.getByRole("button", { name: "Library" }))
		await expect(args.onBack).toHaveBeenCalledOnce()

		const more = canvas.getByRole("button", { name: "More" })
		await userEvent.hover(more)
		await expect(await findHoverTooltip()).toHaveTextContent("More")

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

const TITLE_BELOW_BAR = 24

const PRESENCE_AVATAR_SIZE = 22

const CAPSULE_BUTTON_SIZE = 28

const CLOSE_SIZE = 32

const LIGHT_SURFACE = "rgb(255, 255, 255)"

const DARK_SURFACE = "rgb(18, 18, 19)"

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const DUPLICATE_GLYPH_CORNER = "2.625"

const sizeOf = (element: Element) => {
	const box = element.getBoundingClientRect()
	return [box.width, box.height]
}

const expectBarControls = async (canvasElement: HTMLElement) => {
	const actions = actionsIn(canvasElement)
	const collaborators = slotIn(actions, "library-document-people")
	const capsule = slotIn(actions, "app-header-capsule")
	const close = within(actions).getByRole("button", { name: "Close" })

	await expect(Array.from(actions.children).slice(0, 3)).toEqual([
		collaborators,
		capsule,
		close,
	])
	await expect(getComputedStyle(actions).columnGap).toBe("8px")
	await expect(within(actions).queryByRole("separator")).toBe(null)

	const avatars = Array.from(collaborators.children)
	await expect(avatars).toHaveLength(COLLABORATORS.length)
	for (const [index, avatar] of avatars.entries()) {
		await expect(sizeOf(avatar)).toEqual([
			PRESENCE_AVATAR_SIZE,
			PRESENCE_AVATAR_SIZE,
		])
		const previous = avatars[index - 1]
		if (previous)
			await expect(
				avatar.getBoundingClientRect().left -
					previous.getBoundingClientRect().right,
			).toBe(2)
	}

	const capsuleBox = getComputedStyle(capsule)
	await expect([capsuleBox.padding, capsuleBox.columnGap]).toEqual([
		"2px",
		"2px",
	])
	await expect(barButtonNames(capsule)).toEqual([...BAR_ACTION_NAMES, "More"])
	for (const control of within(capsule).getAllByRole("button"))
		await expect(sizeOf(control)).toEqual([
			CAPSULE_BUTTON_SIZE,
			CAPSULE_BUTTON_SIZE,
		])
	await expect(sizeOf(close)).toEqual([CLOSE_SIZE, CLOSE_SIZE])
	await expect(getComputedStyle(close).backgroundColor).toBe(
		capsuleBox.backgroundColor,
	)
}

const expectBarAtRest = async (canvasElement: HTMLElement, surface: string) => {
	const page = slotIn(canvasElement, "library-document-view")
	const bar = await expectStaticHeaderBar(page)
	await expect(getComputedStyle(bar).backgroundColor).toBe(TRANSPARENT)
	await expect(getComputedStyle(page).backgroundColor).toBe(surface)

	const topLine = slotIn(bar, "app-header-top-line")
	const path = within(topLine).getByRole("button", { name: "Library" })
	const details = slotIn(topLine, "library-bar-meta")
	await expect(topLine).toHaveTextContent(`Library/${SPRING_BRIEF.detail}`)
	const topLineType = getComputedStyle(topLine)
	await expect([
		topLineType.fontSize,
		topLineType.lineHeight,
		topLineType.columnGap,
	]).toEqual(["12px", "16px", "4px"])
	for (const muted of [path, details])
		await expect(getComputedStyle(muted).color).toBe(
			tokenStyleIn(muted, "text-muted-foreground", "color"),
		)

	const title = barTitleIn(canvasElement)
	await expect(title).toHaveTextContent(SPRING_BRIEF.name)
	await expectHeaderTitleStep(title)
	await expect(title.getBoundingClientRect().top).toBe(
		topLine.getBoundingClientRect().bottom,
	)

	await expectBarControls(canvasElement)
	await expect(
		within(bar)
			.getByRole("button", { name: "Duplicate" })
			.querySelector("svg rect"),
	).toHaveAttribute("rx", DUPLICATE_GLYPH_CORNER)
	for (const control of within(bar).getAllByRole("button"))
		await expect(getComputedStyle(control).transitionDuration).toBe("0s")

	const heading = within(page).getByRole("heading", { level: 1 })
	await expect(
		heading.getBoundingClientRect().top - bar.getBoundingClientRect().bottom,
	).toBe(TITLE_BELOW_BAR)
	const column = slotIn(canvasElement, "library-document-column")
	await expect(within(column).queryByText(SPRING_BRIEF.detail)).toBe(null)
	await expect(
		slotIn(column, "markdown").getBoundingClientRect().top -
			heading.getBoundingClientRect().bottom,
	).toBe(
		Number.parseFloat(
			getComputedStyle(heading.closest("article") as HTMLElement).rowGap,
		),
	)
	await expect(column).not.toHaveAttribute("tabindex")
	await expect(column).not.toHaveAttribute("role")
	await expect(column).not.toHaveAttribute("aria-labelledby")
}

export const Light = meta.story({
	args: { people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document at rest in the light theme, as artboard I6a draws it. Check that one bar sits in the flow above the column, 56 tall on the white card with a 1 px rule in the foreground at 8 percent, that its 12/16 top line reads the muted Library path link, a separator and the details, MD · 4 KB · 12 min ago, over the 14/18 semibold document name, that the right group sets 8 apart the two 22 px collaborators 2 apart, the capsule padded by 2 around Download, Duplicate drawn as two rounded squares, and More, each 28, then the 32 px round Close on the capsule fill with no rule before it, that no control fades its colour in, that the heading starts 24 below the bar with no details line under it and the first block one column gap below the heading, and that the column, fitting its card, is neither a Tab stop nor a region.",
			},
		},
	},
	play: ({ canvasElement }) => expectBarAtRest(canvasElement, LIGHT_SURFACE),
})

export const Dark = meta.story({
	...Light.input,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same document in the dark theme, as artboard I6b draws it. Check that the bar sits on the #121213 card, that its rule is white at 8 percent, and that the geometry is the light one.",
			},
		},
	},
	play: ({ canvasElement }) => expectBarAtRest(canvasElement, DARK_SURFACE),
})

const DOCUMENT_COLUMN_WIDTH = 794

const COLUMN_BLOCK_END = 40

const COLUMN_GAP = 14

const expectLoading = async (canvasElement: HTMLElement) => {
	const region = within(canvasElement).getByRole("region", {
		name: "Loading the document…",
	})
	const bar = await expectLibrarySkeletonBar(region)
	await expect(getComputedStyle(bar).backgroundColor).toBe(TRANSPARENT)

	const lines = slotIn(region, "list-skeleton").getBoundingClientRect()
	await expect([
		lines.width,
		lines.top - bar.getBoundingClientRect().bottom,
		region.getBoundingClientRect().bottom - lines.bottom,
	]).toEqual([DOCUMENT_COLUMN_WIDTH, TITLE_BELOW_BAR, COLUMN_BLOCK_END])
	await expectSkeletonFilledTo(region, "bottom")

	const [title, firstBlock] = slotsIn(region, "list-skeleton-row")
	if (!title || !firstBlock)
		throw new Error("The skeleton does not draw its title and a first block")
	await expect(slotsIn(title, "skeleton")).toHaveLength(1)
	await expect(
		firstBlock.getBoundingClientRect().top -
			title.getBoundingClientRect().bottom,
	).toBe(COLUMN_GAP)
}

export const Loading = meta.story({
	globals: { theme: "light" },
	render: () => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryDocumentSkeleton />
			</ContentCard>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The document before its text lands, in the light theme, next to `Light`, the screen it turns into. Check that the one bar of the loaded document sits in the flow above the column, 56 tall with its rule, hidden from a screen reader, that it draws a path bar in the 16 tall top line over a title bar in the 18 tall line under it, starting 12 from the edge, and on the right a 92 by 32 capsule placeholder then, 8 further, a 32 round close placeholder 12 from the edge, that the title bar starts 24 below the bar in the 794 wide column with no details line under it, the first block one column gap of 14 below it, that the lines reach the bottom of that column, that nothing pulses under reduced motion, and that the whole is one busy region named Loading the document. Pick `LoadingDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectLoading(canvasElement),
})

export const LoadingDark = meta.story({
	...Loading.input,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same loading document in the dark theme, next to `Dark`. Check that the geometry is the light one.",
			},
		},
	},
})

const LONG_BRIEF: LibraryDocument = {
	...SPRING_BRIEF,
	body: Array.from({ length: 4 }, () => SPRING_BRIEF.body).join("\n\n"),
}

const SCROLLED_AWAY = 240

export const Scrolled = meta.story({
	args: { document: LONG_BRIEF, people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document scrolled away from its top, as artboard I6c draws it. Check that the bar is the one at rest, in place with its rule and no fade, that the column starts at the rule so nothing is drawn behind the bar, that the heading has passed above the rule, and that every bar control is still the element drawn at its centre.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "library-document-view")
		const column = slotIn(canvasElement, "library-document-column")
		await waitFor(() => expect(column).toHaveAttribute("tabindex", "0"))
		const atRest = (await expectStaticHeaderBar(page)).getBoundingClientRect()

		column.scrollTo({ top: SCROLLED_AWAY })
		await waitFor(() => expect(column.scrollTop).toBe(SCROLLED_AWAY))

		const bar = await expectStaticHeaderBar(page)
		const rule = bar.getBoundingClientRect().bottom
		await expect(bar.getBoundingClientRect()).toEqual(atRest)
		await expect(column.getBoundingClientRect().top).toBe(rule)
		await expect(
			within(page).getByRole("heading", { level: 1 }).getBoundingClientRect()
				.bottom,
		).toBeLessThan(rule)
		for (const control of within(bar).getAllByRole("button")) {
			control.scrollIntoView({ block: "nearest", inline: "nearest" })
			const box = control.getBoundingClientRect()
			const drawn = document.elementFromPoint(
				box.left + box.width / 2,
				box.top + box.height / 2,
			)
			await expect(control.contains(drawn)).toBe(true)
		}
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
					"The read-only document taller than its card, reached from the keyboard. Check that the column is a region named by the document title, that Tab moves from Close to it, that it wears a 2 px ring in the ring colour just inside its edge while it holds keyboard focus, and that the down arrow, Page Down and Space each scroll it further.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const column = slotIn(canvasElement, "library-document-column")
		await waitFor(() => expect(column).toHaveAttribute("tabindex", "0"))
		await expect(
			within(canvasElement).getByRole("region", { name: LONG_BRIEF.name }),
		).toBe(column)
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

export const NarrowLongTitle = meta.story({
	args: { document: LONG_NAMED_BRIEF, people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"A long document name in a 480 wide document, as artboard I6d draws it. Check that the name ends with an ellipsis on its one 18 px line, that the top line still reads Library, the separator and the whole details, and that the two collaborators, the three 28 px capsule buttons and the 32 px Close all stay, 12 from the end of the bar.",
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
		const bar = await expectStaticHeaderBar(
			slotIn(canvasElement, "library-document-view"),
		)
		const title = barTitleIn(canvasElement)
		await expect(title).toHaveTextContent(LONG_NAMED_BRIEF.name)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(title.getBoundingClientRect().height).toBe(18)

		const topLine = slotIn(bar, "app-header-top-line")
		const details = slotIn(topLine, "library-bar-meta")
		await expect(topLine).toHaveTextContent(
			`Library/${LONG_NAMED_BRIEF.detail}`,
		)
		await expect(details.scrollWidth).toBe(details.clientWidth)

		await expectBarControls(canvasElement)
		await expect(
			bar.getBoundingClientRect().right -
				actionsIn(canvasElement).getBoundingClientRect().right,
		).toBe(12)
	},
})

const LAUNCH_BOARD = { name: "Launch board" }

export const BoardBarAtRest = meta.story({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The bar of a board at rest, given what the board screen gives it: a name, `onBack` and Delete. It follows artboard I6a with no details: check that the bar sits in the flow, 56 tall with its rule, that its top line reads the Library path link alone, with no separator, over the board name, that the right group holds the capsule with More alone then Close, and that the canvas starts at the rule.",
			},
		},
	},
	render: ({ onBack, dragRegion }) => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<ScreenLayout
					data-slot="board-screen"
					header={
						<LibraryDocumentBar
							dragRegion={dragRegion}
							item={LAUNCH_BOARD}
							onBack={onBack}
							onDelete={fn()}
						/>
					}
					scroller={() => <div className="min-h-0 flex-1" data-slot="canvas" />}
				/>
			</ContentCard>
		</div>
	),
	play: async ({ args, canvasElement, userEvent }) => {
		const screenLayout = slotIn(canvasElement, "board-screen")
		const bar = await expectStaticHeaderBar(screenLayout)
		await expectBarLeavesTheWindowInPlace(bar)

		const topLine = slotIn(bar, "app-header-top-line")
		await expect(topLine.textContent).toBe("Library")
		await expect(slotsIn(topLine, "app-header-path-separator")).toHaveLength(0)
		await expect(barTitleIn(canvasElement)).toHaveTextContent(LAUNCH_BOARD.name)
		await expectHeaderTitleStep(barTitleIn(canvasElement))

		await expect(barButtonNames(bar)).toEqual(["Library", "More", "Close"])
		await expect(barButtonNames(slotIn(bar, "app-header-capsule"))).toEqual([
			"More",
		])
		await expect(
			slotIn(canvasElement, "canvas").getBoundingClientRect().top,
		).toBe(bar.getBoundingClientRect().bottom)

		await userEvent.click(within(bar).getByRole("button", { name: "Library" }))
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const BoardBarDragsTheWindow = BoardBarAtRest.extend({
	args: { dragRegion: "deep" },
	parameters: {
		docs: {
			description: {
				story:
					"The bar of a board given `dragRegion`, as the board screen mounts it in the frameless window. Check that the bar is the bar of `BoardBarAtRest` and carries the deep drag region, so a press on its empty stretch moves the window, and that the Library path link, More and Close are native buttons with no drag region of their own, so a press on one of them stays a click.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = await expectStaticHeaderBar(
			slotIn(canvasElement, "board-screen"),
		)

		await expect(barButtonNames(bar)).toEqual(["Library", "More", "Close"])
		await expectBarDragsTheWindow(bar)
	},
})

const expectRingOnEachBarControl = async (bar: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const keys = await realPointer()

	for (const control of within(bar).getAllByRole("button")) {
		await keys.tab()
		await expect(control).toHaveFocus()
		await expect(control.matches(":focus-visible")).toBe(true)
		const ring = getComputedStyle(control)
		await expect([ring.outlineStyle, ring.outlineWidth]).toEqual([
			"solid",
			"2px",
		])
		await expect(ring.outlineColor).toBe(
			tokenStyleIn(control, "border border-ring", "borderTopColor"),
		)
	}
}

export const BarKeyboardFocus = meta.story({
	args: { people: COLLABORATORS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document bar walked with Tab in the light theme. Check that the Library path link, Download, Duplicate, More then Close each take focus in that order and wear a 2 px ring in the Space colour while they hold it. The play drives the real keyboard, in the Vitest browser runner only.",
			},
		},
	},
	play: ({ canvasElement }) => expectRingOnEachBarControl(barIn(canvasElement)),
})

export const BarKeyboardFocusDark = meta.story({
	...BarKeyboardFocus.input,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same walk in the dark theme. Check that every control of the bar wears the same 2 px ring in the Space colour.",
			},
		},
	},
})

export const BarMatchesImageBar = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document bar given the same item actions as the image viewer's Default story. Check that the bar is 56 tall like the image bar, that Download, Duplicate, More then Close follow the Library path link in the image bar's order, that each of the four changes colour instantly and names itself in a tooltip, the capsule buttons 28 and Close 32, and that no rule stands between More and Close. Pick it to compare the two headers side by side with Overlays/LibraryLightbox Default.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = await expectStaticHeaderBar(
			slotIn(canvasElement, "library-document-view"),
		)
		const actionNames = ["Download", "Duplicate", "More", "Close"]
		await expect(barButtonNames(bar)).toEqual(["Library", ...actionNames])
		for (const name of actionNames) {
			const action = within(bar).getByRole("button", { name })
			const size = name === "Close" ? CLOSE_SIZE : CAPSULE_BUTTON_SIZE
			await expect(sizeOf(action)).toEqual([size, size])
			await expect(getComputedStyle(action).transitionDuration).toBe("0s")
			await userEvent.hover(action)
			await expect(await findHoverTooltip()).toHaveTextContent(name)
			await userEvent.unhover(action)
			await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))
		}
		await expect(within(bar).queryByRole("separator")).toBe(null)

		await userEvent.click(within(bar).getByRole("button", { name: "Download" }))
		await expect(args.onDownload).toHaveBeenCalledWith(SPRING_BRIEF)
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
					"More pressed on a document, every item action given. Check that the menu lists Open, Open in new tab, Rename, Copy, Show in folder, then Delete under its rule, that neither Download nor Duplicate, already buttons of the bar, appears in it, and that an entry hands the document to its callback.",
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
		).toEqual([
			"Open",
			"Open in new tab",
			"Rename",
			"Copy",
			"Show in folder",
			"Delete",
		])
		for (const name of BAR_ACTION_NAMES)
			await expect(within(menu).queryByRole("menuitem", { name })).toBe(null)

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Show in folder" }),
		)
		await expect(args.onShowInFolder).toHaveBeenCalledWith(SPRING_BRIEF)
	},
})

export const DuplicateFromTheBar = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Duplicate pressed in the bar of a document, every item action given, as artboards I6a to I6d draw the capsule. Check that the capsule reads Download, Duplicate then More before Close, that Duplicate wears the two rounded squares and hands the document to `onDuplicate` once, and that Copy, no longer a bar button, sits in More and hands the document to `onCopy`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const actions = actionsIn(canvasElement)
		await expect(barButtonNames(actions)).toEqual([
			...BAR_ACTION_NAMES,
			"More",
			"Close",
		])

		await userEvent.click(
			within(actions).getByRole("button", { name: "Duplicate" }),
		)
		await expect(args.onDuplicate).toHaveBeenCalledOnce()
		await expect(args.onDuplicate).toHaveBeenCalledWith(SPRING_BRIEF)

		const menu = await openMoreIn(actions, userEvent)
		await expect(
			within(menu).queryByRole("menuitem", { name: "Duplicate" }),
		).toBe(null)
		await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }))
		await expect(args.onCopy).toHaveBeenCalledWith(SPRING_BRIEF)
	},
})

export const CopyFromMore = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Copy picked from More on a document and the copy settled. Check that `onCopy` gets the document and that a screen reader hears Copied.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const actions = actionsIn(canvasElement)
		const announcement = actions.querySelector("[aria-live=polite]")
		await expect(announcement).toHaveTextContent("")

		const menu = await openMoreIn(actions, userEvent)
		await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }))

		await expect(args.onCopy).toHaveBeenCalledWith(SPRING_BRIEF)
		await waitFor(() => expect(announcement).toHaveTextContent("Copied"))
	},
})

export const DuplicateNotShownForTheItem = meta.story({
	tags: ["test-only"],
	args: { isActionShown: (_item, action) => action !== "onDuplicate" },
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given, `isActionShown` refusing Duplicate for the document. Check that neither the capsule nor More offers Duplicate.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const actions = actionsIn(canvasElement)
		await expect(barButtonNames(actions)).toEqual(["Download", "More", "Close"])

		const menu = await openMoreIn(actions, userEvent)
		await expect(
			within(menu).queryByRole("menuitem", { name: "Duplicate" }),
		).toBe(null)
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
					"A document whose name holds only spaces. Check that the bar, the heading and the More menu all say Untitled, and that an entry still hands the document its own name.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("heading", { level: 1, name: "Untitled" }),
		).toBeVisible()
		await expect(barTitleIn(canvasElement)).toHaveTextContent("Untitled")

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
	args: { ...NO_DOCUMENT_ACTIONS, onDuplicate: fn(), onDownload: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Only Download and Duplicate given, both already buttons of the capsule. Check that the capsule draws them and no More, since its menu would have nothing left to list.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(barButtonNames(barIn(canvasElement))).toEqual([
			"Library",
			"Download",
			"Duplicate",
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
					"A document open in a joined Space, where no item action is given for a member. Check that the bar keeps the Library path link and Close and draw neither Download, Duplicate nor More.",
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
					"Atlas and Mira writing in the document, as artboard 10 draws it, Mira's hover card open. Check that the presence pill sits in the bar's right group with a padding of 4 around 22 px avatars set 2 apart, that it counts the writers and reports Stop all, that each added run and its named caret paint in the agent's own colour, and that the card reports Stop Mira and Open conversation with Mira.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
		await expect(actionsIn(canvasElement)).toContainElement(presence)
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
		for (const name of ["Download", "Duplicate", "More", "Close"]) {
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

export const BarDragsTheWindow = meta.story({
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		writers: LIBRARY_WRITERS,
		dragRegion: "deep",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document given `dragRegion`, as the frameless window mounts it, two agents writing so the bar holds every control it can. Check that the bar carries the deep drag region, so a press on its empty stretch moves the window, and that the Library path link, Stop all, Download, Duplicate, More and Close are native buttons with no drag region of their own, so a press on one of them stays a click. Leave `dragRegion` out wherever a title bar already moves the window.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = await expectStaticHeaderBar(
			slotIn(canvasElement, "library-document-view"),
		)

		await expect(barButtonNames(bar)).toEqual([
			"Library",
			"Stop all",
			"Download",
			"Duplicate",
			"More",
			"Close",
		])
		await expectBarDragsTheWindow(bar)
	},
})

const BAR_COMMENTS: LibraryBarComments = {
	counts: COMMENT_COUNTS,
	isCommentMode: false,
	onCommentModeChange: fn(),
	list: (
		<LibraryCommentsList
			counts={COMMENT_COUNTS}
			onOpenThread={fn()}
			onTabChange={fn()}
			tab="open"
			threads={OPEN_THREADS}
		/>
	),
}

const expectCommentControls = async (
	canvasElement: HTMLElement,
	isCommentMode: boolean,
) => {
	const canvas = within(canvasElement)
	const controls = slotIn(canvasElement, "library-comment-bar-controls")
	const counter = within(controls).getByRole("button", {
		name: "3 open comments",
	})
	const toggle = within(controls).getByRole("button", { name: "Comment" })

	await expect(toggle).toHaveAttribute("aria-pressed", String(isCommentMode))
	await expect(
		counter.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	await expect(
		controls.compareDocumentPosition(
			canvas.getByRole("button", { name: "Download" }),
		) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
}

export const WithComments = meta.story({
	args: { comments: BAR_COMMENTS },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The bar of a document that has comment threads, as artboard Doc 1 draws it. Check the counter then the Comment button come first among the actions, before Download, that the button is not pressed, and that a press asks for comment mode.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await expectCommentControls(canvasElement, false)
		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Comment" }),
		)
		await expect(BAR_COMMENTS.onCommentModeChange).toHaveBeenCalledWith(true)
	},
})

export const WithCommentsDark = meta.story({
	args: WithComments.input.args,
	globals: { theme: "dark" },
	play: ({ canvasElement }) => expectCommentControls(canvasElement, false),
})

export const CommentModeOn = meta.story({
	args: { comments: { ...BAR_COMMENTS, isCommentMode: true } },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The same bar while comment mode is on, as artboard Doc 2 draws it. Check the Comment button is pressed and still sits before Download.",
			},
		},
	},
	play: ({ canvasElement }) => expectCommentControls(canvasElement, true),
})

export const CommentModeOnDark = meta.story({
	args: CommentModeOn.input.args,
	globals: { theme: "dark" },
	play: CommentModeOn.input.play,
})
