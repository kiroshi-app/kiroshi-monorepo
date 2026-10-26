import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	PICKED_PICTURE_FILE,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { PICTURE_FIELD_SIZE } from "@workspace/ui/components/settings-styles"

const PICTURE = (
	<InitialsAvatar image={UPLOADED_AVATAR_IMAGE} size={PICTURE_FIELD_SIZE} />
)

const GLYPH = (
	<Icons.User aria-hidden="true" className="size-6 text-muted-foreground" />
)

const EMPTY = { onRemove: undefined, preview: GLYPH }

const DRAWN_FACE = (
	<BotIdentityAvatar blot="blue" seed="bot-7" size={PICTURE_FIELD_SIZE} />
)

const meta = preview.meta({
	title: "Forms/ProfilePictureField",
	component: ProfilePictureField,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A picture, as the row that sets it: the preview on the leading edge and the button that picks a file on the trailing one, inside a softly filled box. Pressing the button opens the picker, and a file dropped on it or pasted into it goes the same way. What sits in the preview circle is the host's to draw and arrives as `preview`, which is what lets one field serve a reader with no picture but a person glyph, and a companion with no picture but the face its engine draws. It holds nothing and names nothing: every label arrives as a prop, and the picked file and the removal both go straight to the host, which stores the picture and writes the URL back.",
			},
		},
	},
	args: {
		preview: PICTURE,
		fileLabel: "Profile picture file",
		pickLabel: "Change picture",
		removeLabel: "Remove picture",
		onPick: fn(),
		onRemove: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who already wears a picture. Check that the picture fills the preview circle rather than sitting in a box inside it, that Remove picture sits before Change picture on the trailing edge, and that both buttons emit and change nothing on screen: the picture only moves once the host writes back. Pick `Empty` for the reader with no picture, `Drawn` for a companion's, `WithoutRemove` for the surface that cannot take one off.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const input = canvas.getByLabelText("Profile picture file")

		await expect(
			canvas.getByRole("button", { name: "Change picture" }),
		).toBeVisible()
		await userEvent.upload(input, PICKED_PICTURE_FILE)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
		await expect(input).toHaveValue("")

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove picture" }),
		)
		await expect(args.onRemove).toHaveBeenCalledTimes(1)
	},
})

export const Empty = meta.story({
	args: { ...EMPTY, pickLabel: "Add picture" },
	parameters: {
		docs: {
			description: {
				story:
					"The reader who has never uploaded one. Check that the preview carries a person glyph rather than initials, since this field is about the picture and not the name, that the button reads `Add picture` rather than `Change picture`, and that no remove button is reachable, by pointer or by Tab: there is nothing to take off. Pick `Default` for the worn picture.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()

		await userEvent.upload(
			canvas.getByLabelText("Profile picture file"),
			PICKED_PICTURE_FILE,
		)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
	},
})

export const Drawn = meta.story({
	args: {
		preview: DRAWN_FACE,
		fileLabel: "Avatar image file",
		pickLabel: "Add picture",
		onRemove: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same field in a companion's Appearance. A companion with no picture is never a blank: it has a face the engine draws, so the host hands that face as the preview. Check that the box, the preview size and the button are the reader's own, and that nothing but the circle's contents tells the two hosts apart.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(canvas.getByLabelText("Avatar image file")).toBeVisible()
	},
})

export const WithoutRemove = meta.story({
	tags: ["test-only"],
	args: { onRemove: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A host that takes pictures but never takes them off — no remove handler given. Check that the corner is clean rather than carrying a button that does nothing, and that replacing still works through the control itself. Pick `Default` when the host can clear the picture.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
	},
})

export const States = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<div className="flex items-center gap-8">
			<div id="picture-empty-hover">
				<ProfilePictureField {...args} {...EMPTY} />
			</div>
			<div id="picture-empty-focus">
				<ProfilePictureField {...args} {...EMPTY} />
			</div>
			<div id="picture-filled-hover">
				<ProfilePictureField {...args} />
			</div>
			<div id="picture-remove-hover">
				<ProfilePictureField {...args} />
			</div>
		</div>
	),
	parameters: {
		pseudo: {
			hover: [
				"#picture-empty-hover button",
				"#picture-filled-hover button",
				"#picture-remove-hover button:first-of-type",
			],
			focusVisible: "#picture-empty-focus button",
		},
		docs: {
			description: {
				story:
					"The empty field's button under a pointer and under a keyboard, then the worn picture's buttons under a pointer. Check that hover fills the button without moving anything and that the focus ring reads against the filled box. Two Tabs cover a worn picture, remove then the picker, and the file input behind them is not a stop of its own.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getAllByRole("button")[0]).toHaveFocus()
	},
})
