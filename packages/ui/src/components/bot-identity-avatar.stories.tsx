import { useState } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	companionGlyphOf,
	companionHueOf,
	drawingOf,
	expectCellsIn,
	expectCompanionPictureShape,
	expectCompanionSilhouette,
	expectGlazeBorders,
	expectRoundAvatar,
	pictureOf,
	Row,
	recordLitCells,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BOT_BADGES } from "@workspace/ui/components/bot-badge"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	BLOT_HUES,
	BLOT_TINTS,
} from "@workspace/ui/components/companion-colour"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { Button } from "@workspace/ui/components/ui/button"

const SIZES = [40, 96, 24]

const HONEYCOMB_SIZES = [16, 96]

const HoneycombSizes = (props: BotIdentityAvatarProps) => (
	<Row>
		{HONEYCOMB_SIZES.map((size) => (
			<BotIdentityAvatar {...props} key={size} size={size} />
		))}
	</Row>
)

const expectOneHoneycomb = async (canvasElement: HTMLElement) => {
	const drawings = botIdentityAvatars(canvasElement).map((avatar) => {
		const canvas = avatar.querySelector("canvas")
		return canvas ? drawingOf(canvas) : ""
	})

	await expect(drawings).toHaveLength(HONEYCOMB_SIZES.length * 2)
	await expect(drawings.every((drawing) => drawing !== "")).toBe(true)
	await expect(new Set(drawings).size).toBe(1)
}

const DRAWN_PICTURE_SLOTS = [{ size: 40 }, { size: 20 }]

const DrawnPictureSlots = (props: BotIdentityAvatarProps) => (
	<Row>
		{DRAWN_PICTURE_SLOTS.map(({ size }) => (
			<BotIdentityAvatar {...props} key={size} size={size} />
		))}
	</Row>
)

const activityDotOf = (avatar: HTMLElement) =>
	slotsIn(avatar, "bot-activity-dot")[0]

const EveryPlace = (props: BotIdentityAvatarProps) => (
	<Row>
		{SIZES.map((size) => (
			<BotIdentityAvatar {...props} key={size} size={size} />
		))}
	</Row>
)

const Changing = (props: BotIdentityAvatarProps) => {
	const [wearing, setWearing] = useState(false)

	return (
		<div className="flex flex-col items-start gap-4">
			<EveryPlace
				{...props}
				image={wearing ? UPLOADED_AVATAR_IMAGE : undefined}
			/>
			<Button onClick={() => setWearing(!wearing)} size="sm" variant="outline">
				Change the companion
			</Button>
		</div>
	)
}

const expectGlyph = async (avatar: HTMLElement, state: string) => {
	const glyph = companionGlyphOf(avatar)
	await expect(glyph).toHaveAccessibleName("Atlas")
	await expect(glyph.dataset.state).toBe(state)
}

const cellsOf = (glyph: HTMLElement) => {
	const canvas = glyph.querySelector("canvas")
	if (!canvas) throw new Error("This avatar draws no cells")
	return canvas
}

const BROKEN_AVATAR_IMAGE = "data:image/png;base64,AAAA"

const imageFailed = () =>
	new Promise<void>((resolve) => {
		const probe = new Image()
		probe.onerror = () => resolve()
		probe.src = BROKEN_AVATAR_IMAGE
	})

const expectFallbackGlyph = async (avatar: HTMLElement, state: string) => {
	await waitFor(() => expectGlyph(avatar, state))
	const glyph = companionGlyphOf(avatar)

	await expect(avatar.querySelector("img")).toBeNull()
	await expect(companionHueOf(glyph)).toBe(BLOT_HUES.blue)
	await expect(glyph.getBoundingClientRect().width).toBe(
		avatar.getBoundingClientRect().width,
	)
	await expectCompanionSilhouette(glyph)
}

const meta = preview.meta({
	title: "Branding/BotIdentityAvatar",
	component: BotIdentityAvatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A companion's face, wherever it is shown: the roster row, its settings column, the replies it signs, the row that says it is working. One component for all of them, so every place draws the same companion. A companion with an uploaded picture is that picture. Otherwise it is its dithered field, drawn from its name and the colour it was given: the silhouette and the screen come from the name, the hue from the colour, so two companions sharing a colour still part by shape. At rest the field holds still; at work it drifts in the way its kind of work moves. The dot at the corner is a badge the caller hands down, never the work itself. Size is the only thing a call site changes.",
			},
		},
	},
	args: {
		name: "Atlas",
		hue: BLOT_HUES.blue,
		seed: "bot-7",
		size: 96,
	},
	argTypes: {
		badge: { control: "select", options: [undefined, ...BOT_BADGES] },
		hue: { control: { type: "range", min: 0, max: 359, step: 1 } },
		name: { control: "text" },
		size: { control: { type: "range", min: 16, max: 160, step: 8 } },
		working: { control: "boolean" },
	},
})

export const Rest = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"One companion at rest: its dithered field in the hue of the colour it was given, drawn once and left alone. Check in both themes that nothing moves, that the field fills the rounded hexagon of the Kiroshi mark and that no dot is drawn. Pick `Working` for the same companion mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)
		const glyph = companionGlyphOf(avatar)

		await expectGlyph(avatar, "idle")
		await expect(companionHueOf(glyph)).toBe(BLOT_HUES.blue)
		await expectCompanionSilhouette(glyph)
		for (const layer of [avatar, glyph]) {
			await expect(getComputedStyle(layer).borderRadius).toBe("0px")
			await expect(getComputedStyle(layer).outlineStyle).toBe("none")
		}
		await expect(activityDotOf(avatar)).toBeUndefined()
	},
})

export const EverySize = meta.story({
	tags: ["test-only"],
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The three sizes the product asks for, a roster row, a settings column and a reply, from one component and one identity. Check that they are the same field at three scales: the grid keeps its cell count and only the cell shrinks, so the 24px one is the same drawing.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const drawn = botIdentityAvatars(canvasElement)

		await expect(drawn).toHaveLength(SIZES.length)
		for (const [index, avatar] of drawn.entries()) {
			await expect(avatar.getBoundingClientRect().width).toBeCloseTo(
				SIZES[index],
			)
			await expectGlyph(avatar, "idle")
		}
	},
})

export const EveryTint = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<Row>
			<BotIdentityAvatar {...args} hue={undefined} />
			{BLOT_TINTS.map((blot) => (
				<BotIdentityAvatar {...args} hue={BLOT_HUES[blot]} key={blot} />
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The companion with no colour, then the eight colours a companion can be given. Each colour paints the cells in its hue on the secondary surface tinted with that hue at the avatar ground strength, so the ground follows the theme and the cells lighten in dark to hold on it; the uncoloured one paints its cells in Kiroshi blue. Switch to dark and check the cells read lighter than their ground on all nine, with no near-white tile.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [none, ...tinted] =
			botIdentityAvatars(canvasElement).map(companionGlyphOf)

		await expect(companionHueOf(none)).toBeUndefined()
		await expect(tinted.map((glyph) => companionHueOf(glyph))).toEqual(
			BLOT_TINTS.map((blot) => BLOT_HUES[blot]),
		)
	},
})

export const FreeHue = meta.story({
	args: { hue: 210 },
	parameters: {
		docs: {
			description: {
				story:
					"A companion given a hue outside the eight presets, 210. Check that its cells are painted in that hue, between cyan and blue, rather than snapped to the nearest preset.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(avatar))).toBe(210)
	},
})

export const NoChosenColour = meta.story({
	args: { hue: undefined },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion never given a colour: its cells are the fixed Kiroshi blue rather than a hue of its own, on the secondary surface tinted with that blue. Switch the theme and check the ground follows it and the blue cells hold on it in both.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			const glyph = companionGlyphOf(avatar)
			await expectGlyph(avatar, "idle")
			await expect(companionHueOf(glyph)).toBeUndefined()
			await expectCellsIn(cellsOf(glyph), "var(--bot-avatar-field)")
		}
	},
})

export const WithBadge = meta.story({
	args: { badge: "attention" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion at rest carrying the badge its caller handed down. Check that the dot sits in the corner of the rounded square without leaving it. Pick `EveryBadge` for the three badges.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)
		const slot = avatar.getBoundingClientRect()
		const dot = activityDotOf(avatar)
		const box = dot.getBoundingClientRect()

		await expectGlyph(avatar, "idle")
		await expect(dot.dataset.badge).toBe("attention")
		await expect(box.right).toBeLessThanOrEqual(slot.right)
		await expect(box.bottom).toBeLessThanOrEqual(slot.bottom)
	},
})

export const EveryBadge = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<Row>
			<BotIdentityAvatar {...args} badge={undefined} />
			{BOT_BADGES.map((badge) => (
				<BotIdentityAvatar {...args} badge={badge} key={badge} />
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three things a dot can mean, and the companion that means none of them. Attention is orange and breathes, because it is the only one asking the reader for something; a finished turn is green and a failed one is red, and both hold perfectly still — a turn that is over has nothing left to signal. The three colours are fixed and do not follow the theme: green cannot become teal on the water theme without the dot losing the only thing it says. Switch the Storybook theme, and light to dark, and check that all three hold. The first avatar carries no badge and must draw no dot at all.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [none, ...badged] =
			botIdentityAvatars(canvasElement).map(activityDotOf)

		await expect(none).toBeUndefined()
		await expect(badged.map((dot) => dot.dataset.badge)).toEqual([
			...BOT_BADGES,
		])
		await expect(
			badged.map((dot) => dot.classList.contains("motion-safe:animate-pulse")),
		).toEqual([true, false, false])
	},
})

export const BadgedWhileWorking = meta.story({
	tags: ["test-only"],
	args: { badge: "failed", working: true, kind: "searching" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A badge and a run are two different things, and the component keeps them apart: the glyph is searching because `working` says so, and the dot is red because the caller said the last turn failed. Neither reads the other. Check that the dot is sized from the avatar so it lands the same on a 24px reply as on a 96px preview.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expectGlyph(avatar, "searching")
			await expect(activityDotOf(avatar).dataset.badge).toBe("failed")
		}
	},
})

export const Working = meta.story({
	args: { working: true, kind: "writing" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The companion at work, in all three places. Its glyph and colour stay its own; the motion is the work: writing fills top to bottom, searching sweeps across, thinking ripples out, working spins and waiting breathes. No size wears a dot. Open this in Storybook for the movement; the test browser forces reduced motion, where each kind holds a still pose of its own.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expectGlyph(avatar, "writing")
			await expect(activityDotOf(avatar)).toBeUndefined()
		}
	},
})

export const Waiting = meta.story({
	tags: ["test-only"],
	args: { working: true, kind: "waiting" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion waiting on the reader: its glyph breathes rather than resting, so waiting reads as attention and not as idleness.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)
		await expectGlyph(avatar, "waiting")
	},
})

export const WithImage = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { image: UPLOADED_AVATAR_IMAGE },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion wearing a picture its reader uploaded. It wins over the glyph in every place and is decorative in all of them: the row, the column and the reply each name the companion in their own text. Check that no glyph is drawn beside it. Pick `UploadedWorking` for the same picture mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expect(await pictureOf(avatar)).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			)
			await expect(
				avatar.querySelector('[data-slot="companion-field"]'),
			).toBeNull()
			await expectCompanionPictureShape(avatar)
		}
	},
})

export const BrokenImage = meta.story({
	args: { image: BROKEN_AVATAR_IMAGE },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion whose picture never arrives: the link is there but the image fails to load. The companion falls back to its own glyph, in the same hexagon, at the same size and in the same hue as a companion that never had a picture, so the slot is never left empty. Check in both themes that each place matches `Rest`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await imageFailed()
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expectFallbackGlyph(avatar, "idle")
		}
	},
})

export const BrokenImageWorkingBadged = meta.story({
	tags: ["test-only"],
	args: {
		image: BROKEN_AVATAR_IMAGE,
		working: true,
		kind: "searching",
		badge: "attention",
	},
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion whose picture failed, mid-run and badged. The fallback glyph moves exactly as a companion without a picture would, and the badge stays drawn over it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await imageFailed()
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expectFallbackGlyph(avatar, "searching")
			await expect(activityDotOf(avatar).dataset.badge).toBe("attention")
		}
	},
})

export const UploadedWorking = meta.story({
	tags: ["test-only"],
	args: { image: UPLOADED_AVATAR_IMAGE, working: true, kind: "searching" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion with a picture, working. The picture stays: swapping it for a glyph that can move would put somebody else on the screen mid-run. A photograph cannot act, so a running picture is read from the line beside it: the corner belongs to the badge and stays empty while none is given. Check that no dot is drawn at any size and that the picture is untouched.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expect(await pictureOf(avatar)).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			)
			await expect(
				avatar.querySelector('[data-slot="bot-activity-dot"]'),
			).toBeNull()
			await expectCompanionPictureShape(avatar)
		}
	},
})

export const UploadedAtDrawnSizes = meta.story({
	tags: ["test-only"],
	args: { image: UPLOADED_AVATAR_IMAGE },
	render: (args) => (
		<Row>
			<DrawnPictureSlots {...args} />
			<InitialsAvatar
				image={UPLOADED_AVATAR_IMAGE}
				name="Ada Martin"
				size={40}
			/>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A companion picture at the two slot sizes the artboards draw, the roster line at 40px and the header identity at 20px, beside the reader's own picture. A companion picture is a rounded square whose corner is a quarter of its slot, never under 6px; the reader's stays a circle. Check a 10px corner at 40px, a 6px corner at 20px, no border on either, and a round reader.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = botIdentityAvatars(canvasElement)

		for (const index of DRAWN_PICTURE_SLOTS.keys()) {
			await expectCompanionPictureShape(avatars[index])
		}

		const [reader] = slotsIn(canvasElement, "user-avatar")
		await pictureOf(reader)
		await expectRoundAvatar(reader)
	},
})

export const UploadedBadged = meta.story({
	tags: ["test-only"],
	args: { image: UPLOADED_AVATAR_IMAGE, badge: "attention" },
	render: (args) => <DrawnPictureSlots {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A companion picture carrying a badge at both drawn slot sizes. Check that the dot sits in the corner of the rounded square without leaving the slot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			const slot = avatar.getBoundingClientRect()
			const dot = activityDotOf(avatar).getBoundingClientRect()

			await expectCompanionPictureShape(avatar)
			await expect(dot.left).toBeGreaterThanOrEqual(slot.left)
			await expect(dot.top).toBeGreaterThanOrEqual(slot.top)
			await expect(dot.right).toBeLessThanOrEqual(slot.right)
			await expect(dot.bottom).toBeLessThanOrEqual(slot.bottom)
		}
	},
})

export const BoundToOneBot = meta.story({
	tags: ["test-only"],
	render: (args) => <Changing {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"What one component buys: change the companion and every place changes with it. Press the button and all three sizes go from the glyph to a picture together, and back. Check that the three never disagree at any point.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const drawn = () => botIdentityAvatars(canvasElement)
		const change = () =>
			userEvent.click(
				canvas.getByRole("button", { name: "Change the companion" }),
			)

		for (const avatar of drawn()) await expectGlyph(avatar, "idle")

		await change()
		for (const avatar of drawn()) {
			await expect(await pictureOf(avatar)).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			)
			await expect(
				avatar.querySelector('[data-slot="companion-field"]'),
			).toBeNull()
		}

		await change()
		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toBeNull()
			await expectGlyph(avatar, "idle")
		}
	},
})

export const HoneycombIdle = meta.story({
	globals: { theme_layout: "side-by-side" },
	beforeEach: recordLitCells,
	render: (args) => <HoneycombSizes {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The field as a honeycomb at rest, at 16 px, the smallest size the app draws a companion at, in mentions and arrival rows, and at 96 px, the settings preview. Flat-topped hexagons in the Kiroshi mark's orientation, every other row offset by half a cell, one gap between every pair of neighbours, and no hexagon cut at the outline. Check in both themes that the glyph reads at 16 px and that both sizes are one drawing. Pick `HoneycombWorking` for the same companion at work.",
			},
		},
	},
	play: ({ canvasElement }) => expectOneHoneycomb(canvasElement),
})

export const HoneycombWorking = meta.story({
	globals: { theme_layout: "side-by-side" },
	beforeEach: recordLitCells,
	args: { working: true, kind: "working" },
	render: (args) => <HoneycombSizes {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same honeycomb at work, at 16 and 96 px in both themes: the field drifts and the working motion runs through the hexagons, never outside the outline. Under reduced motion, what the test run renders, it holds the still idle honeycomb. Pick `HoneycombIdle` for the resting companion.",
			},
		},
	},
	play: ({ canvasElement }) => expectOneHoneycomb(canvasElement),
})

const BORDER_SIZES = [14, 24, 40, 64]

const BorderSizes = (props: BotIdentityAvatarProps) => (
	<div className="flex flex-col gap-3">
		<Row>
			{BORDER_SIZES.map((size) => (
				<BotIdentityAvatar {...props} key={size} size={size} />
			))}
		</Row>
		<Row>
			{BORDER_SIZES.map((size) => (
				<BotIdentityAvatar
					{...props}
					image={UPLOADED_AVATAR_IMAGE}
					key={size}
					size={size}
				/>
			))}
		</Row>
	</div>
)

const expectBorderAtEverySize = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	const avatars = botIdentityAvatars(canvasElement)
	await expect(
		avatars.map((avatar) => avatar.getBoundingClientRect().width),
	).toEqual([...BORDER_SIZES, ...BORDER_SIZES])
	for (const avatar of avatars.slice(BORDER_SIZES.length))
		await pictureOf(avatar)
	await expectGlazeBorders(canvasElement, theme)
}

const BORDER_STORY =
	"The C border at 14, 24, 40 and 64, over the dithered field on the first line and over an uploaded picture on the second. From 20px up the hexagon wears a translucent edge drawn inside its outline and a white lip along its top; below 20px it wears a slightly stronger edge alone. No sheen, no highlight, no arcs. Pick `BorderAtEverySizeDark` for the dark theme."

export const BorderAtEverySize = meta.story({
	render: (args) => <BorderSizes {...args} />,
	parameters: { docs: { description: { story: BORDER_STORY } } },
	play: ({ canvasElement }) => expectBorderAtEverySize(canvasElement, "light"),
})

export const BorderAtEverySizeDark = meta.story({
	globals: { theme: "dark" },
	render: (args) => <BorderSizes {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same four sizes in the dark theme: the edge turns white and the lip dims, so the border reads on a dark sidebar without glowing.",
			},
		},
	},
	play: ({ canvasElement }) => expectBorderAtEverySize(canvasElement, "dark"),
})
