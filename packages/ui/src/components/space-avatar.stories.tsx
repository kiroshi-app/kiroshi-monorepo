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
	{ id: "atelier", name: "Atelier", colour: BLOT_HUES.blue, state: "local" },
	{
		id: "harbour-studio",
		name: "Harbour Studio",
		colour: BLOT_HUES.green,
		state: "online",
	},
	{ id: "personal", name: "Personal", colour: null, state: "local" },
	{
		id: "fieldwork",
		name: "Fieldwork",
		colour: BLOT_HUES.orange,
		state: "offline",
	},
	{
		id: "quarry-labs",
		name: "Quarry Labs",
		colour: BLOT_HUES.red,
		state: "online",
	},
]

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

const RAIL = "flex flex-col items-center gap-3"

const MENU = "flex w-48 flex-col gap-1"

const MENU_ROW = "flex items-center gap-2 px-2 py-1 text-foreground text-sm"

const avatarsIn = (root: HTMLElement) => slotsIn(root, "space-avatar")

const themeOf = (avatar: HTMLElement): SpaceAvatarTheme =>
	avatar.closest(".dark") ? "dark" : "light"

const inThemeLayer = (avatar: HTMLElement, slot: string) =>
	Array.from(
		avatar.querySelectorAll(
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
		await expect(initial).toHaveAttribute("font-size", `${artboard.fontSize}`)
		await expect(initial).toHaveAttribute("font-weight", `${artboard.weight}`)
		await expect(
			initial.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		const colour = avatar.dataset.colour
		await expect(initial).toHaveAttribute(
			"fill",
			spaceInk(
				themeOf(avatar),
				state === "offline" || colour === undefined ? null : Number(colour),
			),
		)
	}
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
					"Artboard F, a joined Space whose host does not answer at 48, 26 and 14px, in both themes. Check the neutral tile crossed by 45 degree lines from bottom left to top right, the initial in the neutral ink whatever the Space colour, and the red badge with a white cross at 48 and 26, a plain red dot at 14.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * DRAWN_SIZES.length)
		await expectArtboardF(canvasElement)
		for (const avatar of avatarsIn(canvasElement)) {
			await expect(inThemeLayer(avatar, "space-avatar-hatch")).toHaveLength(1)
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
		<div className={RAIL}>
			{MIXED_SPACES.map((space) => (
				<SpaceAvatar
					colour={space.colour}
					key={space.id}
					name={space.name}
					size={26}
					spaceId={space.id}
					state={space.state}
				/>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, the rail: Atelier local in blue, Harbour Studio online, Personal local with no colour, Fieldwork offline and Quarry Labs online in red, at 26px. Check Personal draws its initial in the neutral ink and Fieldwork drops its colour for the hatched neutral tile. Pick `SpacesMenuMixedStates` for the 14px rows.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * MIXED_SPACES.length)
		await expectArtboardF(canvasElement)
	},
})

export const SpacesMenuMixedStates = meta.story({
	render: () => (
		<ul className={MENU}>
			{MIXED_SPACES.map((space) => (
				<li className={MENU_ROW} key={space.id}>
					<SpaceAvatar
						colour={space.colour}
						name={space.name}
						size={14}
						spaceId={space.id}
						state={space.state}
					/>
					{space.name}
				</li>
			))}
		</ul>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F, the Spaces menu: the same five Spaces at 14px beside their names. Check every initial reads at 10px bold, the laptop badges of Atelier and Personal, the green dots of Harbour Studio and Quarry Labs, and the plain red dot with no cross on the hatched Fieldwork tile. Pick `RailMixedStates` for 26px.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(avatarsIn(canvasElement)).toHaveLength(2 * MIXED_SPACES.length)
		await expectArtboardF(canvasElement)
	},
})
