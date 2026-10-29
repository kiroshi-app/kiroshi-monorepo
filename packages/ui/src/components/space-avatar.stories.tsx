import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	SpaceAvatar,
	type SpaceAvatarState,
} from "@workspace/ui/components/space-avatar"
import {
	SPACE_AVATAR_SIZES,
	type SpaceAvatarSize,
	type SpaceAvatarTheme,
	spaceInk,
	spacePalette,
} from "@workspace/ui/components/space-avatar-recipe"

type StateEntry = {
	label: string
	state: SpaceAvatarState
	hasAttention?: boolean
}

type StateVariant = {
	label: string
	size: SpaceAvatarSize
	colour: number | null
}

type DrawnSize = 14 | 26 | 48

type MixedSpace = {
	id: string
	name: string
	colour: number | null
	state: SpaceAvatarState
}

const SPACE_ID = "space-release-desk"

const SPACE_NAME = "Release desk"

const DRAWN_SIZES: DrawnSize[] = [48, 26, 14]

const ARTBOARD_F: Record<
	DrawnSize,
	{
		badge: number
		centre: number
		cutOut: number
		fontSize: number
		weight: number
	}
> = {
	48: { badge: 18, centre: 41.52, cutOut: 2.5, fontSize: 24, weight: 600 },
	26: { badge: 12, centre: 21.68, cutOut: 2, fontSize: 13, weight: 600 },
	14: { badge: 8, centre: 11.12, cutOut: 1.5, fontSize: 10, weight: 700 },
}

const MIXED_SPACES: MixedSpace[] = [
	{ id: "atelier", name: "Atelier", colour: 250, state: "local" },
	{
		id: "harbour-studio",
		name: "Harbour Studio",
		colour: 236,
		state: "online",
	},
	{ id: "personal", name: "Personal", colour: null, state: "local" },
	{ id: "fieldwork", name: "Fieldwork", colour: 145, state: "offline" },
	{ id: "quarry-labs", name: "Quarry Labs", colour: 28, state: "online" },
]

const CURRENT_SPACE_ID = "atelier"

const CONTEXT_COLOURS: Record<
	SpaceAvatarTheme,
	{
		railFill: string
		railBorder: string
		menuFill: string
		menuBorder: string
		highlight: string
		name: string
	}
> = {
	light: {
		railFill: "#f7f7f7",
		railBorder: "#e5e5e5",
		menuFill: "#ffffff",
		menuBorder: "#e5e5e5",
		highlight: "#f2f2f2",
		name: "#0a0a0a",
	},
	dark: {
		railFill: "#1a1a1a",
		railBorder: "#212224",
		menuFill: "#141414",
		menuBorder: "#212224",
		highlight: "#222222",
		name: "#f5f5f5",
	},
}

const RAIL_WIDTH = 52

const RAIL_TILE = 26

const RAIL_PITCH = 40

const RAIL_EDGE = 16

const MENU_WIDTH = 232

const MENU_ROW_HEIGHT = 28

const MENU_AVATAR = 14

const MENU_AVATAR_INSET = 8

const MENU_NAME_OFFSET = 30

const OFFLINE_GROUP_OPACITY: Record<SpaceAvatarTheme, string> = {
	light: "0.8",
	dark: "1",
}

const BADGE_SLOT: Partial<Record<SpaceAvatarState, string>> = {
	local: "space-avatar-local",
	shared: "space-avatar-dot",
	online: "space-avatar-dot",
	offline: "space-avatar-offline",
}

const COLOURED = BLOT_HUES.blue

const STATES: StateEntry[] = [
	{ label: "Local", state: "local" },
	{ label: "Shared", state: "shared" },
	{ label: "Online", state: "online" },
	{ label: "Online + attention", state: "online", hasAttention: true },
	{ label: "Connecting", state: "connecting" },
	{ label: "Not connected", state: "offline" },
	{ label: "Invitation", state: "invitation" },
	{ label: "Joining", state: "joining" },
]

const VARIANTS: StateVariant[] = [
	{ label: "14", size: 14, colour: COLOURED },
	{ label: "48", size: 48, colour: COLOURED },
	{ label: "48 Personal", size: 48, colour: null },
]

const SIZE_ROWS = [
	{ label: "Coloured", colour: COLOURED },
	{ label: "Personal", colour: null },
]

const GRID = "grid items-center justify-items-center gap-x-5 gap-y-4"

const LABEL = "text-foreground text-xs"

const RAIL =
	"flex w-13 flex-col items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar py-3"

const RAIL_SLOT = "flex size-8 items-center justify-center"

const MENU =
	"flex w-58 flex-col rounded-control border border-border bg-[#ffffff] p-1.5 dark:bg-[#141414]"

const MENU_ROW =
	"flex h-7 items-center gap-2 rounded-sm px-2 font-normal text-compact text-foreground leading-4 aria-[current=true]:bg-[#f2f2f2] dark:aria-[current=true]:bg-[#222222]"

const avatarsIn = (root: HTMLElement) => slotsIn(root, "space-avatar")

const rgbOf = (hex: string) =>
	`rgb(${[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(", ")})`

const themeOf = (element: Element): SpaceAvatarTheme =>
	element.closest(".dark") ? "dark" : "light"

const inThemeLayer = (avatar: HTMLElement, slot: string) =>
	Array.from(
		avatar.querySelectorAll<HTMLElement>(
			`[data-theme="${themeOf(avatar)}"] [data-slot="${slot}"]`,
		),
	)

const centreOf = (avatar: HTMLElement, element: Element) => {
	const frame = avatar.getBoundingClientRect()
	const box = element.getBoundingClientRect()
	return {
		x: box.left + box.width / 2 - frame.left,
		y: box.top + box.height / 2 - frame.top,
	}
}

const expectArtboardF = async (canvasElement: HTMLElement) => {
	const avatars = avatarsIn(canvasElement)
	await expect(avatars.length).toBeGreaterThan(0)
	for (const avatar of avatars) {
		const size = Number(avatar.dataset.size) as DrawnSize
		const state = avatar.dataset.state as SpaceAvatarState
		const artboard = ARTBOARD_F[size]
		const badge = slotIn(avatar, BADGE_SLOT[state] ?? "")
		const box = badge.getBoundingClientRect()
		await expect(box.width).toBeCloseTo(artboard.badge, 1)
		const { x, y } = centreOf(avatar, badge)
		await expect(x).toBeCloseTo(artboard.centre, 1)
		await expect(y).toBeCloseTo(artboard.centre, 1)
		await expect(
			Number(avatar.querySelector("mask circle")?.getAttribute("r")),
		).toBeCloseTo(artboard.badge / 2 + artboard.cutOut, 3)
		const [initial] = inThemeLayer(avatar, "space-avatar-initial")
		if (!initial) throw new Error("the avatar draws no initial in its theme")
		const type = getComputedStyle(initial)
		await expect(type.fontSize).toBe(`${artboard.fontSize}px`)
		await expect(type.lineHeight).toBe(`${artboard.fontSize}px`)
		await expect(type.fontWeight).toBe(`${artboard.weight}`)
		await expect(type.letterSpacing).toBe(`${-0.02 * artboard.fontSize}px`)
		await expect(getComputedStyle(initial, "::before").content).toBe(
			`"${initial.dataset.initial}"`,
		)
		await expect(
			initial.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		const colour = avatar.dataset.colour
		await expect(type.color).toBe(
			rgbOf(
				spaceInk(
					themeOf(avatar),
					state === "offline" || colour === undefined ? null : Number(colour),
				),
			),
		)
		await expect(avatar.textContent).toBe("")
	}
}

const panelsInBothThemes = async (root: HTMLElement, slot: string) => {
	const panels = slotsIn(root, slot)
	await expect(panels.map(themeOf).sort()).toEqual(["dark", "light"])
	return panels
}

const expectMixedSpacesIn = async (panel: HTMLElement) => {
	const avatars = avatarsIn(panel)
	await expect(
		avatars.map((avatar) => ({
			initial: inThemeLayer(avatar, "space-avatar-initial")[0]?.dataset.initial,
			colour: avatar.dataset.colour,
			state: avatar.dataset.state,
		})),
	).toEqual(
		MIXED_SPACES.map(({ name, colour, state }) => ({
			initial: name[0],
			colour: colour === null ? undefined : `${colour}`,
			state,
		})),
	)
	return avatars
}

const sizeRow = (
	state: SpaceAvatarState,
	colour: number | null,
	name = SPACE_NAME,
) => (
	<div
		className={GRID}
		style={{ gridTemplateColumns: `repeat(${DRAWN_SIZES.length}, auto)` }}
	>
		{DRAWN_SIZES.map((size) => (
			<span className={LABEL} key={size}>
				{size}
			</span>
		))}
		{DRAWN_SIZES.map((size) => (
			<SpaceAvatar
				colour={colour}
				key={size}
				name={name}
				size={size}
				spaceId={SPACE_ID}
				state={state}
			/>
		))}
	</div>
)

const meta = preview.meta({
	title: "Branding/SpaceAvatar",
	component: SpaceAvatar,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The mark of a Space, 8A Horizon Glaze: a superellipse with three arcs drawn from one corner, picked with their radii from the Space id, so a Space keeps its mark whatever its colour. From 20px it wears four tones of its colour under a glaze; under 20px a compact recipe with two arcs and three tones. Personal, a Space with no colour, wears the same arcs in greys. It carries the first letter of the Space name, in a deep ink of its colour. The state is drawn on the mark: a grey laptop badge while local, the green dot while shared or online, lines while connecting, hatched greys under a red badge while not connected, a dashed outline for an invitation. The mark is decorative: the surface that draws it carries the Space's name and state in its accessible name.",
			},
		},
	},
	args: { spaceId: SPACE_ID, name: SPACE_NAME, colour: COLOURED, size: 48 },
	globals: { theme_layout: "side-by-side" },
})

export const Sizes = meta.story({
	render: () => (
		<div
			className={GRID}
			style={{
				gridTemplateColumns: `auto repeat(${SPACE_AVATAR_SIZES.length}, auto)`,
			}}
		>
			<span />
			{SPACE_AVATAR_SIZES.map((size) => (
				<span className={LABEL} key={size}>
					{size}
				</span>
			))}
			{SIZE_ROWS.map(({ label, colour }) => [
				<span className={LABEL} key={label}>
					{label}
				</span>,
				...SPACE_AVATAR_SIZES.map((size) => (
					<SpaceAvatar
						colour={colour}
						key={`${label}-${size}`}
						name={SPACE_NAME}
						size={size}
						spaceId={SPACE_ID}
					/>
				)),
			])}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3: the mark at 12, 14, 26, 36, 48 and 64px, for a coloured Space and for Personal, in both themes. Check that 12 and 14 draw the compact recipe without glaze, that every size from 26 keeps the same corner and arcs, and that Personal reads as the same mark in greys.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = avatarsIn(canvasElement)
		await expect(avatars).toHaveLength(2 * 2 * SPACE_AVATAR_SIZES.length)
		for (const avatar of avatars) {
			const size = Number(avatar.dataset.size)
			await expect(avatar.textContent).toBe("")
			await expect(avatar.getBoundingClientRect().width).toBe(size)
			await expect(avatar.dataset.recipe).toBe(size < 20 ? "compact" : "glaze")
		}
	},
})

export const FreeHue = meta.story({
	render: () => (
		<SpaceAvatar colour={210} name={SPACE_NAME} size={48} spaceId={SPACE_ID} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A Space given a hue outside the eight presets, 210. Check that its four tones are drawn from that hue, between cyan and blue, rather than from the nearest preset. Pick `Sizes` for a preset hue.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = avatarsIn(canvasElement)
		const [ground] = spacePalette("light", 210).full

		await expect(avatar).toHaveAttribute("data-colour", "210")
		await expect(avatar?.querySelector(`rect[fill="${ground}"]`)).not.toBeNull()
	},
})

export const States = meta.story({
	render: () => (
		<div
			className={GRID}
			style={{ gridTemplateColumns: `auto repeat(${VARIANTS.length}, auto)` }}
		>
			<span />
			{VARIANTS.map(({ label }) => (
				<span className={LABEL} key={label}>
					{label}
				</span>
			))}
			{STATES.map((state) => [
				<span className={LABEL} key={state.label}>
					{state.label}
				</span>,
				...VARIANTS.map(({ label, size, colour }) => (
					<SpaceAvatar
						colour={colour}
						hasAttention={state.hasAttention}
						key={`${state.label}-${label}`}
						name={SPACE_NAME}
						size={size}
						spaceId={SPACE_ID}
						state={state.state}
					/>
				)),
			])}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4: the eight states at 14 and 48px for a coloured Space and at 48px for Personal, in both themes. Check the initial on every filled state, the grey laptop badge while local, the green dot parted from the glaze by a ring of the surface while shared or online, the warning ring outside the square with attention, keeping the dot, the ground with its arcs as lines while connecting, the hatched greys under a red badge while not connected, the dashed outline of an invitation and the lines inside it while joining.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = avatarsIn(canvasElement)
		await expect(avatars).toHaveLength(2 * VARIANTS.length * STATES.length)
		for (const avatar of avatars) {
			const { state } = avatar.dataset
			await expect(avatar.textContent).toBe("")
			const hasDot = state === "shared" || state === "online"
			const isOutlined = state === "invitation" || state === "joining"
			await expect(slotsIn(avatar, "space-avatar-dot")).toHaveLength(
				hasDot ? 1 : 0,
			)
			await expect(slotsIn(avatar, "space-avatar-outline").length).toBe(
				isOutlined ? 2 : 0,
			)
			await expect(slotsIn(avatar, "space-avatar-attention")).toHaveLength(
				avatar.dataset.attention === undefined ? 0 : 1,
			)
			const isFull =
				state === "local" || state === "shared" || state === "online"
			await expect(avatar.querySelector("linearGradient") !== null).toBe(
				isFull && avatar.dataset.recipe === "glaze",
			)
		}
	},
})

export const Local = meta.story({
	render: () => sizeRow("local", COLOURED),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, a Space on this computer at 48, 26 and 14px, in both themes. Check the initial R centred in the deep ink of the Space hue, and the grey laptop badge in the bottom end corner, parted from the tile by a ring of the surface, above the initial. Pick `SharedOnline` for the green dot, `Offline` for the hatched tile.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * DRAWN_SIZES.length)
		await expectArtboardF(canvasElement)
		for (const avatar of avatarsIn(canvasElement))
			await expect(
				slotIn(avatar, "space-avatar-local").querySelectorAll("path"),
			).toHaveLength(1)
	},
})

export const SharedOnline = meta.story({
	render: () => (
		<>
			{sizeRow("shared", COLOURED)}
			{sizeRow("online", COLOURED)}
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, a shared Space (first row) and a joined Space whose host answers (second row) at 48, 26 and 14px, in both themes. Check the initial in the Space ink and the green presence dot, with no glyph, parted from the tile by a ring of the surface. Pick `Local` for the laptop badge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(
			2 * 2 * DRAWN_SIZES.length,
		)
		await expectArtboardF(canvasElement)
		for (const avatar of avatarsIn(canvasElement))
			await expect(
				slotIn(avatar, "space-avatar-dot").querySelector("path"),
			).toBeNull()
	},
})

export const Offline = meta.story({
	render: () => sizeRow("offline", COLOURED),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, a joined Space whose host does not answer at 48, 26 and 14px, in both themes. Check the neutral tile crossed by 45 degree lines from bottom left to top right, fading with the tile: every 6px with a 1.5px stroke at 48, where one line runs along the tile diagonal; every 4px with a 1px stroke at 26, where the diagonal falls midway between two lines; every 3px with a 0.8px stroke at 14, where the diagonal falls 2px after one line and 1px before the next. Check the initial in the neutral ink whatever the Space colour, and the red badge with a white cross at 48 and 26, a plain red dot at 14.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * DRAWN_SIZES.length)
		await expectArtboardF(canvasElement)
		for (const avatar of avatarsIn(canvasElement)) {
			const hatches = inThemeLayer(avatar, "space-avatar-hatch")
			await expect(hatches).toHaveLength(1)
			await expect(hatches[0]).toHaveAttribute("stroke-opacity", "0.2")
			await expect(
				hatches[0]?.closest("[opacity]")?.getAttribute("opacity"),
			).toBe(OFFLINE_GROUP_OPACITY[themeOf(avatar)])
			await expect(
				slotIn(avatar, "space-avatar-offline").querySelectorAll("path"),
			).toHaveLength(avatar.dataset.size === "14" ? 0 : 1)
		}
	},
})

export const WithoutName = meta.story({
	render: () => (
		<>
			{sizeRow("local", COLOURED, "")}
			{sizeRow("local", COLOURED, "   ")}
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A Space whose name is not known yet, or blank, at 48, 26 and 14px. Check the tile and its laptop badge are drawn with no initial.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = avatarsIn(canvasElement)
		await expect(avatars).toHaveLength(2 * 2 * DRAWN_SIZES.length)
		for (const avatar of avatars) {
			await expect(slotsIn(avatar, "space-avatar-initial")).toHaveLength(0)
			await expect(slotsIn(avatar, "space-avatar-local")).toHaveLength(1)
		}
	},
})

export const RailMixedStates = meta.story({
	render: () => (
		<div className={RAIL} data-slot="mixed-rail">
			{MIXED_SPACES.map((space) => (
				<div className={RAIL_SLOT} key={space.id}>
					<SpaceAvatar
						colour={space.colour}
						name={space.name}
						size={RAIL_TILE}
						spaceId={space.id}
						state={space.state}
					/>
				</div>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, the rail, in both themes: from top to bottom Atelier local in hue 250, Harbour Studio online in hue 236, Personal local with no colour, Fieldwork offline and Quarry Labs online in hue 28, at 26px. The rail is a 52px panel in the sidebar fill with a 1px border, a 14px radius and 12px of block padding, its tiles centred at a 40px pitch, 16px from its top and bottom edges. Check Personal draws its initial in the neutral ink and Fieldwork drops its colour for the hatched neutral tile. Pick `SpacesMenuMixedStates` for the 14px rows.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * MIXED_SPACES.length)
		await expectArtboardF(canvasElement)
		for (const rail of await panelsInBothThemes(canvasElement, "mixed-rail")) {
			const colours = CONTEXT_COLOURS[themeOf(rail)]
			const style = getComputedStyle(rail)
			await expect(style.backgroundColor).toBe(rgbOf(colours.railFill))
			await expect(style.borderTopColor).toBe(rgbOf(colours.railBorder))
			await expect(style.borderTopWidth).toBe("1px")
			await expect(style.paddingTop).toBe("12px")
			await expect(style.borderTopLeftRadius).toBe("14px")
			const frame = rail.getBoundingClientRect()
			await expect(frame.width).toBe(RAIL_WIDTH)
			const tiles = (await expectMixedSpacesIn(rail)).map((avatar) =>
				avatar.getBoundingClientRect(),
			)
			for (const [index, tile] of tiles.entries()) {
				await expect(tile.width).toBe(RAIL_TILE)
				await expect(tile.left - frame.left).toBe((RAIL_WIDTH - RAIL_TILE) / 2)
				await expect(tile.top - frame.top).toBe(RAIL_EDGE + index * RAIL_PITCH)
			}
			await expect(frame.height).toBe(
				2 * RAIL_EDGE + (tiles.length - 1) * RAIL_PITCH + RAIL_TILE,
			)
		}
	},
})

export const SpacesMenuMixedStates = meta.story({
	render: () => (
		<ul className={MENU} data-slot="mixed-menu">
			{MIXED_SPACES.map((space) => (
				<li
					aria-current={space.id === CURRENT_SPACE_ID || undefined}
					className={MENU_ROW}
					key={space.id}
				>
					<SpaceAvatar
						colour={space.colour}
						name={space.name}
						size={MENU_AVATAR}
						spaceId={space.id}
						state={space.state}
					/>
					<span>{space.name}</span>
				</li>
			))}
		</ul>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, the Spaces menu, in both themes: the same five Spaces in the same hues, Atelier 250, Harbour Studio 236, Personal with no colour, Fieldwork offline and Quarry Labs 28, at 14px beside their names. The menu is a 232px panel in the menu fill with a 1px border, a 12px radius, 6px of padding and no shadow, holding 28px rows with a 6px radius, the avatar 8px from the row start and the name 8px after it in 13px regular type on a 16px line. Only Atelier, the current Space, wears the highlight fill. Check every initial reads at 10px bold, the laptop badges of Atelier and Personal, the green dots of Harbour Studio and Quarry Labs, and the plain red dot with no cross on the hatched Fieldwork tile. Pick `RailMixedStates` for 26px.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * MIXED_SPACES.length)
		await expectArtboardF(canvasElement)
		for (const menu of await panelsInBothThemes(canvasElement, "mixed-menu")) {
			const colours = CONTEXT_COLOURS[themeOf(menu)]
			const style = getComputedStyle(menu)
			await expect(style.backgroundColor).toBe(rgbOf(colours.menuFill))
			await expect(style.borderTopColor).toBe(rgbOf(colours.menuBorder))
			await expect(style.borderTopWidth).toBe("1px")
			await expect(style.paddingTop).toBe("6px")
			await expect(style.borderTopLeftRadius).toBe("12px")
			await expect(style.boxShadow).toBe("none")
			await expect(menu.getBoundingClientRect().width).toBe(MENU_WIDTH)
			await expectMixedSpacesIn(menu)
			const rows = Array.from(menu.children) as HTMLElement[]
			await expect(rows.map((row) => row.tagName)).toEqual(
				MIXED_SPACES.map(() => "LI"),
			)
			for (const [index, row] of rows.entries()) {
				const space = MIXED_SPACES[index]
				const isCurrent = space?.id === CURRENT_SPACE_ID
				const rowStyle = getComputedStyle(row)
				const frame = row.getBoundingClientRect()
				const avatar = slotIn(row, "space-avatar").getBoundingClientRect()
				const name = row.lastElementChild as HTMLElement
				const nameStyle = getComputedStyle(name)
				await expect(frame.height).toBe(MENU_ROW_HEIGHT)
				await expect(rowStyle.borderTopLeftRadius).toBe("6px")
				await expect(rowStyle.paddingInlineEnd).toBe("8px")
				await expect(rowStyle.backgroundColor).toBe(
					isCurrent ? rgbOf(colours.highlight) : "rgba(0, 0, 0, 0)",
				)
				await expect(row.getAttribute("aria-current")).toBe(
					isCurrent ? "true" : null,
				)
				await expect(avatar.left - frame.left).toBe(MENU_AVATAR_INSET)
				await expect(avatar.top - frame.top).toBe(
					(MENU_ROW_HEIGHT - MENU_AVATAR) / 2,
				)
				await expect(name.textContent).toBe(space?.name)
				await expect(name.getBoundingClientRect().left - frame.left).toBe(
					MENU_NAME_OFFSET,
				)
				await expect(nameStyle.fontSize).toBe("13px")
				await expect(nameStyle.lineHeight).toBe("16px")
				await expect(nameStyle.fontWeight).toBe("400")
				await expect(nameStyle.color).toBe(rgbOf(colours.name))
			}
		}
	},
})
