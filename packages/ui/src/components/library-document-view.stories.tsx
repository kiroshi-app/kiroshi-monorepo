import {
	expect,
	fn,
	screen,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_FINISHED,
	LIBRARY_LONG_NAME_FINISHED,
	LIBRARY_LONG_NAME_WRITERS,
	LIBRARY_WRITERS,
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

const BAR_ACTION_NAMES = ["Download", "Copy"]

const barButtonNames = (bar: HTMLElement) =>
	within(bar)
		.getAllByRole("button")
		.map((button) => button.getAttribute("aria-label") ?? button.textContent)

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
					"One document of the Library, read-only, in place of the grid. The bar carries the breadcrumb back to the Library, then the image viewer's actions: Download and Copy, each drawn only when its callback is given, More, drawn only when an item action is left that the bar does not already show as a button, and Close, which calls `onBack` like the breadcrumb; the body is the document's markdown, rendered by the repo renderer in a 640 wide column.",
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
					"A document open from the Library, as artboard 9 draws it. Check that Library in the breadcrumb calls `onBack`, that More names itself in a tooltip, and that the body keeps 15/24 paragraphs with 17/24 headings.",
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

export const BarMatchesImageBar = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document bar given the same item actions as the image viewer's Default story. Check that it is 56 tall like the image bar, that Download, Copy, More then Close follow the breadcrumb in the image bar's order, each a 32 px button that changes colour instantly and names itself in a tooltip, and that the divider between More and Close is 20 tall and centred on the row. Pick it to compare the two bars side by side with Overlays/LibraryLightbox Default.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const bar = canvas.getByRole("navigation").parentElement as HTMLElement
		await expect(bar.getBoundingClientRect().height).toBe(56)
		await expect(barButtonNames(bar)).toEqual([
			"Library",
			"Download",
			"Copy",
			"More",
			"Close",
		])
		for (const name of ["Download", "Copy", "More", "Close"]) {
			const action = within(bar).getByRole("button", { name })
			await expect(action.getBoundingClientRect().width).toBe(32)
			await expect(action.getBoundingClientRect().height).toBe(32)
			await expect(getComputedStyle(action).transitionProperty).toBe("none")
			await userEvent.hover(action)
			await expect(await screen.findByRole("tooltip")).toHaveTextContent(name)
			await userEvent.unhover(action)
			await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))
		}

		const divider = within(bar).getByRole("separator")
		const box = divider.getBoundingClientRect()
		const row = divider.parentElement?.getBoundingClientRect()
		await expect(box.height).toBe(20)
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
					"Only Download and Copy given, both already buttons of the bar. Check that the bar draws them and no More, since its menu would have nothing left to list.",
			},
		},
	},
	play: async ({ canvas }) => {
		const bar = canvas.getByRole("navigation").parentElement as HTMLElement
		await expect(barButtonNames(bar)).toEqual([
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
					"A document open in a joined Space, where no item action is given for a member. Check that the bar keeps the breadcrumb and Close and draws neither Download, Copy nor More.",
			},
		},
	},
	play: async ({ canvas }) => {
		const bar = canvas.getByRole("navigation").parentElement as HTMLElement
		await expect(barButtonNames(bar)).toEqual(["Library", "Close"])
	},
})

const AGENT_CALLBACKS = {
	onStopAll: fn(),
	onStop: fn(),
	onOpenConversation: fn(),
	onUndoAll: fn(),
	onDone: fn(),
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
					"Atlas and Mira writing in the document, as artboard 10 draws it, Mira's hover card open. Check that the presence pill counts the writers and reports Stop all, that each added run and its named caret paint in the agent's own colour, and that the card reports Stop Mira and Open conversation with Mira.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
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

export const AgentFinished = meta.story({
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		finished: LIBRARY_FINISHED,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira done writing, as artboard 11 draws it. Check that the presence pill and the carets are gone, that each added run keeps its agent's colour as plain text, and that the finished bar names both agents and reports Undo all and Done.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.queryByRole("button", { name: "Stop all" })).toBe(null)
		await expect(
			canvasElement.querySelector("[data-slot='library-document-caret']"),
		).toBe(null)
		await expect(canvas.getByRole("button", { name: "More" })).toBeVisible()

		const [atlasRun] = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-run']",
		)
		const block = (atlasRun as HTMLElement).closest("li, p") as HTMLElement
		await expect(getComputedStyle(atlasRun as HTMLElement).color).not.toBe(
			getComputedStyle(block).color,
		)
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).toBe("rgba(0, 0, 0, 0)")

		const bar = slotIn(canvasElement, "library-document-finished")
		await expect(bar).toHaveTextContent("Atlas and Mira finished")
		await expect(bar).toHaveTextContent("2 sentences added · 1m 48s")
		await expect(bar.getBoundingClientRect()).toMatchObject({
			width: 640,
			height: 52,
		})

		await userEvent.click(canvas.getByRole("button", { name: "Undo all" }))
		await expect(args.onUndoAll).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Done" }))
		await expect(args.onDone).toHaveBeenCalledOnce()
		blurActiveElement()
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

export const LongAgentNameFinished = meta.story({
	tags: ["test-only"],
	args: {
		...AGENT_CALLBACKS,
		document: LIBRARY_AGENT_DOCUMENT,
		finished: LIBRARY_LONG_NAME_FINISHED,
	},
	parameters: {
		a11y: {
			config: {
				rules: [{ id: "scrollable-region-focusable", reviewOnFail: true }],
			},
		},
		docs: {
			description: {
				story:
					"A 40-character agent name among four finished agents in a 320 wide document column. Check that the finished bar title names the first two and counts the others on one line, truncated.",
			},
		},
	},
	render: (args) => <NarrowColumn {...args} />,
	play: async ({ canvasElement }) => {
		const title = slotIn(
			canvasElement,
			"library-document-finished",
		).querySelector("p") as HTMLElement
		await expect(title).toHaveTextContent(
			`${LIBRARY_AGENTS.longName.name}, Mira and 2 others finished`,
		)
		await expect(isTruncatedOnOneLine(title)).toBe(true)
	},
})
