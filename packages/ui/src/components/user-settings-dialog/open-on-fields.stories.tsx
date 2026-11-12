import { useState } from "react"
import { expect, fn, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectFocusRing } from "@workspace/storybook/story-utils"
import {
	type OpenOn,
	OpenOnFields,
	type OpenOnFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/open-on-fields"
import { activateLanguage, DEFAULT_LANGUAGE } from "@workspace/ui/lib/i18n"

const NEW_CONVERSATION: OpenOn = "newConversation"

const LAST_CONVERSATION: OpenOn = "lastConversation"

const OpenOnHost = (props: OpenOnFieldsProps) => {
	const [openOn, setOpenOn] = useState(props.openOn)

	return (
		<OpenOnFields
			openOn={openOn}
			onOpenOnChange={(next) => {
				setOpenOn(next)
				props.onOpenOnChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/User/OpenOnFields",
	component: OpenOnFields,
	render: (args) => (
		<div className="w-[26rem]">
			<OpenOnHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Which page the app opens on at launch, as one select: the New page, or the Last conversation the reader was in. The row holds nothing: the choice goes straight to the host, which writes it down and hands back what the trigger shows.",
			},
		},
	},
	args: {
		openOn: NEW_CONVERSATION,
		onOpenOnChange: fn(),
	},
})

export const NewConversation = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The default a fresh record holds. Check that the trigger reads New, that the list offers New then Last conversation, and that picking the second reports `lastConversation` once. Pick `LastConversation` for the other value.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("combobox", { name: "Open on" })
		await expect(trigger).toHaveTextContent("New")

		await userEvent.click(trigger)
		await screen.findByRole("listbox", { name: "Open on" })
		const options = screen.getAllByRole("option")
		await expect(options.map((option) => option.textContent)).toEqual([
			"New",
			"Last conversation",
		])

		await userEvent.click(
			screen.getByRole("option", { name: "Last conversation" }),
		)
		await expect(args.onOpenOnChange).toHaveBeenCalledOnce()
		await expect(args.onOpenOnChange).toHaveBeenCalledWith("lastConversation")
		await expect(trigger).toHaveTextContent("Last conversation")
	},
})

export const LastConversation = meta.story({
	args: { openOn: LAST_CONVERSATION },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who reopens where they left off. Check that the trigger reads Last conversation and that picking New reports `newConversation` once. Pick `NewConversation` for the default.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("combobox", { name: "Open on" })
		await expect(trigger).toHaveTextContent("Last conversation")

		await userEvent.click(trigger)
		await userEvent.click(await screen.findByRole("option", { name: "New" }))
		await expect(args.onOpenOnChange).toHaveBeenCalledOnce()
		await expect(args.onOpenOnChange).toHaveBeenCalledWith("newConversation")
	},
})

export const InFrench = meta.story({
	beforeEach: () => {
		activateLanguage("fr")

		return () => activateLanguage(DEFAULT_LANGUAGE)
	},
	parameters: {
		docs: {
			description: {
				story:
					"The row read in French. Check that the label and both options turned. Pick `NewConversation` for the English row.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = await canvas.findByRole("combobox", { name: "Ouvrir sur" })
		await expect(trigger).toHaveTextContent("Nouveau")

		await userEvent.click(trigger)
		await expect(
			await screen.findByRole("option", { name: "Dernière conversation" }),
		).toBeVisible()
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The row in the dark scheme. Check that the trigger reached by keyboard carries the `ring` outline, and that the arrow keys open the list without a pointer. Pick `NewConversation` for the light scheme.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("combobox", { name: "Open on" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
		await expectFocusRing(trigger)

		await userEvent.keyboard("{ArrowDown}")
		await expect(
			await screen.findByRole("listbox", { name: "Open on" }),
		).toBeVisible()
	},
})
