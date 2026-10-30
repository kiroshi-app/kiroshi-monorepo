import type { ComponentType, ReactNode } from "react"
import { expect, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/ui/dialog"

type DialogContentArgs = {
	children?: ReactNode
	className?: string
	showCloseButton?: boolean
}

const TypedDialogContent = DialogContent as ComponentType<DialogContentArgs>

const LONG_DESCRIPTION =
	"A working directory, a model and a set of instructions are what an agent is made of, and every one of them is editable from this dialog, which is why the description alone runs past a single line on a narrow window."

const DialogDemo = ({ description }: { description: string }) => (
	<Dialog>
		<DialogTrigger render={<Button variant="outline" />}>
			Agent settings
		</DialogTrigger>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Agent settings</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<DialogClose render={<Button size="sm" variant="outline" />}>
					Cancel
				</DialogClose>
				<DialogClose render={<Button size="sm" />}>Save</DialogClose>
			</DialogFooter>
		</DialogContent>
	</Dialog>
)

const meta = preview.meta({
	title: "Overlays/Dialog",
	component: TypedDialogContent,
	render: () => (
		<DialogDemo description="Name the agent and point it at a folder." />
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The centred popup as the shadcn registry ships it: `DialogContent` is the whole overlay - portal, overlay and surface - and it names itself from the `DialogTitle` inside. Its close affordance carries the registry's hardcoded English, so reach for `DialogSurface` instead whenever the copy has to come from the catalogue.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state and the open one. Check the trigger takes focus with a visible ring and opens on Enter, that the surface lands centred over an overlay that dims what is behind it without blurring it, and that Escape closes it and puts focus back on the trigger. The app reaches the registry dialog through `DialogSurface` at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Agent settings" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		const dialog = await screen.findByRole("dialog")
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(dialog).toHaveAccessibleName("Agent settings")

		const overlay = slotIn(document.body, "dialog-overlay")
		await expect(getComputedStyle(overlay).backdropFilter).toBe("none")

		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
		await waitFor(() => expect(trigger).toHaveFocus())
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Keyboard focus and a disabled action inside an open dialog. Check that Tab cycles inside the surface instead of escaping to the page behind it, and that the disabled control is skipped by the cycle rather than taking a focus it cannot act on.",
			},
		},
	},
	render: () => (
		<Dialog defaultOpen>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete agent</DialogTitle>
					<DialogDescription>
						This removes the agent and every conversation it holds.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose render={<Button size="sm" variant="outline" />}>
						Cancel
					</DialogClose>
					<Button disabled size="sm" variant="destructive">
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
	play: async ({ userEvent }) => {
		const dialog = await screen.findByRole("dialog")
		const remove = within(dialog).getByRole("button", { name: "Delete" })

		await expect(remove).toBeDisabled()

		for (let press = 0; press < 4; press++) {
			await userEvent.tab()
			await waitFor(async () => {
				await expect(dialog.contains(document.activeElement)).toBe(true)
			})
			await expect(document.activeElement).not.toBe(remove)
		}
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	render: () => <DialogDemo description={LONG_DESCRIPTION} />,
	parameters: {
		docs: {
			description: {
				story:
					"A description long enough to wrap, the shape a translated string takes. Check the surface stops short of the window edges instead of running under them, and that the text wraps rather than widening the dialog past its cap.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Agent settings" }),
		)

		const dialog = await screen.findByRole("dialog")
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(dialog.offsetWidth).toBeLessThanOrEqual(window.innerWidth - 32)
	},
})
