import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	SpaceAvatar,
	type SpaceAvatarState,
} from "@workspace/ui/components/space-avatar"
import {
	SPACE_AVATAR_SIZES,
	type SpaceAvatarSize,
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

const SPACE_ID = "space-release-desk"

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

const avatarsIn = (root: HTMLElement) => slotsIn(root, "space-avatar")

const meta = preview.meta({
	title: "Branding/SpaceAvatar",
	component: SpaceAvatar,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The mark of a Space, 8A Horizon Glaze: a superellipse with three arcs drawn from one corner, picked with their radii from the Space id, so a Space keeps its mark whatever its colour. From 20px it wears four tones of its colour under a glaze; under 20px a compact recipe with two arcs and three tones. Personal, a Space with no colour, wears the same arcs in greys. The state is drawn on the mark: the green dot while shared or online, lines while connecting, greys while not connected, a dashed outline for an invitation. The mark is decorative: the surface that draws it carries the Space's name and state in its accessible name.",
			},
		},
	},
	args: { spaceId: SPACE_ID, colour: COLOURED, size: 48 },
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
	render: () => <SpaceAvatar colour={210} size={48} spaceId={SPACE_ID} />,
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
					"Artboard 4: the eight states at 14 and 48px for a coloured Space and at 48px for Personal, in both themes. Check the green dot parted from the glaze by a ring of the surface while shared or online, the warning ring outside the square with attention, keeping the dot, the ground with its arcs as lines while connecting, the greys while not connected, the dashed outline of an invitation and the lines inside it while joining.",
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
