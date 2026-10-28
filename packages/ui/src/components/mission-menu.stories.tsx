import type { CSSProperties } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SUBMENU_PORTAL_GUARD,
	FRAME_POLL,
	glyphIn,
	mergeA11y,
	shown,
	slotIn,
	slotsIn,
	withStoryProps,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { MissionCard } from "@workspace/ui/components/mission-card"
import {
	MissionMenu,
	type MissionMenuProps,
} from "@workspace/ui/components/mission-menu"
import { WAITING_MISSION_CARD } from "@workspace/ui/components/missions.fixtures"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"
import { Sidebar, SidebarProvider } from "@workspace/ui/components/ui/sidebar"

type MissionMenuStoryArgs = Omit<MissionMenuProps, "children">

const MENU_LABEL = "Mission actions"

const PANEL_WIDTH = {
	"--sidebar-width": `${ROUTINES_PANEL_WIDTH}px`,
} as CSSProperties

const OPEN_ENTRIES = ["Open mission", "Copy"]

const AGENT_RUNNING_ENTRIES = [
	...OPEN_ENTRIES,
	"Message the coding session",
	"Stop the coding session",
	"Close",
]

const CLOSED_ENTRIES = [...OPEN_ENTRIES, "Reopen"]

const ENTRIES_WITHOUT_A_PULL_REQUEST: Record<MissionState, string[]> = {
	working: AGENT_RUNNING_ENTRIES,
	waiting_bot: AGENT_RUNNING_ENTRIES,
	waiting_human: [...OPEN_ENTRIES, "Answer the question", "Close"],
	ready_to_merge: [...OPEN_ENTRIES, "Close"],
	failed: CLOSED_ENTRIES,
	done: CLOSED_ENTRIES,
	closed: CLOSED_ENTRIES,
}

const entriesFor = (state: MissionState, hasPullRequest: boolean) => {
	const [open, ...rest] = ENTRIES_WITHOUT_A_PULL_REQUEST[state]
	return hasPullRequest ? [open, "Open PR", ...rest] : [open, ...rest]
}

const cardIn = (state: MissionState, density: string) => ({
	...WAITING_MISSION_CARD,
	id: `mission-${state}-${density}`,
	state,
	isWorking: state === "working",
	isClosed: state === "done" || state === "failed" || state === "closed",
})

const Densities = (args: MissionMenuStoryArgs) => (
	<div className="flex w-[36rem] max-w-full flex-col gap-6">
		<SidebarProvider style={PANEL_WIDTH}>
			<Sidebar collapsible="none">
				<ul className="flex flex-col gap-0.5">
					<MissionMenu {...args}>
						<MissionCard
							{...cardIn(args.state, "row")}
							density="row"
							onOpen={fn()}
						/>
					</MissionMenu>
				</ul>
			</Sidebar>
		</SidebarProvider>
		<MissionMenu {...args}>
			<MissionCard
				{...cardIn(args.state, "card")}
				density="card"
				onOpen={fn()}
			/>
		</MissionMenu>
	</div>
)

const openMenu = async () =>
	within(await shown(await screen.findByRole("menu", { name: MENU_LABEL })))

const entriesIn = async () =>
	(await openMenu()).getAllByRole("menuitem").map((item) => item.textContent)

const dismissMenu = async () => {
	await waitFor(
		() =>
			expect(screen.getByRole("menu").contains(document.activeElement)).toBe(
				true,
			),
		FRAME_POLL,
	)
	fireEvent.keyDown(document.activeElement ?? document.body, {
		key: "Escape",
	})
	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull(), FRAME_POLL)
}

const rowIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "mission-card-row")

const cardSurfaceIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "message-bubble-content")

const expectNoMenuButtonIn = async (surface: HTMLElement) => {
	await expect(
		within(surface).queryByRole("button", { name: MENU_LABEL }),
	).toBeNull()
	await expect(slotsIn(surface, "mission-menu")).toHaveLength(0)
}

const openByRightClick = (surface: HTMLElement) =>
	fireEvent.contextMenu(surface, { clientX: 40, clientY: 20 })

type EntriesCheck = {
	canvasElement: HTMLElement
	expected: string[]
}

const expectEntriesInBothDensities = async ({
	canvasElement,
	expected,
}: EntriesCheck) => {
	for (const surface of [rowIn(canvasElement), cardSurfaceIn(canvasElement)]) {
		await expectNoMenuButtonIn(surface)
		openByRightClick(surface)
		const entries = await entriesIn()
		await expect(entries).toEqual(expected)
		await expect(entries).not.toContain("Open in Linear")
		await dismissMenu()
	}
}

const meta = preview.meta({
	title: "Overlays/MissionMenu",
	component: withStoryProps<MissionMenuStoryArgs>(MissionMenu),
	parameters: {
		layout: "centered",
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				component:
					"Everything a person can do to one mission, in one menu. It wraps a `MissionCard` in either density: a right click on the card opens it, and the card draws no button of its own for it. Only the entries that apply to the mission's state are drawn, never a greyed one: Open mission always, Open PR when there's a pull request, the Copy branch, Message the coding session and Stop the coding session while the agent runs, Answer the question while the mission waits on the person, then Close on an open mission or Reopen on a done, failed or closed one. Close calls `onClose` at once, with no popover and no submenu. The component calls nothing on its own: every entry calls the callback it was given.",
			},
		},
	},
	args: {
		state: "working",
		hasPullRequest: true,
		hasBranch: true,
		hasWorkspacePath: true,
		onOpen: fn(),
		onOpenPullRequest: fn(),
		onCopy: fn(),
		onMessageAgent: fn(),
		onStopAgent: fn(),
		onAnswer: fn(),
		onClose: fn(),
		onReopen: fn(),
	},
	render: (args) => <Densities {...(args as MissionMenuStoryArgs)} />,
})

type StateStory = {
	state: MissionState
	hasPullRequest: boolean
	story: string
}

type StatePlay = {
	canvasElement: HTMLElement
}

const stateStoryOf = ({ state, hasPullRequest, story }: StateStory) => ({
	args: { state, hasPullRequest },
	parameters: { docs: { description: { story } } },
	play: async ({ canvasElement }: StatePlay) => {
		await expectEntriesInBothDensities({
			canvasElement,
			expected: entriesFor(state, hasPullRequest),
		})
	},
})

export const Working = meta.story(
	stateStoryOf({
		state: "working",
		hasPullRequest: true,
		story:
			"A mission the agent is working on, with a pull request. Check that a right click on the row and on the card both open the list Open mission, Open PR, Copy, Message the coding session, Stop the coding session and Close, and that no entry carries a shortcut. Pick `WorkingWithoutAPullRequest` for the same mission before its pull request.",
	}),
)

export const WorkingWithoutAPullRequest = meta.story(
	stateStoryOf({
		state: "working",
		hasPullRequest: false,
		story:
			"A mission the agent is working on, before any pull request. Check that Open PR isn't drawn and that the rest of the list is the one `Working` draws.",
	}),
)

export const WaitingOnTheCompanion = meta.story(
	stateStoryOf({
		state: "waiting_bot",
		hasPullRequest: true,
		story:
			"A mission waiting on the companion. Check that it keeps Message the coding session and Stop the coding session, like a working mission.",
	}),
)

export const WaitingOnThePerson = meta.story(
	stateStoryOf({
		state: "waiting_human",
		hasPullRequest: true,
		story:
			"A mission blocked on the person. Check that Answer the question takes the place of the two agent entries.",
	}),
)

export const ReadyToMerge = meta.story(
	stateStoryOf({
		state: "ready_to_merge",
		hasPullRequest: true,
		story:
			"A mission ready to merge. Check that no agent entry and no Merge entry is drawn, and that Close is still there.",
	}),
)

export const Failed = meta.story(
	stateStoryOf({
		state: "failed",
		hasPullRequest: true,
		story:
			"A mission closed as failed. Check that Reopen takes the place of Close and that no Relaunch or Re-run entry is drawn.",
	}),
)

export const Done = meta.story(
	stateStoryOf({
		state: "done",
		hasPullRequest: true,
		story:
			"A mission closed as done, with its pull request. Check that Reopen takes the place of Close and that no Pin, Hide, Mark done or Delete worktree entry is drawn. Pick `DoneWithoutAPullRequest` for a mission closed with no pull request.",
	}),
)

export const Closed = meta.story(
	stateStoryOf({
		state: "closed",
		hasPullRequest: true,
		story:
			"A mission the person closed, neither done nor failed. Check that Reopen takes the place of Close, as on a done mission.",
	}),
)

export const DoneWithoutAPullRequest = meta.story(
	stateStoryOf({
		state: "done",
		hasPullRequest: false,
		story:
			"A mission closed as done with no pull request. Check that Open PR isn't drawn.",
	}),
)

const openSubmenu = async (label: string) => {
	const menu = await openMenu()
	fireEvent.click(menu.getByRole("menuitem", { name: new RegExp(`^${label}`) }))
	return within(
		await shown(
			(await screen.findAllByRole("menu")).find(
				(candidate) => candidate.getAttribute("aria-label") !== MENU_LABEL,
			) as HTMLElement,
		),
	)
}

export const CopyChoices = meta.story({
	args: { hasBranch: false, hasWorkspacePath: false, hasPullRequest: false },
	parameters: {
		docs: {
			description: {
				story:
					"The Copy branch on a mission with no branch, no workspace and no pull request. Check that it offers Issue ID alone, and that choosing it calls `onCopy` with `issue_id`. Branch, PR URL and Workspace path each appear only when the mission has one.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		fireEvent.contextMenu(rowIn(canvasElement), { clientX: 40, clientY: 20 })
		const copy = await openSubmenu("Copy")

		await expect(
			copy.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(["Issue ID"])
		fireEvent.click(copy.getByRole("menuitem", { name: "Issue ID" }))
		await expect(args.onCopy).toHaveBeenCalledWith("issue_id")
	},
})

export const EveryCopyChoice = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The Copy branch on a mission with a branch, a workspace and a pull request. Check the order Issue ID, Branch, PR URL, Workspace path, and that each calls `onCopy` with its own kind.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		fireEvent.contextMenu(rowIn(canvasElement), { clientX: 40, clientY: 20 })
		const copy = await openSubmenu("Copy")

		await expect(
			copy.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(["Issue ID", "Branch", "PR URL", "Workspace path"])
		fireEvent.click(copy.getByRole("menuitem", { name: "Workspace path" }))
		await expect(args.onCopy).toHaveBeenCalledWith("workspace_path")
	},
})

const expectNothingLeftOpen = async () => {
	await expect(screen.queryAllByRole("menu")).toHaveLength(0)
	await expect(screen.queryAllByRole("dialog")).toHaveLength(0)
}

export const CloseAtOnce = meta.story({
	args: { state: "waiting_human" },
	parameters: {
		docs: {
			description: {
				story:
					"Close chosen from the menu. Check that it carries the neutral X mark of the closed pill rather than a check mark, that `onClose` is called with no argument at once, and that no submenu and no popover opens.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		openByRightClick(cardSurfaceIn(canvasElement))
		const close = (await openMenu()).getByRole("menuitem", {
			name: /^Close/,
		})
		await expect(close).not.toHaveAttribute("aria-haspopup")
		await expect(glyphIn(close, Icons.Close)).not.toBeNull()
		await expect(glyphIn(close, Icons.Check)).toBeNull()
		fireEvent.click(close)

		await expect(args.onClose).toHaveBeenCalledTimes(1)
		await expect(args.onClose).toHaveBeenCalledWith()
		await waitFor(
			() => expect(screen.queryByRole("menu")).toBeNull(),
			FRAME_POLL,
		)
		await expectNothingLeftOpen()
	},
})

export const NoCloseFromTheKeyboard = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement, userEvent }) => {
		within(cardSurfaceIn(canvasElement))
			.getByRole("button", { name: /^Open the mission/ })
			.focus()

		await userEvent.keyboard("{Meta>}{Backspace}{/Meta}")

		await expect(args.onClose).not.toHaveBeenCalled()
		await expectNothingLeftOpen()
	},
})

const COMPOSER_LABEL = "Composer"

const COMPOSER_FOCUS_DELAY_MS = 60

const WithComposer = (args: MissionMenuStoryArgs) => (
	<div className="flex flex-col gap-4">
		<Densities {...args} />
		<input aria-label={COMPOSER_LABEL} />
	</div>
)

type Clicking = {
	click: (element: Element) => Promise<void>
}

type ComposerFocusCheck = {
	canvasElement: HTMLElement
	userEvent: Clicking
	entry: string
}

const expectFocusLeftOnTheComposer = async ({
	canvasElement,
	userEvent,
	entry,
}: ComposerFocusCheck) => {
	const composer = screen.getByRole("textbox", { name: COMPOSER_LABEL })
	const focusComposerLater = () =>
		window.setTimeout(() => composer.focus(), COMPOSER_FOCUS_DELAY_MS)

	for (const surface of [rowIn(canvasElement), cardSurfaceIn(canvasElement)]) {
		openByRightClick(surface)
		const item = (await openMenu()).getByRole("menuitem", { name: entry })
		item.addEventListener("click", focusComposerLater)
		await userEvent.click(item)
		await waitFor(
			() => expect(screen.queryByRole("menu")).toBeNull(),
			FRAME_POLL,
		)
		await new Promise((resolve) =>
			window.setTimeout(resolve, 4 * COMPOSER_FOCUS_DELAY_MS),
		)

		await expect(composer).toHaveFocus()
	}
}

export const MessageTheAgentLeavesTheCard = meta.story({
	tags: ["test-only"],
	args: { state: "working" },
	render: (args) => <WithComposer {...(args as MissionMenuStoryArgs)} />,
	play: async ({ canvasElement, userEvent }) => {
		await expectFocusLeftOnTheComposer({
			canvasElement,
			userEvent,
			entry: "Message the coding session",
		})
	},
})

export const AnswerTheQuestionLeavesTheCard = meta.story({
	tags: ["test-only"],
	args: { state: "waiting_human" },
	render: (args) => <WithComposer {...(args as MissionMenuStoryArgs)} />,
	play: async ({ canvasElement, userEvent }) => {
		await expectFocusLeftOnTheComposer({
			canvasElement,
			userEvent,
			entry: "Answer the question",
		})
	},
})

export const KeyboardTrigger = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The menu reached from the keyboard, the way the context menu key or Shift+F10 does it: a contextmenu event on the focused open button. Check that the menu opens with the entries a right click draws, and that Escape closes it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const open = slotIn(rowIn(canvasElement), "sidebar-menu-button")
		open.focus()

		fireEvent.contextMenu(open)
		await expect(await entriesIn()).toEqual(entriesFor("working", true))
		await dismissMenu()
	},
})
