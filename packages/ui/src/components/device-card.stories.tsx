import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { DeviceCard } from "@workspace/ui/components/device-card"
import {
	ASKING_PHONE,
	THIS_MACBOOK_PRO,
} from "@workspace/ui/components/device-card.fixtures"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only."

const DIALOG_CARD_WIDTH = 392

const NARROW_WIDTH = 320

const meta = preview.meta({
	title: "Primitives/DeviceCard",
	component: DeviceCard,
	globals: { theme: "dark" },
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One device as every device surface names it: its kind as a 20px mark, its name, an optional activity line and an optional trailing meta. The approval dialog, Your devices and the new-device screen draw the same card, and none of them shows the device's fingerprint. `isNameStrong` sets the name one weight up, for the dialog where the card is the subject of the question.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: DIALOG_CARD_WIDTH }}>
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	args: { ...ASKING_PHONE, isNameStrong: true },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 6: the asking device inside the approval dialog. Check the phone mark, the name one weight up, the activity line in the muted foreground, and no fingerprint. Pick \`WithMeta\` for the card that names this device.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const card = slotIn(canvasElement, "device-card")

		await expect(card).toHaveTextContent("Noa’s iPhone 17")
		await expect(card).toHaveTextContent("Asked just now")
		await expect(card).not.toHaveTextContent(ASKING_PHONE.fingerprint)
		await expect(getComputedStyle(card).borderTopLeftRadius).toBe("14px")
		await expect(card.getBoundingClientRect().width).toBe(DIALOG_CARD_WIDTH)
	},
})

export const WithMeta = meta.story({
	args: { ...THIS_MACBOOK_PRO, meta: "Active now" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.1: this device in Your devices, with no activity line and its trailing meta. Check the name is the only line beside the mark, with no fingerprint and no empty line under it, and the meta holds its width at the end of the row. Pick \`Default\` for a card with an activity line.`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const meta = canvas.getByText("Active now")
		const name = canvas.getByText(THIS_MACBOOK_PRO.name)

		await expect(getComputedStyle(meta).flexShrink).toBe("0")
		await expect(canvas.queryByText("Asked just now")).toBe(null)
		await expect(canvasElement).not.toHaveTextContent(
			THIS_MACBOOK_PRO.fingerprint,
		)
		await expect(name.parentElement?.childElementCount).toBe(1)
	},
})

export const LongContent = meta.story({
	args: {
		...THIS_MACBOOK_PRO,
		name: "Noa’sMacBookProFromTheResearchLabThatNobodyEverRenamedAfterTheMove",
		meta: "This device",
	},
	decorators: [
		(Story) => (
			<div style={{ width: NARROW_WIDTH }}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"A device name with no break opportunity in a 320px column. Check the name wraps inside the card instead of pushing the meta out of it, with no fingerprint under it. Pick `WithMeta` for the realistic name.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const card = slotIn(canvasElement, "device-card")

		await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
		await expect(card).not.toHaveTextContent(THIS_MACBOOK_PRO.fingerprint)
	},
})
