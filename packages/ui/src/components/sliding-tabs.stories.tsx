import {
	type ComponentProps,
	type ReactNode,
	type TransitionEvent,
	useState,
} from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	emulateMotion,
	isInBrowserRunner,
	slotIn,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	SlidingTab,
	SlidingTabCount,
	SlidingTabs,
} from "@workspace/ui/components/sliding-tabs"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SlidingTabsProps = ComponentProps<typeof SlidingTabs>

const SEARCH_KINDS = [
	"All",
	"Conversations",
	"Messages",
	"Missions",
	"Routines",
]

const QUESTION_HEADERS = ["Plan", "Channels", "Billing"]

const FILTER_COUNTS = { All: 14, Images: 8, Documents: 4, Boards: 2 }

const GROWN_FILTER_COUNTS = { ...FILTER_COUNTS, All: 1014, Images: 1008 }

const filterTabsOf = (counts: Record<string, number>) =>
	Object.entries(counts).map(([label, count]) => (
		<SlidingTab key={label} value={label}>
			{label}
			<SlidingTabCount>{count}</SlidingTabCount>
		</SlidingTab>
	))

const PALETTE_STRIP = {
	kind: "tabs",
	value: "All",
	children: SEARCH_KINDS.map((kind) => (
		<SlidingTab key={kind} value={kind}>
			{kind}
		</SlidingTab>
	)),
} satisfies Partial<SlidingTabsProps>

const QUESTION_CONTROL = {
	kind: "segments",
	value: 0,
	activateOnFocus: true,
	children: QUESTION_HEADERS.map((header, index) => (
		<SlidingTab key={header} value={index}>
			{index === 0 ? (
				<Icons.Check
					aria-hidden="true"
					className="size-3 text-bot-badge-done"
				/>
			) : null}
			<span className="truncate">{header}</span>
		</SlidingTab>
	)),
} satisfies Partial<SlidingTabsProps>

const FILTER_ROW = {
	kind: "filters",
	value: "All",
	"aria-label": "Show",
	children: filterTabsOf(FILTER_COUNTS),
} satisfies Partial<SlidingTabsProps>

const HeldSlidingTabs = ({
	value: initialValue,
	onValueChange,
	...props
}: SlidingTabsProps) => {
	const [value, setValue] = useState(initialValue)

	return (
		<SlidingTabs
			{...props}
			onValueChange={(next) => {
				setValue(next)
				onValueChange(next)
			}}
			value={value}
		/>
	)
}

const onPillGlide = fn()

const reportPillGlide = (event: TransitionEvent<HTMLElement>) => {
	const moved = event.target as HTMLElement
	if (moved.dataset.slot === "sliding-tabs-pill") onPillGlide()
}

type GroundProps = {
	className?: string
	children: ReactNode
}

const PaletteRow = ({ className, children }: GroundProps) => (
	<div
		className={cn("flex h-11 items-center bg-popover px-3", className)}
		onTransitionRun={reportPillGlide}
	>
		{children}
	</div>
)

const QuestionPanel = ({ children }: GroundProps) => (
	<div
		className="flex w-80 flex-col rounded-[24px] bg-muted p-4"
		onTransitionRun={reportPillGlide}
	>
		{children}
	</div>
)

const LibraryContentRow = ({ children }: GroundProps) => (
	<div className="flex items-center" onTransitionRun={reportPillGlide}>
		{children}
	</div>
)

const GrowingFilterRow = (props: SlidingTabsProps) => {
	const [hasGrown, setHasGrown] = useState(false)
	const [hasVideos, setHasVideos] = useState(false)
	const { All, ...kinds } = hasGrown ? GROWN_FILTER_COUNTS : FILTER_COUNTS

	return (
		<div className="flex flex-col items-start gap-4">
			<LibraryContentRow>
				<HeldSlidingTabs {...props}>
					{filterTabsOf(
						hasVideos ? { All, Videos: 3, ...kinds } : { All, ...kinds },
					)}
				</HeldSlidingTabs>
			</LibraryContentRow>
			<Button onClick={() => setHasGrown(true)} variant="outline">
				Import a thousand images
			</Button>
			<Button onClick={() => setHasVideos(true)} variant="outline">
				Import a video
			</Button>
		</div>
	)
}

const pillBeside = (tab: HTMLElement) =>
	slotIn(tab.parentElement as HTMLElement, "sliding-tabs-pill")

const OFFSET_ROUNDING = 0.5

const PILL_EDGES = ["left", "top", "width", "height"] as const

const pillDriftFrom = (tab: HTMLElement) => {
	const pill = pillBeside(tab).getBoundingClientRect()
	const box = tab.getBoundingClientRect()
	return Math.max(...PILL_EDGES.map((edge) => Math.abs(pill[edge] - box[edge])))
}

const expectPillAlreadyUnder = (tab: HTMLElement) =>
	expect(pillDriftFrom(tab)).toBeLessThanOrEqual(OFFSET_ROUNDING)

const expectPillUnder = (tab: HTMLElement) =>
	waitFor(() => expectPillAlreadyUnder(tab))

const SNIPPET_GLIDE = [250, "cubic-bezier(0.22, 1, 0.36, 1)"]

const expectGlideTo = (tab: HTMLElement, press: () => Promise<void>) =>
	withMotionAllowed(async () => {
		await press()
		const glides = pillBeside(tab).getAnimations()
		await expect(glides.length).toBeGreaterThan(0)
		for (const glide of glides) {
			const timing = glide.effect?.getComputedTiming()
			await expect([timing?.duration, timing?.easing]).toEqual(SNIPPET_GLIDE)
		}
		await expect(tab.getAnimations({ subtree: true })).toHaveLength(0)
		await Promise.all(glides.map((glide) => glide.finished))
		await expectPillAlreadyUnder(tab)
	})

const pressAndFollow = async (tab: HTMLElement, press: () => Promise<void>) => {
	if (isInBrowserRunner()) return expectGlideTo(tab, press)
	await press()
	await expectPillUnder(tab)
}

const isInDarkTheme = (element: Element) => element.closest(".dark") !== null

const expectFillOnPill = async (tab: HTMLElement, fill: string) => {
	const pill = pillBeside(tab)
	await expect(pill).toHaveAttribute("aria-hidden", "true")
	await expect(getComputedStyle(pill).pointerEvents).toBe("none")
	await expect(getComputedStyle(pill).backgroundColor).toBe(
		tokenStyleIn(tab, fill, "backgroundColor"),
	)
	await expect(getComputedStyle(tab).backgroundColor).toBe(
		tokenStyleIn(tab, "bg-transparent", "backgroundColor"),
	)
}

const expectFocusRing = async (tab: HTMLElement) => {
	await expect(tab).toHaveFocus()
	await expect(tab.matches(":focus-visible")).toBe(true)
	const { boxShadow, outlineStyle } = getComputedStyle(tab)
	await expect([boxShadow, outlineStyle]).not.toEqual(["none", "none"])
}

const allowMotionBeforeMount = async () => {
	onPillGlide.mockClear()
	if (isInBrowserRunner()) await emulateMotion("no-preference")
}

const restoreReducedMotion = async () => {
	if (isInBrowserRunner()) await emulateMotion("reduce")
}

const meta = preview.meta({
	title: "Navigation/SlidingTabs",
	component: SlidingTabs,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One row of mutually exclusive choices whose active fill is a single pill that glides from the choice left to the choice taken, matching its position and width. `kind` picks one of three complete recipes: `tabs` is the search palette strip, a tablist on a bare track; `segments` is the question card control, a tablist lifted on a filled track; `filters` is the Library filter row, a toggle group whose pressed segment wears the Space colour. The pill is drawn behind the labels and takes no pointer, the label and count colours switch in one frame, and the glide is dropped under `prefers-reduced-motion`. The glide timing comes from the transitions.dev Tabs sliding snippet, `--tabs-dur` and `--tabs-ease` in `globals.css`.",
			},
		},
	},
	args: { ...PALETTE_STRIP, onValueChange: fn() },
	render: (args) => <HeldSlidingTabs {...args} />,
})

export const PaletteTabs = meta.story({
	globals: { theme: "light" },
	decorators: [
		(Story) => (
			<PaletteRow>
				<Story />
			</PaletteRow>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The search palette strip: five search kinds on a bare track, All active. Check that the pill sits under All from the first frame, that pressing Messages glides it there at the snippet's 250ms and easing while the label takes its active colour at once, and that the fill belongs to the pill and not to the tab. The app assembles it through `SearchPalette`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const messages = canvas.getByRole("tab", { name: "Messages" })
		await expectPillUnder(canvas.getByRole("tab", { name: "All" }))

		await pressAndFollow(messages, () => userEvent.click(messages))
		await expect(args.onValueChange).toHaveBeenLastCalledWith("Messages")
		await expect(messages).toHaveAttribute("aria-selected", "true")
		await expectFillOnPill(
			messages,
			isInDarkTheme(messages) ? "bg-input/30" : "bg-background",
		)
	},
})

export const PaletteTabsDark = PaletteTabs.extend({
	globals: { theme: "dark" },
})

export const QuestionSegments = meta.story({
	args: QUESTION_CONTROL,
	globals: { theme: "light" },
	decorators: [
		(Story) => (
			<QuestionPanel>
				<Story />
			</QuestionPanel>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The question card control: three questions on a filled track, the first answered and on screen. Check that the lifted pill keeps the card colour and its shadow, sits inside the track padding, and glides to the segment pressed. The app assembles it through `ToolQuestion` whenever one call asks several questions.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const billing = canvas.getByRole("tab", { name: "Billing" })
		await expectPillUnder(canvas.getByRole("tab", { name: "Plan" }))

		await pressAndFollow(billing, () => userEvent.click(billing))
		await expect(args.onValueChange).toHaveBeenLastCalledWith(2)
		await expect(billing).toHaveAttribute("aria-selected", "true")
		await expectFillOnPill(billing, "bg-card")
		await expect(getComputedStyle(pillBeside(billing)).boxShadow).not.toBe(
			"none",
		)
	},
})

export const QuestionSegmentsDark = QuestionSegments.extend({
	globals: { theme: "dark" },
})

export const LibraryFilters = meta.story({
	args: FILTER_ROW,
	globals: { theme: "light" },
	decorators: [
		(Story) => (
			<LibraryContentRow>
				<Story />
			</LibraryContentRow>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The Library filter row, which the app sets in the content above the grid: four pressed-or-not segments with their counts, All pressed. Check that the pill wears the Space colour, that pressing Documents glides it there and fits it to the wider pressed label, and that the label and the count change colour in the same frame. The app assembles it through `LibraryPanel`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const documents = canvas.getByRole("button", { name: /^Documents/ })
		await expectPillUnder(canvas.getByRole("button", { name: /^All/ }))

		await pressAndFollow(documents, () => userEvent.click(documents))
		await expect(args.onValueChange).toHaveBeenLastCalledWith("Documents")
		await expect(documents).toHaveAttribute("aria-pressed", "true")
		await expectFillOnPill(documents, "bg-primary")
		await expect(getComputedStyle(documents).color).toBe(
			tokenStyleIn(documents, "text-primary-foreground", "color"),
		)
	},
})

export const LibraryFiltersDark = LibraryFilters.extend({
	globals: { theme: "dark" },
})

export const ReducedMotion = meta.story({
	decorators: [
		(Story) => (
			<PaletteRow>
				<Story />
			</PaletteRow>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The strip for a reader who asked the system to stop moving things. Check that the pill reports no transition, that pressing Messages starts no animation, and that the pill is under Messages in that same frame.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const messages = canvas.getByRole("tab", { name: "Messages" })
		await userEvent.click(messages)
		if (!isInBrowserRunner()) return expectPillUnder(messages)

		const pill = pillBeside(messages)
		await expect(getComputedStyle(pill).transitionProperty).toBe("none")
		await expect(pill.getAnimations()).toHaveLength(0)
		await expectPillAlreadyUnder(messages)
	},
})

export const FirstRender = meta.story({
	args: { value: "Messages" },
	decorators: [
		(Story) => (
			<PaletteRow>
				<Story />
			</PaletteRow>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The strip the moment it mounts with Messages active, motion allowed. Check that the pill is already under Messages and that nothing glided to get there, then that pressing Routines does start a glide, so the first check cannot pass on a pill that never moves.",
			},
		},
	},
	beforeEach: allowMotionBeforeMount,
	play: async ({ canvas, userEvent }) => {
		try {
			const messages = canvas.getByRole("tab", { name: "Messages" })
			await expectPillAlreadyUnder(messages)
			await expect(onPillGlide).not.toHaveBeenCalled()
			if (!isInBrowserRunner()) return

			const routines = canvas.getByRole("tab", { name: "Routines" })
			await userEvent.click(routines)
			await waitFor(() => expect(onPillGlide).toHaveBeenCalled())
			await expectPillUnder(routines)
		} finally {
			await restoreReducedMotion()
		}
	},
})

export const WidthChange = meta.story({
	args: { ...FILTER_ROW, value: "Images" },
	render: (args) => <GrowingFilterRow {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The filter row while its counts and its segments change under the pressed one, motion allowed. Check that when All and Images each gain a thousand items the pill is refitted to Images, moved and widened, without a glide, that a width the component did not render, the way a late font lands, is followed too, that a Videos segment arriving before Images moves the pill with Images without a glide, and that once Videos is pressed the pill follows its width as well.",
			},
		},
	},
	beforeEach: allowMotionBeforeMount,
	play: async ({ canvas, userEvent }) => {
		try {
			const images = canvas.getByRole("button", { name: /^Images/ })
			await expectPillAlreadyUnder(images)
			const widthAtRest = images.getBoundingClientRect().width

			await userEvent.click(
				canvas.getByRole("button", { name: "Import a thousand images" }),
			)
			await expect(images).toHaveTextContent("Images1008")
			await expect(images.getBoundingClientRect().width).toBeGreaterThan(
				widthAtRest,
			)
			await expectPillUnder(images)
			await expect(pillBeside(images).getAnimations()).toHaveLength(0)

			canvas.getByRole("button", { name: /^All/ }).style.paddingInline = "24px"
			await expectPillUnder(images)

			const leftBeforeVideos = images.getBoundingClientRect().left
			await userEvent.click(
				canvas.getByRole("button", { name: "Import a video" }),
			)
			const videos = canvas.getByRole("button", { name: /^Videos/ })
			await expect(images.getBoundingClientRect().left).toBeGreaterThan(
				leftBeforeVideos,
			)
			await expectPillUnder(images)
			await expect(onPillGlide).not.toHaveBeenCalled()

			await userEvent.click(videos)
			await expectPillUnder(videos)
			videos.style.paddingInline = "24px"
			await expectPillUnder(videos)
		} finally {
			await restoreReducedMotion()
		}
	},
})

export const ScrollingStrip = meta.story({
	decorators: [
		(Story) => (
			<PaletteRow className="w-60">
				<Story />
			</PaletteRow>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The palette strip in a row too narrow for its five kinds, as on a 320px window. Check that the strip scrolls sideways instead of dropping a tab, that pressing Routines puts the pill under it, and that the pill stays under it at both ends of the scroll.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const strip = canvas.getByRole("tablist")
		const routines = canvas.getByRole("tab", { name: "Routines" })
		await expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)

		await userEvent.click(routines)
		await expectPillUnder(routines)

		strip.scrollLeft = strip.scrollWidth
		await expect(strip.scrollLeft).toBeGreaterThan(0)
		await expectPillAlreadyUnder(routines)

		strip.scrollLeft = 0
		await expectPillAlreadyUnder(routines)
	},
})

export const KeyboardFocus = meta.story({
	render: (args) => (
		<div className="flex flex-col items-start gap-6">
			<PaletteRow>
				<HeldSlidingTabs {...args} />
			</PaletteRow>
			<QuestionPanel>
				<HeldSlidingTabs {...args} {...QUESTION_CONTROL} />
			</QuestionPanel>
			<LibraryContentRow>
				<HeldSlidingTabs {...args} {...FILTER_ROW} />
			</LibraryContentRow>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three recipes walked with the keyboard. Each row is one tab stop and the arrows walk it. Check that every tab draws a ring when the keyboard lands on it, that walking the palette strip leaves All active, that walking the question segments moves the pill with the focus, and that the filters keep All pressed until Space.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const [strip, segments] = canvas.getAllByRole("tablist")
		const filters = canvas.getByRole("group", { name: "Show" })
		if (!(strip && segments)) throw new Error("A tablist is missing")

		await userEvent.tab()
		for (const tab of strip.querySelectorAll<HTMLElement>('[role="tab"]')) {
			await expectFocusRing(tab)
			await userEvent.keyboard("{ArrowRight}")
		}
		await expect(canvas.getByRole("tab", { name: "All" })).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.tab()
		for (const tab of segments.querySelectorAll<HTMLElement>('[role="tab"]')) {
			await expectFocusRing(tab)
			await expect(tab).toHaveAttribute("aria-selected", "true")
			await expectPillUnder(tab)
			await userEvent.keyboard("{ArrowRight}")
		}

		await userEvent.tab()
		for (const segment of filters.querySelectorAll<HTMLElement>("button")) {
			await expectFocusRing(segment)
			await userEvent.keyboard("{ArrowRight}")
		}
		await expect(canvas.getByRole("button", { name: /^All/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
	},
})
