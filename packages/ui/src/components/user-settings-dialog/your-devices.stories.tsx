import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	contentBottomOf,
	probedStyleOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ACCOUNT_EMAIL,
	LISTED_PHONE,
	OTHER_DEVICES,
	THIS_MACBOOK_PRO,
} from "@workspace/ui/components/device-card.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import {
	YourDevices,
	type YourDevicesProps,
} from "@workspace/ui/components/user-settings-dialog/your-devices"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only, in the content column of Settings › Account."

const CONFIRM_TITLE = "Remove Noa’s iPhone 17?"

const DevicesInSettings = (devices: YourDevicesProps) => (
	<UserSettingsDialog
		account={{
			account: {
				status: "signedIn",
				name: "Noa Laurent",
				email: ACCOUNT_EMAIL,
				plan: null,
			},
			devices,
			onSignIn: fn(),
			onCancel: fn(),
			onCopySignInLink: fn(),
			onManageAccount: fn(),
			onSignOut: fn(),
		}}
		history={{
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			onUndo: fn(),
		}}
		language={null}
		onClose={fn()}
		onLanguageChange={fn()}
		onSkillChange={fn()}
		onSkillCreate={fn()}
		onSkillDelete={fn()}
		onSkillPreloadedChange={fn()}
		onValueChange={fn()}
		open
		skills={[]}
		tab="account"
		value={{ name: "Noa Laurent", colorScheme: "dark" }}
	/>
)

const devicesSection = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return within(dialog).findByRole("region", { name: "Your devices" })
}

const removeOf = (section: HTMLElement, device: string) => {
	const row = within(section)
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(device))
	if (!row) throw new window.Error(`No row names ${device}`)
	return within(row).getByRole("button", { name: "Remove" })
}

const confirmIn = (section: HTMLElement) =>
	slotIn(section, "device-removal-confirm")

const meta = preview.meta({
	title: "Settings/User/YourDevices",
	component: YourDevices,
	globals: { theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Every device signed in to the reader's account, under their account in Settings. This device comes first on its own card, then the other devices in one list, each with its activity line, its six words and a Remove. Remove swaps that row in place for a confirm on the destructive tint, so the reader reads the six words again before answering; the confirm is the component's own state, the removal it triggers is the host's, handed back through `removal` while it travels and when it fails. A removed device simply leaves the list. While the list is read, a skeleton the shape of the two groups fills the content column.",
			},
		},
	},
	args: {
		email: ACCOUNT_EMAIL,
		thisDevice: THIS_MACBOOK_PRO,
		otherDevices: OTHER_DEVICES,
		onRemove: fn(),
		onCancelRemoval: fn(),
	},
	render: (args) => <DevicesInSettings {...args} />,
})

export const Default = meta.story({
	name: "7.1 Your devices",
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.1: the reader's MacBook Pro and two other devices. Check the section heading and its description, the This device card with Active now, the Other devices list with one hairline between rows, and a Remove on each row named after the row's device. Pick \`Confirming\` for the confirm Remove opens, \`Empty\` for an account with no other device and \`Loading\` while the list is read.`,
			},
		},
	},
	play: async () => {
		const section = await devicesSection()

		await expect(
			within(section).getByText(
				"Every device here reads your spaces. Remove one you don’t use anymore.",
			),
		).toBeVisible()
		await expect(
			within(section).getByRole("heading", { name: "This device" }),
		).toBeVisible()
		await expect(
			within(section).getByRole("heading", { name: "Other devices" }),
		).toBeVisible()
		const thisDevice = slotIn(section, "device-card")
		await expect(thisDevice).toHaveTextContent(THIS_MACBOOK_PRO.name)
		await expect(thisDevice).toHaveTextContent("Active now")

		const rows = within(section).getAllByRole("listitem")
		await expect(rows).toHaveLength(2)
		await expect(rows[0]).toHaveTextContent("Active 2 hours ago")
		await expect(rows[1]).toHaveTextContent("Active yesterday")
		await expect(
			within(rows[1] as HTMLElement).getByRole("button", { name: "Remove" }),
		).toHaveAccessibleDescription("Noa’s iPhone 17")
	},
})

export const Confirming = meta.story({
	name: "7 Confirm removal",
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7: Remove pressed on the iPhone. Check the row is replaced in place, not added below, by the confirm on the destructive tint, that focus lands on Cancel, that Remove calls back with the device, and that Cancel puts the row back and returns focus to its Remove. Pick \`Removing\` for the removal in flight.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const section = await devicesSection()
		await userEvent.click(removeOf(section, LISTED_PHONE.name))

		const confirm = confirmIn(section)
		await expect(within(section).getAllByRole("listitem")).toHaveLength(2)
		await expect(within(section).getAllByRole("listitem")[1]).toBe(confirm)
		await expect(confirm).toHaveTextContent(CONFIRM_TITLE)
		await expect(confirm).toHaveTextContent(
			"It will be signed out and won’t read your spaces.",
		)
		await expect(getComputedStyle(confirm).backgroundColor).toBe(
			probedStyleOf("bg-destructive/10", "backgroundColor", confirm),
		)
		await expect(
			within(confirm).getByRole("button", { name: "Cancel" }),
		).toHaveFocus()

		await userEvent.click(
			within(confirm).getByRole("button", { name: "Remove" }),
		)
		await expect(args.onRemove).toHaveBeenCalledWith(LISTED_PHONE.id)

		await userEvent.click(
			within(confirm).getByRole("button", { name: "Cancel" }),
		)
		await expect(args.onCancelRemoval).toHaveBeenCalledOnce()
		await expect(
			section.querySelector("[data-slot=device-removal-confirm]"),
		).toBe(null)
		await expect(removeOf(section, LISTED_PHONE.name)).toHaveFocus()
	},
})

export const Removing = meta.story({
	name: "7.2 Removing",
	args: { removal: { deviceId: LISTED_PHONE.id, status: "removing" } },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.2: the removal is on its way. Check both buttons read disabled yet stay focusable, Remove reads Removing… and neither calls back. Pick \`Error\` for the removal that failed.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const confirm = confirmIn(await devicesSection())
		const removing = within(confirm).getByRole("button", { name: "Removing…" })
		const cancel = within(confirm).getByRole("button", { name: "Cancel" })

		await expect(removing).toHaveAttribute("aria-disabled", "true")
		await expect(cancel).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(removing).opacity).toBe("0.7")
		await expect(getComputedStyle(cancel).opacity).toBe("0.5")

		removing.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onRemove).not.toHaveBeenCalled()
	},
})

export const Error = meta.story({
	name: "7.6 Couldn’t remove",
	args: { removal: { deviceId: LISTED_PHONE.id, status: "failed" } },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.6: the removal did not land. Check the confirm stays open, the error line is announced and sits above the buttons aligned under the text, and that both buttons are back to Remove and Cancel at full strength. Pick \`Removing\` for the removal in flight.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const confirm = confirmIn(await devicesSection())
		const alert = within(confirm).getByRole("alert")
		const remove = within(confirm).getByRole("button", { name: "Remove" })

		await expect(alert).toHaveTextContent(
			"Couldn’t remove Noa’s iPhone 17. Check your connection and try again.",
		)
		await expect(
			alert.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(remove).not.toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(remove).opacity).toBe("1")

		await userEvent.click(remove)
		await expect(args.onRemove).toHaveBeenCalledWith(LISTED_PHONE.id)
	},
})

export const Empty = meta.story({
	name: "7.4 Only this device",
	args: { otherDevices: [] },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.4: no device but this one. Check Other devices holds the dashed box naming the reader's email and how to add a device, and no list. Pick \`Default\` for an account with other devices.`,
			},
		},
	},
	play: async () => {
		const section = await devicesSection()
		const empty = within(section).getByText(
			"No other device reads your spaces. To add one, sign in on it with noa@example.com, then approve it here.",
		)

		await expect(getComputedStyle(empty).borderTopStyle).toBe("dashed")
		await expect(within(section).queryByRole("list")).toBe(null)
	},
})

export const Loading = meta.story({
	name: "7.5 Loading",
	args: { isPending: true },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 7.5: the devices are being read. Check the section reads busy, draws no group label, and that its skeleton, this device's bar card then a framed list of three rows, reaches the bottom of the content column. Pick \`Default\` for the read list.`,
			},
		},
	},
	play: async () => {
		const section = await devicesSection()
		const skeleton = await waitFor(() =>
			slotIn(section, "your-devices-skeleton"),
		)
		const panel = within(await screen.findByRole("dialog")).getByRole(
			"tabpanel",
			{ name: "Account" },
		)

		await expect(section).toHaveAttribute("aria-busy", "true")
		await expect(skeleton).toHaveAttribute("aria-hidden", "true")
		await expect(
			within(section).queryByRole("heading", { name: "This device" }),
		).toBe(null)
		await expect(slotsIn(skeleton, "skeleton")).toHaveLength(15)
		await expect(
			getComputedStyle(skeleton.lastElementChild as Element).flexGrow,
		).toBe("1")
		await waitFor(() =>
			expect(skeleton.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
				contentBottomOf(panel) - 9,
			),
		)
	},
})
