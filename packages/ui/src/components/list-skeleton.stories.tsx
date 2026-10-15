import { useEffect, useState } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	FRAME_POLL,
	isInBrowserRunner,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	GenericSkeletonRow,
	ListSkeleton,
	type ListSkeletonAnchor,
} from "@workspace/ui/components/list-skeleton"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

const LOADED_NAMES = ["Ada Martin", "Basile Roux", "Chloe Petit"]

const SKELETON_HOLD_MS = 500

const FRAME_MS = 1000 / 60

type FrameProps = {
	heightClass: string
	anchor?: ListSkeletonAnchor
}

const ListFrame = ({ heightClass, anchor }: FrameProps) => (
	<div className={cn("w-80", heightClass)} data-slot="list-frame">
		<ListSkeleton anchor={anchor} row={<GenericSkeletonRow />} />
	</div>
)

type TimedListProps = {
	pendingMs: number
}

const TimedList = ({ pendingMs }: TimedListProps) => {
	const [isPending, setPending] = useState(true)

	useEffect(() => {
		const timer = setTimeout(() => setPending(false), pendingMs)
		return () => clearTimeout(timer)
	}, [pendingMs])

	const phase = useSkeletonTiming(isPending)
	const isFading = phase === "fade"

	return (
		<div
			className="grid h-45 w-80 grid-rows-1 *:col-start-1 *:row-start-1"
			data-phase={phase}
			data-slot="timed-list"
		>
			{phase === "skeleton" || isFading ? (
				<div
					className={cn(
						isFading && "fade-out fill-mode-forwards animate-out duration-150",
					)}
				>
					<ListSkeleton row={<GenericSkeletonRow />} />
				</div>
			) : null}
			{phase === "content" || isFading ? (
				<ul
					className={cn(
						"flex flex-col gap-3 text-foreground text-sm",
						isFading && "fade-in animate-in duration-150",
					)}
					data-slot="loaded-list"
				>
					{LOADED_NAMES.map((name) => (
						<li key={name}>{name}</li>
					))}
				</ul>
			) : null}
		</div>
	)
}

type SkeletonSighting = {
	shownAt: number | null
	hiddenAt: number | null
}

const watchSkeleton = (root: HTMLElement) => {
	const sighting: SkeletonSighting = { shownAt: null, hiddenAt: null }
	const observer = new MutationObserver(() => {
		const isMounted = root.querySelector('[data-slot="list-skeleton"]') !== null
		if (isMounted && sighting.shownAt === null)
			sighting.shownAt = performance.now()
		if (!isMounted && sighting.shownAt !== null && sighting.hiddenAt === null)
			sighting.hiddenAt = performance.now()
	})
	observer.observe(root, { childList: true, subtree: true })
	return { sighting, stop: () => observer.disconnect() }
}

const emulateMotion = async (value: "no-preference" | "reduce") => {
	const { cdp } = await import("vitest/browser")
	await cdp().send("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value }],
	})
}

const allowMotionBeforeMount = async () => {
	if (!isInBrowserRunner()) return
	await emulateMotion("no-preference")
	return () => emulateMotion("reduce")
}

const phaseOf = (root: Element) => slotIn(root, "timed-list").dataset.phase

const rowCountIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "list-skeleton-row").length

const meta = preview.meta({
	title: "Feedback/ListSkeleton",
	component: ListSkeleton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The stand-in for a list that is still on its way: one row template, passed in by the surface, repeated until the rows reach the bottom of the container, the last one cut by its edge. It measures its container and recounts on every resize, so it fills a sidebar and a sheet alike without a row count from the caller. The whole list pulses as one, never a shimmer, and stops at full tint under reduced motion. It is a shape and nothing else: `aria-hidden` on the whole list, while the `aria-busy` region and the polite status belong to the consumer. Pair it with `useSkeletonTiming`, which keeps it off screen for quick answers and on screen long enough not to flash.",
			},
		},
	},
})

export const TallContainer = meta.story({
	render: () => <ListFrame heightClass="h-120" />,
	parameters: {
		docs: {
			description: {
				story:
					"The list in a full-height pane, the sidebar case. Check that rows run to the bottom with the last one cut by the edge, that every row pulses in phase with the others, and that the whole list is out of the accessible tree. Pick `ShortContainer` for a compact pane.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const list = slotIn(canvasElement, "list-skeleton")
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(9), FRAME_POLL)

		await expect(list).toHaveAttribute("aria-hidden", "true")
		const [firstRow, secondRow] = slotsIn(list, "list-skeleton-row")
		await expect(firstRow.getBoundingClientRect().height).toBe(52)
		await expect(
			secondRow.getBoundingClientRect().top -
				firstRow.getBoundingClientRect().bottom,
		).toBe(4)
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(getComputedStyle(list).animationName).toBe("none")
		await expect(getComputedStyle(list).opacity).toBe("1")
		for (const shape of slotsIn(list, "skeleton"))
			await expect(getComputedStyle(shape).animationName).toBe("none")
	},
})

export const HeightOnARowStep = meta.story({
	render: () => <ListFrame heightClass="h-56" />,
	parameters: {
		docs: {
			description: {
				story:
					"A pane 224 px tall, exactly four rows and their gaps plus one more gap: the height where counting rows by their step alone stops one row short and leaves a strip under the last one. Check that a fifth row starts on the bottom edge so the list still reaches it. Pick `ShortContainer` for a height that cuts a row in its middle.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(5), FRAME_POLL)
		await expectSkeletonFilledTo(canvasElement, "bottom")
	},
})

export const ShortContainer = meta.story({
	render: () => <ListFrame heightClass="h-45" />,
	parameters: {
		docs: {
			description: {
				story:
					"The list in a compact pane: fewer rows, the last still cut by the edge. Check that it holds fewer rows than `TallContainer`, and that growing the pane adds rows while shrinking it takes them back.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = slotIn(canvasElement, "list-frame")
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(4), FRAME_POLL)
		await expectSkeletonFilledTo(canvasElement, "bottom")

		frame.style.height = "480px"
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(9), FRAME_POLL)
		frame.style.height = ""
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(4), FRAME_POLL)
	},
})

export const BottomAnchored = meta.story({
	render: () => <ListFrame anchor="bottom" heightClass="h-45" />,
	parameters: {
		docs: {
			description: {
				story:
					"The list anchored to the bottom, the transcript case where the newest entry sits lowest. Check that the first row rests on the bottom edge and the cut row sits at the top. Pick `ShortContainer` for a list that reads from the top.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = slotIn(canvasElement, "list-frame").getBoundingClientRect()
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(4), FRAME_POLL)
		const [firstRow] = slotsIn(canvasElement, "list-skeleton-row")

		await expect(firstRow.getBoundingClientRect().bottom).toBe(frame.bottom)
		await expectSkeletonFilledTo(canvasElement, "top")
	},
})

export const Dark = meta.story({
	render: () => <ListFrame heightClass="h-45" />,
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story:
					"The compact list in the dark theme. Check that the solid and the faint shapes both read against the dark ground and stay apart from each other. Pick `ShortContainer` for the light theme.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(rowCountIn(canvasElement)).toBe(4), FRAME_POLL)
		const [avatar, title, stamp] = slotsIn(
			slotsIn(canvasElement, "list-skeleton-row")[0],
			"skeleton",
		)

		await expect(avatar.getBoundingClientRect().height).toBe(40)
		await expect(title.getBoundingClientRect().height).toBe(12)
		await expect(stamp.getBoundingClientRect().height).toBe(9)
		await expect(getComputedStyle(title).backgroundColor).not.toBe(
			getComputedStyle(stamp).backgroundColor,
		)
	},
})

export const PendingUnder300Ms = meta.story({
	render: () => <TimedList pendingMs={200} />,
	parameters: {
		docs: {
			description: {
				story:
					"A read that answers in 200 ms, the cached or local case. Check that no skeleton ever mounts and the list arrives straight away. Pick `Pending310Ms` for a read that crosses the delay.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { sighting, stop } = watchSkeleton(canvasElement)
		await waitFor(() => expect(phaseOf(canvasElement)).toBe("content"), {
			...FRAME_POLL,
			timeout: 2000,
		})
		await new Promise((done) => setTimeout(done, 400))
		stop()

		await expect(sighting.shownAt).toBeNull()
		await expect(slotIn(canvasElement, "loaded-list")).toBeVisible()
	},
})

export const Pending310Ms = meta.story({
	render: () => <TimedList pendingMs={310} />,
	parameters: {
		docs: {
			description: {
				story:
					"A read that answers 10 ms after the skeleton appears. Check that the skeleton stays at least 500 ms anyway, so it never flashes, then gives way to the list. Pick `PendingUnder300Ms` for a read that answers before the delay.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { sighting, stop } = watchSkeleton(canvasElement)
		await waitFor(() => expect(phaseOf(canvasElement)).toBe("content"), {
			...FRAME_POLL,
			timeout: 3000,
		})
		stop()

		await expect(sighting.shownAt).not.toBeNull()
		await expect(sighting.hiddenAt).not.toBeNull()
		await expect(
			(sighting.hiddenAt ?? 0) - (sighting.shownAt ?? 0),
		).toBeGreaterThanOrEqual(SKELETON_HOLD_MS - FRAME_MS)
	},
})

export const Fade = meta.story({
	render: () => <TimedList pendingMs={400} />,
	parameters: {
		docs: {
			description: {
				story:
					"The handover once the skeleton is released: skeleton and list share the same place for 150 ms, the one fading out while the other fades in. Check that both are mounted together during the `fade` phase and that only the list is left after it. Under reduced motion the phase is skipped and the list swaps in at once.",
			},
		},
	},
	beforeEach: allowMotionBeforeMount,
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		await waitFor(() => expect(phaseOf(canvasElement)).toBe("fade"), {
			...FRAME_POLL,
			timeout: 3000,
		})
		await expect(slotIn(canvasElement, "list-skeleton")).toBeInTheDocument()
		await expect(slotIn(canvasElement, "loaded-list")).toBeInTheDocument()

		await waitFor(() => expect(phaseOf(canvasElement)).toBe("content"), {
			...FRAME_POLL,
			timeout: 1000,
		})
		await expect(
			canvasElement.querySelector('[data-slot="list-skeleton"]'),
		).toBeNull()
	},
})
