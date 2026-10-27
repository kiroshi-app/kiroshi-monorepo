import type { VariantProps } from "class-variance-authority"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively, Row } from "@workspace/storybook/story-utils"
import { Badge, type badgeVariants } from "@workspace/ui/components/ui/badge"

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

const BADGE_VARIANTS = listExhaustively<BadgeVariant>({
	default: true,
	secondary: true,
	destructive: true,
	outline: true,
	ghost: true,
	link: true,
})

const LONG_LABEL = "Waiting on the release manager"

const meta = preview.meta({
	title: "Primitives/Badge",
	component: Badge,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The one badge in the system, as the shadcn registry ships it: a 20px pill with a variant API and nothing else. It draws a label and takes no state of its own. The bot marks built on it live in `BotBadge`.",
			},
		},
	},
	args: { children: "Badge" },
	argTypes: {
		variant: { control: "select", options: BADGE_VARIANTS },
		children: { control: "text" },
	},
})

export const Default = meta.story({})

export const Variants = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<Row>
			{BADGE_VARIANTS.map((variant) => (
				<Badge {...args} key={variant} variant={variant}>
					{variant}
				</Badge>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every variant the registry badge carries. Check each pill keeps the same 20px height so a row of mixed variants sits on one baseline, and pick the variant by what the label means, never by the colour you want.",
			},
		},
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	args: { children: LONG_LABEL },
	parameters: {
		docs: {
			description: {
				story:
					"A sentence rather than a word, the shape a translated status turns into. Check the pill grows on one line instead of wrapping, and that a caller who cannot afford that width is the one to cap it — the badge never truncates on its own.",
			},
		},
	},
	play: async ({ canvas }) => {
		const badge = canvas.getByText(LONG_LABEL)

		await expect(badge.getBoundingClientRect().height).toBe(20)
		await expect(badge.scrollWidth).toBe(badge.clientWidth)
	},
})
