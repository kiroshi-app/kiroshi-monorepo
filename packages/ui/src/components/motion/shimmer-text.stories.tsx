import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	slotIn,
	slotsIn,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { ShimmerText } from "@workspace/ui/components/motion/shimmer-text"

const CHAT_LABEL = "Thinking"

const SIDEBAR_TITLE =
	"Quarterly roadmap review with the platform and growth teams"

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const ShortBesideLong = () => (
	<div
		className="flex items-center gap-8 text-compact leading-5"
		data-slot="shimmer-pair"
	>
		<span className="shrink-0">
			<ShimmerText className="inline">{CHAT_LABEL}</ShimmerText>
		</span>
		<span className="block w-56 truncate" data-slot="sidebar-title">
			<ShimmerText className="inline" isHeldUnderReducedMotion>
				{SIDEBAR_TITLE}
			</ShimmerText>
		</span>
	</div>
)

const pairsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "shimmer-pair").map((pair) => {
		const [label, title] = slotsIn(pair, "shimmer-text")
		if (!label || !title) throw new Error("A pair draws two shimmers")
		return { pair, label, title }
	})

const bandOffsetAt = (shimmer: HTMLElement, elapsed: number) => {
	const [sweep] = shimmer.getAnimations()
	if (!sweep) throw new Error("Nothing here sweeps")
	sweep.pause()
	sweep.currentTime = elapsed
	return getComputedStyle(shimmer).backgroundPositionX
}

const meta = preview.meta({
	title: "Primitives/ShimmerText",
	component: ShimmerText,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					'Text that reads as still working, and the only shimmer the app plays for work in progress. The glyphs rest on `--muted-foreground` and a band of `--foreground` crosses them left to right on a loop. The band is sized and moved in fixed lengths, never in a share of the text, so it is as wide and as fast on one word as on a long title; a line wider than the band tile shows the next band following at the same distance. Reach for it on a label whose work has no measurable progress, a turn being drafted, a mission still running, and drop it the moment there is a number to show. It loops with no exit: it stops when the caller swaps the label. The glyphs are painted through `background-clip: text`, so the label must never be the only carrier of a state: say it in words beside it. Under `prefers-reduced-motion` it settles on flat `--muted-foreground`, or keeps one still band over the start of the text when given `isHeldUnderReducedMotion`. Pass `className="inline"` inside a parent that truncates, so the parent draws the ellipsis.',
			},
		},
	},
	args: { children: CHAT_LABEL },
	argTypes: { children: { control: "text" } },
})

export const Default = meta.story({
	name: "One word beside a long title",
	render: () => <ShortBesideLong />,
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to judge the band itself: a one word chat label beside a sidebar title too long for its row, both working, in light and in dark. Check that the band is as wide on the word as on the title and crosses both at the same pace, that the title still ends on an ellipsis in its resting colour, and that each theme rests on its own muted foreground with its own foreground crossing it. Pick `ReducedMotion` for the same pair held still.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const { label, title } of pairsIn(canvasElement)) {
			await expect(title.textContent).toBe(SIDEBAR_TITLE)
			await expect(getComputedStyle(title, "::before").content).toBe("none")
			await expect(getComputedStyle(title).display).toBe("inline")

			const clip = title.parentElement
			if (!clip) throw new Error("The title sits in a row that cuts it")
			await expect(getComputedStyle(clip).textOverflow).toBe("ellipsis")
			await expect(clip.scrollWidth).toBeGreaterThan(clip.clientWidth)
			await expect(title.getBoundingClientRect().width).toBeGreaterThan(
				3 * label.getBoundingClientRect().width,
			)
		}

		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			const bases = []
			for (const { pair, label, title } of pairsIn(canvasElement)) {
				const base = tokenStyleIn(pair, "text-muted-foreground", "color")
				const highlight = tokenStyleIn(pair, "text-foreground", "color")
				bases.push(base)

				for (const shimmer of [label, title]) {
					const moving = getComputedStyle(shimmer)
					await expect(moving.animationName).toBe("ui-shimmer-text")
					await expect(moving.animationIterationCount).toBe("infinite")
					await expect(moving.animationTimingFunction).toBe("linear")
					await expect(moving.color).toBe(TRANSPARENT)
					await expect(moving.backgroundColor).toBe(base)
					await expect(moving.backgroundImage).toContain(highlight)
				}

				await expect(getComputedStyle(label).backgroundSize).toBe(
					getComputedStyle(title).backgroundSize,
				)
				await expect(getComputedStyle(label).animationDuration).toBe(
					getComputedStyle(title).animationDuration,
				)
				const early = bandOffsetAt(label, 250)
				const late = bandOffsetAt(label, 750)
				await expect(early).not.toBe(late)
				await expect(bandOffsetAt(title, 250)).toBe(early)
				await expect(bandOffsetAt(title, 750)).toBe(late)
			}
			await expect(new Set(bases).size).toBe(bases.length)
		})
	},
})

export const ReducedMotion = meta.story({
	name: "Reduced motion, flat or held",
	render: () => <ShortBesideLong />,
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"The same pair under `prefers-reduced-motion: reduce`, which is how the test browser renders every story here. Check that nothing moves, that the chat label drops the band for flat muted foreground, and that the sidebar title, which asks to be held, keeps one still band over its first letters, inside the part its row leaves visible, so a working row still differs from a resting one. Pick `Default` for the band in motion.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const { pair, label, title } of pairsIn(canvasElement)) {
			const flat = getComputedStyle(label)
			await expect(flat.animationName).toBe("none")
			await expect(flat.backgroundImage).toBe("none")
			await expect(flat.color).toBe(
				tokenStyleIn(pair, "text-muted-foreground", "color"),
			)

			const held = getComputedStyle(title)
			await expect(held.animationName).toBe("none")
			await expect(held.backgroundImage).toContain("linear-gradient(90deg")
			const bandStart =
				Number.parseFloat(held.backgroundPositionX) +
				0.4 * Number.parseFloat(held.backgroundSize)
			const bandEnd = bandStart + 0.2 * Number.parseFloat(held.backgroundSize)
			await expect(bandStart).toBeCloseTo(0)
			await expect(bandEnd).toBeLessThan(title.parentElement?.clientWidth ?? 0)
			await expect(held.color).toBe(TRANSPARENT)
		}
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	render: () => (
		<p className="max-w-sm text-sm leading-6">
			<ShimmerText className="inline">
				Reading every file the last commit touched, then summarising what
				changed
			</ShimmerText>
		</p>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A sentence long enough to wrap, which no screen of the app assembles: every working label there is cut on one line. Check that the text wraps like the paragraph around it and that the band runs on along the lines at the width it has everywhere else. Reach for `Default` wherever the label fits on one line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shimmer = slotIn(canvasElement, "shimmer-text")
		await expect(shimmer.getClientRects().length).toBeGreaterThan(1)
	},
})
