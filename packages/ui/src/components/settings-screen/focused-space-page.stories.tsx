import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { FocusedSpacePage } from "@workspace/ui/components/settings-screen/focused-space-page"

const meta = preview.meta({
	title: "Settings/Space/FocusedSpacePage",
	component: FocusedSpacePage,
	parameters: {
		docs: {
			description: {
				component:
					"The Space entry of a space's settings screen: a header with the space's avatar, name, standing and its action, then the Name field and the colour field while the space can be renamed, then the Not shared yet card while it is yours and unshared. The screen's stories carry the four artboards; these prove the page on its own, in the light theme and in narrow columns.",
			},
		},
	},
	args: {
		space: { state: "yours", isShared: false } as const,
		spaceId: "release-desk",
		value: { name: "Release desk", colour: BLOT_HUES.blue } as const,
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
					"A space of yours, not shared, in the light theme. Check that the Name field edits the name, that the colour field sits right under it and reports a picked swatch or No colour with the name untouched, and that the card's Share describes itself by its sentence.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const page = within(canvasElement)
		await userEvent.type(page.getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: BLOT_HUES.blue,
		})
		await expect(page.getByRole("radio", { name: "Blue" })).toBeChecked()
		await userEvent.click(page.getByRole("radio", { name: "Green" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			colour: BLOT_HUES.green,
		})
		await userEvent.click(page.getByRole("radio", { name: "No colour" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			colour: null,
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
		await expect(slotIn(canvasElement, "space-avatar").dataset.state).toBe(
			"shared",
		)
		await expect(
			canvasElement.querySelector("[data-slot=not-shared-card]"),
		).not.toBeInTheDocument()
	},
})

export const Joined = meta.story({
	args: {
		space: { state: "joined", hostName: "Sam Rivera", isConnected: true },
		value: { name: "Northwind", colour: 320 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space joined from a connected host, wearing a hue of its own. Check that the Name field edits the name and the colour field under it moves the hue, each reporting through the page with the other value untouched, since members rename and recolour a joined space for everyone.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const page = within(canvasElement)
		const nameField = page.getByLabelText("Name")
		await expect(nameField).not.toHaveAttribute("readonly")
		await userEvent.type(nameField, "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Northwind!",
			colour: 320,
		})

		const slider = page.getByRole("slider", { name: "Your hue" })
		slider.focus()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Northwind",
			colour: 319,
		})
	},
})

export const LongNameInANarrowColumn = meta.story({
	args: {
		value: {
			name: "Thequarterlyreleasedeskforeveryproductlineweship",
			colour: BLOT_HUES.pink,
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
					"An unbreakable name in a 320px column. Check that it wraps inside the header instead of overflowing, while the avatar and Open keep their size, and that the colour field wraps its swatches without scrolling sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const header = slotIn(canvasElement, "focused-space-header")
		await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
		await expect(
			slotIn(header, "space-avatar").getBoundingClientRect().width,
		).toBe(48)
		await expect(
			within(header)
				.getByRole("button", { name: "Open ⌘2" })
				.getBoundingClientRect().height,
		).toBe(32)
		const fields = slotIn(canvasElement, "space-fields")
		await expect(fields.scrollWidth).toBeLessThanOrEqual(fields.clientWidth)
		const swatches = slotIn(fields, "colour-field-options")
		await expect(swatches.scrollWidth).toBeLessThanOrEqual(swatches.clientWidth)
	},
})

export const Connecting = meta.story({
	args: {
		space: { state: "joined", hostName: "Jordan Lee", isConnected: true },
		spaceHost: "connecting",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A joined space whose host is still being reached, the host state handed in by the app. Check the 48px avatar draws its ground with the arcs as lines and no dot, the only connection signal: no state pill follows the space name.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const header = slotIn(canvasElement, "focused-space-header")
		await expect(slotIn(header, "space-avatar").dataset.state).toBe(
			"connecting",
		)
		await expect(
			within(header).getByRole("heading", { level: 2 }),
		).toBeVisible()
		await expect(slotsIn(header, "host-pill")).toHaveLength(0)
	},
})
