import { expect, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { HostPill } from "@workspace/ui/components/host-pill"

const MOCKUP = "Measured against the Paper page `Mockup`, A4 and A5."

const PRESENCE_OFFLINE = "rgb(115, 115, 115)"

const DARK_BACKGROUND = "rgb(0, 0, 0)"

const FOREGROUND = "rgb(245, 245, 245)"

const MUTED_FOREGROUND = "rgb(163, 163, 163)"

const meta = preview.meta({
	title: "Navigation/HostPill",
	component: HostPill,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The state pill a guest's title bar shows beside the space selector while the computer hosting the joined space is not answering yet, or not at all: `Connecting…` over a hollow dot, `Not connected` over the muted presence dot. A reachable host and a space shared from this computer draw no pill, the dot on the selector's square says it. The words are its only readable content; it is a plain label, not a control, and carries no tooltip. `HostDot` is the dot it shares with the selector's square and the menu rows.",
			},
		},
	},
	args: {
		host: "connecting" as const,
	},
})

const expectPillGeometry = async (pill: HTMLElement) => {
	const style = getComputedStyle(pill)
	await expect(pill.getBoundingClientRect().height).toBe(24)
	await expect(style.paddingInlineStart).toBe("8px")
	await expect(style.paddingInlineEnd).toBe("10px")
	await expect(style.columnGap).toBe("6px")
	await expect(style.fontSize).toBe("12px")
	await expect(style.lineHeight).toBe("16px")
	await expect(style.fontWeight).toBe("500")
	const dot = slotIn(pill, "host-dot")
	await expect(dot.getBoundingClientRect().width).toBe(7)
	await expect(dot).toHaveAttribute("aria-hidden", "true")
	return dot
}

export const Connecting = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${MOCKUP} A4: the guest's computer is still reaching the host. Check the 24px pill is fully rounded with 8px before the 7px hollow dot and 10px after the label, that the dot is a 1.5px inner muted presence ring over the title bar background, that it reads \`Connecting…\` in the foreground at 12px and weight 500, and that it is no button and opens no tooltip. Pick \`NotConnected\` for the host that does not answer.`,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const pill = canvas.getByText("Connecting…").parentElement as HTMLElement
		await expect(pill).toHaveTextContent(/^Connecting…$/)
		await expect(canvas.queryByRole("button")).toBeNull()
		await expect(pill).not.toHaveAttribute("tabindex")
		const dot = await expectPillGeometry(pill)
		const ring = getComputedStyle(dot)
		await expect(ring.boxShadow).toContain(
			`${PRESENCE_OFFLINE} 0px 0px 0px 1.5px inset`,
		)
		await expect(ring.backgroundColor).toBe(DARK_BACKGROUND)
		await expect(getComputedStyle(pill).color).toBe(FOREGROUND)
		await userEvent.hover(pill)
		await expect(screen.queryByRole("tooltip")).toBeNull()
	},
})

export const NotConnected = meta.story({
	globals: { theme: "dark" },
	args: { host: "down" },
	parameters: {
		docs: {
			description: {
				story: `${MOCKUP} A5: the host is down or refused the guest. Check the pill keeps the geometry of \`Connecting\`, that the dot is filled with the muted presence colour, and that the label reads \`Not connected\` in the muted foreground. Pick \`Connecting\` for the host still being reached.`,
			},
		},
	},
	play: async ({ canvas }) => {
		const pill = canvas.getByText("Not connected").parentElement as HTMLElement
		await expect(pill).toHaveTextContent(/^Not connected$/)
		const dot = await expectPillGeometry(pill)
		await expect(getComputedStyle(dot).backgroundColor).toBe(PRESENCE_OFFLINE)
		await expect(getComputedStyle(dot).boxShadow).toBe("none")
		await expect(getComputedStyle(pill).color).toBe(MUTED_FOREGROUND)
	},
})

export const ThemesSideBySide = meta.story({
	globals: { theme_layout: "side-by-side" },
	tags: ["test-only"],
	args: { host: "down" },
	parameters: {
		docs: {
			description: {
				story:
					"The not connected pill in light beside dark, the pair the contrast audit reads: the muted label sits on the opaque light pill fill so it keeps AA wherever the shell is tinted. Pick `NotConnected` for the measured dark state.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("Not connected")).toHaveLength(2)
	},
})
