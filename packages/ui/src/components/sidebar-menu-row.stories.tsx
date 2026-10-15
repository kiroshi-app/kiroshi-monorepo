// Call sites: packages/ui/src/components/sidebar-list-row.tsx line 73 and
// packages/ui/src/components/user-chip.tsx line 26

import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { lineHeightOf } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { SidebarMenuRow } from "@workspace/ui/components/sidebar-menu-row"
import { Item } from "@workspace/ui/components/ui/item"
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const CONVERSATION = "Release notes"

const LONG_CONVERSATION =
	"Everything the release train touched since the last freeze"

const MISSION = "Migrating the run history table"

type PanelProps = {
	children: ReactNode
	isOpen?: boolean
}

const Panel = ({ children, isOpen = true }: PanelProps) => (
	<SidebarProvider defaultOpen={isOpen}>
		<Sidebar aria-label="Workspace" collapsible="icon" role="complementary">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>{children}</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	</SidebarProvider>
)

const meta = preview.meta({
	title: "Navigation/SidebarMenuRow",
	component: SidebarMenuRow,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The one row every sidebar list is made of, composed beside the registry because the registry's `SidebarMenuButton` is a bare box. It owns three things the box does not: an icon slot that survives the icon rail, a label that leaves the accessible name behind when the text is hidden, and the tooltip that says what the rail is no longer showing. Both consumers go through it — the conversation row and the user chip — so a change here is a change to every row in the panel.",
			},
		},
	},
	args: {
		children: CONVERSATION,
		icon: <Icons.Message aria-hidden="true" />,
		label: CONVERSATION,
		onSelect: fn(),
	},
	decorators: [
		(Story, context) => (
			<Panel isOpen={context.parameters.isPanelOpen !== false}>{Story()}</Panel>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The row a reader meets in an open panel: icon, then label, then whatever the caller puts after it. Check that the row is at least 36px tall so it clears the pointer target floor, that the label truncates rather than pushing the row wider, and that taking it calls back once. Pick `Selected` for the row the screen is on. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const row = canvas.getByRole("button", { name: CONVERSATION })

		await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(36)
		await expect(row).not.toHaveAttribute("aria-current")

		await userEvent.click(row)
		await expect(args.onSelect).toHaveBeenCalledTimes(1)
	},
})

export const Selected = meta.story({
	args: { isActive: true },
	parameters: {
		docs: {
			description: {
				story:
					"The row the screen is currently on. Check that the selection is carried by `aria-current` and `data-active` as well as by the background — a reader who cannot see the tint still has to be told which row they are on. Pick `Default` for every other row of the same list. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("button", { name: CONVERSATION })

		await expect(row).toHaveAttribute("aria-current", "page")
		await expect(row).toHaveAttribute("data-active")
	},
})

export const LongContent = meta.story({
	args: { children: LONG_CONVERSATION, label: LONG_CONVERSATION },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation whose name nobody shortened. Check that the row holds its width and truncates the label on one line instead of wrapping to two or widening the panel — the panel width is the reader's, set by the resize handle, and no row is allowed to argue with it. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const label = canvas.getByText(LONG_CONVERSATION)

		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
		await expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(label),
		)
	},
})

export const WithSecondLine = meta.story({
	args: {
		below: (
			<span className="truncate text-muted-foreground text-xs">{MISSION}</span>
		),
		isIconDecorative: false,
		render: <Item render={<button type="button" />} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape the conversation row takes when the bot is on a mission: the head keeps the icon and the name, and a second line hangs under them. This is the only case where the row stops being one line, so check that the icon stays aligned with the name rather than centring itself on the whole stack, and that the row still reads as a single control rather than two. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("button", {
			name: `${CONVERSATION} ${MISSION}`,
		})

		await expect(canvas.getByText(MISSION)).toBeVisible()
		await expect(row.getBoundingClientRect().height).toBeGreaterThan(36)
	},
})
