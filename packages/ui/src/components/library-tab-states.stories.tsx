import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	hueScopeOf,
	slotIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LibraryDocumentSkeleton,
	LibraryImageSkeleton,
	LibraryItemUnavailable,
} from "@workspace/ui/components/library-tab-states"

const LONG_NAME =
	"Quarterly planning notes for the spring launch, with every decision the team took across the three workshops and the follow-ups each owner committed to"

const DOCUMENT_COLUMN_WIDTH = 640

type LibraryFrameProps = {
	children: ReactNode
}

const LibraryFrame = ({ children }: LibraryFrameProps) => (
	<div
		className="flex h-208 w-320 bg-background ps-15 pe-1.5 pt-2 pb-2"
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

const expectFillsFrameHeight = async (root: HTMLElement) => {
	const frame = root.closest<HTMLElement>("[data-content-card]")
	if (!frame) throw new Error("No Library frame around the tab state")
	await expect(root.getBoundingClientRect().height).toBeGreaterThan(0)
	await expect(root.getBoundingClientRect().height).toBe(frame.clientHeight)
}

const expectShapesHidden = async (region: HTMLElement) => {
	const shapes = region.querySelectorAll('[data-slot="skeleton"]')
	await expect(shapes.length).toBeGreaterThan(0)
	for (const shape of shapes) {
		await expect(shape.closest('[aria-hidden="true"]')).not.toBe(null)
	}
}

const meta = preview.meta({
	title: "Navigation/LibraryTabStates",
	component: LibraryItemUnavailable,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a Library tab shows before its item is on screen: the document editor skeleton while a document loads, the image viewer skeleton while an image loads, and the can't-open state when the item was deleted or can't be read. Each fills the tab's card from top to bottom, so the Library grid never flashes in between.",
			},
		},
	},
})

export const DocumentLoading = meta.story({
	render: () => (
		<LibraryFrame>
			<LibraryDocumentSkeleton />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A document tab before its text lands. Check the document bar, the title line, the detail line and the body lines in the 640px reading column, the lines reaching the bottom of the card, and the one busy region a screen reader hears. Pick ImageLoading for an image tab.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const region = canvas.getByRole("region", {
			name: "Loading the document…",
		})
		await expect(region).toHaveAttribute("aria-busy", "true")
		await expectShapesHidden(region)
		await expectFillsFrameHeight(region)
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(
			slotIn(canvasElement, "list-skeleton").getBoundingClientRect().width,
		).toBe(DOCUMENT_COLUMN_WIDTH)
	},
})

export const ImageLoading = meta.story({
	render: () => (
		<LibraryFrame>
			<LibraryImageSkeleton />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An image tab before its file lands, drawn on the viewer's dark surface. Check the bar with back, name and actions, the two step buttons around the stage and the zoom bar at the bottom, all as placeholders inside one busy region. Pick DocumentLoading for a document tab.",
			},
		},
	},
	play: async ({ canvas }) => {
		const region = canvas.getByRole("region", { name: "Loading the image…" })
		await expect(region).toHaveAttribute("aria-busy", "true")
		await expectShapesHidden(region)
		await expectFillsFrameHeight(region)
	},
})

export const DeletedItem = meta.story({
	args: { name: "Spring launch brief", reason: "deleted", onBack: fn() },
	render: (args) => (
		<LibraryFrame>
			<LibraryItemUnavailable {...args} />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A tab whose item was deleted from the Library since it was opened. Check the line naming the item, the reason, the centred card, and that Back to the Library takes a focus ring from the keyboard and calls `onBack`. Pick UnreadableItem when the file is there but can't be read.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const state = canvas.getByRole("group", {
			name: "Couldn’t open Spring launch brief",
		})
		await expect(state).toHaveAccessibleDescription(
			"This item was deleted from the Library.",
		)
		const surface = slotIn(canvasElement, "library-item-unavailable")
		await expectFillsFrameHeight(surface)
		const surfaceBox = surface.getBoundingClientRect()
		const stateBox = state.getBoundingClientRect()
		await expect(
			Math.abs(
				stateBox.top +
					stateBox.height / 2 -
					(surfaceBox.top + surfaceBox.height / 2),
			),
		).toBeLessThanOrEqual(1)

		const back = canvas.getByRole("button", { name: "Back to the Library" })
		await userEvent.tab()
		await expect(back).toHaveFocus()
		await expect(getComputedStyle(back).outlineStyle).toBe("solid")
		await userEvent.keyboard("{Enter}")
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const UnreadableItem = meta.story({
	args: { name: LONG_NAME, reason: "unreadable", onBack: fn() },
	render: (args) => (
		<LibraryFrame>
			<LibraryItemUnavailable {...args} />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A tab whose file is still in the Library but can't be read, under a name far longer than the card. Check that the name stays on one line, cut with an ellipsis, with the full line in its tooltip and accessible name, and that the reason says how to retry. Pick DeletedItem when the item is gone.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const line = `Couldn’t open ${LONG_NAME}`
		const state = canvas.getByRole("group", { name: line })
		await expect(state).toHaveAccessibleDescription(
			"Couldn’t read this item on the computer where Kiroshi runs. Go back to the Library and open it again.",
		)
		await expectFillsFrameHeight(
			slotIn(canvasElement, "library-item-unavailable"),
		)

		const shownLine = canvas.getByTitle(line)
		await expect(shownLine.scrollWidth).toBeGreaterThan(shownLine.clientWidth)
		await expect(shownLine.getClientRects()).toHaveLength(1)
	},
})
