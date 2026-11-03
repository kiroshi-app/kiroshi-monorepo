import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

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
	LibraryLightbox,
	type LibraryLightboxImage,
} from "@workspace/ui/components/library-lightbox"
import { LibraryPanel } from "@workspace/ui/components/library-panel"
import { COPIED_RESET_MS } from "@workspace/ui/hooks/use-copy-text"

type LibraryWithLightboxProps = {
	openedAt: number | null
	onPrevious: () => void
	onNext: () => void
	onDownload: (image: LibraryLightboxImage) => void
	onCopy: (image: LibraryLightboxImage) => void | Promise<void>
	onMore?: (image: LibraryLightboxImage) => void
}

const LibraryWithLightbox = ({
	openedAt,
	onPrevious,
	onNext,
	onDownload,
	onCopy,
	onMore,
}: LibraryWithLightboxProps) => {
	const [shownAt, setShownAt] = useState(openedAt)

	return (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryPanel
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
							count={LIBRARY_LIGHTBOX_IMAGES.length}
							image={
								shownAt === null
									? null
									: (LIBRARY_LIGHTBOX_IMAGES[shownAt] ?? null)
							}
							onClose={() => setShownAt(null)}
							onCopy={onCopy}
							onDownload={onDownload}
							onMore={onMore}
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

const copySwapIn = (popup: HTMLElement) => {
	const [copyLayer, checkLayer] = within(popup)
		.getByRole("button", { name: "Copy" })
		.querySelectorAll("[data-slot=icon-swap] > span")
	return { copyLayer, checkLayer }
}

const announcementIn = (popup: HTMLElement) =>
	popup.querySelector("[aria-live=polite]")

const LIGHTBOX_STORY_ARGS: LibraryWithLightboxProps = {
	openedAt: 1,
	onPrevious: fn(),
	onNext: fn(),
	onDownload: fn(),
	onCopy: fn(),
	onMore: fn(),
}

const meta = preview.meta({
	title: "Overlays/LibraryLightbox",
	component: withStoryProps<LibraryWithLightboxProps>(LibraryLightbox),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"One image of the Library, over the content card, opened from a grid item. It traps focus, closes on Escape and on Close, and hands focus back to the item that opened it. Left and Right arrows, like Previous and Next, ask the caller for the neighbouring image, and the two buttons disable at either end. Download and Open folder only report the image to their callback, and Open folder is drawn only when `onMore` is given. Copy reports the image too, then swaps its icon for a check and announces Copied once `onCopy` settles, until the shared copy reset delay runs out. The zoom pill steps the image out and in, and its middle button, Fit, shows the zoom percentage until it is pressed to fit the stage again. Render it as the `overlay` of `LibraryPanel` so it covers the card.",
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
					"The second image open, as artboard 8 draws it. Check the arrows and the three actions report to their callbacks, that the third action is Open folder with a folder icon, that every action of the bar is a 32 px button that changes colour instantly, that every icon button names its action in a tooltip, and that Escape hands focus back to the grid item that opened the image.",
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
		const openFolder = within(popup).getByRole("button", {
			name: "Open folder",
		})
		await userEvent.hover(openFolder)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Open folder",
		)
		await userEvent.unhover(openFolder)
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))
		await userEvent.click(openFolder)
		await expect(args.onMore).toHaveBeenCalledWith(LIBRARY_LIGHTBOX_IMAGES[1])

		for (const name of ["Download", "Copy", "Open folder", "Close"]) {
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
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Next image",
		)
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

export const Member = meta.story({
	args: { onMore: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The second image open in a joined Space, where Open folder has no action for a member. Check that the bar keeps Download, Copy and Close and draws no Open folder.",
			},
		},
	},
	play: async () => {
		const popup = await lightbox()
		await expect(
			within(popup).getByRole("button", { name: "Download" }),
		).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Copy" }),
		).toBeVisible()
		await expect(
			within(popup).queryByRole("button", { name: "Open folder" }),
		).toBe(null)
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
