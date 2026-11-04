import { renderToStaticMarkup } from "react-dom/server"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	settled,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	barIn,
	boxOf,
	unpinnedTabsIn,
} from "@workspace/storybook/tab-drag-gesture"
import {
	AppTitleBar,
	type AppTitleBarProps,
} from "@workspace/ui/components/app-title-bar"
import {
	BUG_BASH,
	DESIGN_REVIEW,
	HIRING_PLAN,
	INVOICE_EXPORT,
	LOGIN_REDIRECT,
	LONG_DOCUMENT_NAME,
	LONG_DOCUMENT_NAME_TAB,
	MOODBOARD,
	MOODBOARD_TAB,
	QUARTERLY_REPORT,
	QUARTERLY_REPORT_TAB,
	RELEASE_NOTES,
	TITLE_BAR,
	WEEKLY_PLANNING,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { Icons } from "@workspace/ui/components/icons"
import {
	type TitleBarTabDescriptor,
	TitleBarTabs,
} from "@workspace/ui/components/title-bar-tabs"

const ICON_SLOT = 16

const GLYPH_ICON = 15

const LINE_HEIGHT = 16

const meta = preview.meta({
	title: "Navigation/TitleBarTabs",
	component: TitleBarTabs,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The tab row of the title bar. A tab carrying a descriptor, plain data naming a kind, a name and an icon, draws that icon and that name in the tab, in the overflow menu and in the drag chip, and every accessible name reads the name. A tab without one draws its own title and icon.",
			},
		},
	},
	args: {
		onSelectTab: fn(),
		onCloseTab: fn(),
		onReorderTabs: fn(),
		onNewTab: fn(),
	},
	render: (args) => (
		<div className="surface-shell relative h-10 w-320">
			<AppTitleBar {...TITLE_BAR} {...args} />
		</div>
	),
})

type DescriptorPlayContext = {
	canvasElement: HTMLElement
}

const glyphOf = (root: ParentNode) =>
	Array.from(root.querySelectorAll("path"), (path) => path.getAttribute("d"))

const glyphNamedBy = ({ icon }: TitleBarTabDescriptor) => {
	const Glyph = Icons[icon]
	const template = document.createElement("template")
	template.innerHTML = renderToStaticMarkup(<Glyph />)
	return glyphOf(template.content)
}

const expectIconOf = async (
	owner: HTMLElement,
	descriptor: TitleBarTabDescriptor,
	slotSide: number,
) => {
	const slot = owner.querySelector<HTMLElement>('span[aria-hidden="true"]')
	if (!slot) throw new Error(`No icon slot in ${owner.textContent}`)
	await expect(boxOf(slot).width).toBe(slotSide)
	await expect(boxOf(slot).height).toBe(slotSide)
	const icon = slot.querySelector("svg")
	if (!icon) throw new Error(`No icon in ${owner.textContent}`)
	await expect(boxOf(icon).width).toBe(GLYPH_ICON)
	await expect(boxOf(icon).height).toBe(GLYPH_ICON)
	await expect(glyphOf(icon)).toEqual(glyphNamedBy(descriptor))
}

const tabNamed = (canvasElement: HTMLElement, name: string) =>
	within(barIn(canvasElement)).getByRole("tab", { name })

const expectTabDrawing = async (
	canvasElement: HTMLElement,
	descriptor: TitleBarTabDescriptor,
) => {
	const tab = tabNamed(canvasElement, descriptor.name)
	await expect(tab).toHaveTextContent(descriptor.name)
	await expect(tab).toBeVisible()
	await expectIconOf(tab, descriptor, ICON_SLOT)
	await expect(
		within(barIn(canvasElement)).getByRole("button", {
			name: `Close ${descriptor.name}`,
		}),
	).toBeInTheDocument()
	return tab
}

const DOCUMENT_TABS = {
	tabs: [QUARTERLY_REPORT_TAB, RELEASE_NOTES],
	activeTabId: QUARTERLY_REPORT_TAB.id,
} satisfies Partial<AppTitleBarProps>

export const LibraryDocumentTab = meta.story({
	args: DOCUMENT_TABS,
	parameters: {
		docs: {
			description: {
				story:
					"A Library document open in a tab beside a conversation. Check the document draws the File glyph in the 16px icon slot and its file name as the label, that Close and the move announcement read the file name, and that the conversation tab without a descriptor keeps its own title. Pick `LibraryImageTab` for an image.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		const tab = await expectTabDrawing(canvasElement, QUARTERLY_REPORT)
		await expect(
			tabNamed(canvasElement, RELEASE_NOTES.title),
		).toHaveTextContent(RELEASE_NOTES.title)

		tab.focus()
		fireEvent.keyDown(tab, { key: "ArrowRight", altKey: true })
		await waitFor(() =>
			expect(
				slotIn(document.body, "title-bar-tab-move-announcement"),
			).toHaveTextContent(`${QUARTERLY_REPORT.name} moved to position 2 of 2`),
		)
	},
})

const WHITESPACE_NAMED_DOCUMENT_TAB = {
	...QUARTERLY_REPORT_TAB,
	descriptor: { ...QUARTERLY_REPORT, name: "   " },
}

export const WhitespaceDocumentNameReadsUntitled = meta.story({
	args: {
		tabs: [WHITESPACE_NAMED_DOCUMENT_TAB, RELEASE_NOTES],
		activeTabId: WHITESPACE_NAMED_DOCUMENT_TAB.id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A Library document whose name holds only spaces, open in a tab beside a conversation. Check the tab, its accessible name, Close and the move announcement read Untitled, and that the conversation tab without a descriptor keeps its own title.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		const tab = tabNamed(canvasElement, "Untitled")
		await expect(tab).toHaveTextContent("Untitled")
		await expect(
			within(barIn(canvasElement)).getByRole("button", {
				name: "Close Untitled",
			}),
		).toBeInTheDocument()
		await expect(
			tabNamed(canvasElement, RELEASE_NOTES.title),
		).toHaveTextContent(RELEASE_NOTES.title)

		tab.focus()
		fireEvent.keyDown(tab, { key: "ArrowRight", altKey: true })
		await waitFor(() =>
			expect(
				slotIn(document.body, "title-bar-tab-move-announcement"),
			).toHaveTextContent("Untitled moved to position 2 of 2"),
		)
	},
})

const IMAGE_TABS = {
	tabs: [MOODBOARD_TAB, RELEASE_NOTES],
	activeTabId: MOODBOARD_TAB.id,
	incomingTab: { tab: QUARTERLY_REPORT_TAB, clientX: 0 },
} satisfies Partial<AppTitleBarProps>

export const LibraryImageTab = meta.story({
	args: IMAGE_TABS,
	parameters: {
		docs: {
			description: {
				story:
					"A Library image open in a tab while a Library document from another window is held over the strip. Check the image draws the Image glyph in the 16px icon slot and its file name as the label, and that the drag chip of the held document draws the File glyph and its file name. Pick `LibraryDocumentTab` for a document alone.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		await expectTabDrawing(canvasElement, MOODBOARD)

		const chip = await waitFor(() =>
			slotIn(barIn(canvasElement), "title-bar-tab-chip"),
		)
		await expect(slotIn(chip, "title-bar-tab-chip-title")).toHaveTextContent(
			QUARTERLY_REPORT.name,
		)
		await expectIconOf(chip, QUARTERLY_REPORT, ICON_SLOT)
	},
})

const CROWDED_TABS = [
	LONG_DOCUMENT_NAME_TAB,
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
	MOODBOARD_TAB,
]

const LONG_NAME_TABS = {
	tabs: CROWDED_TABS,
	activeTabId: LONG_DOCUMENT_NAME_TAB.id,
} satisfies Partial<AppTitleBarProps>

export const LongNameTruncated = meta.story({
	args: LONG_NAME_TABS,
	render: (args) => (
		<div className="surface-shell relative h-10 w-150">
			<AppTitleBar {...TITLE_BAR} {...args} />
		</div>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A Library document whose file name is wider than its tab, in a strip too narrow for every tab. Check the name holds one line and ends on an ellipsis while the tab's accessible name keeps it whole, and that the overflow menu draws the Library image left out of the strip with the Image glyph and its file name.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const tab = await expectTabDrawing(canvasElement, LONG_DOCUMENT_NAME)
		await expect(tab).toHaveAccessibleName(LONG_DOCUMENT_NAME.name)
		const label = Array.from(tab.querySelectorAll("span")).find(
			(span) => span.textContent === LONG_DOCUMENT_NAME.name,
		)
		if (!label) throw new Error("The tab draws no name")
		const style = getComputedStyle(label)
		await expect(style.whiteSpace).toBe("nowrap")
		await expect(style.textOverflow).toBe("ellipsis")
		await expect(boxOf(label).height).toBe(LINE_HEIGHT)
		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)

		await expect(unpinnedTabsIn(canvasElement)).not.toHaveLength(
			CROWDED_TABS.length,
		)
		await userEvent.click(slotIn(barIn(canvasElement), "title-bar-overflow"))
		const menu = await settled(await screen.findByRole("menu"))
		const row = within(menu).getByRole("menuitem", {
			name: MOODBOARD.name,
		})
		await expect(row).toHaveTextContent(MOODBOARD.name)
		await expectIconOf(row, MOODBOARD, ICON_SLOT)
	},
})
