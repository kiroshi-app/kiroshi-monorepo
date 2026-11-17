// Call site: packages/ui/src/components/plugin-settings/history-panel.tsx line 195

import { type ComponentProps, useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { tokenStyleIn } from "@workspace/storybook/story-utils"
import { Input } from "@workspace/ui/components/ui/input"

const SEARCH_LABEL = "Search the history"

const QUERY = "migration"

const HEAD_CLASS = "flex w-80 shrink-0 items-center gap-3 px-5 pt-4 pb-3"

const HistorySearchField = ({
	onChange,
	value,
	...props
}: ComponentProps<typeof Input>) => {
	const [text, setText] = useState(String(value ?? ""))

	return (
		<Input
			{...props}
			onChange={(event) => {
				setText(event.target.value)
				onChange?.(event)
			}}
			value={text}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/Input",
	component: Input,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single-line field as the shadcn registry ships it on the Base UI input: a 32px rounded box on the input surface, a transparent border that turns into the focus ring, and `aria-invalid` as the only way it ever reads as wrong. It holds no label and no state — the caller owns both. In this app it is reached in one place, the search field the History panel opens above the run list, and every story here passes what that call site passes.",
			},
		},
	},
	args: {
		"aria-label": SEARCH_LABEL,
		className: "h-7 min-w-0 flex-1",
		onChange: fn(),
		placeholder: SEARCH_LABEL,
		value: "",
	},
	render: (args) => <HistorySearchField {...args} />,
	decorators: [(Story) => <div className={HEAD_CLASS}>{Story()}</div>],
})

export const Default = meta.story({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The search field the moment the History panel opens it, empty. Check that the placeholder repeats the accessible name rather than replacing it — the field carries no visible label, so the name has to come from `aria-label` — that the panel's 28px override wins over the primitive's 32px instead of being dropped, and that the corners wear the normal radius rather than square ones. Pick `Filled` for a query already typed.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByRole("textbox", { name: SEARCH_LABEL })

		await expect(field).toHaveValue("")
		await expect(field).toHaveAttribute("placeholder", SEARCH_LABEL)
		await expect(field.getBoundingClientRect().height).toBe(28)
		await expect(getComputedStyle(field).borderTopLeftRadius).toBe(
			tokenStyleIn(
				field.parentElement as HTMLElement,
				"rounded-lg",
				"borderTopLeftRadius",
			),
		)
		await expect(
			Number.parseFloat(getComputedStyle(field).borderTopLeftRadius),
		).toBeGreaterThan(0)
	},
})

export const DefaultDark = Default.extend({
	globals: { theme: "dark" },
})

export const Filled = meta.story({
	args: { value: QUERY },
	parameters: {
		docs: {
			description: {
				story:
					"A query already in the field, which is what the panel re-renders on every keystroke. Check that the typed text reads at the same size as the placeholder it replaced and that the field keeps shrinking with its row rather than pushing the controls beside it out — `min-w-0` is what makes that hold.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const field = canvas.getByRole("textbox", { name: SEARCH_LABEL })

		await expect(field).toHaveValue(QUERY)

		await userEvent.type(field, "s")
		await expect(field).toHaveValue(`${QUERY}s`)
	},
})

export const Focused = meta.story({
	args: { value: QUERY },
	parameters: {
		docs: {
			description: {
				story:
					"The field as the panel hands it focus on opening the search, so the reader types without aiming first. A text field matches `:focus-visible` on a programmatic focus too, which is why the ref focus of the call site lights the ring. Check that the ring is the border turning opaque plus a 3px halo rather than the browser outline alone, and that nothing in the box moves when it lands — only colour and shadow transition here.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByRole("textbox", { name: SEARCH_LABEL })

		field.focus()

		await expect(field).toHaveFocus()
		await expect(field.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(field).boxShadow).not.toBe("none")
	},
})
