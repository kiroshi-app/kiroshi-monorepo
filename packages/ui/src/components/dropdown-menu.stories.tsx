import { expect, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const MENU_LABEL = "Transcript actions"

const meta = preview.meta({
	title: "Overlays/DropdownMenu",
	component: DropdownMenuItem,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The menu a button opens, as the shadcn registry ships it on the Base UI root. It anchors under its trigger and is portalled out so it is never clipped by the bar that owns it. Base UI runs the keyboard: arrows walk the list, Escape closes and hands focus back to the trigger, and the highlighted item is the focused one, drawn by the item's own `focus:bg-accent` with no colour transition. `DropdownMenuTrigger` takes a `render` element, so the button itself opens the menu. Pick `ContextMenu` for the same items opened by a right-click.",
			},
		},
	},
	render: () => (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button aria-label="More" size="icon" variant="outline" />}
			>
				<Icons.More aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				aria-label={MENU_LABEL}
				className={STILL_UNDER_REDUCED_MOTION}
			>
				<DropdownMenuItem>
					<Icons.Copy aria-hidden="true" className="size-3.5" />
					Copy transcript
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Icons.Edit aria-hidden="true" className="size-3.5" />
					Rename
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive">
					<Icons.Delete aria-hidden="true" className="size-3.5" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Actions on one object, the destructive one separated and toned apart at the bottom. Check the menu opens under its button, that each item changes its highlight at once, and that Escape closes it and hands focus back to the button.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "More" })
		await userEvent.click(trigger)

		const menu = await screen.findByRole("menu", { name: MENU_LABEL })
		const items = within(menu).getAllByRole("menuitem")
		await expect(items.map((item) => item.textContent)).toEqual([
			"Copy transcript",
			"Rename",
			"Delete",
		])
		await expect(items[2]).toHaveAttribute("data-variant", "destructive")
		for (const item of items)
			await expect(getComputedStyle(item).transitionDuration).toBe("0s")
		await expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			trigger.getBoundingClientRect().bottom,
		)

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))
		await waitFor(() => expect(trigger).toHaveFocus())
	},
})
