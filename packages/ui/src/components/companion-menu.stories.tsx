import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { shown, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	CompanionMenuContent,
	type CompanionMenuSubject,
} from "@workspace/ui/components/companion-menu"
import type { Space } from "@workspace/ui/components/space"
import {
	ContextMenu,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"

const ATLAS: CompanionMenuSubject = {
	id: "bot-atlas",
	name: "Atlas",
	sectionId: "section-build",
}

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: "blue", avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: "green", avatarSeed: "vocca" },
]

const SECTIONS = [
	{ id: "section-build", name: "Build" },
	{ id: "section-review", name: "Review" },
]

const MEMBERSHIPS = ["perso", "vocca"]

const MENU_LABEL = "Actions for Atlas"

const SURFACE =
	"flex h-32 w-64 items-center justify-center rounded-xl border border-border border-dashed bg-card text-muted-foreground text-sm"

const TRIGGER_LABEL = "Right-click this companion"

const ITEMS_IN_ORDER = [
	"Pin",
	"Open settings",
	"Duplicate",
	"Move to section",
	"Spaces",
	"Delete",
]

const openMenu = async (target: HTMLElement) => {
	fireEvent.contextMenu(target, { clientX: 120, clientY: 90 })
	return within(
		await shown(await screen.findByRole("menu", { name: MENU_LABEL })),
	)
}

const meta = preview.meta({
	title: "Overlays/CompanionMenu",
	component: CompanionMenuContent,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Everything the app can do to one companion, in one menu. It is the menu the roster row has always opened on a right-click, lifted out of that row so the same list can hang off any surface naming a companion — the roster row, the avatar in the transcript gutter, a mention inside a message. It is a `ContextMenuContent`, so it is given to a `ContextMenu` beside its trigger and never rendered on its own. The order is fixed: the pin toggle and its separator first, then Settings, Duplicate, the section branch, the spaces branch, and Delete apart at the bottom. Settings, Duplicate and Delete are always drawn — each calls the callback it was given and does nothing when it was given none. The three that answer to the host are the pin toggle, which needs `onPin` or `onUnpin` depending on `isPinned`, the section branch, which needs `onMoveToSection` or `onCreateSectionFor`, and the spaces branch, which needs `onAddToSpace` or `onRemoveFromSpace` plus spaces and memberships to list: each of those draws nothing at all without them. Outside the roster, `CompanionMenuProvider` is what hands this content to the transcript: it answers one companion id with one menu, and a surface it answers nothing for keeps the markup it had.",
			},
		},
	},
	args: {
		companion: ATLAS,
		isPinned: false,
		memberships: MEMBERSHIPS,
		sections: SECTIONS,
		spaces: SPACES,
		openSpaceId: "perso",
		onPin: fn(),
		onUnpin: fn(),
		onEdit: fn(),
		onDuplicate: fn(),
		onAddToSpace: fn(),
		onRemoveFromSpace: fn(),
		onDelete: fn(),
		onMoveToSection: fn(),
		onCreateSectionFor: fn(),
	},
	render: (args) => (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<button className={SURFACE} type="button">
						{TRIGGER_LABEL}
					</button>
				}
			/>
			<CompanionMenuContent {...args} />
		</ContextMenu>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The whole list, on a companion the app can pin, move and remove. Check the order a reader scans top to bottom — Pin, Settings, Duplicate, Move to section, Spaces, Delete — that the pin toggle is fenced off by its own separator, and that Delete is the only item toned as destructive. This is the same list `AppSidebar` opens on a roster row: a change here changes the row.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenu(canvas.getByText(TRIGGER_LABEL))

		await expect(
			menu.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(ITEMS_IN_ORDER)
	},
})

export const Pinned = meta.story({
	args: { isPinned: true },
	parameters: {
		docs: {
			description: {
				story:
					"The same companion, already pinned. Check that the first item reads Unpin rather than Pin and keeps its own separator under it — the toggle is one item that flips, never two items stacked. Pick `Default` for the companion that is not pinned yet.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenu(canvas.getByText(TRIGGER_LABEL))
		const [first] = menu.getAllByRole("menuitem")

		await expect(first).toHaveTextContent("Unpin")
	},
})

export const WithoutBranches = meta.story({
	args: {
		onPin: undefined,
		onUnpin: undefined,
		onAddToSpace: undefined,
		onRemoveFromSpace: undefined,
		onMoveToSection: undefined,
		onCreateSectionFor: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A host that wired only `onEdit`, `onDuplicate` and `onDelete` — the transcript today, which can open a companion's settings but does not own its pins, sections or spaces. Check that the menu is exactly Settings, Duplicate and Delete: the pin toggle, the section branch and the spaces branch draw nothing without a callback, and the separators around them collapse with them rather than leaving a gap. Pick `Default` for the roster host, which wires all of them.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenu(canvas.getByText(TRIGGER_LABEL))

		await expect(
			menu.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(["Open settings", "Duplicate", "Delete"])
	},
})

const LONG_TITLE = "Release manager for the whole desktop platform"

const TITLED_ATLAS: CompanionMenuSubject = { ...ATLAS, title: LONG_TITLE }

const openMenuOn = async (target: HTMLElement) => {
	fireEvent.contextMenu(target, { clientX: 120, clientY: 90 })
	return shown(await screen.findByRole("menu", { name: MENU_LABEL }))
}

const leftOf = (element: Element) => element.getBoundingClientRect().left

export const WithHeader = meta.story({
	args: { companion: TITLED_ATLAS },
	parameters: {
		docs: {
			description: {
				story:
					"The menu opened on a companion with a long title. Check that the first line is plain text naming it, name then a middle dot then the whole title, wrapping rather than cut, set on the same start edge as the items and fenced off by a separator. It is a label, not an item: the down arrow lands on Pin first. Pick `WithHeaderUntitled` for a companion with no title.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText(TRIGGER_LABEL))
		const header = slotIn(menu, "context-menu-label")
		const [pin] = within(menu).getAllByRole("menuitem")

		await expect(header).toHaveTextContent(`Atlas · ${LONG_TITLE}`)
		await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
		await expect(slotsIn(header, "bot-identity-avatar")).toHaveLength(0)
		await expect(slotsIn(header, "bot-title-badge")).toHaveLength(0)
		await expect(header.nextElementSibling).toHaveAttribute(
			"data-slot",
			"context-menu-separator",
		)
		await expect(leftOf(header)).toBe(leftOf(pin))
		await expect(getComputedStyle(header).paddingInlineStart).toBe(
			getComputedStyle(pin).paddingInlineStart,
		)

		fireEvent.keyDown(menu, { key: "ArrowDown" })

		await waitFor(() => expect(document.activeElement).toBe(pin))
	},
})

export const WithHeaderUntitled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same header on a companion with no title. Check it reads the name alone, with no dot left dangling after it. Pick `WithHeader` for a titled companion.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText(TRIGGER_LABEL))

		await expect(slotIn(menu, "context-menu-label").textContent).toBe("Atlas")
	},
})

export const HeaderLabelsItsItems = meta.story({
	args: { companion: TITLED_ATLAS },
	parameters: {
		docs: {
			description: {
				story:
					"The header read as the label of the whole menu. Check that one group holds every item and takes its name from the header, and that no group is left holding a label and nothing else.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText(TRIGGER_LABEL))
		const inside = within(menu)
		const groups = inside.getAllByRole("group")
		const [labelled] = groups

		await expect(groups).toHaveLength(1)
		await expect(labelled).toHaveAccessibleName(`Atlas · ${LONG_TITLE}`)
		await expect(within(labelled).getAllByRole("menuitem")).toEqual(
			inside.getAllByRole("menuitem"),
		)
	},
})
