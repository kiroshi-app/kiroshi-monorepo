import type { ReactNode } from "react"
import { expect, screen, type userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import { buttonVariants } from "@workspace/ui/components/ui/button"
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/ui/dialog"

type DialogDemoProps = {
	className?: string
	body?: ReactNode
	title?: string
}

const LONG_TITLE =
	"Agent settings for the release manager that watches the packaging pipeline"

const ACTIONS = (
	<div className="flex justify-end gap-2">
		<DialogClose className={buttonVariants({ variant: "outline", size: "sm" })}>
			Cancel
		</DialogClose>
		<DialogClose className={buttonVariants({ size: "sm" })}>Save</DialogClose>
	</div>
)

const PARAGRAPHS = Array.from(
	{ length: 20 },
	(_, index) =>
		`Setting ${index + 1} — a working directory, a model and a set of instructions are what an agent is made of, and every one of them is editable here.`,
)

const LONG_BODY = (
	<>
		{PARAGRAPHS.map((paragraph) => (
			<p className="text-foreground text-sm" key={paragraph}>
				{paragraph}
			</p>
		))}
		{ACTIONS}
	</>
)

const DialogDemo = ({
	className,
	body = ACTIONS,
	title = "Agent settings",
}: DialogDemoProps) => (
	<Dialog>
		<DialogTrigger className={buttonVariants({ variant: "outline" })}>
			Agent settings
		</DialogTrigger>
		<DialogSurface className={className}>
			<DialogTitle>{title}</DialogTitle>
			<DialogDescription>
				Name the agent, point it at a folder and tell it how to behave.
			</DialogDescription>
			{body}
		</DialogSurface>
	</Dialog>
)

const backdropIn = () => {
	const dimmed = document.querySelector<HTMLElement>(
		"[data-slot=dialog-overlay]",
	)
	if (!dimmed) throw new Error("The dialog opened without a backdrop")

	return dimmed
}

const openDialog = async (
	canvas: ReturnType<typeof within>,
	user: ReturnType<typeof userEvent.setup>,
) => {
	await user.click(canvas.getByRole("button", { name: "Agent settings" }))

	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())

	return dialog
}

const meta = preview.meta({
	title: "Overlays/DialogSurface",
	component: DialogSurface,
	render: () => <DialogDemo />,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The registry `DialogContent` with the repo's own surface on it: a settings-sized column, a scroll region, and a close affordance named from the copy catalogue rather than the registry's hardcoded English. Reach for it over the bare `DialogContent` for anything a reader configures. `Dialog`, `DialogTrigger` and `DialogClose` come straight from the vendored file, so a trigger is styled like any other button and any control inside can close the dialog. The surface caps at the window minus 3rem in both directions and scrolls what does not fit, and a `className` overrides its width and padding without touching that cap.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state and the open one, from a trigger a screen supplies. Check that the trigger takes focus with a visible ring and opens on Enter, that the surface lands in the middle of the window over a dimmed backdrop, and that it announces itself as a dialog named after its title. Tab cycles inside the surface rather than escaping to the page behind it, and Escape closes it and puts focus back on the trigger — a reader who opened it with the keyboard never loses their place. Focus lands on the corner affordance first, so a dialog longer than the window still opens at its title rather than scrolled to its last control. Pick `Dismissing` for the backdrop and the corner affordance, `Overflowing` for content taller than the window. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Agent settings" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
		await expect(trigger.matches(":focus-visible")).toBe(true)

		await userEvent.keyboard("{Enter}")
		const dialog = await screen.findByRole("dialog")
		await waitFor(() => expect(backdropIn()).toBeVisible())
		await expect(dialog).toHaveAccessibleName("Agent settings")

		await waitFor(async () => {
			const box = dialog.getBoundingClientRect()
			await expect(
				Math.abs(box.left + box.width / 2 - window.innerWidth / 2),
			).toBeLessThanOrEqual(1)
			await expect(
				Math.abs(box.top + box.height / 2 - window.innerHeight / 2),
			).toBeLessThanOrEqual(1)
		})

		for (let press = 0; press < 5; press++) {
			await userEvent.tab()
			await waitFor(async () => {
				await expect(dialog.contains(document.activeElement)).toBe(true)
			})
		}

		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
		await waitFor(() => expect(trigger).toHaveFocus())
	},
})

export const Dismissing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The two pointer routes out of the dialog, which is what a reader reaches for when they opened it by mistake. Check that a press on the dimmed area closes it, that the corner affordance is a named button rather than a bare glyph, and that either route hands focus back to the trigger the same way Escape does. A press inside the surface changes nothing — only the area outside it dismisses. Pick `Default` for the keyboard route. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Agent settings" })

		const dialog = await openDialog(canvas, userEvent)
		await userEvent.click(dialog)
		await expect(screen.getByRole("dialog")).toBeVisible()

		await userEvent.click(backdropIn())
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
		await waitFor(() => expect(trigger).toHaveFocus())

		const reopened = await openDialog(canvas, userEvent)
		await userEvent.click(
			within(reopened).getByRole("button", { name: "Close" }),
		)
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
		await waitFor(() => expect(trigger).toHaveFocus())
	},
})

export const Overflowing = meta.story({
	render: () => <DialogDemo body={LONG_BODY} />,
	parameters: {
		docs: {
			description: {
				story:
					"A dialog holding more than the window can show, which is what a long settings form gives it. Check that the surface stops 1.5rem short of every window edge instead of running under them, that the overflow scrolls inside the surface rather than moving the page behind it, and that the last control is reachable by scrolling. The title scrolls with the content — the surface is one scrolling region, not a pinned header over a body. Pick `Default` for content that fits. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const dialog = await openDialog(canvas, userEvent)

		await expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight)
		await expect(dialog.offsetHeight).toBeLessThanOrEqual(
			window.innerHeight - 48,
		)
		await expect(dialog.offsetWidth).toBeLessThanOrEqual(window.innerWidth - 48)
		await expect(dialog.scrollTop).toBe(0)

		const save = screen.getByRole("button", { name: "Save" })
		await expect(save.offsetTop).toBeGreaterThan(dialog.clientHeight)

		dialog.scrollTop = dialog.scrollHeight
		await waitFor(async () =>
			expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				dialog.getBoundingClientRect().bottom,
			),
		)
	},
})

export const Sized = meta.story({
	render: () => <DialogDemo className="w-80 p-4" />,
	parameters: {
		docs: {
			description: {
				story:
					"A narrower, tighter surface, which is the one override a screen makes when a dialog holds a single question rather than a form. Check that the width and the padding given win over the defaults while the surface stays centred and still stops short of the window edges — the cap belongs to the primitive, not the caller. Everything else is unchanged: same backdrop, same corner affordance, same focus behaviour. Pick `Default` for the standard surface. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const dialog = await openDialog(canvas, userEvent)

		await expect(dialog.offsetWidth).toBe(320)
		await expect(getComputedStyle(dialog).paddingTop).toBe("16px")
	},
})

export const LongTitle = meta.story({
	render: () => <DialogDemo title={LONG_TITLE} />,
	parameters: {
		docs: {
			description: {
				story:
					"A title long enough to wrap onto a second line, which is what a translated heading does to a dialog sized for English. The surface reserves the corner affordance's column once, as a `padding-inline-end` on every title inside it, so no caller has to remember it and the gutter follows the reading direction rather than a hardcoded right edge. Check the title takes more than one line, and that its text column ends before the affordance begins rather than running under it. The app assembles it at `apps/app/src/App.tsx:991`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const dialog = await openDialog(canvas, userEvent)
		const title = within(dialog).getByText(LONG_TITLE)
		const close = within(dialog).getByRole("button", { name: "Close" })

		const { lineHeight, paddingInlineEnd } = getComputedStyle(title)
		const titleBox = title.getBoundingClientRect()
		const closeBox = close.getBoundingClientRect()

		await expect(titleBox.height).toBeGreaterThan(Number.parseFloat(lineHeight))
		await expect(
			titleBox.right - Number.parseFloat(paddingInlineEnd),
		).toBeLessThanOrEqual(closeBox.left)
	},
})
