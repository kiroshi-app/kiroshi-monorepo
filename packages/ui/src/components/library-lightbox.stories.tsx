import { useState } from "react"
import {
	expect,
	fn,
	screen,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectBarDragsTheWindow,
	expectBarLeavesTheWindowInPlace,
	expectHeaderTitleStep,
	expectLibrarySkeletonBar,
	expectStaticHeaderBar,
	HOVER_TOOLTIP_WAIT,
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
	tokenStyleIn,
	withStoryProps,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_ITEMS,
	LIBRARY_LIGHTBOX_IMAGES,
} from "@workspace/ui/components/library.fixtures"
import {
	COMMENT_COUNTS,
	OPEN_THREADS,
} from "@workspace/ui/components/library-comments.fixtures"
import { LibraryCommentsList } from "@workspace/ui/components/library-comments-list"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import type { LibraryItem } from "@workspace/ui/components/library-grid"
import type {
	LibraryBarComments,
	LibraryItemActions,
} from "@workspace/ui/components/library-item-menu"
import {
	LibraryLightbox,
	type LibraryLightboxImage,
	type LibraryLightboxProps,
} from "@workspace/ui/components/library-lightbox"
import { LibraryPanel } from "@workspace/ui/components/library-panel"
import { LibraryImageSkeleton } from "@workspace/ui/components/library-tab-states"
import { cn } from "@workspace/ui/lib/utils"

type LibraryWithLightboxProps = LibraryItemActions<
	LibraryItem | LibraryLightboxImage
> &
	Pick<
		LibraryLightboxProps,
		| "onSaveToLibrary"
		| "onCopyImage"
		| "isSavingToLibrary"
		| "dragRegion"
		| "comments"
		| "presence"
	> & {
		openedAt: number | null
		images?: LibraryLightboxImage[]
		isNarrow?: boolean
		onClose: () => void
		onPrevious: () => void
		onNext: () => void
	}

const LibraryWithLightbox = ({
	openedAt,
	images = LIBRARY_LIGHTBOX_IMAGES,
	isNarrow = false,
	onClose,
	onPrevious,
	onNext,
	onSaveToLibrary,
	onCopyImage,
	isSavingToLibrary,
	dragRegion,
	comments,
	presence,
	...actions
}: LibraryWithLightboxProps) => {
	const [shownAt, setShownAt] = useState(openedAt)

	return (
		<div
			className={cn(
				"flex h-[832px] bg-background",
				isNarrow ? "w-[440px]" : "w-[1280px] ps-15 pe-1.5 pt-2 pb-2",
			)}
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryPanel
					{...actions}
					filter="all"
					items={LIBRARY_ITEMS}
					onFilterChange={fn()}
					onOpenItem={(item) =>
						setShownAt(images.findIndex((image) => image.id === item.id))
					}
					overlay={
						<LibraryLightbox
							{...actions}
							comments={comments}
							count={images.length}
							dragRegion={dragRegion}
							isSavingToLibrary={isSavingToLibrary}
							onCopyImage={onCopyImage}
							onSaveToLibrary={onSaveToLibrary}
							presence={presence}
							image={shownAt === null ? null : (images[shownAt] ?? null)}
							onClose={() => {
								onClose()
								setShownAt(null)
							}}
							onNext={() => {
								onNext()
								setShownAt((at) => (at ?? 0) + 1)
							}}
							onPrevious={() => {
								onPrevious()
								setShownAt((at) => (at ?? 0) - 1)
							}}
							position={(shownAt ?? 0) + 1}
						/>
					}
					state="ready"
				/>
			</ContentCard>
		</div>
	)
}

const lightbox = async () => {
	const popup = await screen.findByRole("dialog")
	await waitFor(() => expect(popup).toBeVisible())
	await waitFor(() => expect(popup.contains(document.activeElement)).toBe(true))
	return popup
}

const barIn = (popup: HTMLElement) => slotIn(popup, "app-header")

const sizeOf = (element: Element) => {
	const box = element.getBoundingClientRect()
	return [box.width, box.height]
}

const expectBarControls = async (popup: HTMLElement) => {
	const actions = slotIn(barIn(popup), "library-bar-actions")
	const capsule = slotIn(actions, "app-header-capsule")
	const close = within(actions).getByRole("button", { name: "Close" })

	await expect(Array.from(actions.children).slice(0, 2)).toEqual([
		capsule,
		close,
	])
	await expect(getComputedStyle(actions).columnGap).toBe("8px")
	await expect(
		within(capsule)
			.getAllByRole("button")
			.map((button) => button.getAttribute("aria-label")),
	).toEqual(["Download", "Duplicate", "More"])
	for (const control of within(capsule).getAllByRole("button"))
		await expect(sizeOf(control)).toEqual([28, 28])
	await expect(sizeOf(close)).toEqual([32, 32])

	return { capsule, close }
}

const expectSoleTooltip = (name: string) =>
	waitFor(() => {
		const tooltips = screen.getAllByRole("tooltip")
		expect(tooltips).toHaveLength(1)
		expect(tooltips[0]).toHaveTextContent(name)
	}, HOVER_TOOLTIP_WAIT)

const menuEntryNames = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("menuitem")
		.map((entry) => entry.textContent)

const ITEM_ACTION_NAMES = [
	"Open",
	"Open in new tab",
	"Rename",
	"Duplicate",
	"Copy",
	"Download",
	"Show in folder",
	"Delete",
]

const BAR_ACTION_NAMES = ["Download", "Duplicate"]

const BAR_MENU_ACTION_NAMES = ITEM_ACTION_NAMES.filter(
	(name) => !BAR_ACTION_NAMES.includes(name),
)

const expectNoBarActionIn = async (menu: HTMLElement) => {
	for (const name of BAR_ACTION_NAMES)
		await expect(within(menu).queryByRole("menuitem", { name })).toBe(null)
}

const openMoreMenu = async (popup: HTMLElement, userEvent: UserEventObject) => {
	await userEvent.click(within(popup).getByRole("button", { name: "More" }))
	return screen.findByRole("menu", { name: /^Actions for / })
}

const closeMenu = async (userEvent: UserEventObject) => {
	await userEvent.keyboard("{Escape}")
	await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))
}

const openGridMenu = async (
	canvasElement: HTMLElement,
	userEvent: UserEventObject,
) => {
	await userEvent.pointer({
		keys: "[MouseRight]",
		target: within(canvasElement).getByRole("button", {
			name: /dashboard-redesign\.png/,
		}),
	})
	return screen.findByRole("menu", {
		name: "Actions for dashboard-redesign.png",
	})
}

const LIGHTBOX_STORY_ARGS: LibraryWithLightboxProps = {
	openedAt: 1,
	onClose: fn(),
	onPrevious: fn(),
	onNext: fn(),
	onOpen: fn(),
	onOpenInNewTab: fn(),
	onRename: fn(),
	onDuplicate: fn(),
	onCopy: fn(),
	onDownload: fn(),
	onShowInFolder: fn(),
	onDelete: fn(),
}

const meta = preview.meta({
	title: "Overlays/LibraryLightbox",
	component: withStoryProps<LibraryWithLightboxProps>(LibraryLightbox),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"One image of the Library, over the content card, opened from a grid item. Its header is the static bar of the open document on the lightbox surface at full opacity: on its top line the Library path link, a separator and the image details, over the image name; on the right, 8 apart, the capsule of the actions then the round Close. It traps focus, closes on Escape, on Close and on a click on the backdrop around the image, and hands focus back to the item that opened it. Left and Right arrows, like Previous and Next, ask the caller for the neighbouring image, and the two buttons disable at either end. Previous and Next float over the stage 16 from either side at mid-height, and the zoom pill floats over its bottom edge, so the fitted image keeps 16 on its four sides under the bar, and a zoomed image is cut at the rule of the bar. The Library path link closes the lightbox like Close. Download and Duplicate are drawn only when their callback is given and `isActionShown` keeps them for the image, and More opens the item action menu, drawn only when at least one item action is shown, Copy among its entries. The zoom pill steps the image out and in, and its middle button, Fit, shows the zoom percentage until it is pressed to fit the stage again. Render it as the `overlay` of `LibraryPanel` so it covers the card.",
			},
		},
	},
	globals: { theme: "dark" },
	args: LIGHTBOX_STORY_ARGS,
	render: (args) => <LibraryWithLightbox {...LIGHTBOX_STORY_ARGS} {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The second image open, as artboard 8 draws it. Check the arrows, Download and Duplicate report to their callbacks, that the third action is More, that the three capsule actions are 28 px buttons and Close a 32 px one, that every control of the bar changes colour instantly, that every icon button names its action in a tooltip, and that Escape hands focus back to the grid item that opened the image.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const popup = await lightbox()
		await expect(popup).toHaveTextContent("dashboard-redesign.png")
		await expect(popup).toHaveTextContent("2 of 8")
		await expectBarLeavesTheWindowInPlace(barIn(popup))

		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onNext).toHaveBeenCalledOnce()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onPrevious).toHaveBeenCalledOnce()

		const download = within(popup).getByRole("button", { name: "Download" })
		await userEvent.click(download)
		await expect(args.onDownload).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Duplicate" }),
		)
		await expect(args.onDuplicate).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)
		const more = within(popup).getByRole("button", { name: "More" })
		await userEvent.hover(more)
		await expectSoleTooltip("More")
		await userEvent.unhover(more)
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))

		await expectBarControls(popup)
		for (const control of within(barIn(popup)).getAllByRole("button"))
			await expect(getComputedStyle(control).transitionDuration).toBe("0s")

		for (const divider of within(popup).getAllByRole("separator")) {
			const box = divider.getBoundingClientRect()
			const row = divider.parentElement?.getBoundingClientRect()
			await expect(box.top + box.height / 2).toBeCloseTo(
				(row?.top ?? 0) + (row?.height ?? 0) / 2,
				0,
			)
		}

		await userEvent.hover(
			within(popup).getByRole("button", { name: "Next image" }),
		)
		await expectSoleTooltip("Next image")
		await userEvent.unhover(
			within(popup).getByRole("button", { name: "Next image" }),
		)
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))

		const opener = canvas.getByRole("button", {
			name: /dashboard-redesign\.png/,
		})
		await userEvent.click(opener)
		const reopened = await lightbox()
		await expect(reopened).toContainElement(
			document.activeElement as HTMLElement,
		)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await waitFor(() => expect(opener).toHaveFocus())

		await userEvent.click(opener)
		await lightbox()
		await userEvent.click(screen.getByRole("button", { name: "Close" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await waitFor(() => expect(opener).toHaveFocus())

		await userEvent.click(opener)
		await lightbox()
	},
})

const STAGE_INSET = 16

const ARTBOARD_IMAGE: LibraryLightboxImage = {
	...(LIBRARY_LIGHTBOX_IMAGES[1] as LibraryLightboxImage),
	detail: "PNG · 412 KB · 3 h ago",
}

export const OverlayFitted = meta.story({
	args: { images: LIBRARY_LIGHTBOX_IMAGES.with(1, ARTBOARD_IMAGE) },
	parameters: {
		docs: {
			description: {
				story:
					"The image fitted to the stage under the bar, as artboard I7a draws it. Check that the overlay is #080809 at 93 percent, that the bar sits in the flow at its top, 56 tall on #0B0B0C at full opacity with a 1 px rule in white at 8 percent, that its 12/16 top line reads Library and the details, PNG · 412 KB · 3 h ago, in #A3A3A3 around a #6B6B6B separator, over the 14/18 semibold name in #F5F5F5, that the capsule and Close wear white at 8 percent, 8 apart, under #E5E5E5 icons, that no bar control and neither Previous nor Next casts a shadow, that no bar control fades its colour in, that the image, its corners rounded by 4, is centred in a stage that starts at the rule and keeps 16 on its four sides, and that Previous and Next float over that stage 16 from either side at its mid-height.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		const overlay = popup.getBoundingClientRect()
		await expect(getComputedStyle(popup).backgroundColor).toBe(
			"oklab(0.13493 0.000670321 -0.00230238 / 0.93)",
		)

		const bar = await expectStaticHeaderBar(popup)
		const rule = bar.getBoundingClientRect().bottom
		await expect(getComputedStyle(bar).backgroundColor).toBe("rgb(11, 11, 12)")

		const name = within(popup).getByRole("heading", {
			name: "dashboard-redesign.png",
		})
		await expect(getComputedStyle(name).color).toBe("rgb(245, 245, 245)")
		await expectHeaderTitleStep(name)
		await expect(name.scrollWidth).toBe(name.clientWidth)

		const topLine = slotIn(bar, "app-header-top-line")
		const topLineType = getComputedStyle(topLine)
		await expect(topLine).toHaveTextContent(`Library/${ARTBOARD_IMAGE.detail}`)
		await expect([topLineType.fontSize, topLineType.lineHeight]).toEqual([
			"12px",
			"16px",
		])
		await expect(topLine.getBoundingClientRect().bottom).toBe(
			name.getBoundingClientRect().top,
		)
		const details = slotIn(topLine, "library-bar-meta")
		for (const muted of [
			within(topLine).getByRole("button", { name: "Library" }),
			details,
		])
			await expect(getComputedStyle(muted).color).toBe("rgb(163, 163, 163)")
		await expect(
			getComputedStyle(slotIn(topLine, "app-header-path-separator")).color,
		).toBe("rgb(107, 107, 107)")
		await expect(elementAt(centreOf(details))).toBe(details)

		const { capsule, close } = await expectBarControls(popup)
		for (const filled of [capsule, close])
			await expect(getComputedStyle(filled).backgroundColor).toBe(
				tokenStyleIn(filled, "bg-white/8", "backgroundColor"),
			)
		for (const control of [...within(capsule).getAllByRole("button"), close])
			await expect(getComputedStyle(control).color).toBe("rgb(229, 229, 229)")

		const image = within(popup).getByRole("img", {
			name: "dashboard-redesign.png",
		})
		const drawn = image.getBoundingClientRect()
		const stage = slotIn(popup, "library-lightbox-zoom").getBoundingClientRect()
		await expect(stage.top).toBe(rule)
		await expect(drawn.top - rule).toBeGreaterThanOrEqual(STAGE_INSET)
		await expect(stage.left - overlay.left).toBe(STAGE_INSET)
		await expect(overlay.right - stage.right).toBe(STAGE_INSET)
		await expect(overlay.bottom - stage.bottom).toBe(STAGE_INSET)
		await expect(drawn.left).toBeGreaterThanOrEqual(stage.left)
		await expect(drawn.right).toBeLessThanOrEqual(stage.right)
		await expect(drawn.bottom).toBeLessThanOrEqual(stage.bottom)
		await expect(
			drawn.left + drawn.right - stage.left - stage.right,
		).toBeCloseTo(0, 0)
		const stageMiddle = (rule + STAGE_INSET + stage.bottom) / 2
		await expect((drawn.top + drawn.bottom) / 2).toBeCloseTo(stageMiddle, 0)
		await expect(getComputedStyle(image).borderRadius).toBe("4px")

		for (const control of within(bar).getAllByRole("button")) {
			await expect(getComputedStyle(control).transitionDuration).toBe("0s")
			await expect(getComputedStyle(control).boxShadow).toBe("none")
		}

		const previous = within(popup).getByRole("button", {
			name: "Previous image",
		})
		const next = within(popup).getByRole("button", { name: "Next image" })
		for (const step of [previous, next]) {
			await expect(bar.contains(step)).toBe(false)
			await expect(getComputedStyle(step).boxShadow).toBe("none")
			const box = step.getBoundingClientRect()
			await expect(box.top + box.height / 2).toBeCloseTo(stageMiddle, 0)
		}
		await expect(previous.getBoundingClientRect().left - overlay.left).toBe(
			STAGE_INSET,
		)
		await expect(overlay.right - next.getBoundingClientRect().right).toBe(
			STAGE_INSET,
		)
	},
})

const STEP_SIZE = 40

export const Loading = meta.story({
	render: () => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryImageSkeleton />
			</ContentCard>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The image before its file lands, next to `OverlayFitted`, the screen it turns into. Check that the surface is #080809 at 93 percent, that the one bar of the loaded lightbox sits in the flow at its top, 56 tall on #0B0B0C at full opacity with its rule, hidden from a screen reader, that it draws a path bar over a title bar and, on the right, a 92 by 32 capsule placeholder then a 32 round close placeholder, that the stage placeholder starts at the rule like the loaded stage and keeps 16 on its three other sides, that the only other placeholders are the ones the loaded lightbox draws, Previous and Next 16 from either side at mid-height and the zoom pill, each on the input fill so it reads over the fainter stage, that nothing pulses under reduced motion, and that the whole is one busy region named Loading the image. Pick `LoadingLight` for the light theme.",
			},
		},
	},
	play: async ({ canvas }) => {
		const region = canvas.getByRole("region", { name: "Loading the image…" })
		const surface = region.getBoundingClientRect()
		await expect(getComputedStyle(region).backgroundColor).toBe(
			"oklab(0.13493 0.000670321 -0.00230238 / 0.93)",
		)

		const bar = await expectLibrarySkeletonBar(region)
		const rule = bar.getBoundingClientRect().bottom
		await expect(getComputedStyle(bar).backgroundColor).toBe("rgb(11, 11, 12)")

		const stagePlaceholder = slotIn(region, "library-image-skeleton-stage")
		const stage = stagePlaceholder.getBoundingClientRect()
		await expect(stage.top).toBe(rule)
		await expect([
			stage.left - surface.left,
			surface.right - stage.right,
			surface.bottom - stage.bottom,
		]).toEqual([STAGE_INSET, STAGE_INSET, STAGE_INSET])

		const [previous, next, zoomPill, ...others] = slotsIn(
			region,
			"skeleton",
		).filter((shape) => !bar.contains(shape))
		if (!previous || !next || !zoomPill)
			throw new Error("The skeleton does not draw its steps and its zoom pill")
		await expect(others).toEqual([])
		const stageFill = getComputedStyle(stagePlaceholder).backgroundColor
		for (const control of [previous, next, zoomPill]) {
			const fill = getComputedStyle(control).backgroundColor
			await expect(fill).toBe(
				tokenStyleIn(control, "bg-input", "backgroundColor"),
			)
			await expect(fill).not.toBe(stageFill)
		}

		const stageMiddle = (rule + surface.bottom) / 2
		for (const step of [previous, next]) {
			const box = step.getBoundingClientRect()
			await expect(sizeOf(step)).toEqual([STEP_SIZE, STEP_SIZE])
			await expect(box.top + box.height / 2).toBe(stageMiddle)
		}
		await expect(previous.getBoundingClientRect().left - surface.left).toBe(
			STAGE_INSET,
		)
		await expect(surface.right - next.getBoundingClientRect().right).toBe(
			STAGE_INSET,
		)
	},
})

export const LoadingLight = meta.story({
	...Loading.input,
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The same loading image in the light theme, where the white card shows through the surface. Check that the surface, the bar and every placeholder keep the dark geometry and fills, and that Previous, Next and the zoom pill still read over the stage.",
			},
		},
	},
})

const ZOOMED_AWAY = 56

export const ZoomedCutAtTheBar = meta.story({
	args: { images: LIBRARY_LIGHTBOX_IMAGES.with(1, ARTBOARD_IMAGE) },
	parameters: {
		docs: {
			description: {
				story:
					"The image zoomed past its fit and scrolled, as artboard I7b draws it. Check that the bar is the one at rest, that the stage starts at its rule, that the image runs above the rule yet the bar is what is drawn just above it and the image just below, that every control of the bar is still the one drawn at its centre, and that Download still reports while the lightbox stays open.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const stage = slotIn(popup, "library-lightbox-zoom")
		const image = within(popup).getByRole("img", {
			name: "dashboard-redesign.png",
		})
		const zoomIn = within(popup).getByRole("button", { name: "Zoom in" })
		while (
			stage.scrollHeight - stage.clientHeight < ZOOMED_AWAY ||
			stage.scrollWidth - stage.clientWidth < ZOOMED_AWAY
		) {
			await expect(zoomIn).toBeEnabled()
			await userEvent.click(zoomIn)
		}
		stage.scrollTo({ top: ZOOMED_AWAY, left: ZOOMED_AWAY })
		await waitFor(() => expect(stage.scrollTop).toBe(ZOOMED_AWAY))

		const bar = await expectStaticHeaderBar(popup)
		const rule = bar.getBoundingClientRect().bottom
		const room = stage.getBoundingClientRect()
		const drawn = image.getBoundingClientRect()
		await expect(room.top).toBe(rule)
		await expect(drawn.top).toBeLessThan(rule)
		const across =
			(Math.max(drawn.left, room.left) + Math.min(drawn.right, room.right)) / 2
		await expect(bar.contains(elementAt({ x: across, y: rule - 2 }))).toBe(true)
		await expect(elementAt({ x: across, y: rule + 2 })).toBe(image)

		for (const control of within(bar).getAllByRole("button")) {
			control.scrollIntoView({ block: "nearest", inline: "nearest" })
			await expect(control.contains(elementAt(centreOf(control)))).toBe(true)
		}

		await userEvent.click(within(bar).getByRole("button", { name: "Download" }))
		await expect(args.onDownload).toHaveBeenCalledWith(ARTBOARD_IMAGE)
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()
	},
})

const LONG_NAMED_IMAGE: LibraryLightboxImage = {
	...ARTBOARD_IMAGE,
	name: "dashboard-redesign-spring-launch-final-export-for-review-v12.png",
}

export const NarrowLongName = meta.story({
	args: {
		images: LIBRARY_LIGHTBOX_IMAGES.with(1, LONG_NAMED_IMAGE),
		isNarrow: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A long image name in a 440 wide overlay, as artboard I7c draws it. Check that the name ends with an ellipsis on its one 18 px line, that the top line still reads Library, the separator and the whole details, drawn on top, and that the three 28 px capsule buttons and the 32 px Close all stay, 12 from the end of the bar.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		const bar = await expectStaticHeaderBar(popup)
		const name = within(popup).getByRole("heading", {
			name: LONG_NAMED_IMAGE.name,
		})
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().height).toBe(18)
		await expect(elementAt(centreOf(name))).toBe(name)

		const topLine = slotIn(bar, "app-header-top-line")
		const details = slotIn(topLine, "library-bar-meta")
		await expect(topLine).toHaveTextContent(
			`Library/${LONG_NAMED_IMAGE.detail}`,
		)
		await expect(details.scrollWidth).toBe(details.clientWidth)
		await expect(elementAt(centreOf(details))).toBe(details)

		await expectBarControls(popup)
		await expect(
			bar.getBoundingClientRect().right -
				slotIn(bar, "library-bar-actions").getBoundingClientRect().right,
		).toBe(12)
	},
})

export const HostMoreMenu = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"More pressed on the host, every item action given. Check that the menu lists Open, Open in new tab, Rename, Copy, Show in folder, then Delete under a rule and drawn as destructive, that neither Download nor Duplicate, already buttons of the bar, appears in it, that the highlight follows the pointer with no colour transition, that an entry hands the shown image to its callback, and that the grid item menu still lists every action, Duplicate and Download included.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const popup = await lightbox()
		const menu = await openMoreMenu(popup, userEvent)
		await expect(menu).toHaveAccessibleName(
			"Actions for dashboard-redesign.png",
		)
		await expect(menuEntryNames(menu)).toEqual(BAR_MENU_ACTION_NAMES)
		await expectNoBarActionIn(menu)
		const entries = within(menu).getAllByRole("menuitem")
		await expect(entries.at(-1)?.previousElementSibling).toHaveAttribute(
			"role",
			"separator",
		)
		await expect(entries.at(-1)).toHaveAttribute("data-variant", "destructive")
		for (const entry of entries)
			await expect(getComputedStyle(entry).transitionDuration).toBe("0s")

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Show in folder" }),
		)
		await expect(args.onShowInFolder).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))

		await userEvent.click(within(popup).getByRole("button", { name: "Close" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		const gridMenu = await openGridMenu(canvasElement, userEvent)
		await expect(menuEntryNames(gridMenu)).toEqual(ITEM_ACTION_NAMES)
		await closeMenu(userEvent)
	},
})

export const MemberMoreMenu = meta.story({
	args: { onShowInFolder: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"More pressed in a joined Space, where Show in folder has no action for a member. Check that the bar keeps Download, Duplicate and More, that neither the More menu nor the grid item menu lists Show in folder, and that only the grid item menu lists Download and Duplicate.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup).getByRole("button", { name: "Download" }),
		).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Duplicate" }),
		).toBeVisible()

		const memberActions = ITEM_ACTION_NAMES.filter(
			(name) => name !== "Show in folder",
		)
		await expect(menuEntryNames(await openMoreMenu(popup, userEvent))).toEqual(
			memberActions.filter((name) => !BAR_ACTION_NAMES.includes(name)),
		)
		await closeMenu(userEvent)

		await userEvent.click(within(popup).getByRole("button", { name: "Close" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await expect(
			menuEntryNames(await openGridMenu(canvasElement, userEvent)),
		).toEqual(memberActions)
		await closeMenu(userEvent)
	},
})

export const ImageWithoutRename = meta.story({
	args: {
		isActionShown: (item, action) =>
			action !== "onRename" || ("kind" in item && item.kind === "document"),
	},
	parameters: {
		docs: {
			description: {
				story:
					"More pressed on an image, every item action given and Rename kept for documents. Check that the menu lists every action but Rename and the bar's own Download and Duplicate, with Delete still under its rule.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const popup = await lightbox()
		const menu = await openMoreMenu(popup, userEvent)
		await expect(menuEntryNames(menu)).toEqual(
			BAR_MENU_ACTION_NAMES.filter((name) => name !== "Rename"),
		)
		await expect(
			within(menu).getAllByRole("menuitem").at(-1)?.previousElementSibling,
		).toHaveAttribute("role", "separator")
		await closeMenu(userEvent)
	},
})

export const OnlyDeleteShown = meta.story({
	tags: ["test-only"],
	args: { isActionShown: (_, action) => action === "onDelete" },
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given and only Delete shown for the image. Check that the bar draws neither Download nor Duplicate, and that the More menu and the grid item menu list Delete alone with no rule above it.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup).queryByRole("button", { name: "Download" }),
		).toBe(null)
		await expect(
			within(popup).queryByRole("button", { name: "Duplicate" }),
		).toBe(null)

		const menu = await openMoreMenu(popup, userEvent)
		await expect(menuEntryNames(menu)).toEqual(["Delete"])
		await expect(within(menu).queryByRole("separator")).toBe(null)
		await closeMenu(userEvent)

		await userEvent.click(within(popup).getByRole("button", { name: "Close" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		const gridMenu = await openGridMenu(canvasElement, userEvent)
		await expect(menuEntryNames(gridMenu)).toEqual(["Delete"])
		await expect(within(gridMenu).queryByRole("separator")).toBe(null)
		await closeMenu(userEvent)
	},
})

export const OnlyBarActionsGiven = meta.story({
	tags: ["test-only"],
	args: {
		isActionShown: (_, action) =>
			action === "onDownload" || action === "onDuplicate",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given and only Download and Duplicate shown for the image, both already buttons of the bar. Check that the bar draws them and no More, since its menu would have nothing left to list.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label"))
				.filter((name) =>
					["Download", "Duplicate", "More", "Close"].includes(name ?? ""),
				),
		).toEqual(["Download", "Duplicate", "Close"])
	},
})

export const EveryActionLeftOut = meta.story({
	tags: ["test-only"],
	args: { isActionShown: () => false },
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given and every one left out for the image. Check that the bar draws neither Download, Duplicate nor More, and that a right-click on the grid item opens no menu.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label"))
				.filter((name) =>
					["Download", "Duplicate", "More"].includes(name ?? ""),
				),
		).toEqual([])

		await userEvent.click(within(popup).getByRole("button", { name: "Close" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: within(canvasElement).getByRole("button", {
				name: /dashboard-redesign\.png/,
			}),
		})
		await expect(screen.queryByRole("menu")).toBe(null)
	},
})

export const DeleteConfirmation = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Delete picked in the More menu. Check that a confirmation asks first and says this can’t be undone, that nothing is deleted before the confirmation, and that confirming hands the shown image to `onDelete` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const menu = await openMoreMenu(popup, userEvent)
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Delete" }),
		)

		const confirmation = await screen.findByRole("alertdialog")
		await expect(confirmation).toHaveAccessibleName(
			"Delete dashboard-redesign.png?",
		)
		await expect(confirmation).toHaveAccessibleDescription(
			"This can’t be undone.",
		)
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(confirmation).getByRole("button", { name: "Delete" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledOnce()
		await expect(args.onDelete).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])
	},
})

const expectRingOnEachBarControl = async (bar: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const keys = await realPointer()

	for (const control of within(bar).getAllByRole("button")) {
		await keys.tab()
		await expect(control).toHaveFocus()
		await expect(control.matches(":focus-visible")).toBe(true)
		const ring = getComputedStyle(control)
		await expect([ring.outlineStyle, ring.outlineWidth]).toEqual([
			"solid",
			"2px",
		])
		await expect(ring.outlineColor).toBe(
			tokenStyleIn(control, "border border-ring", "borderTopColor"),
		)
		if (control.hasAttribute("data-kind"))
			await expect(ring.boxShadow).toBe(
				tokenStyleIn(control, "ring-2 ring-lightbox-bar", "boxShadow"),
			)
	}
}

export const BarKeyboardFocus = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The image bar walked with Tab from the open lightbox. Check that the Library path link, Download, Duplicate, More then Close each take focus in that order and wear a 2 px ring in the Space colour on the dark bar while they hold it, the four round controls over a 2 px halo in the #0B0B0C of the bar, never the card colour. The play drives the real keyboard, in the Vitest browser runner only.",
			},
		},
	},
	play: async () => expectRingOnEachBarControl(barIn(await lightbox())),
})

export const LibraryPathLink = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The bar with its Library path link at the start of the top line, over the image name. Check that it reads Library and that pressing it closes the lightbox.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const path = within(popup).getByRole("button", { name: "Library" })
		await expect(path).toHaveTextContent("Library")
		await expect(path.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			within(popup).getByRole("heading").getBoundingClientRect().top,
		)

		await userEvent.click(path)
		await expect(args.onClose).toHaveBeenCalledOnce()
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
	},
})

type Point = { x: number; y: number }

const elementAt = ({ x, y }: Point) => {
	const hit = document.elementFromPoint(x, y)
	if (hit === null) throw new Error(`Nothing drawn at ${x}, ${y}`)
	return hit
}

const centreOf = (element: Element): Point => {
	const box = element.getBoundingClientRect()
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const cornerOf = (element: Element): Point => {
	const box = element.getBoundingClientRect()
	return { x: box.x + 4, y: box.y + 4 }
}

const besideImage = (stage: Element, image: Element): Point => {
	const room = stage.getBoundingClientRect()
	const drawn = image.getBoundingClientRect()
	const belowBar =
		room.top + Number.parseFloat(getComputedStyle(stage).paddingTop)
	return drawn.left - room.left > drawn.top - belowBar
		? { x: (room.left + drawn.left) / 2, y: drawn.top + 8 }
		: { x: room.left + 8, y: (belowBar + drawn.top) / 2 }
}

const SCROLLBAR_BAND = 16

const onVerticalScrollbar = (stage: Element): Point => {
	const box = stage.getBoundingClientRect()
	return { x: box.right - SCROLLBAR_BAND / 2, y: box.top + box.height / 2 }
}

const onHorizontalScrollbar = (stage: Element): Point => {
	const box = stage.getBoundingClientRect()
	return { x: box.left + box.width / 2, y: box.bottom - SCROLLBAR_BAND / 2 }
}

const pressAt = (userEvent: UserEventObject, target: Element, point: Point) =>
	userEvent.pointer({
		keys: "[MouseLeft]",
		target,
		coords: { clientX: point.x, clientY: point.y },
	})

const clickAt = (userEvent: UserEventObject, point: Point) =>
	pressAt(userEvent, elementAt(point), point)

export const BackdropClick = meta.story({
	args: { openedAt: 0 },
	parameters: {
		docs: {
			description: {
				story:
					"The first image, so Previous is disabled. Check that a click on the backdrop closes the lightbox once, beside the image in fit and in zoomed mode and in the bottom strip outside the zoom pill, and that a click on the image, the classic scrollbar of the zoomed stage, its room held by a stable gutter so a headless browser keeps it, the header bar, the zoom pill or Previous and Next, disabled or not, keeps it open. A press on the image or on that scrollbar released on the backdrop keeps it open too, and while the More menu or the delete confirmation is open, a click outside never closes the lightbox.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const reopen = async () => {
			await userEvent.click(
				canvas.getByRole("button", { name: /hero-dunes\.png/ }),
			)
			return lightbox()
		}
		const stageIn = (popup: HTMLElement) =>
			popup.querySelector("[data-slot=library-lightbox-zoom]") as HTMLElement
		const imageIn = (popup: HTMLElement) =>
			within(popup).getByRole("img", { name: "hero-dunes.png" })
		const clickBesideImage = async (popup: HTMLElement) => {
			const stage = stageIn(popup)
			const beside = besideImage(stage, imageIn(popup))
			await expect(elementAt(beside)).toBe(stage)
			await clickAt(userEvent, beside)
		}
		const zoomBarIn = (popup: HTMLElement) =>
			popup.querySelector(
				"[data-slot=library-lightbox-zoom-bar]",
			) as HTMLElement
		const bottomStripIn = (popup: HTMLElement) =>
			zoomBarIn(popup).parentElement as HTMLElement
		const closedFor = async (times: number) => {
			await expect(args.onClose).toHaveBeenCalledTimes(times)
			await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		}

		let popup = await lightbox()
		const image = imageIn(popup)
		await userEvent.click(image)
		await expect(args.onClose).not.toHaveBeenCalled()

		await userEvent.click(within(popup).getByRole("heading"))
		await userEvent.click(within(popup).getByText("PNG · 1600 × 1000 · 248 KB"))
		await userEvent.click(barIn(popup))
		await expect(args.onClose).not.toHaveBeenCalled()

		const zoomBar = zoomBarIn(popup)
		await userEvent.click(zoomBar)
		await userEvent.click(within(zoomBar).getByText("1 of 8"))
		const previous = within(popup).getByRole("button", {
			name: "Previous image",
		})
		await expect(previous).toBeDisabled()
		await userEvent.click(elementAt(centreOf(previous)))
		await expect(args.onClose).not.toHaveBeenCalled()

		const stage = stageIn(popup)
		const onImage = centreOf(image)
		const beside = besideImage(stage, image)
		await expect(elementAt(onImage)).toBe(image)
		await expect(elementAt(beside)).toBe(stage)
		await userEvent.pointer([
			{
				keys: "[MouseLeft>]",
				target: image,
				coords: { clientX: onImage.x, clientY: onImage.y },
			},
			{
				target: stage,
				coords: { clientX: beside.x, clientY: beside.y },
			},
			{ keys: "[/MouseLeft]" },
		])
		await expect(args.onClose).not.toHaveBeenCalled()

		stage.style.scrollbarGutter = "stable"
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await expect(stage.offsetWidth).toBeGreaterThan(stage.clientWidth)
		const onScrollbar = onVerticalScrollbar(stage)
		await expect(
			onScrollbar.x - stage.getBoundingClientRect().left - stage.clientLeft,
		).toBeGreaterThanOrEqual(stage.clientWidth)
		await pressAt(userEvent, stage, onScrollbar)
		await expect(args.onClose).not.toHaveBeenCalled()

		const zoomedStripCorner = cornerOf(bottomStripIn(popup))
		await userEvent.pointer([
			{
				keys: "[MouseLeft>]",
				target: stage,
				coords: { clientX: onScrollbar.x, clientY: onScrollbar.y },
			},
			{
				target: elementAt(zoomedStripCorner),
				coords: { clientX: zoomedStripCorner.x, clientY: zoomedStripCorner.y },
			},
			{ keys: "[/MouseLeft]" },
		])
		await expect(args.onClose).not.toHaveBeenCalled()
		await userEvent.click(
			within(popup).getByRole("button", { name: /%, fit to the window$/ }),
		)
		stage.style.scrollbarGutter = ""

		await openMoreMenu(popup, userEvent)
		await clickAt(userEvent, cornerOf(bottomStripIn(popup)))
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))
		await expect(args.onClose).not.toHaveBeenCalled()

		const menu = await openMoreMenu(popup, userEvent)
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Delete" }),
		)
		await screen.findByRole("alertdialog")
		await clickAt(userEvent, cornerOf(bottomStripIn(popup)))
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()

		await clickBesideImage(popup)
		await closedFor(1)

		popup = await reopen()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom out" }),
		)
		await clickBesideImage(popup)
		await closedFor(2)

		popup = await reopen()
		const bottomStrip = bottomStripIn(popup)
		const stripCorner = cornerOf(bottomStrip)
		await expect(getComputedStyle(bottomStrip).pointerEvents).toBe("none")
		await expect(elementAt(stripCorner)).toHaveAttribute(
			"data-lightbox-backdrop",
		)
		await clickAt(userEvent, stripCorner)
		await closedFor(3)
	},
})

export const OverlayScrollbarPress = meta.story({
	tags: ["test-only"],
	args: { openedAt: 5 },
	parameters: {
		docs: {
			description: {
				story:
					"The image zoomed in on a stage whose scrollbars take no layout space, like overlay scrollbars drawn over the content. Check that a press and release on the vertical scrollbar at the inline end of the stage, then on the horizontal one at its block end, keeps the lightbox open, and that once zoomed out to leave room beside the image, a click on the backdrop there, away from the scrollbar band, closes it once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const stage = slotIn(popup, "library-lightbox-zoom")
		const image = within(popup).getByRole("img", { name: "growth-sketch.png" })
		stage.style.scrollbarWidth = "none"
		const zoomInUntil = async (isReached: () => boolean) => {
			const zoomIn = within(popup).getByRole("button", { name: "Zoom in" })
			while (!isReached()) {
				await expect(zoomIn).toBeEnabled()
				await userEvent.click(zoomIn)
			}
		}
		const scrollsVertically = () => stage.scrollHeight > stage.clientHeight
		const scrollsHorizontally = () => stage.scrollWidth > stage.clientWidth

		await zoomInUntil(scrollsVertically)
		await expect(stage.offsetWidth).toBe(stage.clientWidth)
		await pressAt(userEvent, stage, onVerticalScrollbar(stage))
		await expect(args.onClose).not.toHaveBeenCalled()

		await zoomInUntil(scrollsHorizontally)
		await expect(stage.offsetHeight).toBe(stage.clientHeight)
		await pressAt(userEvent, stage, onHorizontalScrollbar(stage))
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom out" }),
		)
		await expect(scrollsHorizontally()).toBe(true)
		await expect(scrollsVertically()).toBe(false)
		const room = stage.getBoundingClientRect()
		const beside = besideImage(stage, image)
		await expect(elementAt(beside)).toBe(stage)
		await expect(room.bottom - beside.y).toBeGreaterThan(SCROLLBAR_BAND)
		await expect(room.right - beside.x).toBeGreaterThan(SCROLLBAR_BAND)
		await clickAt(userEvent, beside)
		await expect(args.onClose).toHaveBeenCalledOnce()
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
	},
})

export const WithoutItemActions = meta.story({
	tags: ["test-only"],
	args: {
		onOpen: undefined,
		onOpenInNewTab: undefined,
		onRename: undefined,
		onDuplicate: undefined,
		onCopy: undefined,
		onDownload: undefined,
		onShowInFolder: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The lightbox with no item action given. Check that the bar draws neither Download, Duplicate nor More, keeping the Library path link and Close.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label"))
				.filter((name) =>
					["Download", "Duplicate", "More"].includes(name ?? ""),
				),
		).toEqual([])
		await expect(
			within(popup).getByRole("button", { name: "Library" }),
		).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Close" }),
		).toBeVisible()
	},
})

export const DuplicateFromTheBar = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Duplicate pressed in the bar of an image, every item action given, as artboards I7a to I7c draw the capsule. Check that the capsule reads Download, Duplicate then More before Close, that Duplicate hands the shown image to `onDuplicate` once, and that Copy, no longer a bar button, sits in More and hands the image to `onCopy`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const actions = slotIn(barIn(popup), "library-bar-actions")
		await expect(
			within(actions)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual(["Download", "Duplicate", "More", "Close"])

		await userEvent.click(
			within(actions).getByRole("button", { name: "Duplicate" }),
		)
		await expect(args.onDuplicate).toHaveBeenCalledOnce()
		await expect(args.onDuplicate).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)

		const menu = await openMoreMenu(popup, userEvent)
		await expectNoBarActionIn(menu)
		await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }))
		await expect(args.onCopy).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])
	},
})

export const AtTheFirstImage = meta.story({
	args: { openedAt: 0 },
	parameters: {
		docs: {
			description: {
				story:
					"The first image of the Library: there is nothing before it. Check that Previous is disabled, that Left arrow asks for nothing, and that Next and Right arrow still step forward.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		await expect(popup).toHaveTextContent("1 of 8")
		await expect(
			within(popup).getByRole("button", { name: "Previous image" }),
		).toBeDisabled()
		await expect(
			within(popup).getByRole("button", { name: "Next image" }),
		).toBeEnabled()

		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onPrevious).not.toHaveBeenCalled()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onNext).toHaveBeenCalledOnce()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onPrevious).toHaveBeenCalledOnce()
	},
})

const expectCoversPanel = async (panel: HTMLElement, popup: HTMLElement) => {
	await expect(panel).toContainElement(popup)
	await expect(popup.parentElement).not.toBe(document.body)
	await expect(getComputedStyle(popup).position).toBe("absolute")
	await expect(popup.getBoundingClientRect().toJSON()).toEqual(
		panel.getBoundingClientRect().toJSON(),
	)
}

export const OpenedWithThePanel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An image already open on the very render that mounts the Library, as when the app restores a Library tab on a Library image. Check that the image covers the content card only, never the whole window, and that it still does once closed and opened again from the grid.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const panel = canvasElement.querySelector<HTMLElement>(
			'[data-slot="library-panel"]',
		)
		if (!panel) throw new Error("The library panel is not rendered.")

		await expectCoversPanel(panel, await lightbox())

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await userEvent.click(
			canvas.getByRole("button", { name: /dashboard-redesign\.png/ }),
		)
		await expectCoversPanel(panel, await lightbox())
	},
})

export const Zoomed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The image zoomed in past its fit, the stage scrolling to follow it. Check that Fit gives way to the zoom percentage while the image is not fitted, and that pressing that percentage fits the image to the stage again.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const fit = within(popup).getByRole("button", { name: "Fit to the window" })
		await expect(fit).toHaveTextContent("Fit")

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		const zoomedIn = within(popup).getByRole("button", {
			name: /%, fit to the window$/,
		})
		await expect(zoomedIn).toHaveTextContent(/^\d+%$/)
		const image = within(popup).getByRole("img", {
			name: "dashboard-redesign.png",
		})
		const zoomedWidth = image.getBoundingClientRect().width

		await userEvent.click(zoomedIn)
		await expect(fit).toHaveTextContent("Fit")
		await expect(image.getBoundingClientRect().width).toBeLessThan(zoomedWidth)

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom out" }),
		)
		await expect(
			within(popup).getByRole("button", { name: /%, fit to the window$/ }),
		).toBeVisible()

		const scroller = slotIn(popup, "library-lightbox-zoom")
		scroller.focus()
		await userEvent.keyboard("{ArrowRight}")
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onNext).not.toHaveBeenCalled()
		await expect(args.onPrevious).not.toHaveBeenCalled()

		if (isInBrowserRunner()) {
			const { userEvent: browserKeys } = await import("vitest/browser")
			await browserKeys.keyboard("{ArrowRight}")
			await waitFor(() => expect(scroller.scrollLeft).toBeGreaterThan(0))
			await expect(args.onNext).not.toHaveBeenCalled()
		}

		within(popup).getByRole("button", { name: "Download" }).focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onNext).toHaveBeenCalledOnce()
		await expect(popup).toHaveTextContent("harbour-at-night.jpg")

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
	},
})

export const ImageMenuOpen = meta.story({
	args: { onSaveToLibrary: fn(), onCopyImage: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The `ImageMenu` open on the image, on a right-click on the stage. Check it opens dark at the pointer, lists the bar's actions in the bar's order, Download and Duplicate then the More menu's, then Save to Library and Copy image, never Open in viewer, that an entry hands the image to its callback, and that a click outside the menu dismisses it without closing the lightbox.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const image = within(popup).getByRole("img", {
			name: "dashboard-redesign.png",
		})
		const openStageMenu = async () => {
			await userEvent.pointer({ keys: "[MouseRight]", target: image })
			return screen.findByRole("menu", {
				name: "Actions for dashboard-redesign.png",
			})
		}

		let menu = await openStageMenu()
		await expect(menuEntryNames(menu)).toEqual([
			...BAR_ACTION_NAMES,
			...BAR_MENU_ACTION_NAMES,
			"Save to Library",
			"Copy image",
		])
		await expect(
			within(menu).queryByRole("menuitem", { name: "Open in viewer" }),
		).toBe(null)
		await expect(menu.closest(".dark")).not.toBe(null)

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Save to Library" }),
		)
		await expect(args.onSaveToLibrary).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))

		await openStageMenu()
		await clickAt(userEvent, besideImage(image.parentElement as Element, image))
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))
		await expect(args.onClose).not.toHaveBeenCalled()

		menu = await openStageMenu()
		await expect(menu).toBeVisible()
	},
})

export const ImageMenuSaving = meta.story({
	args: {
		onSaveToLibrary: fn(),
		onCopyImage: fn(),
		isSavingToLibrary: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The `ImageMenu` open on the image on screen while it is on its way to the Library. Check Save to Library is disabled while Copy image still answers.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const popup = await lightbox()
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: within(popup).getByRole("img", {
				name: "dashboard-redesign.png",
			}),
		})
		const menu = await screen.findByRole("menu", {
			name: "Actions for dashboard-redesign.png",
		})
		await expect(
			within(menu).getByRole("menuitem", { name: "Save to Library" }),
		).toHaveAttribute("aria-disabled", "true")
		await expect(
			within(menu).getByRole("menuitem", { name: "Copy image" }),
		).not.toHaveAttribute("aria-disabled")
	},
})

export const BarDragsTheWindow = meta.story({
	args: { dragRegion: "deep" },
	parameters: {
		docs: {
			description: {
				story:
					"An image given `dragRegion`, as the frameless window mounts it. Check that the bar carries the deep drag region, so a press on its empty stretch moves the window instead of closing the image, and that the Library path link, Download, Duplicate, More and Close are native buttons with no drag region of their own, so a press on one of them stays a click. Leave `dragRegion` out wherever a title bar already moves the window.",
			},
		},
	},
	play: async () => {
		const bar = barIn(await lightbox())

		await expect(
			within(bar)
				.getAllByRole("button")
				.map(
					(button) => button.getAttribute("aria-label") ?? button.textContent,
				),
		).toEqual(["Library", "Download", "Duplicate", "More", "Close"])
		await expectBarDragsTheWindow(bar)
	},
})

const BAR_COMMENTS: LibraryBarComments = {
	counts: COMMENT_COUNTS,
	isCommentMode: false,
	onCommentModeChange: fn(),
	list: (
		<LibraryCommentsList
			counts={COMMENT_COUNTS}
			onOpenThread={fn()}
			onTabChange={fn()}
			tab="open"
			threads={OPEN_THREADS}
		/>
	),
}

const commentControlsIn = (popup: HTMLElement) => {
	const controls = slotIn(popup, "library-comment-bar-controls")

	return {
		controls,
		counter: within(controls).getByRole("button", { name: "3 open comments" }),
		toggle: within(controls).getByRole("button", { name: "Comment" }),
	}
}

export const WithComments = meta.story({
	args: { comments: BAR_COMMENTS },
	parameters: {
		docs: {
			description: {
				story:
					"The bar of an image that has comment threads, as artboard Img 1 draws it. Check the counter then the Comment button come first among the actions, before Download, that a press asks for comment mode, and that the counter opens the comments list dark, over the viewer, without closing it.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const popup = await lightbox()
		const { controls, counter, toggle } = commentControlsIn(popup)

		await expect(toggle).toHaveAttribute("aria-pressed", "false")
		await expect(
			controls.compareDocumentPosition(
				within(popup).getByRole("button", { name: "Download" }),
			) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()

		await userEvent.click(toggle)
		await expect(BAR_COMMENTS.onCommentModeChange).toHaveBeenCalledWith(true)

		await userEvent.click(counter)
		const tabs = await screen.findByRole("tablist", { name: "Comments" })
		await expect(tabs.closest(".dark")).not.toBe(null)
		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(counter).toHaveAttribute("aria-expanded", "false"),
		)
		await expect(popup).toBeVisible()
	},
})

export const CommentModeOn = meta.story({
	args: { comments: { ...BAR_COMMENTS, isCommentMode: true } },
	parameters: {
		docs: {
			description: {
				story:
					"The same bar while comment mode is on, as artboard Img 2 draws it. Check the Comment button is pressed.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expect(commentControlsIn(popup).toggle).toHaveAttribute(
			"aria-pressed",
			"true",
		)
	},
})

const PEOPLE_PRESENT = [
	{ id: "lea", name: "Lea Martin" },
	{ id: "noor", name: "Noor Haddad" },
]

const PRESENCE_AVATAR_SIZE = 22

const expectPeopleBeforeComments = async (popup: HTMLElement) => {
	const actions = slotIn(barIn(popup), "library-bar-actions")
	const people = slotIn(actions, "library-document-people")
	const { controls } = commentControlsIn(popup)
	const capsule = slotIn(actions, "app-header-capsule")
	const close = within(actions).getByRole("button", { name: "Close" })

	await expect(Array.from(actions.children).slice(0, 4)).toEqual([
		people,
		controls,
		capsule,
		close,
	])
	await expect(getComputedStyle(actions).columnGap).toBe("8px")

	const avatars = within(people).getAllByRole("img")
	await expect(
		avatars.map((avatar) => avatar.getAttribute("aria-label")),
	).toEqual(PEOPLE_PRESENT.map(({ name }) => name))
	for (const avatar of avatars)
		await expect(sizeOf(avatar)).toEqual([
			PRESENCE_AVATAR_SIZE,
			PRESENCE_AVATAR_SIZE,
		])
	const [first, second] = avatars
	if (!first || !second) throw new Error("The bar lost a person")
	await expect(
		second.getBoundingClientRect().left - first.getBoundingClientRect().right,
	).toBe(2)
	await expect(sizeOf(close)).toEqual([32, 32])
}

export const OverlayWithPeoplePresent = meta.story({
	args: {
		images: LIBRARY_LIGHTBOX_IMAGES.with(1, ARTBOARD_IMAGE),
		presence: <LibraryDocumentPresence people={PEOPLE_PRESENT} writers={[]} />,
		comments: BAR_COMMENTS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The image fitted to the stage with two people looking at it, as artboard I7a draws it. Check that the two 22 px avatars, 2 apart and not overlapping, open the right group of the bar 8 before the comment counter, the Comment button, the capsule and Close, exactly where the open document draws them in I6a. The artboard predates comments, so its bar shows neither the counter nor the Comment button.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expectStaticHeaderBar(popup)
		await expectPeopleBeforeComments(popup)
	},
})

export const OverlayWithNobodyPresent = meta.story({
	args: {
		images: LIBRARY_LIGHTBOX_IMAGES.with(1, ARTBOARD_IMAGE),
		presence: <LibraryDocumentPresence people={[]} writers={[]} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The image fitted to the stage with presence given but nobody there. Check that the bar draws no avatar and leaves no gap before the capsule, which opens the right group as in `OverlayFitted`.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		const actions = slotIn(barIn(popup), "library-bar-actions")
		const { capsule } = await expectBarControls(popup)
		await expect(capsule.getBoundingClientRect().left).toBe(
			actions.getBoundingClientRect().left,
		)
	},
})

export const NarrowLongNameWithPeoplePresent = meta.story({
	args: {
		images: LIBRARY_LIGHTBOX_IMAGES.with(1, LONG_NAMED_IMAGE),
		isNarrow: true,
		presence: <LibraryDocumentPresence people={PEOPLE_PRESENT} writers={[]} />,
		comments: BAR_COMMENTS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A long image name in a 440 wide overlay with two people present. Check that the name ends with an ellipsis on its one 18 px line while the two 22 px avatars, the comment controls, the capsule and Close keep their full size, 12 from the end of the bar.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		const bar = await expectStaticHeaderBar(popup)
		const name = within(popup).getByRole("heading", {
			name: LONG_NAMED_IMAGE.name,
		})
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().height).toBe(18)
		await expectPeopleBeforeComments(popup)
		const actions = slotIn(bar, "library-bar-actions")
		await expect(actions.scrollWidth).toBe(actions.clientWidth)
		await expect(
			bar.getBoundingClientRect().right - actions.getBoundingClientRect().right,
		).toBe(12)
	},
})
