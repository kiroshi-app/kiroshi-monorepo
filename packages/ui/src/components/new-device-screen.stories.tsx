import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	glyphIn,
	probedStyleOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ACCOUNT_EMAIL,
	NEW_MACBOOK_AIR,
} from "@workspace/ui/components/device-card.fixtures"
import { Icons } from "@workspace/ui/components/icons"
import { NewDeviceScreen } from "@workspace/ui/components/new-device-screen"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only, the desktop as the new device, full window with no sidebar."

const APPROVE_CODE = "Approve this computer"

const screenIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "new-device-screen")

const linksIn = (canvasElement: HTMLElement) =>
	within(screenIn(canvasElement))
		.getAllByRole("button")
		.filter(
			(button) => getComputedStyle(button).textDecorationLine === "underline",
		)
		.map((link) => link.textContent)

const meta = preview.meta({
	title: "Feedback/NewDeviceScreen",
	component: NewDeviceScreen,
	globals: { theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What this computer shows while it waits to join an account it just signed in to: an approval from a device the reader already uses, or a six-digit code sent to their email when they have no other device. One centred column, four steps the host chooses: `waiting`, `code`, `expired` and `rejected`. Every step but the code names this computer on the same device card the approving device shows, so the reader compares the six words across both screens. The code step keeps Approve this computer disabled, yet focusable, until all six digits are in.",
			},
		},
	},
	args: {
		email: ACCOUNT_EMAIL,
		device: NEW_MACBOOK_AIR,
		onUseCode: fn(),
		onApproveWithCode: fn(),
		onResendCode: fn(),
		onAskAgain: fn(),
		onSignOut: fn(),
		onBackToSignIn: fn(),
	},
	render: (args) => (
		<WorkspaceShell>
			<NewDeviceScreen {...args} />
		</WorkspaceShell>
	),
})

export const Waiting = meta.story({
	name: "10 Waiting",
	args: { step: "waiting" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 10: this computer waits for another device to approve it. Check the laptop tile, the title and the body naming the email, the card with This device, the spinner beside Waiting for approval… announced politely, and the two links calling back. Pick \`Code\` for the reader with no other device.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const screen = screenIn(canvasElement)

		await expect(
			canvas.getByRole("heading", {
				level: 1,
				name: "Approve this device from one you already use",
			}),
		).toBeVisible()
		await expect(screen).toHaveTextContent(
			"Open Kiroshi on a device that uses noa@example.com and approve this one.",
		)
		await expect(glyphIn(screen, Icons.Laptop)).not.toBe(null)
		await expect(slotIn(screen, "device-card")).toHaveTextContent("This device")
		await expect(
			slotIn(screen, "device-card").getBoundingClientRect().width,
		).toBe(440)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Waiting for approval…",
		)
		await expect(linksIn(canvasElement)).toEqual([
			"I don't have another device",
			"Sign out",
		])

		await userEvent.click(
			canvas.getByRole("button", { name: "I don't have another device" }),
		)
		await expect(args.onUseCode).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Sign out" }))
		await expect(args.onSignOut).toHaveBeenCalledOnce()
	},
})

export const Code = meta.story({
	name: "10.1 Code by email",
	args: { step: "code" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 10.1: a code went to the reader's email. Check the mail tile, six boxes with no card, the active box drawn on the ring colour, digits in tabular figures, Approve this computer disabled until the sixth digit and calling back with the code once enabled. Pick \`Waiting\` for the approval from another device.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const screen = screenIn(canvasElement)
		const code = canvas.getByRole("textbox", { name: "6-digit code" })
		const approve = canvas.getByRole("button", { name: APPROVE_CODE })
		const slots = slotsIn(screen, "input-otp-slot")

		await expect(glyphIn(screen, Icons.Mail)).not.toBe(null)
		await expect(screen.querySelector("[data-slot=device-card]")).toBe(null)
		await expect(slots).toHaveLength(6)
		await expect(slots[0]?.getBoundingClientRect().width).toBe(48)
		await expect(slots[0]?.getBoundingClientRect().height).toBe(56)
		await expect(approve).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(approve).opacity).toBe("0.5")

		await userEvent.click(code)
		await userEvent.keyboard("48213")
		await expect(slots[5]).toHaveAttribute("data-active", "true")
		await expect(getComputedStyle(slots[5] as HTMLElement).borderTopColor).toBe(
			probedStyleOf("border-ring", "borderTopColor", screen),
		)
		await expect(
			getComputedStyle(slots[0] as HTMLElement).fontVariantNumeric,
		).toBe("tabular-nums")
		await expect(approve).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(approve).pointerEvents).toBe("none")

		await userEvent.keyboard("7")
		await expect(approve).not.toHaveAttribute("aria-disabled", "true")
		await userEvent.click(approve)
		await expect(args.onApproveWithCode).toHaveBeenCalledWith("482137")
		await expect(linksIn(canvasElement)).toEqual([
			"Send a new code",
			"Sign out",
		])
	},
})

export const Expired = meta.story({
	name: "10.2 Request expired",
	args: { step: "expired" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 10.2: nobody approved in time. Check the card stays, Ask again is the primary and calls back, and the two links of the waiting step come back. Pick \`Waiting\` for the request still open.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("heading", { name: "The request expired" }),
		).toBeVisible()
		await expect(slotIn(screenIn(canvasElement), "device-card")).toBeVisible()
		await userEvent.click(canvas.getByRole("button", { name: "Ask again" }))
		await expect(args.onAskAgain).toHaveBeenCalledOnce()
		await expect(linksIn(canvasElement)).toEqual([
			"I don't have another device",
			"Sign out",
		])
	},
})

export const Rejected = meta.story({
	name: "10.3 Not me",
	args: { step: "rejected" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 10.3: the reader's other device said this one isn't theirs. Check the title, the body naming the email, the card, and Back to sign in as the single way out. Pick \`Expired\` for a request nobody answered.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("heading", { name: "This device wasn't approved" }),
		).toBeVisible()
		await expect(screenIn(canvasElement)).toHaveTextContent(
			"Someone using noa@example.com said it isn't theirs, so it was signed out.",
		)
		await expect(linksIn(canvasElement)).toEqual(["Back to sign in"])
		await userEvent.click(
			canvas.getByRole("button", { name: "Back to sign in" }),
		)
		await expect(args.onBackToSignIn).toHaveBeenCalledOnce()
	},
})
