import { useTranslation } from "react-i18next"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectHeadingFont } from "@workspace/storybook/story-utils"
import {
	ConfirmDialog,
	type ConfirmDialogProps,
} from "@workspace/ui/components/confirm-dialog"
import { buttonVariants } from "@workspace/ui/components/ui/button"

const LeaveSpaceConfirmation = () => {
	const { t } = useTranslation("common")

	return (
		<ConfirmDialog
			confirmLabel={t("spaces.leave.action")}
			defaultOpen
			description={t("spaces.leave.description")}
			onConfirm={fn()}
			title={t("spaces.leave.title", { name: "Northwind" })}
		/>
	)
}

type SignOutConfirmationProps = Pick<
	ConfirmDialogProps,
	"onConfirm" | "onCancel"
>

const SignOutConfirmation = ({
	onConfirm,
	onCancel,
}: SignOutConfirmationProps) => {
	const { t } = useTranslation("bots")

	return (
		<ConfirmDialog
			confirmLabel={t("spaces.signOut.confirm")}
			defaultOpen
			description={t("spaces.signOut.description", {
				host: "Lea",
				name: "Studio Nord",
			})}
			onCancel={onCancel}
			onConfirm={onConfirm}
			title={t("spaces.signOut.title")}
		/>
	)
}

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "Overlays/ConfirmDialog",
	component: ConfirmDialog,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The question that stands between a reader and something they cannot undo. Reach for it wherever a press deletes: it dims the page and traps focus, so it reads as a question rather than as a notification, and it puts Cancel first so the safe way out is the one the hand reaches. The title names the thing, never the action alone, so a reader who opened the wrong row finds out here rather than after, and the description repeats the consequence in full instead of shortening it to `Are you sure?`. It owns its own open state and reports nothing until the reader answers: `onConfirm` fires once on the second press, and `onCancel` once when they back out through Cancel, Escape or the backdrop, never after a confirm.",
			},
		},
	},
	args: {
		trigger: "Delete skill",
		triggerClassName: buttonVariants({ variant: "destructive", size: "sm" }),
		title: "Delete Release notes?",
		description:
			"The agent can no longer use this skill. This can’t be undone.",
		confirmLabel: "Delete skill",
		onConfirm: fn(),
		onCancel: fn(),
	},
	argTypes: {
		defaultOpen: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state: the trigger alone, nothing asked yet. Check that the trigger wears whatever `triggerClassName` says and nothing else — the dialog draws the question, the caller draws the button that opens it. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Delete skill" }),
		).toBeVisible()
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})

export const Confirming = meta.story({
	args: { defaultOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"The question, mounted already up — reach for this to review the wording without a press. Check that the title names the thing being deleted, that Cancel sits before the destructive button, and that Escape closes it without reporting anything. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await expect(popup).toHaveTextContent("Delete Release notes?")
		await expectHeadingFont(within(popup).getByRole("heading", { level: 2 }))

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})

export const Cancelled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The path most readers take: they open the question and back out of it. Check that the trigger is still reachable afterwards, since a cancelled question must not leave the surface inert, and that only `onCancel` was reported. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete skill" }))

		const popup = await confirmation()
		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
		await expect(args.onCancel).toHaveBeenCalledOnce()
		await expect(
			canvas.getByRole("button", { name: "Delete skill" }),
		).toBeVisible()
	},
})

export const Confirmed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. The second press closes the question and fires `onConfirm` exactly once — the dialog deletes nothing itself, it only says the reader agreed, which leaves the surface free to close, undo, or fail loudly. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete skill" }))

		const popup = await confirmation()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete skill" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).toHaveBeenCalledTimes(1)
		await expect(args.onCancel).not.toHaveBeenCalled()
	},
})

export const Rejected = meta.story({
	args: {
		defaultOpen: true,
		failureLabel: "Couldn’t remove this secret. Retry.",
		onConfirm: fn(() => Promise.reject(new Error("removal refused"))),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The confirmed press that fails on the other side. Reach for this whenever `onConfirm` reaches a disk or a host that can say no: the question is held up on what it named instead of closing on a press that changed nothing, the destructive action is disabled while the callback is in flight so a slow write cannot be fired twice, and `failureLabel` is announced inside the question. Without a `failureLabel` the dialog still holds, silently — pass one wherever the callback can reject. The only call sites that pass a failure label are `packages/ui/src/components/routine-row.tsx:82` and `packages/ui/src/components/environment-panel.tsx:247`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete skill" }),
		)

		await expect(
			await within(popup).findByText("Couldn’t remove this secret. Retry."),
		).toBeVisible()
		await expect(popup).toBeVisible()
		await expect(args.onConfirm).toHaveBeenCalledTimes(1)
	},
})

export const LeaveSpace = meta.story({
	render: () => <LeaveSpaceConfirmation />,
	parameters: {
		docs: {
			description: {
				story:
					"The question before a person leaves a joined space, from the switcher. The title names the space, the description says the host keeps everything and a new invitation brings it back, so leaving reads as reversible. Check that Cancel comes first and Leave space wears the destructive colour.",
			},
		},
	},
	play: async () => {
		const popup = await confirmation()

		await expect(
			within(popup).getByRole("heading", { name: "Leave Northwind?" }),
		).toBeVisible()
		await expect(popup).toHaveTextContent(
			"Nothing is deleted on the host. You can join again with a new invitation.",
		)
		await expect(
			within(popup).getByRole("button", { name: "Leave space" }),
		).toBeEnabled()
	},
})

const SIGN_OUT_ARTBOARD =
	"Measured against the Paper page `Join an invited Space`, dark only."

const expectSignOutQuestion = async (popup: HTMLElement) => {
	await expect(
		within(popup).getByRole("heading", { name: "Sign out of Kiroshi?" }),
	).toBeVisible()
	await expect(popup).toHaveTextContent(
		"Studio Nord leaves this computer until you sign in again. Its conversations stay with Lea.",
	)
	const [cancel, signOut] = within(popup).getAllByRole("button")
	await expect(cancel).toHaveAccessibleName("Cancel")
	await expect(signOut).toHaveAccessibleName("Sign out")
	await expect(getComputedStyle(signOut).color).not.toBe(
		getComputedStyle(cancel).color,
	)
	await expect(
		signOut.getBoundingClientRect().left - cancel.getBoundingClientRect().right,
	).toBe(8)
	return { cancel, signOut }
}

export const M12SignOut = meta.story({
	name: "M12 Sign out",
	globals: { theme: "dark" },
	render: (args) => <SignOutConfirmation {...args} />,
	parameters: {
		docs: {
			description: {
				story: `${SIGN_OUT_ARTBOARD} M12: the question before signing out of Kiroshi takes a joined Space off this computer. Check Cancel comes first in outline and Sign out wears the destructive colour 8px after it, right-aligned, that the description names the Space and who keeps its conversations, and that Sign out reports \`onConfirm\` alone.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()
		const { signOut } = await expectSignOutQuestion(popup)

		await userEvent.click(signOut)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).toHaveBeenCalledOnce()
		await expect(args.onCancel).not.toHaveBeenCalled()
	},
})

export const M12SignOutCancelled = meta.story({
	name: "M12 Sign out, cancelled",
	tags: ["test-only"],
	globals: { theme: "dark" },
	render: (args) => <SignOutConfirmation {...args} />,
	parameters: {
		docs: {
			description: {
				story: `${SIGN_OUT_ARTBOARD} M12 answered with Cancel: the dialog closes and reports \`onCancel\` alone.`,
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()
		const { cancel } = await expectSignOutQuestion(popup)

		await userEvent.click(cancel)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onCancel).toHaveBeenCalledOnce()
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})
