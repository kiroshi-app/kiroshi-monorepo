import { Tabs } from "@base-ui/react/tabs"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	hasOverlayScrollbars,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { FillIcons, type Icon, Icons } from "@workspace/ui/components/icons"
import {
	DANGER_RAIL_ITEM_CLASS,
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailBack,
	SettingsRailItem,
	type SettingsRailProps,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"

const GROUPS = [
	{ icon: "User", label: "Profile", value: "profile" },
	{ icon: "Image", label: "Appearance", value: "appearance" },
	{ icon: "Terminal", label: "Runtime", value: "runtime" },
] as const

const DANGER = { icon: "Alert", label: "Danger zone", value: "danger" } as const

const iconIn = (item: HTMLElement) => {
	const icon = item.querySelector("svg")
	if (!icon) throw new Error(`No icon in ${item.textContent}`)
	return icon
}

const glyphOf = (root: ParentNode) =>
	Array.from(root.querySelectorAll("path"), (path) => path.getAttribute("d"))

const glyphDrawnBy = (Glyph: Icon) => {
	const template = document.createElement("template")
	template.innerHTML = renderToStaticMarkup(<Glyph />)
	return glyphOf(template.content)
}

const expectDrawnWith = async (item: HTMLElement, Glyph: Icon) =>
	expect(glyphOf(iconIn(item))).toEqual(glyphDrawnBy(Glyph))

const boxOf = (element: Element) => {
	const { top, left, width, height } = element.getBoundingClientRect()
	return { top, left, width, height }
}

const labelPlacementOf = (item: HTMLElement) => {
	const label = item.querySelector("span")
	if (!label) throw new Error(`No label in ${item.textContent}`)
	const { top, left, height } = label.getBoundingClientRect()
	return { top, left, height }
}

const layoutOf = (item: HTMLElement) => ({
	row: boxOf(item),
	icon: boxOf(iconIn(item)),
	label: labelPlacementOf(item),
})

type SwapStep = {
	canvas: { getByRole: (role: "tab", options: { name: string }) => HTMLElement }
	userEvent: { click: (element: HTMLElement) => Promise<void> }
}

const expectIconSwapsWithSelection = async ({
	canvas,
	userEvent,
}: SwapStep) => {
	const profile = canvas.getByRole("tab", { name: "Profile" })
	const appearance = canvas.getByRole("tab", { name: "Appearance" })
	await expectDrawnWith(profile, FillIcons.User)
	await expectDrawnWith(appearance, Icons.Image)
	const selectedIcon = iconIn(profile).outerHTML
	const profileLayout = layoutOf(profile)
	const appearanceLayout = layoutOf(appearance)

	await userEvent.click(appearance)
	await expect(appearance).toHaveAttribute("aria-selected", "true")
	await expectDrawnWith(profile, Icons.User)
	await expectDrawnWith(appearance, FillIcons.Image)
	await expect(iconIn(profile).outerHTML).not.toBe(selectedIcon)
	await expect(layoutOf(profile)).toEqual(profileLayout)
	await expect(layoutOf(appearance)).toEqual(appearanceLayout)
}

const renderRail = (args: SettingsRailProps) => (
	<Tabs.Root
		className="flex h-72 w-[36rem] overflow-hidden rounded-2xl border border-border"
		defaultValue="profile"
		orientation="vertical"
	>
		<SettingsRail {...args}>
			{GROUPS.map((group) => (
				<SettingsRailItem
					icon={group.icon}
					iconsOnly={args.iconsOnly}
					key={group.value}
					label={group.label}
					value={group.value}
				/>
			))}
			<SettingsRailSeparator />
			<SettingsRailItem
				className={DANGER_RAIL_ITEM_CLASS}
				icon={DANGER.icon}
				iconsOnly={args.iconsOnly}
				label={DANGER.label}
				value={DANGER.value}
			/>
		</SettingsRail>
		{[...GROUPS, DANGER].map((group) => (
			<Tabs.Panel
				className={SETTINGS_PANEL_CLASS}
				key={group.value}
				value={group.value}
			>
				<span className="text-muted-foreground text-sm">{group.label}</span>
			</Tabs.Panel>
		))}
	</Tabs.Root>
)

const meta = preview.meta({
	title: "Navigation/SettingsRail",
	component: SettingsRail,
	render: renderRail,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The column of groups down the left of a settings dialog — a companion's, a reader's own. It holds its width and never scrolls with the panel beside it, so a reader who scrolled a long group finds the rail where they left it. One tab stop reaches it and the arrow keys walk it: walking is not opening, so nobody drags a long group past on the way to the group they wanted. The surface that owns the width decides when the names leave, and hands the answer to the rail and to the panel beside it at once.",
			},
		},
	},
	args: { iconsOnly: false, children: null },
})

export const WithBack = meta.story({
	args: {
		leading: (
			<>
				<SettingsRailBack
					iconsOnly={false}
					label="All skills"
					onClick={() => {}}
				/>
				<SettingsRailSeparator />
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The rail of a surface a reader came into from somewhere else — a skill opened out of the list of them. Reach for this whenever the rail replaces another one: the way out stands where the first group would, above the list rather than inside it, so a screen reader counts the groups and never a button among them. Check that one Tab still reaches the groups, and that the way back is its own stop before them. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const back = canvas.getByRole("button", { name: "All skills" })
		await expectDrawnWith(back, Icons.Previous)

		await userEvent.hover(back)
		back.focus()
		await expectDrawnWith(back, Icons.Previous)
		await userEvent.tab()
		await expect(canvas.getByRole("tab", { name: "Profile" })).toHaveFocus()
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The rail with room for its names. Check that the open group is the filled row rather than a tinted one, that one Tab reaches the rail and the arrows walk it without opening anything, and that no item carries a tooltip — a name already on the screen is not worth saying twice. Pick `IconsOnly` for the narrow surface. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const profile = canvas.getByRole("tab", { name: "Profile" })
		const appearance = canvas.getByRole("tab", { name: "Appearance" })

		profile.focus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(appearance).toHaveFocus()
		await expect(appearance).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Enter}")
		await expect(appearance).toHaveAttribute("aria-selected", "true")
	},
})

export const IconsOnly = meta.story({
	args: { iconsOnly: true },
	parameters: {
		docs: {
			description: {
				story:
					"The rail once the surface is too narrow for its names — the state the dialog switches to below 42rem of content. Check that the rail keeps every item reachable and still named to a screen reader, that the icons are centred in the narrower column, and that a name dropped off the screen comes back as a tooltip on hover and on focus. Pick `Default` for the named rail. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const [rail] = slotsIn(canvasElement, "settings-rail")
		const appearance = canvas.getByRole("tab", { name: "Appearance" })

		await expect(rail.getBoundingClientRect().width).toBeLessThan(80)
		await userEvent.hover(appearance)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Appearance",
		)
		await expectIconSwapsWithSelection({ canvas, userEvent })
	},
})

export const SelectedBesideIdle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The open group beside the ones at rest. Check that the open group draws its icon filled while every other group keeps the stroked one, that opening Appearance fills its image and returns Profile to stroke without moving a row, an icon or a name, and that the danger zone keeps its red whether open or not. Pick `IconsOnly` for the same switch in the narrow rail. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectIconSwapsWithSelection({ canvas, userEvent })

		const [rail] = slotsIn(canvasElement, "settings-rail")
		const danger = canvas.getByRole("tab", { name: DANGER.label })
		const destructive = tokenStyleIn(rail, "text-destructive", "color")
		await expectDrawnWith(danger, Icons.Alert)
		await expect(getComputedStyle(iconIn(danger)).color).toBe(destructive)

		await userEvent.click(danger)
		await expect(danger).toHaveAttribute("aria-selected", "true")
		await expectDrawnWith(danger, FillIcons.Alert)
		await expect(getComputedStyle(iconIn(danger)).color).toBe(
			tokenStyleIn(rail, "text-destructive-tint-foreground", "color"),
		)
	},
})

const LONG_PANEL = Array.from(
	{ length: 30 },
	(_, index) => `Setting ${index + 1}`,
)

const renderScrollingPanels = (args: SettingsRailProps) => (
	<Tabs.Root
		className="flex h-72 w-[36rem] overflow-hidden rounded-2xl border border-border"
		defaultValue="profile"
		orientation="vertical"
	>
		<SettingsRail {...args}>
			{GROUPS.map((group) => (
				<SettingsRailItem
					icon={group.icon}
					iconsOnly={args.iconsOnly}
					key={group.value}
					label={group.label}
					value={group.value}
				/>
			))}
		</SettingsRail>
		<SettingsScrollingPanel value="profile">
			{LONG_PANEL.map((line) => (
				<span className="text-muted-foreground text-sm" key={line}>
					{line}
				</span>
			))}
		</SettingsScrollingPanel>
		<SettingsScrollingPanel value="appearance">
			<span className="text-muted-foreground text-sm">One short row</span>
		</SettingsScrollingPanel>
		<SettingsScrollingPanel value="runtime">
			<span className="text-muted-foreground text-sm">One short row</span>
		</SettingsScrollingPanel>
	</Tabs.Root>
)

export const ScrollingPanel = meta.story({
	render: renderScrollingPanels,
	parameters: {
		docs: {
			description: {
				story:
					"The panel beside the rail once its group runs past the height of the dialog. An OverlayScrollbars instance draws the handle over the content and reserves no gutter, so the rows keep the same width whether the group scrolls or not and nothing reflows when a reader switches from a long group to a short one. The handle fades in on the way into the panel and out again on the way out, and holds still under reduced motion \u2014 the mode these stories run in. Check that the panel carries a live instance, that the long group overflows and scrolls, and that the short group beside it measures the same content width. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const long = canvas.getByRole("tabpanel")

		await waitFor(() => expect(hasOverlayScrollbars(long)).toBe(true))
		await expect(long.scrollHeight).toBeGreaterThan(long.clientHeight)
		await expect(getComputedStyle(long).scrollbarWidth).toBe("none")
		await expect(long.clientWidth).toBe(long.offsetWidth)
		const contentWidth = long.clientWidth

		const handle = long.querySelector<HTMLElement>(".os-scrollbar")
		if (!handle) throw new Error("The overlay scrollbar is not mounted.")
		await expect(getComputedStyle(handle).transitionProperty).toBe("none")

		long.scrollTop = 60
		await expect(long.scrollTop).toBe(60)

		await userEvent.click(canvas.getByRole("tab", { name: "Appearance" }))
		const short = canvas.getByRole("tabpanel")

		await waitFor(() =>
			expect(short.scrollHeight).toBeLessThanOrEqual(short.clientHeight),
		)
		await expect(short.clientWidth).toBe(contentWidth)
	},
})
