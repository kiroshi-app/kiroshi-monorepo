import { type ReactNode, useState } from "react"
import { expect, fireEvent, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SUBMENU_PORTAL_GUARD,
	FRAME_POLL,
	isInBrowserRunner,
	mergeA11y,
	tokenLengthOf,
} from "@workspace/storybook/story-utils"
import { ContextMenuPressTrigger } from "@workspace/ui/components/context-menu-press-trigger"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const SURFACE =
	"flex h-40 w-72 items-center justify-center rounded-xl border border-border border-dashed bg-card text-muted-foreground text-sm"

const MENU_LABEL = "Transcript actions"

const SUBMENU_LABEL = "Move to"

const LONG_LABEL =
	"Everything this bot was asked to do since the beginning of the week"

const shownMenu = async (name: string) => {
	const menu = await screen.findByRole("menu", { name })
	await waitFor(() => expect(menu).toBeVisible(), FRAME_POLL)
	return menu
}

const openMenuOn = async (target: HTMLElement) => {
	fireEvent.contextMenu(target, { clientX: 180, clientY: 140 })
	return shownMenu(MENU_LABEL)
}

const TranscriptMenu = () => (
	<ContextMenuContent
		aria-label={MENU_LABEL}
		className={STILL_UNDER_REDUCED_MOTION}
	>
		<ContextMenuItem>
			<Icons.Copy aria-hidden="true" className="size-3.5" />
			Copy transcript
			<ContextMenuShortcut>⌘C</ContextMenuShortcut>
		</ContextMenuItem>
		<ContextMenuItem disabled>
			<Icons.Edit aria-hidden="true" className="size-3.5" />
			Rename
		</ContextMenuItem>
		<ContextMenuSub>
			<ContextMenuSubTrigger className="gap-2">
				<Icons.Folder aria-hidden="true" className="size-3.5" />
				{SUBMENU_LABEL}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className={STILL_UNDER_REDUCED_MOTION}>
				<ContextMenuItem>Inbox</ContextMenuItem>
				<ContextMenuItem>Later</ContextMenuItem>
				<ContextMenuItem>Archive</ContextMenuItem>
			</ContextMenuSubContent>
		</ContextMenuSub>
		<ContextMenuSeparator />
		<ContextMenuItem variant="destructive">
			<Icons.Delete aria-hidden="true" className="size-3.5" />
			Delete
		</ContextMenuItem>
	</ContextMenuContent>
)

const TranscriptCard = () => (
	<ContextMenu>
		<ContextMenuTrigger
			render={
				<button className={SURFACE} type="button">
					Right-click this card
				</button>
			}
		/>
		<TranscriptMenu />
	</ContextMenu>
)

const ViewMenu = () => {
	const [wrap, setWrap] = useState(true)
	const [timestamps, setTimestamps] = useState(false)
	const [density, setDensity] = useState("cosy")

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<button className={SURFACE} type="button">
						Right-click this card
					</button>
				}
			/>
			<ContextMenuContent
				aria-label={MENU_LABEL}
				className={STILL_UNDER_REDUCED_MOTION}
			>
				<ContextMenuGroup>
					<ContextMenuLabel>Transcript</ContextMenuLabel>
					<ContextMenuCheckboxItem
						checked={wrap}
						onCheckedChange={setWrap}
						closeOnClick={false}
					>
						Wrap long lines
					</ContextMenuCheckboxItem>
					<ContextMenuCheckboxItem
						checked={timestamps}
						onCheckedChange={setTimestamps}
						closeOnClick={false}
					>
						Show timestamps
					</ContextMenuCheckboxItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuRadioGroup value={density} onValueChange={setDensity}>
					<ContextMenuLabel>Density</ContextMenuLabel>
					<ContextMenuRadioItem value="cosy">Cosy</ContextMenuRadioItem>
					<ContextMenuRadioItem value="compact">Compact</ContextMenuRadioItem>
				</ContextMenuRadioGroup>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const meta = preview.meta({
	title: "Overlays/ContextMenu",
	component: ContextMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The menu a surface offers when it is asked what it can do, as the shadcn registry ships it on the Base UI root. It opens on a right-click or a long press, anchored on the point the request came from, and is portalled out so it is never clipped by the row that owns it. Base UI runs the keyboard: arrows walk the list, typing jumps by `label`, Escape closes and hands focus back, and the highlighted item is the focused one — which is why the item's own `focus:bg-accent` is the focus indicator. Three item kinds compose inside it — plain, checkbox and radio — beside `ContextMenuLabel`, `ContextMenuSeparator` and `ContextMenuShortcut`. `ContextMenuSub` nests a second menu behind one row. `ContextMenuTrigger` takes a `render` element rather than wrapping its child, so the surface itself answers the right-click. For a control that must open the same menu on a plain left-click, reach for `ContextMenuPressTrigger` instead — `AsMenuButton` shows it.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: actions on one object, the destructive one separated and toned apart at the bottom. Check the menu opens at the cursor rather than at the card's corner, that its corner is the registry's `rounded-2xl` and its items sit one padding inside it on `rounded-xl`, so the two corners stay concentric, that the shortcut hint is decorative text and not a second control, and that Escape closes it. Pick `WithCheckboxAndRadioItems` for the stateful item kinds. The app reaches the registry menu through `AppSidebar` and `SpaceSwitcher` at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		await expect(
			screen.getByRole("menuitem", { name: /Copy transcript/ }),
		).toBeVisible()

		await expect(getComputedStyle(menu).borderStartStartRadius).toBe(
			tokenLengthOf("--radius-2xl"),
		)

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const Closed = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The surface before anyone asks it anything, which is what a reader sees 99% of the time. Check that nothing of the menu is in the accessible tree while it is closed — no `menu` role, no item — so a screen reader walking the page never meets an action it cannot reach.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async () => {
		await expect(screen.queryByRole("menu")).toBeNull()
		await expect(screen.queryByRole("menuitem")).toBeNull()
	},
})

export const WithCheckboxAndRadioItems = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"The two stateful item kinds under their group labels. Checkboxes carry `closeOnClick={false}` so a reader flips several settings in one visit — the reason to put them in a menu instead of a dialog. Check that a checked item, an unchecked item and the chosen radio all report through `aria-checked` and not through the tick alone, and that ticking one does not shift the label beside it.",
			},
		},
	},
	render: () => <ViewMenu />,
	play: async ({ canvas, userEvent }) => {
		await openMenuOn(canvas.getByText("Right-click this card"))

		const wrap = screen.getByRole("menuitemcheckbox", {
			name: "Wrap long lines",
		})
		await expect(wrap).toHaveAttribute("aria-checked", "true")
		await expect(
			screen.getByRole("menuitemcheckbox", { name: "Show timestamps" }),
		).toHaveAttribute("aria-checked", "false")

		await userEvent.click(wrap)
		await expect(
			screen.getByRole("menuitemcheckbox", { name: "Wrap long lines" }),
		).toHaveAttribute("aria-checked", "false")
	},
})

export const WithSubmenu = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"One row carrying a menu of its own. Check the branch reads as `aria-haspopup` before it opens, that hovering it opens the second menu beside the first without closing it, and that the chevron is decorative. Reach for a submenu only for a set of destinations too long to sit in the parent — one level, never two.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		const branch = await within(menu).findByRole("menuitem", {
			name: SUBMENU_LABEL,
		})
		await userEvent.hover(branch)

		const submenu = await shownMenu(SUBMENU_LABEL)
		await expect(
			within(submenu).getByRole("menuitem", { name: "Archive" }),
		).toBeVisible()
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"The item states the menu draws: the focused item, which Base UI highlights by moving real focus onto it, and the disabled one, which keeps its place in the list and reports `data-disabled` rather than disappearing. Check the focused item is legible against `accent` in both themes, and that walking the list with the arrows never lands on the disabled row.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		await waitFor(() => expect(menu).toHaveFocus(), { timeout: 5000 })

		await userEvent.keyboard("{ArrowDown}")
		const copy = within(menu).getByRole("menuitem", { name: /Copy transcript/ })
		await waitFor(() => expect(copy).toHaveFocus(), { timeout: 5000 })

		await expect(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		).toHaveAttribute("data-disabled")
	},
})

const pixelsOf = (value: string) => Number.parseFloat(value)

export const RadiusLadder = meta.story({
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"The three corners side by side in one frame: the open menu, the item nested flush inside it, and a standalone `Button` beside the card. Check the item's corner is the menu's corner minus the menu's padding, so the two curves stay parallel, and that the button keeps the `lg` corner every standalone control carries rather than the menu's larger one.",
			},
		},
	},
	render: () => (
		<div className="flex items-center gap-4">
			<TranscriptCard />
			<Button variant="outline">Save</Button>
		</div>
	),
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button", { name: "Save" })
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))
		const item = within(menu).getByRole("menuitem", {
			name: /Copy transcript/,
		})
		const surface = getComputedStyle(menu)
		const outer = pixelsOf(surface.borderStartStartRadius)

		await expect(outer).toBe(pixelsOf(tokenLengthOf("--radius-2xl")))
		await expect(pixelsOf(getComputedStyle(item).borderStartStartRadius)).toBe(
			outer - pixelsOf(surface.paddingInlineStart),
		)
		await expect(getComputedStyle(button).borderStartStartRadius).toBe(
			tokenLengthOf("--radius-lg"),
		)
	},
})

export const KeyboardFocusRing = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"An item reached with the arrows. Check it wears a 2px ring in the `ring` colour drawn inside its own corner, on top of the `accent` fill, so a keyboard reader sees where they are even where the fill is faint. Pick `PointerFocusWithoutRing` for the same item reached with the pointer.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))
		await waitFor(() => expect(menu).toHaveFocus(), { timeout: 5000 })

		await userEvent.keyboard("{ArrowDown}")
		const copy = within(menu).getByRole("menuitem", { name: /Copy transcript/ })
		await waitFor(() => expect(copy).toHaveFocus(), { timeout: 5000 })

		await expect(copy.matches(":focus-visible")).toBe(true)
		const ring = getComputedStyle(copy)
		await expect(ring.outlineStyle).toBe("solid")
		await expect(ring.outlineWidth).toBe("2px")
		await expect(ring.outlineOffset).toBe("-2px")
	},
})

export const PointerFocusWithoutRing = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"An item reached with the pointer, which Base UI focuses as it highlights it. Check it keeps the `accent` fill and draws no ring, since the pointer already marks where the reader is. The play drives a real pointer through the Vitest browser runner, so it only asserts there; in Storybook, open the menu with a right-click and hover an item by hand.",
			},
		},
	},
	render: () => <TranscriptCard />,
	play: async ({ canvas }) => {
		if (!isInBrowserRunner()) return
		const pointer = (await import("vitest/browser")).userEvent
		const card = canvas.getByText("Right-click this card")

		try {
			await pointer.click(card, { button: "right" })
			const menu = await shownMenu(MENU_LABEL)
			const copy = within(menu).getByRole("menuitem", {
				name: /Copy transcript/,
			})
			await pointer.hover(copy)
			await waitFor(() => expect(copy).toHaveFocus(), { timeout: 5000 })

			await expect(copy.matches(":focus-visible")).toBe(false)
			await expect(getComputedStyle(copy).outlineStyle).toBe("none")
		} finally {
			await pointer.keyboard("{Escape}")
			await pointer.unhover(card)
			await pointer.keyboard("{Shift}")
		}
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"A label longer than any menu should be, on a panel a call site bounded with `max-w-64`. The registry popup sets `min-w-36` and no maximum, so a menu that renders names the product does not author has to cap itself — every call site that lists a space or a section name does. Check the panel stops at 16rem and the label truncates instead of pushing the menu off screen.",
			},
		},
	},
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<button className={SURFACE} type="button">
						Right-click this card
					</button>
				}
			/>
			<ContextMenuContent
				aria-label={MENU_LABEL}
				className={`max-w-64 ${STILL_UNDER_REDUCED_MOTION}`}
			>
				<ContextMenuItem label={LONG_LABEL}>
					<Icons.Folder aria-hidden="true" className="size-3.5" />
					<span className="min-w-0 truncate">{LONG_LABEL}</span>
				</ContextMenuItem>
				<ContextMenuItem>
					<Icons.Copy aria-hidden="true" className="size-3.5" />
					Copy transcript
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	),
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		await expect(menu.getBoundingClientRect().width).toBeLessThanOrEqual(256)
	},
})

const TRAILING_GAP = 24

const panelFloor = () =>
	pixelsOf(getComputedStyle(document.documentElement).fontSize) * 12

const slotOf = (row: HTMLElement, selector: string) => {
	const slot = row.querySelector<HTMLElement>(selector)
	if (!slot) throw new Error(`No trailing slot ${selector} in the row`)
	return slot
}

interface MenuOnCardProps {
	children: ReactNode
	className?: string
}

const MenuOnCard = ({ children, className }: MenuOnCardProps) => (
	<ContextMenu>
		<ContextMenuTrigger
			render={
				<button className={SURFACE} type="button">
					Right-click this card
				</button>
			}
		/>
		<ContextMenuContent
			aria-label={MENU_LABEL}
			className={`${className ?? ""} ${STILL_UNDER_REDUCED_MOTION}`}
		>
			{children}
		</ContextMenuContent>
	</ContextMenu>
)

export const MinimumWidth = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"Three short labels never shrink the panel below the shared 12rem floor the globals layer sets on every context menu panel.",
			},
		},
	},
	render: () => (
		<MenuOnCard>
			<ContextMenuItem>Cut</ContextMenuItem>
			<ContextMenuItem>Copy</ContextMenuItem>
			<ContextMenuItem>Paste</ContextMenuItem>
		</MenuOnCard>
	),
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		await expect(menu.getBoundingClientRect().width).toBeGreaterThanOrEqual(
			panelFloor(),
		)
	},
})

const TrailingSlotsMenu = () => {
	const [wrap, setWrap] = useState(true)

	return (
		<MenuOnCard>
			<ContextMenuItem>
				<Icons.Copy aria-hidden="true" className="size-3.5" />
				Copy transcript
				<ContextMenuShortcut>⌘C</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger className="gap-2">
					<Icons.Folder aria-hidden="true" className="size-3.5" />
					{SUBMENU_LABEL}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className={STILL_UNDER_REDUCED_MOTION}>
					<ContextMenuItem>Inbox</ContextMenuItem>
					<ContextMenuItem>Later</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuCheckboxItem
				checked={wrap}
				closeOnClick={false}
				onCheckedChange={setWrap}
			>
				Wrap long lines
			</ContextMenuCheckboxItem>
		</MenuOnCard>
	)
}

export const TrailingSlotsAligned = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"A shortcut, a submenu chevron and a checkbox indicator share one fixed-width trailing column, flush to the same inline-end edge, and the submenu panel keeps the 12rem floor.",
			},
		},
	},
	render: () => <TrailingSlotsMenu />,
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))
		const trailing = [
			slotOf(
				within(menu).getByRole("menuitem", { name: /Copy transcript/ }),
				'[data-slot="context-menu-shortcut"]',
			),
			slotOf(
				within(menu).getByRole("menuitem", { name: SUBMENU_LABEL }),
				"svg:last-child",
			),
			slotOf(
				within(menu).getByRole("menuitemcheckbox", { name: "Wrap long lines" }),
				":scope > span:first-child",
			),
		].map((slot) => slot.getBoundingClientRect())

		for (const rect of trailing) {
			await expect(Math.abs(rect.right - trailing[0].right)).toBeLessThan(1)
			await expect(Math.abs(rect.left - trailing[0].left)).toBeLessThan(1)
		}

		await userEvent.hover(
			within(menu).getByRole("menuitem", { name: SUBMENU_LABEL }),
		)
		const submenu = await shownMenu(SUBMENU_LABEL)
		await expect(submenu.getBoundingClientRect().width).toBeGreaterThanOrEqual(
			panelFloor(),
		)
	},
})

export const LongLabelKeepsTrailingSlot = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"A label longer than the panel's max width truncates, keeps 24px before the trailing slot, and the shortcut stays inside the panel, flush right.",
			},
		},
	},
	render: () => (
		<MenuOnCard className="max-w-64">
			<ContextMenuItem label={LONG_LABEL}>
				<Icons.Folder aria-hidden="true" className="size-3.5" />
				<span className="min-w-0 truncate">{LONG_LABEL}</span>
				<ContextMenuShortcut>⌘L</ContextMenuShortcut>
			</ContextMenuItem>
		</MenuOnCard>
	),
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))
		const row = within(menu).getByRole("menuitem")
		const label = within(row).getByText(LONG_LABEL)
		const shortcut = slotOf(row, '[data-slot="context-menu-shortcut"]')
		const panel = menu.getBoundingClientRect()
		const slot = shortcut.getBoundingClientRect()
		const slotContentStart =
			slot.left + pixelsOf(getComputedStyle(shortcut).paddingInlineStart)

		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
		await expect(slot.left).toBeGreaterThanOrEqual(panel.left)
		await expect(slot.right).toBeLessThanOrEqual(panel.right)
		await expect(
			slotContentStart - label.getBoundingClientRect().right,
		).toBeGreaterThanOrEqual(TRAILING_GAP)
	},
})

export const AsMenuButton = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"The same menu behind a control that is expected to answer a plain left-click. `ContextMenuPressTrigger` forwards the press to the trigger as a context request anchored on the button's bottom edge, so the button keeps its own role and label and the menu still comes from the registry parts. Reach for it only where the menu is the button's whole purpose; a row that also does something else keeps the right-click trigger.",
			},
		},
	},
	render: () => (
		<ContextMenu>
			<ContextMenuPressTrigger
				render={<Button variant="outline">Transcript actions</Button>}
			/>
			<TranscriptMenu />
		</ContextMenu>
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: MENU_LABEL }))

		await shownMenu(MENU_LABEL)
		await expect(
			screen.getByRole("menuitem", { name: /Copy transcript/ }),
		).toBeVisible()
	},
})
