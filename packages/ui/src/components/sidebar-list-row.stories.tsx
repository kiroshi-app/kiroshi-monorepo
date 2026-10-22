import type { ReactNode } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	isInBrowserRunner,
} from "@workspace/storybook/story-utils"
import {
	BotMissionStrip,
	BotTitleBadge,
} from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@workspace/ui/components/ui/sidebar"

const BOX_ON_B1E22DA1 = {
	open: {
		height: 52,
		padding: "6px 12px 6px 6px",
		gap: "10px",
		radius: "10px",
		border: "0px",
	},
	openWithStrips: {
		height: 108,
		padding: "6px 6px 6px 6px",
		gap: "4px",
		radius: "10px",
		border: "0px",
	},
}

const PRESS_HOLD_MS = 800

const NON_PHRASING = ":not(span, svg, svg *, img, canvas, button)"

const AVATAR = <BotIdentityAvatar name="Atlas" seed="atlas" size={40} />

const STRIPS = [
	<BotMissionStrip
		key="waiting"
		state="waiting"
		ticket={{ platform: "linear", externalId: "OPE-64", title: "Pin the room" }}
	/>,
	<BotMissionStrip
		key="working"
		state="working"
		ticket={{
			platform: "github",
			externalId: "#4172",
			title: "Resume the turn",
		}}
	/>,
]

interface ShellProps {
	isOpen?: boolean
	children: ReactNode
}

const Shell = ({ isOpen = true, children }: ShellProps) => (
	<SidebarProvider defaultOpen={isOpen}>
		<Sidebar aria-label="Conversations" collapsible="icon" role="complementary">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>{children}</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
		<SidebarInset>
			<SidebarTrigger aria-label="Toggle the panel" />
		</SidebarInset>
	</SidebarProvider>
)

const rowsIn = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="sidebar-menu-button"]',
		),
	)

const rowIn = (canvasElement: HTMLElement) => {
	const [row] = rowsIn(canvasElement)
	if (!row) throw new Error("No sidebar list row rendered")
	return row
}

const slotIn = (row: HTMLElement, slot: string) =>
	row.querySelector<HTMLElement>(`[data-slot="${slot}"]`)

const boxOf = (row: HTMLElement) => {
	const style = getComputedStyle(row)
	return {
		height: row.getBoundingClientRect().height,
		padding: [
			style.paddingTop,
			style.paddingRight,
			style.paddingBottom,
			style.paddingLeft,
		].join(" "),
		gap: style.gap,
		radius: style.borderRadius,
		border: style.borderTopWidth,
	}
}

const scaleOf = (element: HTMLElement) => getComputedStyle(element).scale

const colorOf = (element: HTMLElement) => getComputedStyle(element).color

const skinOf = (element: HTMLElement) => {
	const style = getComputedStyle(element)
	return { background: style.backgroundColor, ring: style.boxShadow }
}

const realPointer = async () => (await import("vitest/browser")).userEvent

type RealPointer = Awaited<ReturnType<typeof realPointer>>

const withRealPointer = async (
	parkOn: HTMLElement,
	run: (pointer: RealPointer) => Promise<void>,
) => {
	const pointer = await realPointer()
	try {
		await run(pointer)
	} finally {
		await pointer.unhover(parkOn)
		await pointer.keyboard("{Shift}")
	}
}

const holdPointerOn = async (
	target: HTMLElement,
	whileHeld: () => Promise<void>,
) =>
	withRealPointer(target, async (pointer) => {
		const pressed = new Promise((resolve) =>
			target.addEventListener("pointerdown", resolve, { once: true }),
		)
		await Promise.all([
			pointer.click(target, { delay: PRESS_HOLD_MS }),
			pressed.then(whileHeld),
		])
	})

const meta = preview.meta({
	title: "Navigation/SidebarListRow",
	component: SidebarListRow,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					'The one row both roster lists of the left sidebar draw, a companion and a group conversation alike. Its root is the registry `Item` rendered as the sidebar menu button, so it keeps `data-slot="sidebar-menu-button"`, the sidebar tokens for hover, focus, active and selected, and gains the press scale the design system `Button` gives. Its structure is fixed and every part but the name is optional: a leading media (an avatar, an avatar group or an icon), a name line with a trailing slot beside the name and a timestamp at its end, a preview line, a badge dot and a strip area under both lines. A slot given nothing draws no box and no spacing; a slot given an empty string keeps its box, which is how the roster holds its timestamp column for a companion nobody has talked to yet. On the icon rail only the media is drawn, and the row keeps its name through `aria-label` and a hint.',
			},
		},
	},
	args: {
		name: "Atlas",
		onSelect: fn(),
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
		</Shell>
	),
})

export const NameOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					'The row given its name and nothing else, the one required part. Check the root is a `button` carrying `data-slot="sidebar-menu-button"`, that no other slot draws a box, and that nothing inside the button is a block element. Pick `WithTrailingBadgeAndTimestamp` for a full name line. The app assembles it at `apps/app/src/App.tsx:935`.',
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const row = rowIn(canvasElement)

		await expect(row.tagName).toBe("BUTTON")
		await expect(row).toHaveAccessibleName("Atlas")
		await expect(row.querySelectorAll(NON_PHRASING)).toHaveLength(0)
		for (const slot of [
			"roster-row-timestamp",
			"roster-row-preview",
			"roster-row-missions",
			"bot-activity-dot",
		])
			await expect(slotIn(row, slot)).toBeNull()

		await userEvent.click(row)
		await expect(args.onSelect).toHaveBeenCalledOnce()
	},
})

export const WithTrailingBadgeAndTimestamp = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		trailing: <BotTitleBadge data-slot="roster-row-badge" title="Research" />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A name line carrying a title badge beside the name and the time of the last message at its end. Check the badge sits right after the name and the timestamp is pushed to the end of the line. Pick `LongContent` for a name that has to give way to both. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const name = slotIn(row, "roster-row-name")
		const badge = slotIn(row, "roster-row-badge")

		await expect(name?.nextElementSibling).toBe(badge)
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent("09:24")
	},
})

export const WithPreview = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Pulled the papers for the brief, drafting the summary now.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A row at rest with its last message on the preview line. Check the preview is one clipped muted line under the name and carries no shimmer. Pick `WorkingPreview` for a companion at work. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const preview = slotIn(rowIn(canvasElement), "roster-row-preview")

		await expect(preview).toHaveTextContent("Pulled the papers")
		await expect(preview?.children).toHaveLength(0)
	},
})

export const WorkingPreview = meta.story({
	args: {
		media: <BotIdentityAvatar name="Atlas" seed="atlas" size={40} working />,
		timestamp: "09:24",
		preview: "Thinking",
		isWorking: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A companion at work: the preview line runs the working shimmer the roster uses on its busy rows. Check the shimmer wraps the preview text and not the name. Pick `WithPreview` for the same line at rest. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const preview = slotIn(rowIn(canvasElement), "roster-row-preview")

		await expect(preview?.children).toHaveLength(1)
		await expect(preview?.firstElementChild).toHaveTextContent("Thinking")
	},
})

export const MutedName = meta.story({
	tags: ["test-only"],
	args: {
		media: AVATAR,
		timestamp: "09:12",
		preview: "Closed earlier today.",
		isNameMuted: true,
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarListRow {...args} isNameMuted={false} name="Beacon" />
			</SidebarMenuItem>
		</Shell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A row whose name no longer speaks for something live, beside the same row at full strength: the activity panel asks for this on a mission that is done. Check the muted name reads in the colour its preview line reads in, and that the row beside it keeps the name colour of the sidebar. Pick `WithPreview` for the line that colour is taken from.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [muted, plain] = rowsIn(canvasElement)
		if (!muted || !plain) throw new Error("Both rows are not rendered")
		const mutedName = slotIn(muted, "roster-row-name")
		const mutedPreview = slotIn(muted, "roster-row-preview")
		const plainName = slotIn(plain, "roster-row-name")
		if (!mutedName || !mutedPreview || !plainName)
			throw new Error("Missing name line slot")

		await expect(colorOf(mutedName)).toBe(colorOf(mutedPreview))
		await expect(colorOf(mutedName)).not.toBe(colorOf(plainName))
	},
})

export const PreviewFromNodes = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: (
			<>
				<span className="font-medium tabular-nums" data-slot="preview-lead">
					OPE-64
				</span>
				<span className="before:mx-1 before:content-['·']">Pin the room</span>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A preview line built from nodes rather than from one string, the way a mission row writes its ticket, its companion and its state. Check that every node lands inside the single preview line, that the line still clips to one row rather than wrapping, and that nothing inside the button is a block element. Pick `WithPreview` for the same slot given plain text. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const preview = slotIn(row, "roster-row-preview")
		if (!preview) throw new Error("The row draws no preview line")

		const [lead, opened] = Array.from(preview.children)
		if (!lead || !opened) throw new Error("The preview line writes no node")

		await expect(preview.children).toHaveLength(2)
		await expect(lead).toBe(slotIn(row, "preview-lead"))
		await expect(lead).toHaveTextContent("OPE-64")
		await expect(opened).toHaveTextContent("Pin the room")
		await expect(getComputedStyle(opened, "::before").content).toBe('"·"')
		await expect(preview.clientHeight).toBe(16)
		await expect(row.querySelectorAll(NON_PHRASING)).toHaveLength(0)
	},
})

export const WithBadgeDot = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Waiting on your answer.",
		badge: "attention",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A row whose companion is asking for the reader. Check the badge dot sits at the end of the preview line, inside the row, without pushing the preview or the timestamp. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const dot = slotIn(row, "bot-activity-dot")

		await expect(dot).not.toBeNull()
		if (!dot) return
		const dotBox = dot.getBoundingClientRect()
		const column = (dot.offsetParent as HTMLElement).getBoundingClientRect()
		const preview = slotIn(row, "roster-row-preview") as HTMLElement
		const previewTextEnd =
			preview.getBoundingClientRect().right -
			Number.parseFloat(getComputedStyle(preview).paddingInlineEnd)

		await expect(dotBox.right).toBeCloseTo(column.right, 0)
		await expect(dotBox.left).toBeGreaterThanOrEqual(previewTextEnd)
		await expect(dotBox.right).toBeLessThanOrEqual(
			row.getBoundingClientRect().right,
		)
	},
})

export const WithStrips = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Two missions open.",
		strips: STRIPS,
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A row carrying open missions: the strips hang under both lines, one per mission, in the row's own box. Check the avatar stays centred on the name and preview rather than on the whole row. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const strips = slotIn(rowIn(canvasElement), "roster-row-missions")

		await expect(strips?.children).toHaveLength(STRIPS.length)
	},
})

export const AllSlots = meta.story({
	tags: ["test-only"],
	args: {
		media: AVATAR,
		trailing: <BotTitleBadge data-slot="roster-row-badge" title="Research" />,
		timestamp: "09:24",
		preview: "Pulled the papers for the brief.",
		badge: "attention",
		strips: STRIPS,
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The row carrying every slot at once: media, a trailing badge, a timestamp, a preview, a badge dot and strips. Check that with all of them drawn nothing inside the button is a block element, since a `button` may only hold phrasing content. Pick `NameOnly` for the same rule on the bare row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)

		for (const slot of [
			"bot-identity-avatar",
			"roster-row-badge",
			"roster-row-timestamp",
			"roster-row-preview",
			"bot-activity-dot",
			"roster-row-missions",
		])
			await expect(slotIn(row, slot)).not.toBeNull()
		await expect(row.querySelectorAll(NON_PHRASING)).toHaveLength(0)
	},
})

export const SkinMatchesMenuButton = meta.story({
	tags: ["test-only"],
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Pulled the papers for the brief.",
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarMenuButton>Launch review</SidebarMenuButton>
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarListRow {...args} isActive name="Beacon" />
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarMenuButton isActive>Transport migration</SidebarMenuButton>
			</SidebarMenuItem>
		</Shell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The row beside a bare registry sidebar menu button in the same panel, each at rest and selected. The play reads the background and the ring off both rendered elements at rest, on keyboard focus, under a real pointer hover and while selected, and requires them equal, so an `Item` class that survived the merge cannot repaint the row. The hover step needs the Vitest browser runner; in Storybook, hover both by hand.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const [row, bare, selectedRow, selectedBare] = rowsIn(canvasElement)
		await expect(slotIn(bare, "roster-row-name")).toBeNull()

		const parkPointer = canvas.getByRole("button", {
			name: "Toggle the panel",
		})
		if (isInBrowserRunner())
			await withRealPointer(parkPointer, (pointer) =>
				pointer.hover(parkPointer),
			)

		const rest = skinOf(bare)
		await expect(skinOf(row)).toEqual(rest)
		await expect(skinOf(selectedRow)).toEqual(skinOf(selectedBare))
		await expect(skinOf(selectedBare).background).not.toBe(rest.background)

		await userEvent.tab()
		await expect(row.matches(":focus-visible")).toBe(true)
		const focusedRow = skinOf(row)
		await userEvent.tab()
		await expect(bare.matches(":focus-visible")).toBe(true)
		await expect(focusedRow).toEqual(skinOf(bare))
		await expect(focusedRow.ring).not.toBe(rest.ring)
		bare.blur()

		if (!isInBrowserRunner()) return
		await withRealPointer(bare, async (pointer) => {
			await pointer.hover(row)
			await waitFor(() => expect(row.matches(":hover")).toBe(true))
			const hoveredRow = skinOf(row)
			await pointer.hover(bare)
			await waitFor(() => expect(bare.matches(":hover")).toBe(true))
			await expect(hoveredRow).toEqual(skinOf(bare))
			await expect(hoveredRow.background).not.toBe(rest.background)
		})
		await expect(bare.matches(":hover")).toBe(false)
	},
})

export const LongContent = meta.story({
	args: {
		media: AVATAR,
		name: "Atlas the quarterly infrastructure capacity planner",
		timestamp: "Tue",
		preview:
			"Pulled every capacity report since January and flagged the three regions that will run out first.",
		trailing: <BotTitleBadge data-slot="roster-row-badge" title="Ops" />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A name longer than the room left by a title badge and a timestamp. Check the title gives way first down to a stub ending in an ellipsis, the name is then cut with an ellipsis, the timestamp stays whole at its own width, and the preview clips to one line. Pick `WithTrailingBadgeAndTimestamp` for the same line when everything fits. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const name = slotIn(row, "roster-row-name")
		const badge = slotIn(row, "roster-row-badge")
		const timestamp = slotIn(row, "roster-row-timestamp")
		if (!name || !badge || !timestamp) throw new Error("Missing name line slot")

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(badge.scrollWidth).toBeGreaterThan(badge.clientWidth)
		await expect(badge).toBeVisible()
		await expect(timestamp.scrollWidth).toBeLessThanOrEqual(
			timestamp.clientWidth,
		)
	},
})

const FULL_TITLE = "Researcher"

const LONG_TITLE = "Research lead"

const NARROW_ROW_WIDTH = 200

const isCut = (element: HTMLElement) =>
	element.scrollWidth > element.clientWidth

const nameLineOf = (canvasElement: HTMLElement) => {
	const row = rowIn(canvasElement)
	const name = slotIn(row, "roster-row-name")
	const badge = slotIn(row, "roster-row-badge")
	const timestamp = slotIn(row, "roster-row-timestamp")
	if (!name || !badge || !timestamp) throw new Error("Missing name line slot")
	return { name, badge, timestamp, line: name.parentElement as HTMLElement }
}

export const WithFullTitle = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		trailing: <BotTitleBadge data-slot="roster-row-badge" title={FULL_TITLE} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A roster row wide enough for the name and the whole title. Check neither carries an ellipsis: the title has no maximum width, so it is only ever cut for lack of room. Pick `WithTitleCutBeforeName` for the same row once the room runs out.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { name, badge, timestamp, line } = nameLineOf(canvasElement)

		await expect(name).toHaveTextContent("Atlas")
		await expect(badge).toHaveTextContent(FULL_TITLE)
		await expect(isCut(name)).toBe(false)
		await expect(isCut(badge)).toBe(false)
		await expect(isCut(timestamp)).toBe(false)
		await expect(line.getBoundingClientRect().height).toBe(20)
	},
})

export const WithTitleCutBeforeName = meta.story({
	args: {
		media: AVATAR,
		timestamp: "09:24",
		trailing: <BotTitleBadge data-slot="roster-row-badge" title={LONG_TITLE} />,
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem style={{ width: NARROW_ROW_WIDTH }}>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
		</Shell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same row held at 200px, too narrow for the whole title. Check the title is cut with an ellipsis while the name stays whole and the timestamp keeps its full width on one line. Pick `WithFullTitle` for the row with room to spare, `LongContent` for a name that gives way too.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { name, badge, timestamp, line } = nameLineOf(canvasElement)

		await expect(name).toHaveTextContent("Atlas")
		await expect(badge).toHaveTextContent(LONG_TITLE)
		await expect(isCut(name)).toBe(false)
		await expect(isCut(badge)).toBe(true)
		await expect(getComputedStyle(badge).textOverflow).toBe("ellipsis")
		await expect(isCut(timestamp)).toBe(false)
		await expect(line.getBoundingClientRect().height).toBe(20)
	},
})

export const Pressed = meta.story({
	tags: ["test-only"],
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Pulled the papers for the brief.",
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
			<SidebarMenuItem>
				<Button>Press me</Button>
			</SidebarMenuItem>
		</Shell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The row held down with the pointer beside a design system `Button` held the same way. The play holds a real pointer on each through the Vitest browser runner, so it only runs there; in Storybook, press the row by hand. Check the row scales down by the amount the `Button` scales down by, transitions only its geometry and that scale, and settles back on release. The play then restores the page to keyboard input, because a real press leaves Chromium in mouse modality, where a later synthetic tab in another story file would focus without a ring.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const row = rowIn(canvasElement)
		const button = canvas.getByRole("button", { name: "Press me" })

		await waitFor(() =>
			expect(getComputedStyle(row).transitionProperty).toBe(
				"width, height, padding, scale",
			),
		)
		if (!isInBrowserRunner()) return

		let buttonScale = ""
		await holdPointerOn(button, async () => {
			await waitFor(() => expect(scaleOf(button)).not.toBe("none"))
			buttonScale = scaleOf(button)
		})

		await expect(scaleOf(row)).toBe("none")
		await holdPointerOn(row, async () => {
			await waitFor(() => expect(scaleOf(row)).toBe(buttonScale))
		})
		await waitFor(() => expect(scaleOf(row)).toBe("none"))

		row.blur()
		await userEvent.tab()
		await expect(row).toHaveFocus()
		await expect(row.matches(":focus-visible")).toBe(true)
	},
})

const HEIGHTS_ON_MAIN = [48, 48, 52, 52]

const ROWS_WITHOUT_A_DETAIL = [
	{ key: "name", name: "Atlas" },
	{ key: "preview", name: "Atlas", preview: "Pulled the papers." },
	{ key: "media", name: "Atlas", media: AVATAR, timestamp: "09:24" },
	{
		key: "full",
		name: "Atlas",
		media: AVATAR,
		timestamp: "09:24",
		preview: "Pulled the papers.",
	},
]

export const HeightWithoutADetail = meta.story({
	tags: ["test-only"],
	render: () => (
		<Shell>
			{ROWS_WITHOUT_A_DETAIL.map(({ key, ...row }) => (
				<SidebarMenuItem key={key}>
					<SidebarListRow {...row} />
				</SidebarMenuItem>
			))}
		</Shell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Rows given no detail, from the name alone to every slot but the detail. Check that each keeps the height it has on `origin/main`, where the stack held a fixed 36px, now that it holds a 36px minimum to make room for a detail line. Pick `BoxMetrics` for the full box.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const heights = rowsIn(canvasElement).map(
			(row) => row.getBoundingClientRect().height,
		)
		await expect(heights).toEqual(HEIGHTS_ON_MAIN)
	},
})

export const BoxMetrics = meta.story({
	tags: ["test-only"],
	args: {
		media: AVATAR,
		timestamp: "09:24",
		preview: "Pulled the papers for the brief.",
	},
	render: (args) => (
		<Shell>
			<SidebarMenuItem>
				<SidebarListRow {...args} />
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarListRow {...args} name="Launch review" strips={STRIPS} />
			</SidebarMenuItem>
		</Shell>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The row box against the numbers measured on the roster at commit b1e22da1: 52px open and 108px open with two strips, with the padding, gaps and 10px corner of that commit and no border box. Check that rebuilding the row on `Item` moved none of them.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [plain, stripped] = rowsIn(canvasElement)

		await expect(boxOf(plain)).toEqual(BOX_ON_B1E22DA1.open)
		await expect(boxOf(stripped)).toEqual(BOX_ON_B1E22DA1.openWithStrips)
	},
})
