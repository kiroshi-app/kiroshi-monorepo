import type { VariantProps } from "class-variance-authority"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively, Row } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { Button, type buttonVariants } from "@workspace/ui/components/ui/button"

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

const BUTTON_VARIANTS = listExhaustively<ButtonVariant>({
	default: true,
	secondary: true,
	outline: true,
	ghost: true,
	destructive: true,
	link: true,
})

const BUTTON_SIZES = listExhaustively<ButtonSize>({
	xs: true,
	sm: true,
	default: true,
	lg: true,
	"icon-xs": true,
	"icon-sm": true,
	icon: true,
	"icon-lg": true,
})

const isIconSize = (size: ButtonSize) => size.startsWith("icon")

const meta = preview.meta({
	title: "Primitives/Button",
	component: Button,
	parameters: { layout: "centered" },
	args: {
		children: "Button",
		onClick: fn(),
	},
	argTypes: {
		variant: { control: "select", options: BUTTON_VARIANTS },
		size: { control: "select", options: BUTTON_SIZES },
		children: { control: "text" },
		disabled: { control: "boolean" },
	},
})

export const Playground = meta.story({
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name: "Button" })

		await userEvent.tab()
		await expect(button).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onClick).toHaveBeenCalled()
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	render: () => (
		<Row>
			{BUTTON_VARIANTS.map((variant) => (
				<Button key={variant} variant={variant}>
					{variant}
				</Button>
			))}
		</Row>
	),
})

export const Sizes = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="flex flex-col gap-4">
			<Row>
				{BUTTON_SIZES.filter((size) => !isIconSize(size)).map((size) => (
					<Button key={size} size={size}>
						{size}
					</Button>
				))}
			</Row>
			<Row>
				{BUTTON_SIZES.filter(isIconSize).map((size) => (
					<Button key={size} size={size} aria-label={size}>
						<Icons.Add />
					</Button>
				))}
			</Row>
		</div>
	),
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		pseudo: {
			hover: "#button-hover",
			focusVisible: "#button-focus",
			active: "#button-active",
		},
	},
	render: () => (
		<Row>
			<Button>Default</Button>
			<Button id="button-hover">Hover</Button>
			<Button id="button-focus">Focus</Button>
			<Button id="button-active">Active</Button>
			<Button disabled>Disabled</Button>
		</Row>
	),
})

export const WithIcons = meta.story({
	render: () => (
		<Row>
			<Button>
				<Icons.Add data-icon="inline-start" />
				Create
			</Button>
			<Button variant="outline">
				Continue
				<Icons.Next data-icon="inline-end" />
			</Button>
			<Button variant="destructive">
				<Icons.Delete data-icon="inline-start" />
				Delete
			</Button>
			<Button variant="ghost" size="icon" aria-label="Settings">
				<Icons.Settings />
			</Button>
		</Row>
	),
})

const resolveStyle = (
	host: HTMLElement,
	property: "borderTopLeftRadius" | "fontSize",
	value: string,
) => {
	const probe = document.createElement("span")
	probe.style[property] = value
	host.append(probe)
	const resolved = getComputedStyle(probe)[property]
	probe.remove()
	return resolved
}

export const ClassNameOverridesProjectTokens = meta.story({
	tags: ["test-only"],
	args: { className: "rounded-control text-compact" },
	play: async ({ canvas, canvasElement }) => {
		const button = canvas.getByRole("button", { name: "Button" })
		const style = getComputedStyle(button)
		const controlRadius = resolveStyle(
			canvasElement,
			"borderTopLeftRadius",
			"var(--radius-control)",
		)
		const compactSize = resolveStyle(
			canvasElement,
			"fontSize",
			"var(--text-compact)",
		)

		await expect(controlRadius).not.toBe(
			resolveStyle(canvasElement, "borderTopLeftRadius", "var(--radius-2xl)"),
		)
		await expect(compactSize).not.toBe(
			resolveStyle(canvasElement, "fontSize", "var(--text-sm)"),
		)
		await expect(style.borderTopLeftRadius).toBe(controlRadius)
		await expect(style.fontSize).toBe(compactSize)
		await expect(button).not.toHaveClass("rounded-2xl")
		await expect(button).not.toHaveClass("text-sm")
	},
})
