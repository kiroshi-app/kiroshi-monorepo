import { useState } from "react"
import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import {
	LibraryCommentBarControls,
	type LibraryCommentBarControlsProps,
} from "@workspace/ui/components/library-comment-bar-controls"
import {
	COMMENT_COUNTS,
	OPEN_THREADS,
	RESOLVED_THREADS,
} from "@workspace/ui/components/library-comments.fixtures"
import {
	LibraryCommentsList,
	type LibraryCommentsTab,
} from "@workspace/ui/components/library-comments-list"

const THREADS = { open: OPEN_THREADS, resolved: RESOLVED_THREADS }

type ControlsOnBarProps = Omit<LibraryCommentBarControlsProps, "list"> & {
	onOpenThread: (id: string) => void
}

const ControlsOnBar = ({
	isCommentMode: isInitiallyOn,
	onCommentModeChange,
	onOpenThread,
	...props
}: ControlsOnBarProps) => {
	const [isCommentMode, setCommentMode] = useState(isInitiallyOn)
	const [tab, setTab] = useState<LibraryCommentsTab>("resolved")

	return (
		<div
			className={
				props.isOnDarkStage
					? "dark flex w-140 justify-end bg-[#080809] p-3 pb-96 text-foreground"
					: "flex w-140 justify-end bg-card p-3 pb-96 text-foreground"
			}
			data-slot="bar"
			{...hueScopeOf("blue")}
		>
			<LibraryCommentBarControls
				{...props}
				isCommentMode={isCommentMode}
				list={
					<LibraryCommentsList
						counts={props.counts}
						onOpenThread={onOpenThread}
						onTabChange={setTab}
						tab={tab}
						threads={THREADS[tab]}
					/>
				}
				onCommentModeChange={(next) => {
					setCommentMode(next)
					onCommentModeChange(next)
				}}
			/>
		</div>
	)
}

const toggleIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole("button", { name: "Comment" })

const meta = preview.meta({
	title: "Navigation/LibraryCommentBarControls",
	component: LibraryCommentBarControls,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The two comment controls of a Library bar, first among its actions: the counter of open threads, which opens the comments list in a popover hung from the end of the pair, and the Comment button with its C keycap, pressed while comment mode is on. The counter is drawn as long as the item has a thread, open or resolved, so resolved threads stay reachable at 0 open, and leaves the bar when there is none. `isOnDarkStage` keeps the popover dark on the image viewer.",
			},
		},
	},
	args: {
		counts: COMMENT_COUNTS,
		isCommentMode: false,
		onCommentModeChange: fn(),
		list: null,
	},
	render: (args) => <ControlsOnBar {...args} onOpenThread={fn()} />,
})

export const AtRest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The pair at rest, as artboard Doc 1 draws it. Check the counter reads 3 and is named 3 open comments, the Comment button is not pressed and shows its C keycap without reading it in its name, both change colour instantly, and a press turns comment mode on.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const counter = within(canvasElement).getByRole("button", {
			name: "3 open comments",
		})
		await expect(counter).toHaveTextContent("3")
		await expect(getComputedStyle(counter).transitionProperty).toBe("none")

		const toggle = toggleIn(canvasElement)
		await expect(toggle).toHaveAttribute("aria-pressed", "false")
		await expect(toggle).toHaveAttribute("aria-keyshortcuts", "C")
		await expect(toggle.querySelector("kbd")).toHaveTextContent("C")
		await expect(getComputedStyle(toggle).transitionProperty).toBe("none")

		await userEvent.click(toggle)
		await expect(args.onCommentModeChange).toHaveBeenCalledWith(true)
		await expect(toggle).toHaveAttribute("aria-pressed", "true")
	},
})

export const AtRestDark = meta.story({
	globals: { theme: "dark" },
	play: AtRest.input.play,
})

export const CommentModeOn = meta.story({
	args: { isCommentMode: true },
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on, as artboard Doc 2 draws it. Check the button is pressed, its label, icon and keycap wear the Space colour on the soft Space ground, and a press turns the mode off.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const toggle = toggleIn(canvasElement)
		const keycap = toggle.querySelector("kbd") as HTMLElement
		await expect(toggle).toHaveAttribute("aria-pressed", "true")
		await expect(getComputedStyle(keycap).color).toBe(
			getComputedStyle(toggle).color,
		)
		await expect(getComputedStyle(toggle).color).not.toBe(
			getComputedStyle(slotIn(canvasElement, "bar")).color,
		)

		await userEvent.click(toggle)
		await expect(args.onCommentModeChange).toHaveBeenCalledWith(false)
	},
})

export const CommentModeOnDark = meta.story({
	args: CommentModeOn.input.args,
	globals: { theme: "dark" },
	play: CommentModeOn.input.play,
})

export const ListOpen = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The counter pressed, as artboard Resolved 1 draws it. Check the comments list opens under the bar with its end on the end of the Comment button, the counter says it is expanded, the tabs switch, and Escape closes the list.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const counter = within(canvasElement).getByRole("button", {
			name: "3 open comments",
		})
		await userEvent.click(counter)
		await expect(counter).toHaveAttribute("aria-expanded", "true")

		const tabs = await screen.findByRole("tablist", { name: "Comments" })
		const list = tabs.closest('[data-slot="library-comments-list"]')
		await expect(list).not.toBe(null)
		await expect(
			Math.round((list as HTMLElement).getBoundingClientRect().right),
		).toBe(Math.round(toggleIn(canvasElement).getBoundingClientRect().right))

		await userEvent.click(screen.getByRole("tab", { name: "Open 3" }))
		await expect(screen.getByRole("tab", { name: "Open 3" })).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.keyboard("{Escape}")
		await expect(counter).toHaveAttribute("aria-expanded", "false")
	},
})

export const ListOpenDark = meta.story({
	globals: { theme: "dark" },
	play: ListOpen.input.play,
})

export const NoOpenThread = meta.story({
	args: { counts: { open: 0, resolved: 4 } },
	parameters: {
		docs: {
			description: {
				story:
					"Every thread is resolved. Check the counter stays, reads 0, is named 0 open comments so its number is not read as the size of the list, and still opens the list, so the resolved threads remain reachable.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const counter = within(canvasElement).getByRole("button", {
			name: "0 open comments",
		})
		await expect(counter).toHaveAccessibleName("0 open comments")
		await expect(counter).toHaveTextContent("0")
		await userEvent.click(counter)
		await expect(
			await screen.findByRole("tab", { name: "Resolved 4" }),
		).toBeVisible()
		await userEvent.keyboard("{Escape}")
	},
})

export const NoThread = meta.story({
	args: { counts: { open: 0, resolved: 0 } },
	parameters: {
		docs: {
			description: {
				story:
					"An item nobody commented on. Check the counter is not drawn and the Comment button is the only control.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getAllByRole("button")).toHaveLength(1)
		await expect(toggleIn(canvasElement)).toBeVisible()
	},
})

export const OnImageStage = meta.story({
	args: { isOnDarkStage: true, isCommentMode: true },
	parameters: {
		docs: {
			description: {
				story:
					"The pair on the image viewer's bar, dark in both themes, with comment mode on, as artboard Img 2 draws it. Check the list opens dark too.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await expect(toggleIn(canvasElement)).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "3 open comments" }),
		)
		const tabs = await screen.findByRole("tablist", { name: "Comments" })
		await expect(tabs.closest(".dark")).not.toBe(null)
		await userEvent.keyboard("{Escape}")
	},
})
