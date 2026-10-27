import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectClickModifiers,
	expectFont,
	expectHeadingFont,
	expectSkeletonClippedAtBottomOf,
	FRAME_POLL,
	probedStyleOf,
	slotIn,
	slotsIn,
	tokenLengthOf,
} from "@workspace/storybook/story-utils"
import { THEME_CLASS_NAMES } from "@workspace/storybook/themed-docs-container"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import {
	CLOSED_MISSION,
	EARLIER_TODAY_ROWS,
	LATE_REPORTED_RUN,
	NO_EARLIER_TODAY,
	NO_MISSIONS,
	OPEN_MISSIONS,
	REPORTED_RUN,
	WAITING_HUMAN_MISSION,
} from "@workspace/ui/components/missions.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import type { RoutineDetailModel } from "@workspace/ui/components/routine-detail"
import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import {
	CLEANUP_DETAIL,
	DIGEST_DETAIL,
	DIGEST_RUNS,
	INBOX_FORM,
	MORNING_DIGEST,
	RELEASE_WATCH,
	ROUTINES,
	SCHEDULED_FORM,
	SOURCE_NAMED_BY_ID,
	TRIGGER_SOURCES,
	WATCH_DETAIL,
	WATCHING_FORM,
} from "@workspace/ui/components/routines.fixtures"
import {
	ROUTINES_PANEL_WIDTH,
	RoutinesPanel,
	type RoutinesPanelProps,
	RoutinesPanelTrigger,
} from "@workspace/ui/components/routines-panel"
import { SidebarMenuRow } from "@workspace/ui/components/sidebar-menu-row"
import { SIDEBAR_WIDTH_STEP } from "@workspace/ui/components/sidebar-resize"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuItem,
	SidebarTrigger,
} from "@workspace/ui/components/ui/sidebar"
import {
	SHELL_TITLE_BAR_HEIGHT,
	WorkspaceShell,
} from "@workspace/ui/components/workspace-shell"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const ANSWER =
	"Three routines watch this conversation: a digest, a changelog watch and a nightly cleanup."

const THREAD = (
	<ThreadLayout
		composer={<PromptInput onSubmit={fn()} />}
		header={<AppHeader trailing={<RoutinesPanelTrigger />} />}
	>
		<UserTurn>What runs on its own here?</UserTurn>
		<AssistantTurn copyText={ANSWER}>{ANSWER}</AssistantTurn>
	</ThreadLayout>
)

const THEMES = Object.values(THEME_CLASS_NAMES)

const THEME_CLASSES = THEMES.filter(Boolean)

const cardPaintBeside = (panel: HTMLElement) =>
	probedStyleOf("bg-card", "backgroundColor", panel.parentElement ?? panel)

const cardSurfaceIn = async (panel: HTMLElement, themeClass: string) => {
	const root = document.documentElement
	root.classList.remove(...THEME_CLASSES)
	if (themeClass) root.classList.add(themeClass)
	const painted = getComputedStyle(panel).backgroundColor
	await expect(painted).toBe(cardPaintBeside(panel))
	return painted
}

const expectCardSurfaceInEveryTheme = async (panel: HTMLElement) => {
	const root = document.documentElement
	const themeAtStart = root.className
	const painted = new Set<string>()
	try {
		for (const themeClass of THEMES) {
			painted.add(await cardSurfaceIn(panel, themeClass))
		}
	} finally {
		root.className = themeAtStart
	}
	await expect(painted.size).toBe(THEMES.length)
}

const expectChatDivider = async (panel: HTMLElement) => {
	const edge = getComputedStyle(panel)
	await expect(edge.borderInlineStartWidth).toBe("1px")
	await expect(edge.borderInlineStartColor).toBe(
		probedStyleOf("border-shell-divider", "borderTopColor", panel),
	)
}

const FORMS: Record<string, RoutineFormModel> = {
	[MORNING_DIGEST.id]: SCHEDULED_FORM,
	[RELEASE_WATCH.id]: WATCHING_FORM,
	[SOURCE_NAMED_BY_ID.id]: INBOX_FORM,
}

const DETAILS: Record<string, RoutineDetailModel> = {
	[MORNING_DIGEST.id]: DIGEST_DETAIL,
	[RELEASE_WATCH.id]: WATCH_DETAIL,
	[SOURCE_NAMED_BY_ID.id]: CLEANUP_DETAIL,
}

const PanelHost = ({
	isOpen,
	routines,
	form,
	detail,
	...props
}: RoutinesPanelProps) => {
	const [open, setOpen] = useState(isOpen)
	const [held, setHeld] = useState(routines)
	const [shown, setShown] = useState<RoutineFormModel | null>(
		form?.open ?? null,
	)
	const [opened, setOpened] = useState<RoutineDetailModel | null>(
		detail?.open ?? null,
	)

	const answer = (id: string, isEnabled: boolean) =>
		setHeld((rows) =>
			rows.map((row) =>
				row.id === id
					? {
							...row,
							isEnabled,
							hasStoppedItself: row.hasStoppedItself && !isEnabled,
						}
					: row,
			),
		)

	return (
		<RoutinesPanel
			{...props}
			detail={
				detail && {
					...detail,
					onClose: () => {
						detail.onClose()
						setOpened(null)
					},
					onOpen: (routineId) => {
						detail.onOpen(routineId)
						setOpened(DETAILS[routineId] ?? null)
					},
					open: opened,
				}
			}
			form={
				form && {
					...form,
					onClose: () => {
						form.onClose()
						setShown(null)
					},
					onNew: () => {
						form.onNew()
						setShown({ id: null, values: EMPTY_ROUTINE_VALUES })
					},
					onOpen: (routineId) => {
						form.onOpen(routineId)
						setShown(FORMS[routineId] ?? null)
					},
					onSave: (values) => {
						form.onSave(values)
						setShown(null)
						setOpened((current) =>
							current ? { ...current, title: values.title } : current,
						)
					},
					open: shown,
				}
			}
			isOpen={open}
			onDelete={(id) => {
				props.onDelete(id)
				setHeld((rows) => rows.filter((row) => row.id !== id))
			}}
			onEnabledChange={(id, isEnabled) => {
				props.onEnabledChange(id, isEnabled)
				answer(id, isEnabled)
			}}
			onOpenChange={(next) => {
				props.onOpenChange(next)
				setOpen(next)
			}}
			routines={held}
		/>
	)
}

const NO_ROUTINES: RoutineRowModel[] = []

const NO_MISSION_AT_ALL = {
	open: NO_MISSIONS,
	earlierToday: NO_EARLIER_TODAY,
	onOpen: fn(),
}

const shownMissions = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "mission-card-row").filter((row) =>
		row.checkVisibility(),
	)

const shownActivityRows = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="mission-card-row"], [data-slot="reported-run-row"]',
		),
	).filter((row) => row.checkVisibility())

const listNamedBy = (head: HTMLElement) => {
	const listId = head.getAttribute("aria-controls")
	const list = listId && head.ownerDocument.getElementById(listId)
	if (!list) throw new Error("the fold names no list of this document")
	return list
}

const openRoutines = async (
	canvasElement: HTMLElement,
	userEvent: { click: (element: Element) => Promise<void> },
) => {
	await userEvent.click(slotIn(canvasElement, "routines-entry"))
}

const WORKSPACE_SIDEBAR = (
	<Sidebar aria-label="Workspace" collapsible="icon" role="complementary">
		<SidebarHeader>
			<SidebarTrigger aria-label="Toggle workspace">
				<Icons.Sidebar className="size-4" />
			</SidebarTrigger>
		</SidebarHeader>
		<SidebarContent>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuRow label="Shift log">Shift log</SidebarMenuRow>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarContent>
	</Sidebar>
)

const verticalCentreOf = (element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	return Math.round(box.top + box.height / 2)
}

const resizeHandleIn = (canvas: ReturnType<typeof within>) =>
	canvas.getByRole("separator", { name: "Resize sidebar" })

const renderInShell = (args: RoutinesPanelProps) => (
	<WorkspaceShell sidebar={WORKSPACE_SIDEBAR}>
		<PanelHost {...args} />
	</WorkspaceShell>
)

const MOUNTED_BY_THE_THREAD =
	"`apps/app/src/components/thread-routines.tsx:107` mounts the panel of every conversation, with the missions, routines, form and detail its controllers hold."

const meta = preview.meta({
	title: "Conversation/Routines/RoutinesPanel",
	component: RoutinesPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The activity of one conversation, on the trailing edge of its thread: the missions running on it above the routines watching it, each list under its own section head. It carries a sidebar provider of its own, so opening or resizing it says nothing to the workspace sidebar on the other side of the window, and it owns no shortcut — the control in the thread header is the only way in and out. Closed, it takes no room at all and the transcript spans the thread. The lists are the whole surface: no mission running gets a dotted line rather than a gap, nothing at all gets an empty state rather than a bare list, a read that failed gets the failure and a retry rather than a list that looks empty, and a change that could not be written says so in its own words rather than borrowing the read's.",
			},
		},
	},
	args: {
		children: THREAD,
		detail: {
			onClose: fn(),
			onOpen: fn(),
			onRetryRuns: fn(),
			onRunNow: fn(),
			open: null,
		},
		failure: null,
		form: {
			canCreate: true,
			onClose: fn(),
			onNew: fn(),
			onOpen: fn(),
			onSave: fn(),
			open: null,
			sources: TRIGGER_SOURCES,
		},
		isOpen: true,
		missions: {
			open: OPEN_MISSIONS,
			earlierToday: EARLIER_TODAY_ROWS,
			onOpen: fn(),
		},
		onDelete: fn(),
		onEnabledChange: fn(),
		onOpenChange: fn(),
		onRetry: fn(),
		routines: ROUTINES,
	},
	render: (args) => <PanelHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Six missions of three companions, spread over the three groups the panel knows: what waits on the reader first, what is in progress under it, then what closed earlier today, folded. Check that every group carries its count, that the rows are bare — no border, no surface — that a mission closed earlier today keeps its rows out of sight until its head is opened, that no routine is listed in the body, and that the routines of the conversation sit behind the entry at the foot carrying their count. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = canvas.getByRole("complementary", { name: "Activity" })
		await expect(panel).toBeVisible()
		await expectCardSurfaceInEveryTheme(panel)
		await expectChatDivider(panel)
		await expect(
			within(panel).getByRole("button", { name: "Close activity" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Toggle activity" }),
		).not.toBeInTheDocument()
		await expectHeadingFont(
			within(panel).getByRole("heading", { level: 2, name: "Activity" }),
		)

		const waiting = canvas.getByRole("heading", { name: "Waiting on you" })
		await expect(waiting).toBeVisible()
		await expectFont(waiting, "font-sans")
		await expect(
			canvas.getByRole("heading", { name: "In progress" }),
		).toBeVisible()
		await expect(
			slotIn(canvasElement, "missions-waiting").compareDocumentPosition(
				slotIn(canvasElement, "missions-inProgress"),
			),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

		await expect(shownMissions(canvasElement)).toHaveLength(
			OPEN_MISSIONS.length,
		)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)
		await expect(
			within(slotIn(canvasElement, "routines-entry")).getByText(
				String(ROUTINES.length),
			),
		).toBeVisible()
	},
})

export const OneMission = meta.story({
	args: {
		missions: {
			open: [WAITING_HUMAN_MISSION],
			earlierToday: NO_EARLIER_TODAY,
			onOpen: fn(),
		},
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation holding one mission, and that mission waiting on the reader. Check that only the group it belongs to is drawn — a group with nothing in it is left out rather than shown empty — and that the row reads its companion, its ticket and its age on two lines. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-card-row")).toHaveLength(1)
		await expect(
			canvas.getByRole("heading", { name: "Waiting on you" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("heading", { name: "In progress" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: /Earlier today/ }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText("Ada Martin")).toBeVisible()
		await expect(canvas.getByText("OPE-51")).toBeVisible()
	},
})

export const EarlierTodayUnfolded = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"What the conversation closed and what its routines reported since midnight, unfolded from their head. Check that the head reports itself expanded once activated, that closed missions and reported runs read as one list ordered most recent first, that a closed mission reads muted with the time of day it closed, that a reported run names its routine, its trigger, its companion and the word reported, and that a run row answers no pointer. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const head = canvas.getByRole("button", { name: /Earlier today/ })
		await expect(head).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(head)
		await expect(head).toHaveAttribute("aria-expanded", "true")
		await expect(shownActivityRows(canvasElement)).toHaveLength(
			OPEN_MISSIONS.length + EARLIER_TODAY_ROWS.length,
		)

		const group = within(slotIn(canvasElement, "missions-earlierToday"))
		await expect(
			[
				LATE_REPORTED_RUN.routineTitle,
				CLOSED_MISSION.objective,
				REPORTED_RUN.routineTitle,
			].map((title) => group.getByText(title)),
		).toHaveLength(3)
		await expect(
			group
				.getByText(LATE_REPORTED_RUN.routineTitle)
				.compareDocumentPosition(group.getByText(CLOSED_MISSION.objective)),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		await expect(
			group
				.getByText(CLOSED_MISSION.objective)
				.compareDocumentPosition(group.getByText(REPORTED_RUN.routineTitle)),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

		await expect(group.getByText("09:12")).toBeVisible()
		await expect(group.getByText(REPORTED_RUN.timestamp)).toBeVisible()
		await expect(group.getByText(REPORTED_RUN.triggerSourceTitle)).toBeVisible()
		await expect(group.getAllByText("reported")).toHaveLength(2)
		await expect(
			within(slotIn(canvasElement, "reported-run-row")).queryByRole("button"),
		).not.toBeInTheDocument()
	},
})

export const EarlierTodayFoldTarget = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The list the fold speaks for, in both of its states. Check that the id named by aria-controls resolves in the document while the group is folded as well as once it is unfolded, that the folded list is hidden from view and from assistive technology rather than removed, and that its rows stay out of the tab order until the group is opened. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const head = canvas.getByRole("button", { name: /Earlier today/ })
		const folded = listNamedBy(head)

		await expect(folded).not.toBeVisible()
		await expect(shownMissions(canvasElement)).toHaveLength(
			OPEN_MISSIONS.length,
		)

		head.focus()
		await userEvent.tab()
		await expect(head.ownerDocument.activeElement).not.toBe(
			folded.querySelector("button"),
		)

		await userEvent.click(head)
		await expect(listNamedBy(head)).toBe(folded)
		await expect(folded).toBeVisible()
		await expect(
			within(folded).getByText(CLOSED_MISSION.objective),
		).toBeVisible()
	},
})

export const Closed = meta.story({
	args: { isOpen: false },
	parameters: {
		docs: {
			description: {
				story:
					"The panel folded away. Check that the thread card takes the whole room the folded panel leaves, keeping nothing but its own gutter, that the control in the app header reports the panel closed rather than merely looking unpressed, that it points at nothing while there is nothing to point at — a folded panel is out of the document, so an `aria-controls` naming it would name an element a screen reader cannot reach — and that the panel is out of the document entirely rather than a column of no width. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const control = canvas.getByRole("button", { name: "Toggle activity" })
		await expect(control).toHaveAttribute("aria-expanded", "false")
		await expect(control).not.toHaveAttribute("aria-controls")

		const thread = slotIn(canvasElement, "sidebar-inset")
		await expect(
			canvas.queryByRole("complementary", { name: "Activity" }),
		).toBeNull()
		await expect(thread.getBoundingClientRect().width).toBe(
			thread.parentElement?.getBoundingClientRect().width ?? 0,
		)
	},
})

export const Toggling = meta.story({
	render: renderInShell,
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The way in and the way out, each in its own place. Check that the control in the app header opens the panel and then leaves the header, that the icon that closes it again sits on the same line the opener's icon sat on, in the column of the routine rows' delete icons rather than the opener's distance from the frame, that opening hands the keyboard to the close control inside the panel rather than dropping it on the body, that this control closes the panel, and that closing hands the keyboard back to the control in the app header. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const opener = canvas.getByRole("button", { name: "Toggle activity" })
		const openerCentre = verticalCentreOf(opener)

		await userEvent.click(opener)
		await expect(args.onOpenChange).toHaveBeenCalledWith(true)

		const panel = canvas.getByRole("complementary", { name: "Activity" })
		await expect(panel.getBoundingClientRect().width).toBeGreaterThan(0)
		await expect(
			canvas.queryByRole("button", { name: "Toggle activity" }),
		).not.toBeInTheDocument()

		const close = within(panel).getByRole("button", { name: "Close activity" })
		await expect(verticalCentreOf(close)).toBe(openerCentre)
		await waitFor(() => expect(close).toHaveFocus(), FRAME_POLL)

		await userEvent.click(close)
		await expect(args.onOpenChange).toHaveBeenCalledWith(false)

		const control = canvas.getByRole("button", { name: "Toggle activity" })
		await expect(control).toHaveAttribute("aria-expanded", "false")
		await waitFor(() => expect(control).toHaveFocus(), FRAME_POLL)
	},
})

export const Empty = meta.story({
	args: { missions: NO_MISSION_AT_ALL, routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation nothing runs on yet, neither mission nor routine. Check that the empty body names what would land here rather than showing three empty groups, that the entry at the foot still counts the routines it holds — none — and that the way to write the first routine is one screen behind it. Pick `NoMission` for a conversation whose routines are written but whose missions are all closed and gone. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Nothing is running here")).toBeVisible()
		await expect(slotsIn(canvasElement, "mission-card-row")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		await openRoutines(canvasElement, userEvent)
		await expect(canvas.getByText("No routine yet")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Create a routine" }),
		)
		await expect(slotIn(canvasElement, "routine-form")).toBeVisible()
	},
})

export const NoMission = meta.story({
	args: { missions: NO_MISSION_AT_ALL },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation whose routines are written and whose missions are all closed before today. Check that the body reads as the empty one rather than as a blank column, and that the routines are still counted at the foot. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Nothing is running here")).toBeVisible()
		await expect(slotsIn(canvasElement, "mission-card-row")).toHaveLength(0)
		await expect(
			within(slotIn(canvasElement, "routines-entry")).getByText(
				String(ROUTINES.length),
			),
		).toBeVisible()
	},
})

export const OpeningTheRoutines = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The routines of the conversation, one screen behind the entry at the foot. Check that the entry pushes them over the panel rather than growing the body, that the missions are gone while they are up, that every routine row names its routine and the source that fires it — including the routine whose source no read named, which falls back to the source id rather than leaving the line blank — that flipping a switch reports the routine it belongs to, and that coming back hands the keyboard to the entry that opened it. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)

		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
		await expect(slotsIn(canvasElement, "mission-card-row")).toHaveLength(0)
		await expect(canvas.getByText("Every day at 08:00")).toBeVisible()
		await expect(
			canvas.getByText(SOURCE_NAMED_BY_ID.triggerSourceTitle),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("switch", { name: "Morning digest" }),
		)
		await expect(args.onEnabledChange).toHaveBeenCalledWith(
			"routine-morning-digest",
			false,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the activity" }),
		)
		await expect(shownMissions(canvasElement)).toHaveLength(
			OPEN_MISSIONS.length,
		)
		await waitFor(
			() => expect(slotIn(canvasElement, "routines-entry")).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const OpeningAMission = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A mission picked from a group. Check that the whole row is what answers the pointer and the keyboard — the row carries no control of its own — that it reports the mission it belongs to rather than opening anything inside the panel, and that a row reached by keyboard wears a focus ring. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByText(WAITING_HUMAN_MISSION.objective))
		await expect(args.missions.onOpen).toHaveBeenCalledWith(
			WAITING_HUMAN_MISSION.id,
			NO_CLICK_MODIFIERS,
		)

		await userEvent.keyboard("{Enter}")
		await expect(args.missions.onOpen).toHaveBeenCalledTimes(2)

		const row = canvas
			.getByText(WAITING_HUMAN_MISSION.objective)
			.closest("button") as HTMLElement
		await expect(row).toHaveFocus()
		await expect(getComputedStyle(row).boxShadow).not.toBe("none")
	},
})

export const OpensWithClickModifiers = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"An open mission, then a mission closed earlier today, each clicked every way a host can tell apart. Check that both lists hand the caller the mission with the button and the keys of that click, middle with the keys held, Cmd, Ctrl or Shift alone, none on a plain click or Enter, and nothing on a right-click. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /Earlier today/ }))
		for (const mission of [WAITING_HUMAN_MISSION, CLOSED_MISSION]) {
			await expectClickModifiers({
				target: canvas
					.getByText(mission.objective)
					.closest("button") as HTMLElement,
				callback: args.missions.onOpen,
				reported: [mission.id],
				userEvent,
			})
		}
	},
})

export const RoutinesReadFailed = meta.story({
	args: { failure: "routines", routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"The routines could not be read, the missions could. Check that the notice names the routines rather than the activity as a whole, that the missions the app did read stay on screen under it, and that the retry is the only thing asked of the reader. Pick `MissionsReadFailed` for the other way round. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Couldn’t load routines")).toBeVisible()
		await expect(
			canvas.queryByText("Couldn’t load missions"),
		).not.toBeInTheDocument()
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetry).toHaveBeenCalled()
	},
})

export const RoutinesLoading = meta.story({
	args: { routines: NO_ROUTINES, isRoutinesPending: true },
	decorators: [
		(Story) => (
			<div className="h-[36rem]">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The routines still on their way. Check that routine row skeletons run from under the header to the bottom of the panel, the last one cut by the edge, each at the height of a loaded routine row so nothing moves when the rows land, that the empty state stays away and that the region reads busy. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		const pending = slotIn(canvasElement, "routines-pending")
		await expect(pending).toHaveAttribute("aria-busy", "true")

		const body = pending.parentElement as HTMLElement
		const list = await expectSkeletonClippedAtBottomOf(body)
		const [firstRow] = slotsIn(list, "list-skeleton-row")
		await expect(firstRow?.getBoundingClientRect().height).toBe(62)
		await expect(slotsIn(canvasElement, "routines-empty")).toHaveLength(0)
		await expect(canvas.queryByText("Couldn’t load routines")).toBeNull()
	},
})

export const MissionsLoading = meta.story({
	args: { missions: NO_MISSION_AT_ALL, isMissionsPending: true },
	decorators: [
		(Story) => (
			<div className="h-[38rem]">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The missions still on their way. Check that grouped mission row skeletons run from under the header to the bottom of the panel, the last one cut by the edge, that the empty state stays away rather than claiming nothing runs here, and that the region reads busy. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const pending = slotIn(canvasElement, "missions-pending")
		await expect(pending).toHaveAttribute("aria-busy", "true")

		const list = await expectSkeletonClippedAtBottomOf(
			pending.parentElement as HTMLElement,
		)
		await expect(list).toBeVisible()
		await expect(canvas.queryByText("Nothing is running here")).toBeNull()
		await expect(slotsIn(canvasElement, "activity-empty")).toHaveLength(0)
		await expect(canvas.queryByText("Couldn’t load missions")).toBeNull()
	},
})

export const MissionsReadFailed = meta.story({
	args: { failure: "missions", missions: NO_MISSION_AT_ALL },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The missions could not be read, the routines could. Check that the notice names the missions rather than blaming a routines read that never failed, that it sits above the body rather than inside a group, and that the routines the app did read are still counted at the foot. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Couldn’t load missions")).toBeVisible()
		await expect(
			canvas.queryByText("Couldn’t load routines"),
		).not.toBeInTheDocument()
		await expect(
			within(slotIn(canvasElement, "routines-entry")).getByText(
				String(ROUTINES.length),
			),
		).toBeVisible()
	},
})

export const ActivityReadFailed = meta.story({
	args: {
		failure: "activity",
		missions: NO_MISSION_AT_ALL,
		routines: NO_ROUTINES,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Neither read came back. Check that one notice covers both rather than two stacked on top of each other, that it takes the place of the empty state — a conversation whose activity could not be read has not lost it — and that its retry asks for both reads at once. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Couldn’t load the activity")).toBeVisible()
		await expect(slotsIn(canvasElement, "chat-notice")).toHaveLength(1)
		await expect(
			canvas.queryByText("Nothing is running here"),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetry).toHaveBeenCalled()
	},
})

export const WriteFailed = meta.story({
	args: { failure: "write" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A switch that could not be written. Check that the panel says a change failed rather than blaming a read that never happened, that the notice follows the reader onto the routines screen, that the routines the app is holding stay on screen under it, and that the switch reads as it did before the attempt. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await expect(canvas.getByText("Couldn’t update the routine")).toBeVisible()
		await expect(
			canvas.queryByText("Couldn’t load routines"),
		).not.toBeInTheDocument()
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
	},
})

export const Creating = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The new routine action of the header, from the list to the empty form and back. Check that the form takes the place of the list inside the panel rather than opening a dialog over the thread, that the keyboard lands in the form when it opens, and that leaving hands focus back to the action that opened it with the list where it was. Pick `Editing` for the same form filled from a row. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await userEvent.click(
			canvas.getByRole("button", { name: "Create a routine" }),
		)
		await expect(args.form?.onNew).toHaveBeenCalled()

		const form = canvas.getByRole("form", { name: "Create a routine" })
		await waitFor(() => expect(form).toHaveFocus(), FRAME_POLL)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)
		await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument()

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routines" }),
		)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
		await waitFor(
			() =>
				expect(
					canvas.getByRole("button", { name: "Create a routine" }),
				).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const Opening = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A row picked from the list. Check that the detail takes the place of the list inside the panel, that it repeats the title and the trigger source the row carried rather than a shortened version of them, that the runs are read as it opens, that the close control still holds the end of the header row behind the back control, and that leaving returns focus to the row that opened it. Pick `Editing` for the form reached from here. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await userEvent.click(canvas.getByText("Morning digest"))
		await expect(args.detail?.onOpen).toHaveBeenCalledWith(MORNING_DIGEST.id)

		const detail = slotIn(canvasElement, "routine-detail")
		await waitFor(() => expect(detail).toHaveFocus(), FRAME_POLL)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)
		await expect(canvas.getByText("Every day at 08:00")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(
			DIGEST_RUNS.length,
		)

		const back = canvas.getByRole("button", { name: "Back to the routines" })
		await expect(
			back.compareDocumentPosition(
				slotIn(canvasElement, "routines-panel-close"),
			),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

		await userEvent.click(back)
		const rows = slotsIn(canvasElement, "routine-row")
		await expect(rows).toHaveLength(ROUTINES.length)
		await waitFor(
			() => expect(rows[0]?.querySelector("button[data-opens]")).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const Editing = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The form as it is really reached: from the detail, not from the list. Check that it opens filled with that routine — its title, its expression, its trigger read as text rather than a list — that leaving it lands back on the detail rather than on the list two screens down, and that focus returns to the edit control that opened it. Pick `Saving` for what the detail shows once the form is submitted. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await userEvent.click(canvas.getByText("Morning digest"))
		await userEvent.click(canvas.getByRole("button", { name: "Edit routine" }))
		await expect(args.form?.onOpen).toHaveBeenCalledWith(MORNING_DIGEST.id)

		await expect(canvas.getByDisplayValue("Morning digest")).toBeVisible()
		await expect(canvas.getByDisplayValue("0 8 * * *")).toBeVisible()
		await expect(canvas.getByDisplayValue("On a schedule")).toHaveAttribute(
			"readonly",
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routine" }),
		)
		await expect(slotIn(canvasElement, "routine-detail")).toBeVisible()
		await waitFor(
			() =>
				expect(
					canvas.getByRole("button", { name: "Edit routine" }),
				).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const LeavingByKeyboard = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The pushed screens of the panel walked without a pointer. Check that Enter on the entry pushes the routines, that Enter on a row pushes its detail, and that Enter on the back control of each screen hands the keyboard back to the control that opened it: the row first, then the entry. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		slotIn(canvasElement, "routines-entry").focus()
		await userEvent.keyboard("{Enter}")

		const [row] = slotsIn(canvasElement, "routine-row")
		const opener = row?.querySelector<HTMLElement>("button[data-opens]")
		if (!opener) throw new Error("the first routine row carries no opener")
		opener.focus()
		await userEvent.keyboard("{Enter}")
		await waitFor(
			() => expect(slotIn(canvasElement, "routine-detail")).toHaveFocus(),
			FRAME_POLL,
		)

		canvas.getByRole("button", { name: "Back to the routines" }).focus()
		await userEvent.keyboard("{Enter}")
		await waitFor(
			() =>
				expect(
					slotsIn(canvasElement, "routine-row")[0]?.querySelector(
						"button[data-opens]",
					),
				).toHaveFocus(),
			FRAME_POLL,
		)

		canvas.getByRole("button", { name: "Back to the activity" }).focus()
		await userEvent.keyboard("{Enter}")
		await waitFor(
			() => expect(slotIn(canvasElement, "routines-entry")).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

const editTypedDigest = async (
	canvas: ReturnType<typeof within>,
	canvasElement: HTMLElement,
	userEvent: {
		click: (element: Element) => Promise<void>
		type: (element: Element, text: string) => Promise<void>
	},
) => {
	await openRoutines(canvasElement, userEvent)
	await userEvent.click(canvas.getByText("Morning digest"))
	await userEvent.click(canvas.getByRole("button", { name: "Edit routine" }))
	await userEvent.type(canvas.getByDisplayValue("Morning digest"), " draft")
}

const leaveConfirmation = () =>
	screen.findByRole("alertdialog", { name: "Leave without saving?" })

export const LeavingAnUnsavedFormByBack = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The back control of a form holding changes nobody saved. Check that it asks before anything is left, that refusing keeps the form open with every value typed, and that accepting leaves the form for the detail under it. Pick `Editing` for the same form left with nothing changed, which leaves without asking. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await editTypedDigest(canvas, canvasElement, userEvent)
		const back = () =>
			userEvent.click(
				canvas.getByRole("button", { name: "Back to the routine" }),
			)

		await back()
		await userEvent.click(
			within(await leaveConfirmation()).getByRole("button", {
				name: "Cancel",
			}),
		)
		await expect(args.form?.onClose).not.toHaveBeenCalled()
		await expect(canvas.getByDisplayValue("Morning digest draft")).toBeVisible()

		await back()
		await userEvent.click(
			within(await leaveConfirmation()).getByRole("button", {
				name: "Leave",
			}),
		)
		await expect(args.form?.onClose).toHaveBeenCalledOnce()
		await expect(slotIn(canvasElement, "routine-detail")).toBeVisible()
	},
})

export const LeavingAnUnsavedFormByClose = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The close control of the panel while a form holds changes nobody saved. Check that it asks before the panel goes, that refusing keeps the panel and the form open with every value typed, and that accepting closes the panel only, leaving the open routine where it was. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await editTypedDigest(canvas, canvasElement, userEvent)
		const close = () =>
			userEvent.click(slotIn(canvasElement, "routines-panel-close"))

		await close()
		await userEvent.click(
			within(await leaveConfirmation()).getByRole("button", {
				name: "Cancel",
			}),
		)
		await expect(args.onOpenChange).not.toHaveBeenCalled()
		await expect(canvas.getByDisplayValue("Morning digest draft")).toBeVisible()

		await close()
		await userEvent.click(
			within(await leaveConfirmation()).getByRole("button", {
				name: "Leave",
			}),
		)
		await expect(args.onOpenChange).toHaveBeenCalledWith(false)
		await expect(args.form?.onClose).not.toHaveBeenCalled()
	},
})

export const Saving = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A routine renamed from the form the detail opened. Check that saving lands back on the detail rather than leaving the form on screen, and that the detail reads the title just saved while keeping the trigger source, which a written routine cannot change. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await userEvent.click(canvas.getByText("Morning digest"))
		await userEvent.click(canvas.getByRole("button", { name: "Edit routine" }))

		const title = canvas.getByLabelText("Title")
		await userEvent.clear(title)
		await userEvent.type(title, "Overnight digest")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		const detail = within(slotIn(canvasElement, "routine-detail"))
		await expect(detail.getByText("Overnight digest")).toBeVisible()
		await expect(detail.getByText("Every day at 08:00")).toBeVisible()
	},
})

export const RunNowFailed = meta.story({
	args: {
		detail: {
			onClose: fn(),
			onOpen: fn(),
			onRetryRuns: fn(),
			onRunNow: fn(),
			open: DIGEST_DETAIL,
		},
		failure: "write",
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A Run now the app could not even send. Check that the detail borrows the write failure the panel already carries rather than growing a notice of its own, that the notice sits above the detail with the history left as it was, and that the runs are not blamed for a failure that never reached them. Pick the `Error` story of `RoutineDetail` for the runs that could not be read. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Couldn’t update the routine")).toBeVisible()
		await expect(slotIn(canvasElement, "routine-detail")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(
			DIGEST_RUNS.length,
		)
	},
})

export const WithoutSeatedLead = meta.story({
	args: {
		form: {
			canCreate: false,
			onClose: fn(),
			onNew: fn(),
			onOpen: fn(),
			onSave: fn(),
			open: null,
			sources: TRIGGER_SOURCES,
		},
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation with no lead companion seated: a routine written here would have nobody to run it. Check that the new routine action is left out of the routines screen rather than shown and refused on save, and that the routines already written stay readable and editable. " +
					MOUNTED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await openRoutines(canvasElement, userEvent)
		await expect(
			canvas.queryByRole("button", { name: "Create a routine" }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText("Morning digest")).toBeVisible()
	},
})

export const InWorkspaceShell = meta.story({
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The panel where it really lives: inside the shell, opposite the workspace sidebar. This is the one to open when the two panels are suspected of sharing a context. Check that opening the routines panel leaves the sidebar on the other side expanded and exactly as wide as it was, and that widening this panel from its own handle does not narrow the sidebar with it: each panel carries a provider and a width of its own, so neither can reach the other. `apps/app/src/App.tsx:935` mounts the same panel inside the workspace shell, through `apps/app/src/components/thread-routines.tsx:107`.",
			},
		},
	},
	render: renderInShell,
	play: async ({ canvas, userEvent }) => {
		const workspace = canvas.getByRole("complementary", { name: "Workspace" })
		const widthBefore = workspace.getBoundingClientRect().width

		await userEvent.click(
			canvas.getByRole("button", { name: "Toggle activity" }),
		)
		const panel = canvas.getByRole("complementary", { name: "Activity" })
		await waitFor(
			() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(0),
			FRAME_POLL,
		)

		await expect(
			workspace.closest("[data-slot=sidebar]")?.getAttribute("data-state"),
		).toBe("expanded")
		await expect(workspace.getBoundingClientRect().width).toBe(widthBefore)

		const handle = resizeHandleIn(canvas)
		handle.focus()
		await userEvent.keyboard("{ArrowLeft}")

		await waitFor(
			() =>
				expect(handle).toHaveAttribute(
					"aria-valuenow",
					String(ROUTINES_PANEL_WIDTH + SIDEBAR_WIDTH_STEP),
				),
			FRAME_POLL,
		)
		await expect(workspace.getBoundingClientRect().width).toBe(widthBefore)
	},
})

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const paintOf = (element: HTMLElement) =>
	getComputedStyle(element).backgroundColor

const shellPaint = () => {
	const swatch = document.createElement("div")
	swatch.className = "surface-shell"
	document.body.append(swatch)
	const painted = paintOf(swatch)
	swatch.remove()
	return painted
}

const cardsIn = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>("[data-content-card]"),
	) as [HTMLElement, HTMLElement]

const panelSurfaceIn = (panel: HTMLElement) =>
	panel.querySelector<HTMLElement>('[data-slot="sidebar-inner"]') ?? panel

const expectPanelOnCardSurface = async (panel: HTMLElement) => {
	await expect(paintOf(panelSurfaceIn(panel))).toBe(cardPaintBeside(panel))
	await expectChatDivider(panel)
	await expect(paintOf(panel.parentElement as HTMLElement)).toBe(shellPaint())
}

const SHELL_CARD_BORDER = 1

const expectThreadInsideShellCard = async (canvasElement: HTMLElement) => {
	const [shellCard, threadCard] = cardsIn(canvasElement)
	const frame = getComputedStyle(shellCard)
	await expect(frame.borderInlineEndWidth).toBe("1px")
	await expect(frame.borderStartEndRadius).not.toBe("0px")
	await expect(frame.overflow).toBe("hidden")
	await expect(paintOf(shellCard)).not.toBe(TRANSPARENT)

	const yielded = getComputedStyle(threadCard)
	await expect(yielded.borderInlineEndWidth).toBe("0px")
	await expect(yielded.borderStartEndRadius).toBe("0px")
	await expect(paintOf(threadCard)).toBe(TRANSPARENT)
	return shellCard
}

const activityPanelIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole("complementary", { name: "Activity" })

const PANEL_TOKENS = [
	"--sidebar",
	"--sidebar-accent",
	"--sidebar-border",
	"--accent",
	"--border",
	"--input",
	"--muted",
	"--secondary",
]

const tokenPaintsIn = (host: HTMLElement) =>
	PANEL_TOKENS.map((token) => {
		const probe = document.createElement("div")
		probe.style.backgroundColor = `var(${token})`
		host.append(probe)
		const painted = paintOf(probe)
		probe.remove()
		return painted
	})

const expectShellSurfaceAround = async (canvasElement: HTMLElement) => {
	const panel = activityPanelIn(canvasElement)
	const [, threadCard] = cardsIn(canvasElement)

	await expectPanelOnCardSurface(panel)
	const shellCard = await expectThreadInsideShellCard(canvasElement)
	await expect(tokenPaintsIn(panel)).toEqual(tokenPaintsIn(document.body))

	await waitFor(async () => {
		const threadEdges = threadCard.getBoundingClientRect()
		const panelEdges = panel.getBoundingClientRect()
		await expect(panelEdges.left - threadEdges.right).toBe(0)
		await expect(
			shellCard.getBoundingClientRect().right - panelEdges.right,
		).toBe(SHELL_CARD_BORDER)
	}, FRAME_POLL)
}

const OPEN_ON_SHELL_SURFACE =
	"The panel open inside the shell card: the shell card is the only frame, the thread yields its own, and the panel sits beside the thread on the card surface up to the card's trailing border, the same surface the Conversations panel paints opposite. Check that the panel paints the card background, that a shell divider draws the edge facing the thread, and that the thread and the panel meet with no gap. Pick `OnShellSurfaceClosed` for the panel gone from the document. `apps/app/src/App.tsx:935` is the shell, and `apps/app/src/components/thread-routines.tsx:107` the panel inside it."

const CLOSED_ON_SHELL_SURFACE =
	"The panel closed, which is what most of a session looks like: the thread fills the shell card, which keeps its radius, border and background, 34px under the top of the window for the title bar and 4px off the trailing and bottom edges. Check the thread draws no frame of its own inside it. Pick `OnShellSurfaceOpen` for the panel holding room beside the card. `apps/app/src/App.tsx:935` is the shell, and `apps/app/src/components/thread-routines.tsx:107` the panel inside it."

export const OnShellSurfaceOpen = meta.story({
	args: { isOpen: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: OPEN_ON_SHELL_SURFACE } },
	},
	render: renderInShell,
	play: async ({ canvasElement }) => {
		await expectShellSurfaceAround(canvasElement)
	},
})

export const OnShellSurfaceOpenDark = meta.story({
	args: { isOpen: true },
	globals: { theme: "dark" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: OPEN_ON_SHELL_SURFACE } },
	},
	render: renderInShell,
	play: async ({ canvasElement }) => {
		await expectShellSurfaceAround(canvasElement)
	},
})

const shellInset = () => Number.parseFloat(tokenLengthOf("--shell-inset"))

const expectShellSurfaceWithoutPanel = async (canvasElement: HTMLElement) => {
	await expect(
		within(canvasElement).queryByRole("complementary", { name: "Activity" }),
	).toBeNull()
	const shellCard = await expectThreadInsideShellCard(canvasElement)

	const edges = shellCard.getBoundingClientRect()
	const inset = shellInset()
	await expect(window.innerWidth - edges.right).toBe(inset)
	await expect(edges.top).toBe(SHELL_TITLE_BAR_HEIGHT)
	await expect(window.innerHeight - edges.bottom).toBe(inset)
}

export const OnShellSurfaceClosed = meta.story({
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: CLOSED_ON_SHELL_SURFACE } },
	},
	render: renderInShell,
	play: async ({ canvasElement }) => {
		await expectShellSurfaceWithoutPanel(canvasElement)
	},
})

export const OnShellSurfaceClosedDark = meta.story({
	args: { isOpen: false },
	globals: { theme: "dark" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: CLOSED_ON_SHELL_SURFACE } },
	},
	render: renderInShell,
	play: async ({ canvasElement }) => {
		await expectShellSurfaceWithoutPanel(canvasElement)
	},
})

type InlineInset = { start: number; end: number }

type ContentInset = InlineInset & { top: number }

type ThreadInsets = {
	card: { top: number; end: number; bottom: number }
	transcript: ContentInset
	foot: ContentInset
}

const contentInsetIn = (frame: DOMRect, element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	const style = getComputedStyle(element)
	return {
		start: box.left + Number.parseFloat(style.paddingInlineStart) - frame.left,
		end: frame.right - box.right + Number.parseFloat(style.paddingInlineEnd),
		top: box.top + Number.parseFloat(style.paddingTop) - frame.top,
	}
}

const composerFootIn = (layout: HTMLElement) => {
	const foot = Array.from(layout.children).find((child) =>
		child.querySelector("textarea"),
	)
	if (!(foot instanceof HTMLElement)) {
		throw new Error("This thread draws no composer foot")
	}
	return foot
}

const threadInsetsIn = (canvasElement: HTMLElement): ThreadInsets => {
	const [shellCard, threadCard] = cardsIn(canvasElement)
	const card = shellCard.getBoundingClientRect()
	const frame = threadCard.getBoundingClientRect()
	const layout = slotIn(threadCard, "chat-layout")
	return {
		card: {
			top: card.top,
			end: window.innerWidth - card.right,
			bottom: window.innerHeight - card.bottom,
		},
		transcript: contentInsetIn(
			frame,
			slotIn(layout, "message-scroller-content"),
		),
		foot: contentInsetIn(frame, composerFootIn(layout)),
	}
}

const surfaceEdgesOf = (panel: HTMLElement) => {
	const surface = panelSurfaceIn(panel)
	const box = surface.getBoundingClientRect()
	const edge = getComputedStyle(surface)
	return new DOMRect(
		box.left + Number.parseFloat(edge.borderInlineStartWidth),
		box.top,
		box.width -
			Number.parseFloat(edge.borderInlineStartWidth) -
			Number.parseFloat(edge.borderInlineEndWidth),
		box.height,
	)
}

const panelBodyInsetIn = (panel: HTMLElement): InlineInset => {
	const { start, end } = contentInsetIn(
		surfaceEdgesOf(panel),
		slotIn(panel, "sidebar-content"),
	)
	return { start, end }
}

const centreXOf = (element: Element) => {
	const box = element.getBoundingClientRect()
	return box.left + box.width / 2
}

const expectWithinAPixel = async (actual: number, expected: number) => {
	await expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
}

const iconOf = (control: HTMLElement) => {
	const glyph = control.querySelector("svg")
	if (!glyph) throw new Error("This control draws no icon")
	return glyph
}

const expectBodyInsetUnderHeader = async (panel: HTMLElement) => {
	const header = slotIn(panel, "sidebar-header").getBoundingClientRect()
	const first = slotIn(panel, "sidebar-content").firstElementChild
	if (!first) throw new Error("This panel body holds nothing")
	await expectWithinAPixel(
		first.getBoundingClientRect().top - header.bottom,
		shellInset(),
	)
}

const expectRowsOnThePanelInsetRule = async (
	panel: HTMLElement,
	headerTitleStart: number,
) => {
	const inset = shellInset()
	const surface = surfaceEdgesOf(panel)
	const body = slotIn(panel, "sidebar-content")
	const [row] = slotsIn(panel, "routine-row")
	if (!row) throw new Error("This panel lists no routine")
	const card = row.getBoundingClientRect()
	const titleId = within(row)
		.getByRole("switch")
		.getAttribute("aria-labelledby")
	const title = titleId && row.ownerDocument.getElementById(titleId)
	if (!title) throw new Error("This routine row names no title")
	const remove = within(row).getByRole("button", { name: /^Delete / })
	const close = within(panel).getByRole("button", { name: "Close activity" })

	await expectBodyInsetUnderHeader(panel)
	await expectWithinAPixel(card.left - surface.left, inset)
	await expectWithinAPixel(surface.right - card.right, inset)
	await expectWithinAPixel(title.getBoundingClientRect().left, headerTitleStart)
	await expectWithinAPixel(centreXOf(iconOf(close)), centreXOf(iconOf(remove)))
	await expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight)
	await expectWithinAPixel(
		surface.bottom -
			body.getBoundingClientRect().bottom +
			Number.parseFloat(getComputedStyle(body).paddingBlockEnd),
		inset,
	)
}

const expectOneInsetRuleOnShell = async (
	canvasElement: HTMLElement,
	userEvent: { click: (element: Element) => Promise<void> },
) => {
	const canvas = within(canvasElement)
	const closed = threadInsetsIn(canvasElement)

	await userEvent.click(canvas.getByRole("button", { name: "Toggle activity" }))
	const panel = await canvas.findByRole("complementary", { name: "Activity" })
	await expectShellSurfaceAround(canvasElement)

	const opened = threadInsetsIn(canvasElement)
	await expect(opened).toEqual(closed)
	await expect(panelBodyInsetIn(panel)).toEqual({
		start: opened.foot.start,
		end: opened.foot.end,
	})
	await expectBodyInsetUnderHeader(panel)
	const headerTitleStart = within(slotIn(panel, "sidebar-header"))
		.getByRole("heading")
		.getBoundingClientRect().left

	await openRoutines(canvasElement, userEvent)
	await within(panel).findByRole("heading", { name: "Routines" })
	await expectRowsOnThePanelInsetRule(panel, headerTitleStart)
}

const ONE_INSET_RULE_ON_SHELL =
	"The thread opens its panel inside the shell, and nothing it already drew moves: the shell card keeps its distance from the top, the trailing and the bottom edges of the window, the transcript keeps its inset from the thread card and the composer its own. Inside the panel, cards line up with cards and text with text: the panel body takes the composer's inset from its surface on every side, the routine cards sit that inset in from the surface edges, the header title starts where a routine title starts, and the close icon sits on the same line as each row's delete icon. Check the conversation and the composer hold still as the panel opens, that the first item sits one shell inset under the header, and that the Routines list keeps the composer's inset above the bottom of the panel. Pick `OnShellSurfaceOpen` for the frames the two surfaces draw. `apps/app/src/App.tsx:935` is the shell, and `apps/app/src/components/thread-routines.tsx:107` the panel inside it."

export const OnShellSurfaceInsets = meta.story({
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: ONE_INSET_RULE_ON_SHELL } },
	},
	render: renderInShell,
	play: async ({ canvasElement, userEvent }) => {
		await expectOneInsetRuleOnShell(canvasElement, userEvent)
	},
})

export const OnShellSurfaceInsetsDark = meta.story({
	args: { isOpen: false },
	globals: { theme: "dark" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: { description: { story: ONE_INSET_RULE_ON_SHELL } },
	},
	render: renderInShell,
	play: async ({ canvasElement, userEvent }) => {
		await expectOneInsetRuleOnShell(canvasElement, userEvent)
	},
})

export const OnShellSurfaceTinted = meta.story({
	args: { isOpen: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The panel open in a space that carries a colour, which never reaches the window background nor the panel: the space hue reaches the reader's own message bubbles, the accent and the colour dots, never a shell or panel surface. Check that the panel keeps the card surface the Conversations panel paints, that the eight tokens it paints with (sidebar, sidebar-accent, sidebar-border, accent, border, input, muted and secondary) read exactly the values they read outside any space, and that the wrapper behind it wears the same neutral background as a shell with no colour. A row, a rule, a field or a shell washed in the space colour is the regression this story catches. `Navigation/AppSidebar` `SpaceTinted` reads the same pair on the roster panel opposite. Pick `OnShellSurfaceOpen` for the panel in a space with no colour. `apps/app/src/App.tsx:935` mounts the same panel inside the workspace shell, through `apps/app/src/components/thread-routines.tsx:107`.",
			},
		},
	},
	render: (args) => (
		<WorkspaceShell sidebar={WORKSPACE_SIDEBAR} spaceTint="blue">
			<PanelHost {...args} />
		</WorkspaceShell>
	),
	play: async ({ canvas, canvasElement }) => {
		const activity = activityPanelIn(canvasElement)
		const shell = canvas.getByRole("main").parentElement as HTMLElement

		await expect(paintOf(panelSurfaceIn(activity))).toBe(
			cardPaintBeside(activity),
		)
		await expect(shell).toHaveAttribute("data-hue", String(BLOT_HUES.blue))
		await expect(tokenPaintsIn(activity)).toEqual(tokenPaintsIn(document.body))
		await waitFor(async () => {
			const wrapper = paintOf(activity.parentElement as HTMLElement)
			await expect(wrapper).toBe(paintOf(shell))
			await expect(wrapper).toBe(shellPaint())
		}, FRAME_POLL)
	},
})
