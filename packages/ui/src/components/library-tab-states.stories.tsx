import type { ReactNode } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

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

const DOCUMENT_LOADING_STORY =
	"A document tab before its text lands. Check the document bar, the title line, the detail line and the body lines in the 640px reading column, the lines reaching the bottom of the card, and the one busy region a screen reader hears. Pick ImageLoading for an image tab."

const expectDocumentLoading = async (canvasElement: HTMLElement) => {
	const region = within(canvasElement).getByRole("region", {
		name: "Loading the document…",
	})
	await expect(region).toHaveAttribute("aria-busy", "true")
	await expectShapesHidden(region)
	await expectFillsFrameHeight(region)
	await expectSkeletonFilledTo(canvasElement, "bottom")
	await expect(
		slotIn(canvasElement, "list-skeleton").getBoundingClientRect().width,
	).toBe(DOCUMENT_COLUMN_WIDTH)
}

const MISSING_ITEM_STORY =
	"A tab whose item is no longer in the Library list, deleted or moved since it was opened. Check the title without the item name, the reason, the centred card, the polite announcement of both without focus moving, and that Close tab takes a focus ring from the keyboard and calls `onAction`. Pick UnreadableItem when the file is there but can't be read."

const MISSING_TITLE = "This item isn’t in the Library anymore."

const MISSING_BODY = "It was deleted or moved. Close this tab."

const expectMissingItem = async (
	canvasElement: HTMLElement,
	onAction: () => void,
) => {
	const canvas = within(canvasElement)
	const state = canvas.getByRole("group", { name: MISSING_TITLE })
	await expect(state).toHaveAccessibleDescription(MISSING_BODY)
	await expect(state).not.toHaveTextContent("Spring launch brief")

	const announcement = canvas.getByRole("status")
	await expect(announcement).toHaveTextContent(MISSING_TITLE)
	await expect(announcement).toHaveTextContent(MISSING_BODY)
	await expect(state).not.toContainElement(
		document.activeElement as HTMLElement,
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

	const close = canvas.getByRole("button", { name: "Close tab" })
	await userEvent.tab()
	await expect(close).toHaveFocus()
	await expect(getComputedStyle(close).outlineStyle).toBe("solid")
	await userEvent.keyboard("{Enter}")
	await expect(onAction).toHaveBeenCalledOnce()
}

const meta = preview.meta({
	title: "Navigation/LibraryTabStates",
	component: LibraryItemUnavailable,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a Library tab shows before its item is on screen: the document editor skeleton while a document loads, the image viewer skeleton while an image loads, and the can't-open state when the item is no longer in the Library or can't be read. Each fills the tab's card from top to bottom, so the Library grid never flashes in between.",
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
				story: `${DOCUMENT_LOADING_STORY} Pick \`DocumentLoadingDark\` for the dark theme.`,
			},
		},
	},
	play: ({ canvasElement }) => expectDocumentLoading(canvasElement),
})

export const DocumentLoadingDark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	render: () => (
		<LibraryFrame>
			<LibraryDocumentSkeleton />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story: `${DOCUMENT_LOADING_STORY} Pick \`DocumentLoading\` for the light theme.`,
			},
		},
	},
	play: ({ canvasElement }) => expectDocumentLoading(canvasElement),
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

export const MissingItem = meta.story({
	args: { name: "Spring launch brief", reason: "missing", onAction: fn() },
	render: (args) => (
		<LibraryFrame>
			<LibraryItemUnavailable {...args} />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story: `${MISSING_ITEM_STORY} Pick \`MissingItemDark\` for the dark theme.`,
			},
		},
	},
	play: ({ args, canvasElement }) =>
		expectMissingItem(canvasElement, args.onAction),
})

export const MissingItemDark = meta.story({
	args: { name: "Spring launch brief", reason: "missing", onAction: fn() },
	globals: { theme: "dark", theme_layout: "single" },
	render: (args) => (
		<LibraryFrame>
			<LibraryItemUnavailable {...args} />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story: `${MISSING_ITEM_STORY} Pick \`MissingItem\` for the light theme.`,
			},
		},
	},
	play: ({ args, canvasElement }) =>
		expectMissingItem(canvasElement, args.onAction),
})

export const UnreadableItem = meta.story({
	args: { name: LONG_NAME, reason: "unreadable", onAction: fn() },
	render: (args) => (
		<LibraryFrame>
			<LibraryItemUnavailable {...args} />
		</LibraryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A tab whose file is still in the Library but can't be read, under a name far longer than the card. Check that the name stays on one line, cut with an ellipsis, with the full line in its tooltip and accessible name, and that the reason says how to retry. Pick MissingItem when the item is gone.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
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

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the Library" }),
		)
		await expect(args.onAction).toHaveBeenCalledOnce()
	},
})
