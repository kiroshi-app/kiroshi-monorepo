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
	hueScopeOf,
	isInBrowserRunner,
	slotIn,
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
import { COPIED_RESET_MS } from "@workspace/ui/hooks/use-copy-text"

type LibraryWithLightboxProps = LibraryItemActions<
	LibraryItem | LibraryLightboxImage
> &
	Pick<
		LibraryLightboxProps,
		"onSaveToLibrary" | "onCopyImage" | "isSavingToLibrary" | "comments"
	> & {
		openedAt: number | null
		onClose: () => void
		onPrevious: () => void
		onNext: () => void
	}

const LibraryWithLightbox = ({
	openedAt,
	onClose,
	onPrevious,
	onNext,
	onSaveToLibrary,
	onCopyImage,
	isSavingToLibrary,
	comments,
	...actions
}: LibraryWithLightboxProps) => {
	const [shownAt, setShownAt] = useState(openedAt)

	return (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryPanel
					{...actions}
					filter="all"
					items={LIBRARY_ITEMS}
					onFilterChange={fn()}
					onOpenItem={(item) =>
						setShownAt(
							LIBRARY_LIGHTBOX_IMAGES.findIndex(
								(image) => image.id === item.id,
							),
						)
					}
					overlay={
						<LibraryLightbox
							{...actions}
							comments={comments}
							count={LIBRARY_LIGHTBOX_IMAGES.length}
							isSavingToLibrary={isSavingToLibrary}
							onCopyImage={onCopyImage}
							onSaveToLibrary={onSaveToLibrary}
							image={
								shownAt === null
									? null
									: (LIBRARY_LIGHTBOX_IMAGES[shownAt] ?? null)
							}
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

const expectSoleTooltip = (name: string) =>
	waitFor(() => {
		const tooltips = screen.getAllByRole("tooltip")
		expect(tooltips).toHaveLength(1)
		expect(tooltips[0]).toHaveTextContent(name)
	})

const copySwapIn = (popup: HTMLElement) => {
	const [copyLayer, checkLayer] = within(popup)
		.getByRole("button", { name: "Copy" })
		.querySelectorAll("[data-slot=icon-swap] > span")
	return { copyLayer, checkLayer }
}

const announcementIn = (popup: HTMLElement) =>
	popup.querySelector("[aria-live=polite]")

const menuEntryNames = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("menuitem")
		.map((entry) => entry.textContent)

const ITEM_ACTION_NAMES = [
	"Open",
	"Open in new tab",
	"Rename",
	"Copy",
	"Download",
	"Show in folder",
	"Delete",
]

const BAR_ACTION_NAMES = ["Download", "Copy"]

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
					"One image of the Library, over the content card, opened from a grid item. It traps focus, closes on Escape, on Close and on a click on the backdrop around the image, and hands focus back to the item that opened it. Left and Right arrows, like Previous and Next, ask the caller for the neighbouring image, and the two buttons disable at either end. Back, at the leading edge of the header, closes it like Close. Download and Copy are drawn only when their callback is given and `isActionShown` keeps them for the image, and More opens the item action menu, drawn only when at least one item action is shown. Copy reports the image too, then swaps its icon for a check and announces Copied once `onCopy` settles, until the shared copy reset delay runs out. The zoom pill steps the image out and in, and its middle button, Fit, shows the zoom percentage until it is pressed to fit the stage again. Render it as the `overlay` of `LibraryPanel` so it covers the card.",
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
					"The second image open, as artboard 8 draws it. Check the arrows, Download and Copy report to their callbacks, that the third action is More, that every action of the bar is a 32 px button that changes colour instantly, that every icon button names its action in a tooltip, and that Escape hands focus back to the grid item that opened the image.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const popup = await lightbox()
		await expect(popup).toHaveTextContent("dashboard-redesign.png")
		await expect(popup).toHaveTextContent("2 of 8")

		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onNext).toHaveBeenCalledOnce()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onPrevious).toHaveBeenCalledOnce()

		const download = within(popup).getByRole("button", { name: "Download" })
		await userEvent.click(download)
		await expect(args.onDownload).toHaveBeenCalledWith(
			LIBRARY_LIGHTBOX_IMAGES[1],
		)
		await userEvent.click(within(popup).getByRole("button", { name: "Copy" }))
		await expect(args.onCopy).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])
		const more = within(popup).getByRole("button", { name: "More" })
		await userEvent.hover(more)
		await expectSoleTooltip("More")
		await userEvent.unhover(more)
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))

		for (const name of ["Back", "Download", "Copy", "More", "Close"]) {
			const action = within(popup).getByRole("button", { name })
			await expect(action.getBoundingClientRect().width).toBe(32)
			await expect(action.getBoundingClientRect().height).toBe(32)
			await expect(getComputedStyle(action).transitionProperty).toBe("none")
		}

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

export const HostMoreMenu = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"More pressed on the host, every item action given. Check that the menu lists Open, Open in new tab, Rename, Show in folder, then Delete under a rule and drawn as destructive, that neither Download nor Copy, already buttons of the bar, appears in it, that the highlight follows the pointer with no colour transition, that an entry hands the shown image to its callback, and that the grid item menu still lists every action, Copy and Download included.",
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
					"More pressed in a joined Space, where Show in folder has no action for a member. Check that the bar keeps Download, Copy and More, that neither the More menu nor the grid item menu lists Show in folder, and that only the grid item menu lists Download and Copy.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup).getByRole("button", { name: "Download" }),
		).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Copy" }),
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
					"More pressed on an image, every item action given and Rename kept for documents. Check that the menu lists every action but Rename and the bar's own Download and Copy, with Delete still under its rule.",
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
					"Every item action given and only Delete shown for the image. Check that the bar draws neither Download nor Copy, and that the More menu and the grid item menu list Delete alone with no rule above it.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup).queryByRole("button", { name: "Download" }),
		).toBe(null)
		await expect(within(popup).queryByRole("button", { name: "Copy" })).toBe(
			null,
		)

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
			action === "onDownload" || action === "onCopy",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given and only Download and Copy shown for the image, both already buttons of the bar. Check that the bar draws them and no More, since its menu would have nothing left to list.",
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
					["Download", "Copy", "More", "Close"].includes(name ?? ""),
				),
		).toEqual(["Download", "Copy", "Close"])
	},
})

export const EveryActionLeftOut = meta.story({
	tags: ["test-only"],
	args: { isActionShown: () => false },
	parameters: {
		docs: {
			description: {
				story:
					"Every item action given and every one left out for the image. Check that the bar draws neither Download, Copy nor More, and that a right-click on the grid item opens no menu.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const popup = await lightbox()
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label"))
				.filter((name) => ["Download", "Copy", "More"].includes(name ?? "")),
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

export const BackButton = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The header with its back button at the leading edge, before the image name. Check that it names itself Back in a tooltip and that pressing it closes the lightbox.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		const back = within(popup).getByRole("button", { name: "Back" })
		await expect(back.getBoundingClientRect().right).toBeLessThan(
			within(popup).getByRole("heading").getBoundingClientRect().left,
		)
		await userEvent.hover(back)
		await expectSoleTooltip("Back")
		await userEvent.unhover(back)

		await userEvent.click(back)
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
	return drawn.left - room.left > drawn.top - room.top
		? { x: (room.left + drawn.left) / 2, y: drawn.top + 8 }
		: { x: room.left + 8, y: (room.top + drawn.top) / 2 }
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
					"The first image, so Previous is disabled. Check that a click on the backdrop closes the lightbox once, beside the image in fit and in zoomed mode and in the bottom strip outside the zoom pill, and that a click on the image, the classic scrollbar of the zoomed stage, its room held by a stable gutter so a headless browser keeps it, the header, the zoom pill or Previous and Next, disabled or not, keeps it open. A press on the image or on that scrollbar released on the backdrop keeps it open too, and while the More menu or the delete confirmation is open, a click outside never closes the lightbox.",
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

		const headerActions = within(popup).getByRole("button", { name: "Close" })
			.parentElement as HTMLElement
		await userEvent.click(within(popup).getByRole("heading"))
		await userEvent.click(within(popup).getByText("PNG · 1600 × 1000 · 248 KB"))
		await userEvent.click(headerActions)
		await userEvent.click(headerActions.parentElement as HTMLElement)
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
		await expect(elementAt(stripCorner)).toBe(bottomStrip)
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
		onCopy: undefined,
		onDownload: undefined,
		onShowInFolder: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The lightbox with no item action given. Check that the bar draws neither Download, Copy nor More, keeping Back and Close.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label"))
				.filter((name) => ["Download", "Copy", "More"].includes(name ?? "")),
		).toEqual([])
		await expect(
			within(popup).getByRole("button", { name: "Back" }),
		).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Close" }),
		).toBeVisible()
	},
})

export const CopyCheck = meta.story({
	args: { onCopy: fn(async () => undefined) },
	parameters: {
		docs: {
			description: {
				story:
					"Copy pressed and the copy settled. Check that the copy icon swaps for a check, that a screen reader hears Copied, that the copy icon comes back once the shared copy reset delay runs out, and that stepping to the next image after a copy shows the copy icon at once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await lightbox()
		await expect(copySwapIn(popup).checkLayer).toHaveAttribute(
			"data-shown",
			"false",
		)

		await userEvent.click(within(popup).getByRole("button", { name: "Copy" }))

		await expect(args.onCopy).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])
		await waitFor(() =>
			expect(copySwapIn(popup).checkLayer).toHaveAttribute(
				"data-shown",
				"true",
			),
		)
		await expect(copySwapIn(popup).copyLayer).toHaveAttribute(
			"data-shown",
			"false",
		)
		await expect(announcementIn(popup)).toHaveTextContent("Copied")

		await waitFor(
			() =>
				expect(copySwapIn(popup).copyLayer).toHaveAttribute(
					"data-shown",
					"true",
				),
			{ timeout: COPIED_RESET_MS + 1000 },
		)
		await expect(copySwapIn(popup).checkLayer).toHaveAttribute(
			"data-shown",
			"false",
		)
		await expect(announcementIn(popup)).toHaveTextContent("")

		await userEvent.click(within(popup).getByRole("button", { name: "Copy" }))
		await waitFor(() =>
			expect(copySwapIn(popup).checkLayer).toHaveAttribute(
				"data-shown",
				"true",
			),
		)
		await userEvent.keyboard("{ArrowRight}")
		await expect(popup).toHaveTextContent("3 of 8")
		await expect(copySwapIn(popup).copyLayer).toHaveAttribute(
			"data-shown",
			"true",
		)
		await expect(copySwapIn(popup).checkLayer).toHaveAttribute(
			"data-shown",
			"false",
		)
		await expect(announcementIn(popup)).toHaveTextContent("")
	},
})

const refusedCopy = fn(async () => {
	throw new Error("The clipboard refused the image.")
})

export const CopyRefused = meta.story({
	tags: ["test-only"],
	args: { onCopy: refusedCopy },
	parameters: {
		docs: {
			description: {
				story:
					"Copy pressed and the copy rejected. Check that the copy icon stays, that no check appears and that the lightbox announces nothing, the caller having raised its own failure notice.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const popup = await lightbox()

		await userEvent.click(within(popup).getByRole("button", { name: "Copy" }))

		await expect(refusedCopy).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])
		await expect(refusedCopy.mock.results[0]?.value).rejects.toThrow(
			"The clipboard refused the image.",
		)
		await new Promise((settled) => window.setTimeout(settled, 100))
		await expect(announcementIn(popup)).toHaveTextContent("")
		await expect(copySwapIn(popup).copyLayer).toHaveAttribute(
			"data-shown",
			"true",
		)
		await expect(copySwapIn(popup).checkLayer).toHaveAttribute(
			"data-shown",
			"false",
		)
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
					"The `ImageMenu` open on the image, on a right-click on the stage. Check it opens dark at the pointer, lists the bar's actions in the bar's order, Download and Copy then the More menu's, then Save to Library and Copy image, never Open in viewer, that an entry hands the image to its callback, and that a click outside the menu dismisses it without closing the lightbox.",
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
		counter: within(controls).getByRole("button", { name: "3 comments" }),
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
