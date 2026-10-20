import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectHeadingFont,
	glyphIn,
	slotIn,
} from "@workspace/storybook/story-utils"
import { DeviceApprovalDialog } from "@workspace/ui/components/device-approval-dialog"
import { ASKING_PHONE } from "@workspace/ui/components/device-card.fixtures"
import { Icons } from "@workspace/ui/components/icons"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only."

const TITLE = "Noa’s iPhone 17 wants to use your account"

const DIALOG_WIDTH = 440

const approvalDialog = async () => {
	const dialog = await screen.findByRole("alertdialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const meta = preview.meta({
	title: "Overlays/DeviceApprovalDialog",
	component: DeviceApprovalDialog,
	globals: { theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The question another device puts to this one when it signs in to the same account: who asks, named by its kind, its name and its activity line, and two answers. Approve lets it read the reader's spaces; Not me signs it out. Fully controlled: the host opens it, hands in the asking device and the status of the answer, and closes it once the answer landed, so nothing here dismisses it on its own. While the answer travels both actions hold still and keep their focus; when it fails the reason shows above them and the primary offers to try again.",
			},
		},
	},
	args: {
		open: true,
		device: ASKING_PHONE,
		onApprove: fn(),
		onReject: fn(),
	},
})

export const Default = meta.story({
	name: "6 Asking",
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 6: another device just asked. Check the title names it, the card shows its phone mark, its name and its activity line with no fingerprint, and that Approve and Not me each call back. Pick \`Approving\` for the answer in flight and \`Error\` for the answer that failed.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await approvalDialog()
		await expect(dialog).toHaveAccessibleName(TITLE)
		await expect(dialog.getBoundingClientRect().width).toBe(DIALOG_WIDTH)
		await expectHeadingFont(within(dialog).getByRole("heading"))
		const card = slotIn(dialog, "device-card")
		await expect(card).toHaveTextContent(ASKING_PHONE.name)
		await expect(card).toHaveTextContent("Asked just now")
		await expect(glyphIn(card, Icons.Smartphone)).not.toBe(null)
		await expect(dialog).not.toHaveTextContent(ASKING_PHONE.fingerprint)
		await expect(within(dialog).queryByRole("alert")).toBe(null)

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Approve" }),
		)
		await expect(args.onApprove).toHaveBeenCalledOnce()
		await userEvent.click(
			within(dialog).getByRole("button", { name: "Not me" }),
		)
		await expect(args.onReject).toHaveBeenCalledOnce()
	},
})

export const Approving = meta.story({
	name: "6.1 Approving",
	args: { status: "approving" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 6.1: the approval is on its way. Check both actions read disabled yet stay focusable, the primary reads Approving…, and pressing either calls nothing back. Pick \`Default\` for the question at rest.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await approvalDialog()
		const primary = within(dialog).getByRole("button", { name: "Approving…" })
		const notMe = within(dialog).getByRole("button", { name: "Not me" })

		await expect(dialog).not.toHaveTextContent(ASKING_PHONE.fingerprint)
		await expect(primary).toHaveAttribute("aria-disabled", "true")
		await expect(notMe).toHaveAttribute("aria-disabled", "true")
		await expect(primary).not.toHaveAttribute("disabled")
		await expect(getComputedStyle(primary).opacity).toBe("0.7")
		await expect(getComputedStyle(notMe).opacity).toBe("0.5")

		primary.focus()
		await expect(primary).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onApprove).not.toHaveBeenCalled()
		await expect(args.onReject).not.toHaveBeenCalled()
	},
})

export const Error = meta.story({
	name: "6.6 Couldn’t approve",
	args: { status: "failed" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 6.6: the approval did not land. Check the error line sits between the card and the actions on the destructive role with its alert mark, is announced, and that the primary now reads Try again and calls back. Pick \`Approving\` for the answer in flight.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await approvalDialog()
		const alert = within(dialog).getByRole("alert")

		await expect(dialog).not.toHaveTextContent(ASKING_PHONE.fingerprint)
		await expect(alert).toHaveTextContent(
			"Couldn’t approve Noa’s iPhone 17. Check your connection and try again.",
		)
		await expect(
			alert.compareDocumentPosition(slotIn(dialog, "device-card")) &
				Node.DOCUMENT_POSITION_PRECEDING,
		).toBeTruthy()

		const retry = within(dialog).getByRole("button", { name: "Try again" })
		await expect(retry).not.toHaveAttribute("aria-disabled", "true")
		await userEvent.click(retry)
		await expect(args.onApprove).toHaveBeenCalledOnce()
	},
})
