import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	hueScopeOf,
	isInBrowserRunner,
	resolvedChannelsOf,
	resolvedRootColor,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	BoardConnectorFlyout,
	type BoardConnectorFlyoutProps,
} from "@workspace/ui/components/board/board-connector-flyout"
import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"

const AA_TEXT_CONTRAST = 4.5

type FlyoutPlayContext = {
	canvasElement: HTMLElement
	args: BoardConnectorFlyoutProps
}

const colourIn = (scope: HTMLElement, property: string) => {
	const probe = document.createElement("span")
	probe.style.backgroundColor = `var(${property})`
	scope.append(probe)
	const color = getComputedStyle(probe).backgroundColor
	probe.remove()
	return color
}

const ControlledFlyout = ({
	routing: initialRouting,
	onRoutingChange,
}: BoardConnectorFlyoutProps) => {
	const [routing, setRouting] = useState(initialRouting)
	return (
		<BoardConnectorFlyout
			onRoutingChange={(next) => {
				setRouting(next)
				onRoutingChange(next)
			}}
			routing={routing}
		/>
	)
}

const expectOptionLook = async (option: HTMLElement, isSelected: boolean) => {
	const look = getComputedStyle(option)
	await expect([look.paddingTop, look.paddingLeft]).toEqual(["6px", "8px"])
	await expect(look.columnGap).toBe("6px")
	await expect(look.borderTopLeftRadius).toBe("7px")
	await expect(look.fontSize).toBe("13px")
	await expect(look.fontWeight).toBe(isSelected ? "600" : "500")
	await expect(look.color).toBe(
		colourIn(option, isSelected ? "--primary" : "--board-control-foreground"),
	)
	const glyph = option.querySelector("svg") as SVGElement
	await expect(glyph.getBoundingClientRect().width).toBe(16)
	await expect(getComputedStyle(glyph).color).toBe(look.color)
	if (!isSelected) return
	await expect(look.backgroundColor).toBe(
		colourIn(option, "--board-control-selected"),
	)
	await expect(
		contrastRatio(
			resolvedChannelsOf("var(--primary)", option) as Rgb,
			resolvedChannelsOf("var(--board-control-selected)", option) as Rgb,
		),
	).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
}

const playFlyout = async ({ canvasElement, args }: FlyoutPlayContext) => {
	const canvas = within(canvasElement)
	const group = canvas.getByRole("radiogroup", { name: "Connector type" })
	const flyout = slotIn(canvasElement, "board-connector-flyout")
	const look = getComputedStyle(flyout)
	await expect(look.paddingTop).toBe("4px")
	await expect(look.columnGap).toBe("4px")
	await expect(look.borderTopLeftRadius).toBe("10px")
	await expect(look.backgroundColor).toBe(colourIn(flyout, "--board-control"))

	const straight = within(group).getByRole("radio", { name: "Straight" })
	const elbow = within(group).getByRole("radio", { name: "Elbow" })
	const picked = args.routing === "straight" ? straight : elbow
	const other = picked === straight ? elbow : straight
	await expect(picked).toBeChecked()
	await expect(other).not.toBeChecked()
	await expectOptionLook(picked, true)
	await expectOptionLook(other, false)

	await userEvent.click(other)
	await expect(other).toBeChecked()
	await expect(args.onRoutingChange).toHaveBeenLastCalledWith(
		args.routing === "straight" ? "elbow" : "straight",
	)
	await expectOptionLook(other, true)

	await userEvent.keyboard(
		args.routing === "straight" ? "{ArrowLeft}" : "{ArrowRight}",
	)
	await expect(picked).toHaveFocus()
	await expect(picked).toBeChecked()
	await expect(args.onRoutingChange).toHaveBeenLastCalledWith(args.routing)

	if (!isInBrowserRunner()) return
	await withMotionAllowed(async () => {
		await expect(colourTransitionsOf(straight)).toEqual([])
		await expect(colourTransitionsOf(elbow)).toEqual([])
	})
}

const playInYellowSpace = async (context: FlyoutPlayContext) => {
	const space = context.canvasElement.querySelector<HTMLElement>(
		"[data-hue]",
	) as HTMLElement
	const checked = within(context.canvasElement).getByRole("radio", {
		checked: true,
	})
	await expect(getComputedStyle(checked).color).toBe(
		colourIn(space, "--primary"),
	)
	await expect(colourIn(space, "--primary")).not.toBe(
		resolvedRootColor("--primary"),
	)
	await playFlyout(context)
}

const meta = preview.meta({
	title: "Board/BoardConnectorFlyout",
	component: BoardConnectorFlyout,
	render: (args) => <ControlledFlyout {...args} />,
	args: {
		routing: "straight",
		onRoutingChange: fn(),
	} satisfies BoardConnectorFlyoutProps,
	play: playFlyout,
})

export const Straight = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The connector type flyout of Boards 4d, Straight picked. Check the 4px padding and gap, the 10px corners on the board control surface and its shadow, each option with its 16px icon, 6px gap, 6 by 8 padding and 7px corners, the idle option at weight 500 in the control foreground and the picked one at weight 600 in the Space colour on its tint. Click or the arrow keys switch the pick, colours change with no transition. Pick StraightDark for the dark theme, Elbow for the other pick.",
			},
		},
	},
})

export const StraightDark = meta.story({
	globals: { theme: "dark" },
})

export const Elbow = meta.story({
	args: { routing: "elbow" },
	parameters: {
		docs: {
			description: {
				story:
					"The flyout with Elbow picked, as the artboard shows it while an elbow connector is drawn. Pick ElbowDark for the dark theme.",
			},
		},
	},
})

export const ElbowDark = meta.story({
	globals: { theme: "dark" },
	args: Elbow.input.args,
})

export const ElbowInYellowSpace = meta.story({
	args: { routing: "elbow" },
	decorators: [
		(Story) => (
			<div {...hueScopeOf("yellow")}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The flyout inside a Space with the pale yellow hue. Check the picked label and glyph in the Space ink, never the pastel bubble fill, at AA contrast on their tint. Pick ElbowInYellowSpaceDark for the dark theme.",
			},
		},
	},
	play: playInYellowSpace,
})

export const ElbowInYellowSpaceDark = meta.story({
	globals: { theme: "dark" },
	args: ElbowInYellowSpace.input.args,
	decorators: ElbowInYellowSpace.input.decorators,
	play: playInYellowSpace,
})
