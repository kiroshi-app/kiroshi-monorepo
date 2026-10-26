import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { FocusedSpacePage } from "@workspace/ui/components/settings-screen/focused-space-page"

const meta = preview.meta({
	title: "Settings/Space/FocusedSpacePage",
	component: FocusedSpacePage,
	parameters: {
		docs: {
			description: {
				component:
					"The Space entry of a space's settings screen: a header with the space's square, name, standing and its action, then the Name field while the space can be renamed or read, then the Not shared yet card while it is yours and unshared. The screen's stories carry the four artboards; these prove the page on its own, in the light theme and in narrow columns.",
			},
		},
	},
	args: {
		space: { state: "yours", isShared: false } as const,
		value: { name: "Release desk", colour: "blue" } as const,
		onValueChange: fn(),
		rank: 2,
		onOpen: fn(),
		onShare: fn(),
	},
	render: (args) => (
		<div className="flex max-w-200 flex-col gap-6 bg-card px-6 pt-8 pb-4">
			<FocusedSpacePage {...args} />
		</div>
	),
})

export const Yours = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A space of yours, not shared, in the light theme. Check that the Name field edits the name and that the card's Share describes itself by its sentence.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const page = within(canvasElement)
		await userEvent.type(page.getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "blue",
		})
		await expect(
			page.getByRole("button", { name: "Share" }),
		).toHaveAccessibleDescription(
			"Share Release desk to invite people. Deleting it lives in Danger zone.",
		)
	},
})

export const Shared = meta.story({
	args: { space: { state: "yours", isShared: true } },
	parameters: {
		docs: {
			description: {
				story:
					"A space of yours you already share. Check that it reads Yours · shared, wears the shared presence dot, and drops the Not shared yet card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "focused-space-standing"),
		).toHaveTextContent("Yours · shared")
		await expect(slotIn(canvasElement, "host-dot")).toHaveAttribute(
			"data-host",
			"shared",
		)
		await expect(
			canvasElement.querySelector("[data-slot=not-shared-card]"),
		).not.toBeInTheDocument()
	},
})

export const LongNameInANarrowColumn = meta.story({
	args: {
		value: {
			name: "Thequarterlyreleasedeskforeveryproductlineweship",
			colour: "pink",
		},
	},
	render: (args) => (
		<div className="flex w-80 flex-col gap-6 bg-card px-6 pt-8 pb-4">
			<FocusedSpacePage {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An unbreakable name in a 320px column. Check that it wraps inside the header instead of overflowing, while the square and Open keep their size.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const header = slotIn(canvasElement, "focused-space-header")
		await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
		await expect(
			slotIn(header, "space-dot").getBoundingClientRect().width,
		).toBe(48)
		await expect(
			within(header)
				.getByRole("button", { name: "Open ⌘2" })
				.getBoundingClientRect().height,
		).toBe(32)
	},
})
