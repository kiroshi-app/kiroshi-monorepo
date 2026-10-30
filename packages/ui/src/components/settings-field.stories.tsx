import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectControlFrame,
	expectFocusRing,
	expectInvalidOutline,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	SettingsField,
	type SettingsFieldProps,
} from "@workspace/ui/components/settings-field"

const FieldHost = (props: SettingsFieldProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SettingsField
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange?.(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsField",
	component: SettingsField,
	render: (args) => (
		<div className="w-80">
			<FieldHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One labelled text control, the unit every settings surface is built from. The label owns the control through a generated id, so the whole field is one target for a screen reader and a click on the words lands in the box. It is a single-line input until it is given room: `rows` makes it a textarea of that many lines, `fill` makes it a textarea that takes whatever height its container has left. It never resizes by hand — the surface decides the height, not the reader — and it holds no value of its own, so a host owns the state and this only reports keystrokes.",
			},
		},
	},
	args: {
		label: "Name",
		value: "Nest Keeper",
		onValueChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal field: one line, filled. Check that the label names the control — clicking the word puts the caret in the box — that typing reports every keystroke to the host, and that Tab reaches it with a visible ring rather than a bare outline. Pick `ZeroValue` for the empty field, `Multiline` for the prose ones.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Name")

		await userEvent.tab()
		await expect(field).toHaveFocus()

		await userEvent.type(field, "!")
		await expect(field).toHaveValue("Nest Keeper!")
		await expect(args.onValueChange).toHaveBeenCalledWith("Nest Keeper!")
	},
})

export const ZeroValue = meta.story({
	args: {
		value: "",
		placeholder: "Repository archivist",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The field of a companion that has not been given one yet. Check that the placeholder reads as a hint rather than a value — dimmed, and gone on the first keystroke — and that the label still names the control with nothing in it. Pick `Default` for the filled field.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const field = canvas.getByLabelText("Name")

		await expect(field).toHaveValue("")
		await expect(field).toHaveAttribute("placeholder", "Repository archivist")

		await userEvent.type(field, "Atlas")
		await expect(field).toHaveValue("Atlas")
	},
})

export const Multiline = meta.story({
	args: {
		label: "Instructions",
		value: "Say which file you would touch, then the change.",
		rows: 4,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The prose field: `rows` turns the control into a textarea of that many lines. Check that it opens at four lines whatever it holds, that it never grows a resize handle, and that Enter breaks the line instead of leaving the field. Pick `Fill` for the one that takes the room a surface has left.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Instructions")

		await expect(field.tagName).toBe("TEXTAREA")
		await expect(field).toHaveAttribute("rows", "4")
		await expect(getComputedStyle(field).resize).toBe("none")
	},
})

export const Fill = meta.story({
	args: {
		label: "Instructions",
		value: "Say which file you would touch, then the change.",
		fill: true,
	},
	render: (args) => (
		<div className="flex h-64 w-80 flex-col" data-slot="fill-surface">
			<FieldHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The field that is the whole of what a surface shows, on a tab that holds nothing else. Check that the textarea reaches the bottom of its container rather than stopping at its content, and that it gives the label its line first. Pick `Multiline` for the field measured in rows.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const field = canvas.getByLabelText("Instructions")
		const [surface] = slotsIn(canvasElement, "fill-surface")

		await expect(field.tagName).toBe("TEXTAREA")
		await expect(field.getBoundingClientRect().bottom).toBeCloseTo(
			surface.getBoundingClientRect().bottom,
			0,
		)
	},
})

export const WithHint = meta.story({
	args: {
		label: "Name",
		value: "release-notes",
		hint: "Lowercase letters, numbers and hyphens.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this over `Default` whenever the field will not take everything a reader might type. The rule goes under the control rather than into the placeholder, because a placeholder is gone the moment they start typing — which is exactly when the rule is worth reading — and it is wired to the control through `aria-describedby`, so it is announced after the label instead of in place of it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const control = canvas.getByLabelText("Name")
		const hint = canvas.getByText("Lowercase letters, numbers and hyphens.")

		await expect(control).toHaveAttribute("aria-describedby", hint.id)
	},
})

export const ReadOnly = meta.story({
	args: {
		label: "Body",
		readOnly: true,
		rows: 4,
		value:
			"# Environment\n\nPlatform: darwin 24.5.0\nShell: /bin/zsh\n\nRead from the machine each time this agent starts.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A field holding something a reader may read but not write — a skill the host keeps up to date. Check that the neutral fill says so before a keystroke does, that Tab still reaches the control with a visible ring so the text can be read and copied by keyboard, and that typing into it changes nothing and reports nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Body")

		await userEvent.tab()
		await expect(field).toHaveFocus()

		await userEvent.type(field, "!")
		await expect(args.onValueChange).not.toHaveBeenCalled()
	},
})

export const PasswordKind = meta.story({
	args: {
		label: "Value",
		kind: "password",
		value: "",
		hint: "Saved once and never shown again.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The form a field takes when what it carries must not be read over a shoulder, nor kept by anything on the way: an environment value, a token, a key. Reach for this over `Default` whenever the surface writes a secret it will never show again — the control masks every character, and it turns off the browser's autofill and the spellchecker, both of which would otherwise send the secret somewhere this field does not control. It is a single-line control only; the value it holds is still reported in clear to the host, which is the one place it is meant to go.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Value")

		await expect(field).toHaveAttribute("type", "password")
		await expect(field).toHaveAttribute("autocomplete", "off")
		await expect(field).toHaveAttribute("spellcheck", "false")

		await userEvent.type(field, "s3cret")
		await expect(args.onValueChange).toHaveBeenLastCalledWith("s3cret")
	},
})

export const NumberKind = meta.story({
	args: {
		label: "Attempt",
		kind: "number",
		value: "10",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The form a field takes when the surface behind it reads the value as a number rather than as text. Reach for this over `Default` whenever a word entered there would be stored and then silently mean nothing: the control refuses anything that is not a number instead of handing one on, decimals included, and reports an empty value rather than the letters typed into it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Attempt")

		await expect(field).toHaveAttribute("type", "number")
		await expect(field).toHaveAttribute("inputmode", "decimal")
		await expect(field).toHaveValue(10)

		await userEvent.clear(field)
		await userEvent.type(field, "many")
		await expect(field).toHaveValue(null)
		await expect(args.onValueChange).toHaveBeenLastCalledWith("")
	},
})

export const TextKind = meta.story({
	args: {
		kind: "text",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The kind every field takes unless its caller declares another: plain text, with the default keyboard and the spellchecker left on. Check that the control is a text input carrying no input mode of its own.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Name")

		await expect(field).toHaveAttribute("type", "text")
		await expect(field).not.toHaveAttribute("inputmode")
	},
})

export const EmailKind = meta.story({
	args: {
		kind: "email",
		label: "Email",
		value: "ada@example.com",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The kind for an address a person reads back letter by letter. Check that the control is an email input, that it asks a touch keyboard for the at sign, and that the spellchecker stays off so a correct address is never underlined.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Email")

		await expect(field).toHaveAttribute("type", "email")
		await expect(field).toHaveAttribute("inputmode", "email")
		await expect(field).toHaveAttribute("spellcheck", "false")
	},
})

export const UrlKind = meta.story({
	args: {
		kind: "url",
		label: "URL",
		value: "https://example.com/mcp",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The kind for an address on the network. Check that the control is a url input, that a touch keyboard offers the slash and the dot, and that the spellchecker stays off.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("URL")

		await expect(field).toHaveAttribute("type", "url")
		await expect(field).toHaveAttribute("inputmode", "url")
		await expect(field).toHaveAttribute("spellcheck", "false")
	},
})

export const SearchKind = meta.story({
	args: {
		kind: "search",
		label: "Search",
		value: "",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The kind for a query. Check that the control is a search input and that a touch keyboard turns its return key into a search key.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Search")

		await expect(field).toHaveAttribute("type", "search")
		await expect(field).toHaveAttribute("inputmode", "search")
	},
})

export const WithError = meta.story({
	args: {
		error: "A skill needs a name.",
		value: "",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The field once a submission refused it. Check that the message reads under the control in the destructive colour, that it is announced as an alert, and that the control is marked invalid and described by that message.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Name")
		const message = canvas.getByRole("alert")

		await expect(message).toHaveTextContent("A skill needs a name.")
		await expect(field).toHaveAttribute("aria-invalid", "true")
		await expect(field).toHaveAccessibleDescription("A skill needs a name.")
	},
})

const ARTBOARD_FIELD =
	"The single-line text field of artboard V1e, light and dark side by side: a `muted` fill, a 1px `input` outline and the `radius-control` corner, the value at 14px / 20px inside 8px block and 12px inline padding, the placeholder in `muted-foreground`. "

const namesIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
		"input, textarea",
	),
]

const expectArtboardField = async (field: HTMLElement) => {
	const style = getComputedStyle(field)
	await expectControlFrame(field)
	await expect(style.fontSize).toBe("14px")
	await expect(style.lineHeight).toBe("20px")
	await expect(style.paddingBlockStart).toBe("8px")
	await expect(style.paddingInlineStart).toBe("12px")
}

export const ThemesAtRest = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { placeholder: "Nest Keeper", value: "" },
	parameters: {
		docs: { description: { story: `${ARTBOARD_FIELD}At rest, empty.` } },
	},
	play: async ({ canvasElement }) => {
		const fields = namesIn(canvasElement)
		await expect(fields.length).toBe(2)
		for (const field of fields) await expectArtboardField(field)
	},
})

export const ThemesFilled = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: { description: { story: `${ARTBOARD_FIELD}Holding a value.` } },
	},
	play: async ({ canvasElement }) => {
		for (const field of namesIn(canvasElement)) await expectArtboardField(field)
	},
})

export const ThemesMultiline = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: {
		label: "Instructions",
		rows: 3,
		value: "Answer in English.\nKeep replies short.",
	},
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_FIELD}As a textarea, on the same frame and the same line height.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const field of namesIn(canvasElement)) await expectArtboardField(field)
	},
})

export const ThemesFocusVisible = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { focusVisible: "input" },
		docs: {
			description: {
				story: `${ARTBOARD_FIELD}Keyboard focus keeps the existing \`ring\` outline and its translucent halo on the frame.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const field of namesIn(canvasElement)) {
			field.focus()
			await expectFocusRing(field)
		}
	},
})

export const ThemesInvalid = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { error: "A skill needs a name.", value: "" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_FIELD}Refused, the frame keeps the existing \`destructive\` outline.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const field of namesIn(canvasElement))
			await expectInvalidOutline(field)
	},
})

export const ThemesReadOnly = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { readOnly: true },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_FIELD}Read-only, the frame drops the \`muted\` fill and shows the surface behind it, so it reads apart from a field at rest.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const field of namesIn(canvasElement))
			await expect(getComputedStyle(field).backgroundColor).toBe(
				"rgba(0, 0, 0, 0)",
			)
	},
})
