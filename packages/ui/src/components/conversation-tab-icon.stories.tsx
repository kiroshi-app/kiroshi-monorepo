import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationTabIcon } from "@workspace/ui/components/conversation-tab-icon"

const meta = preview.meta({
	title: "Navigation/ConversationTabIcon",
	component: ConversationTabIcon,
	parameters: {
		docs: {
			description: {
				component:
					"The icon a conversation draws in its title bar tab. With a colour it is the filled glyph of the conversation in the avatar ink of that hue, 15px, with no tile. Without one it is the bare filled glyph, sized and coloured by the tab that holds it. `Navigation/TitleBarTabs` shows both inside tabs.",
			},
		},
	},
	args: { icon: "Rocket" },
})

export const Coloured = meta.story({
	args: { hue: BLOT_HUES.pink },
	play: async ({ canvasElement }) => {
		const icon = slotIn(canvasElement, "conversation-subject-icon")
		const glyph = icon.querySelector("svg") as SVGElement
		const box = glyph.getBoundingClientRect()
		await expect(icon.dataset.hue).toBe(String(BLOT_HUES.pink))
		await expect(icon.children).toHaveLength(1)
		await expect([box.width, box.height]).toEqual([15, 15])
		await expect(getComputedStyle(glyph).color).toBe(
			getComputedStyle(icon).color,
		)
		await expect(
			canvasElement.querySelector('[data-slot="outlined-hexagon"]'),
		).toBeNull()
	},
})

export const Monochrome = meta.story({
	args: { hue: null },
	play: async ({ canvasElement }) => {
		const glyph = canvasElement.querySelector("svg") as SVGElement
		await expect(
			canvasElement.querySelector('[data-slot="conversation-subject-icon"]'),
		).toBeNull()
		await expect(getComputedStyle(glyph).color).toBe(
			getComputedStyle(glyph.parentElement as Element).color,
		)
	},
})
