import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { probedStyleOf } from "@workspace/storybook/story-utils"
import { JoinedSpaceFields } from "@workspace/ui/components/space-settings-dialog/joined-space-fields"

const meta = preview.meta({
	title: "Settings/Space/JoinedSpaceFields",
	component: JoinedSpaceFields,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The Space entry of a space joined from another Kiroshi: its name, read-only text under its label since a member cannot rename the space, and the host it lives on, read-only with a hint saying the space lives there. No colour, no share link, nothing to move between machines. Pick `SpaceFields` for a space this machine owns.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-md">
				<Story />
			</div>
		),
	],
	args: {
		value: { name: "Northwind" },
		host: "http://192.168.1.24:45367",
	},
})

const nameIn = async (scope: HTMLElement) => {
	const label = within(scope).getByRole("term")
	await expect(label).toHaveTextContent(/^Name$/)
	const name = within(scope).getByRole("definition")
	await expect(name.previousElementSibling).toBe(label)
	return name
}

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Name and Host on a joined space. Check that Name reads as plain text named by its label, with no textbox, no field box and no focus stop, that Host takes no edit but still takes focus so it can be selected and copied, and that the hint under Host is read as its description.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const name = await nameIn(canvasElement)
		await expect(name).toHaveTextContent(/^Northwind$/)
		await expect(canvas.queryByRole("textbox", { name: "Name" })).toBeNull()
		await expect(canvas.queryByDisplayValue("Northwind")).toBeNull()

		const style = getComputedStyle(name)
		await expect(style.borderTopWidth).toBe("0px")
		await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)")
		await expect(style.cursor).toBe("default")
		await expect(style.color).toBe(probedStyleOf("text-foreground", "color"))
		await expect(name).not.toHaveAttribute("tabindex")

		const host = canvas.getByLabelText("Host")
		await userEvent.tab()
		await expect(host).toHaveFocus()
		await userEvent.type(host, "!")
		await expect(host).toHaveValue("http://192.168.1.24:45367")
		await expect(host).toHaveAttribute("readonly")
		await expect(host).toHaveAccessibleDescription(
			"This space lives on another Kiroshi.",
		)
	},
})

export const EmptyName = meta.story({
	args: { value: { name: "" } },
	parameters: {
		docs: {
			description: {
				story:
					"A joined space whose owner left its name empty. Check Name reads `Untitled space`, the fallback the dialog title shows, in `muted-foreground` so it does not pass for a chosen name, and that no textbox carries it. Pick `Default` for a named space.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const name = await nameIn(canvasElement)
		await expect(name).toHaveTextContent(/^Untitled space$/)
		await expect(getComputedStyle(name).color).toBe(
			probedStyleOf("text-muted-foreground", "color"),
		)
		await expect(canvas.queryByRole("textbox", { name: "Name" })).toBeNull()
		await expect(canvas.queryByDisplayValue("Untitled space")).toBeNull()
	},
})

export const LongName = meta.story({
	args: {
		value: {
			name: "Northwind_quarterly_planning_offsite_in_Lisbon_with_the_whole_studio",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A joined space whose owner chose one unbroken name longer than the panel. Check the name wraps inside the panel width instead of running past it. Pick `Default` for a name that fits.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = await nameIn(canvasElement)
		const fields = canvasElement.querySelector<HTMLElement>(
			"[data-slot='joined-space-fields']",
		)
		if (!fields) throw new Error("The joined fields did not render")

		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
			fields.getBoundingClientRect().right,
		)
		await expect(
			Number.parseFloat(getComputedStyle(name).lineHeight),
		).toBeLessThan(name.getBoundingClientRect().height)
	},
})
