import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	animatedTransitionsOf,
	boxOf,
	expectClickModifiers,
	expectPictureUnderBorder,
	glyphIn,
	lineHeightOf,
	pictureOf,
	shown,
	slotIn,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	CompanionMenuContent,
	CompanionMenuProvider,
} from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import { Icons } from "@workspace/ui/components/icons"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { RosterBot } from "@workspace/ui/components/roster"
import type { RosterMenuSection } from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import {
	AssistantTurn,
	PersonTurn,
	type TurnCause,
	UserTurn,
} from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line in the other direction."

const QUEUED = "And then run the test suite once that lands."

const cancelQueued = fn()

const reply = fn()

const pin = fn()

const saveAsDocument = fn()

const jumpToQuoted = fn()

const QUESTION = "Is any of that destructive?"

const KEPT_SKILL =
	"Atlas kept a skill. You can read it, and undo it, in its History."

const QUOTED_BOT = {
	author: "Skippy",
	excerpt: ANSWER,
	from: "assistant",
	onJump: jumpToQuoted,
} as const

const jumpToExcerpt = fn()

const jumpToWhole = fn()

const QUOTED_EXCERPT = {
	author: "Atlas",
	excerpt: "`@workspace/ui` holds the design system",
	isExcerpt: true,
	from: "assistant",
	onJump: jumpToExcerpt,
} as const

const QUOTED_WHOLE = {
	author: "Skippy",
	excerpt: KEPT_SKILL,
	from: "assistant",
	onJump: jumpToWhole,
} as const

const rightClickOn = async (target: HTMLElement) => {
	const bounds = target.getBoundingClientRect()
	const coords = { clientX: bounds.left + 8, clientY: bounds.top + 8 }

	fireEvent.pointerDown(target, { button: 2, ...coords })
	const defaulted = fireEvent.contextMenu(target, coords)

	return { defaulted }
}

const openTurnMenu = async (target: HTMLElement) => {
	await rightClickOn(target)
	return shown(await screen.findByRole("menu", { name: "Message actions" }))
}

const PASTED = `Walk me through every package.\n\nStart with the design system, then the Tauri shell, and call out anything that crosses between them.`

const LEAD: MessageAuthor = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
	isLead: true,
}

const SECOND: MessageAuthor = {
	id: "bot-basile",
	name: "Basile",
	blot: BLOT_HUES.purple,
}

const GONE: MessageAuthor = {
	id: "bot-elia",
	name: "Elia",
	isDeleted: true,
}

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: BLOT_HUES.blue,
}

const NO_SPACES: Space[] = []

const NO_MEMBERSHIPS: string[] = []

const NO_SECTIONS: RosterMenuSection[] = []

const stopTurn = fn()

const PARTIAL = ANSWER.slice(0, 48)

const TESTS =
	"Beside what they test: Vitest drives the stories in `@workspace/ui`, and `cargo test` covers the Tauri host."

const RENDERED_BY_THE_THREAD =
	"`apps/app/src/components/thread-turn.tsx:98` renders the companion row of every transcript, from the row `apps/app/src/lib/chat/screen-model.ts:101` publishes."

const CAUSED_BY_THE_RUN =
	"`apps/app/src/components/thread-screen.tsx:637` passes the cause of the run, from the reported runs and the mission summons the thread holds."

const sentOn = (day: number, hours: number, minutes: number) =>
	new Date(2026, 9, day, hours, minutes).getTime()

const READ_ON = sentOn(10, 9, 30)

const timesIn = (root: HTMLElement) =>
	Array.from(root.querySelectorAll<HTMLTimeElement>("time"))

const meta = preview.meta({
	title: "Conversation/Message/Turn",
	component: AssistantTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The transcript rows. Every message is one bubble, radius 16 and padding 18 on every side, with its author line at the foot, 6 below the words. An agent sits on the start side up to 580 wide; another person and you sit on the end side up to 480 wide, your bubble in the Space colour. The author line carries the avatar, the name (in the agent colour for an agent), the role badge of an agent and the send time. Hovering a bubble or focusing it raises its fill from white 5 to 8 percent with no transition and shows Pin, Reply and Copy in the author line; a right click opens the same three in a menu. `state` ends an answer: `cancelled` appends Stopped, `failed` appends This response failed and a Retry when `onRetry` is given. `work` swaps the author line for the work line at the same height while the agent answers. A `UserTurn` that did not send draws a dimmed bubble with the reason and a Retry under it; a `queued` one swaps its author line for the Waiting to be sent chip. `repliedTo` draws one card per replied message inside the bubble, in order, above the words: a passage inside curly quotes, a whole message bare. `cause` names the routine or mission that opened the answer above its bubble. Neither scrolls nor animates the list: that belongs to the transcript around them.",
			},
		},
	},
	args: { children: ANSWER, state: "complete", copyText: ANSWER },
})

export const Default = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText="How is this workspace laid out?">
				How is this workspace laid out?
			</UserTurn>
			<AssistantTurn copyText={ANSWER} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal exchange: a prompt that landed and an answer that finished. Check that your prompt sits on the end side in the Space colour and the answer on the start side, each with its author line at the foot. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("user message")).toBeVisible()
		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
	},
})

export const LongContent = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={PASTED}>{PASTED}</UserTurn>
			<AssistantTurn copyText={`${ANSWER}\n\n${ANSWER}`} identity={BOT}>
				{`${ANSWER}\n\n${ANSWER}`}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the two multi-line paths: a pasted prompt keeps its blank lines in one bubble, and an answer handed more than one paragraph still renders them verbatim. Check that the answer stops widening at 580 and the prompt at 480. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
})

export const Menu = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} onReply={reply} onPin={pin}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn
				copyText={ANSWER}
				identity={BOT}
				onReply={reply}
				pinned
				onPin={pin}
			>
				{ANSWER}
			</AssistantTurn>
			<AssistantTurn identity={BOT}>{TESTS}</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same actions the hover row offers, reached by right-clicking the bubble instead of hunting for a button: reply, copy, then pin, each carrying the icon and the label its button carries, so a pinned row says `Unpin` in both places. No row here is given a save handler, so the menu draws no separator and no Save as document entry. A row is handed only the actions it was given a handler for, and the last row here, given none at all, keeps the browser's own menu rather than drawing an empty one. Check that the menu grows out of the pointer, that choosing a row reports it and closes, and that right-clicking a second bubble hands the menu over rather than leaving two open. The bubble stays selectable under the menu, because a reader copies a passage of an answer far more often than they right-click it; the registry trigger's own `select-none` is overridden here and only comes back on a coarse pointer, where a drag is a scroll and a long press is the way in. That coarse branch is a media query the runner cannot emulate, so the play reads the rule rather than the effect. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		reply.mockClear()

		const surface = slotIn(canvasElement, "message-actions")

		await expect(getComputedStyle(surface).userSelect).toBe("text")
		await expect(surface.className).toContain("pointer-coarse:select-none")

		const menu = await openTurnMenu(canvas.getByText(QUESTION))
		const items = within(menu).getAllByRole("menuitem")

		await expect(items.map((item) => item.textContent)).toEqual([
			"Reply",
			"Copy",
			"Pin",
		])
		await expect(within(menu).queryByRole("separator")).toBeNull()

		const pinned = await openTurnMenu(canvas.getByText(ANSWER))

		await expect(screen.getAllByRole("menu")).toHaveLength(1)
		await expect(
			within(pinned).getByRole("menuitem", { name: "Unpin" }),
		).toBeVisible()

		await userEvent.click(
			within(pinned).getByRole("menuitem", { name: "Reply" }),
		)
		await expect(reply).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		const { defaulted } = await rightClickOn(canvas.getByText(TESTS))

		await expect(defaulted).toBe(true)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

export const MenuWithSaveAsDocument = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				copyText={ANSWER}
				identity={BOT}
				onReply={reply}
				onPin={pin}
				onSaveAsDocument={saveAsDocument}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The message menu of a turn the app can save: reply, copy and pin, then a separator, then Save as document with the file glyph, the last row. The hover row under the answer keeps its pin, reply and copy buttons and gains no save button. Check that the entry reads in the same type and icon size as the rows above it, in the light and the dark theme, and that choosing it reports the save once and closes the menu. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		saveAsDocument.mockClear()

		const menu = await openTurnMenu(canvas.getByText(ANSWER))
		const items = within(menu).getAllByRole("menuitem")

		await expect(items.map((item) => item.textContent)).toEqual([
			"Reply",
			"Copy",
			"Pin",
			"Save as document",
		])
		const separators = within(menu).getAllByRole("separator")

		await expect(separators).toHaveLength(1)
		await expect(separators[0]?.nextElementSibling).toBe(items.at(-1))
		await expect(
			canvas.queryByRole("button", { name: "Save as document" }),
		).toBeNull()

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Save as document" }),
		)
		await expect(saveAsDocument).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

const SCHEDULED_CAUSE: TurnCause = {
	routineTitle: "Morning release digest",
	triggerSourceId: "schedule",
}

const UNNAMED_CAUSE: TurnCause = {
	routineTitle: "Inbox sweep",
	triggerSourceId: "matrix-poll",
}

const SUMMONS_CAUSE: TurnCause = {
	routineTitle: "Opened by the mission",
	triggerSourceId: "mission",
	kind: "mission",
}

const REPORT =
	"Three pull requests landed overnight and the migration is green on a fresh database."

export const ReportedByUnnamedTrigger = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A routine fired by a trigger this design system names no icon for — any plugin may declare its own, so an unknown id is the ordinary case and never an error. The line falls back to a bell and writes the routine title exactly as it was handed over. Check that the row reads the same as the scheduled one, one icon apart. " +
					CAUSED_BY_THE_RUN,
			},
		},
	},
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn author={LEAD} cause={UNNAMED_CAUSE} copyText={REPORT}>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const cause = slotIn(canvasElement, "turn-cause")

		await expect(glyphIn(cause, Icons.Bell)).toBeVisible()
		await expect(slotIn(cause, "turn-cause-title")).toHaveTextContent(
			UNNAMED_CAUSE.routineTitle,
		)
		await expect(slotsIn(canvasElement, "message-author")).toHaveLength(0)
	},
})

export const SummonedByMission = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A run a mission opened, not a routine. The line reads exactly like a routine report, and only the word a screen reader hears before the title changes: a mission summons, never a routine report. Check that the announcement names the mission and that the run still loses its name line. " +
					CAUSED_BY_THE_RUN,
			},
		},
	},
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn author={LEAD} cause={SUMMONS_CAUSE} copyText={REPORT}>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const cause = slotIn(canvasElement, "turn-cause")

		await expect(cause).toHaveTextContent("Mission summons")
		await expect(cause).not.toHaveTextContent("Routine report")
		await expect(slotIn(cause, "turn-cause-title")).toHaveTextContent(
			SUMMONS_CAUSE.routineTitle,
		)
		await expect(slotsIn(canvasElement, "message-author")).toHaveLength(0)
	},
})

export const FootnotedSqueezed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same note in a container squeezed to 320 pixels. Check that it wraps inside the content column instead of widening the row, that every line still starts where the bubble does, and that nothing scrolls sideways. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<div className="w-[320px] px-6">
			<AssistantTurn copyText={ANSWER} footer={KEPT_SKILL} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const note = slotIn(canvasElement, "message-footer")
		const bubble = slotIn(canvasElement, "message-bubble")
		const column = slotIn(canvasElement, "message").parentElement as HTMLElement

		await expect(note.getBoundingClientRect().height).toBeGreaterThan(
			lineHeightOf(note),
		)
		await expect(note.getBoundingClientRect().left).toBeCloseTo(
			bubble.getBoundingClientRect().left,
			0,
		)
		await expect(note.getBoundingClientRect().right).toBeLessThanOrEqual(
			column.getBoundingClientRect().right,
		)
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

const editCompanion = fn()

const deleteCompanion = fn()

const COMPANION_MENU_LABEL = `Actions for ${BOT.name}`

const companionMenuFor = (companionId: string) =>
	companionId === BOT.id ? (
		<CompanionMenuContent
			companion={{ id: BOT.id, name: BOT.name }}
			isPinned={false}
			memberships={NO_MEMBERSHIPS}
			onDelete={deleteCompanion}
			onEdit={editCompanion}
			sections={NO_SECTIONS}
			spaces={NO_SPACES}
		/>
	) : null

const GutterTurn = ({ identity }: { identity: RosterBot }) => (
	<div className="mx-auto max-w-2xl">
		<AssistantTurn copyText={ANSWER} identity={identity} onReply={reply}>
			{ANSWER}
		</AssistantTurn>
	</div>
)

const selectCompanion = fn()

const PICTURED_BOT: RosterBot = { ...BOT, image: UPLOADED_AVATAR_IMAGE }

const SELECT_NOT_YET_RENDERED =
	"No screen mounts `CompanionSelectProvider` yet: the thread hands it the select in OPE-328, so the story stays out of the sidebar until then."

const SelectableGutters = () => (
	<CompanionSelectProvider onSelect={selectCompanion}>
		<div className="flex flex-col gap-6">
			<GutterTurn identity={BOT} />
			<GutterTurn identity={PICTURED_BOT} />
		</div>
	</CompanionSelectProvider>
)

const gutterSelects = (canvas: ReturnType<typeof within>) =>
	canvas.getAllByRole("button", { name: BOT.name })

const REMOVED_HOVER_RING_CLASSES = [
	"hover:ring-2",
	"hover:ring-muted-foreground",
	"hover:ring-offset-2",
	"hover:ring-offset-background",
]

export const AuthorWithCustomImage = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn copyText={ANSWER} identity={PICTURED_BOT}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An answer from an agent wearing a custom picture. The author line sits inside the bubble's typeset, which spaces every image of the message: the avatar stays out of it. Check that the picture fills its 20px hexagon exactly under the border, with nothing below it. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = slotsIn(canvasElement, "bot-identity-avatar")
		await expectPictureUnderBorder(avatar)
	},
})

export const CompanionSelectOnGutterHovered = meta.story({
	tags: ["test-only"],
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		pseudo: { hover: true },
		docs: {
			description: {
				story: `The two gutter avatars with the pointer resting on them, in both themes at once, drawn by the pseudo-state addon. The select dims its target instead of ringing it: the stop veils the face because pressing it ends work, while the select only opens the companion, so it lowers the avatar to 70 percent opacity and leaves the face in view. Check by eye in the light and the dark theme that the blot and the picture read as dimmed by the same amount, with no ring and no shadow around either, and that each stays recognizable against the page background. The play asserts the computed shadow, the hover class and that nothing transitions, and reads no computed opacity: the vitest runner draws the hover before the play, but the sidebar draws it only once the play has run. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableGutters />,
	play: async ({ canvas }) => {
		const buttons = gutterSelects(canvas)

		await expect(buttons).toHaveLength(4)
		for (const button of buttons) {
			await expect(getComputedStyle(button).boxShadow).toBe("none")
			await expect(button).toHaveClass("hover:not-focus-visible:opacity-70")
			await expect(animatedTransitionsOf(button)).toEqual([])
			for (const ringClass of REMOVED_HOVER_RING_CLASSES)
				await expect(button).not.toHaveClass(ringClass)
		}
	},
})

export const CompanionSelectFromGutter = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The gutter avatar under both a select and a companion menu. Check that a click, Enter and Space each report the companion id once, and that a right-click still opens the companion menu without reporting a select. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => (
		<CompanionSelectProvider onSelect={selectCompanion}>
			<CompanionMenuProvider menuFor={companionMenuFor}>
				<GutterTurn identity={BOT} />
			</CompanionMenuProvider>
		</CompanionSelectProvider>
	),
	play: async ({ canvas, userEvent }) => {
		selectCompanion.mockClear()
		const button = canvas.getByRole("button", { name: BOT.name })

		await userEvent.click(button)
		await expect(selectCompanion).toHaveBeenCalledTimes(1)
		await expect(selectCompanion).toHaveBeenLastCalledWith(
			BOT.id,
			NO_CLICK_MODIFIERS,
		)

		button.focus()
		await userEvent.keyboard("{Enter}")
		await expect(selectCompanion).toHaveBeenCalledTimes(2)
		await userEvent.keyboard(" ")
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
		await expect(selectCompanion).toHaveBeenLastCalledWith(
			BOT.id,
			NO_CLICK_MODIFIERS,
		)

		await rightClickOn(button)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
	},
})

export const CompanionSelectWithClickModifiers = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The gutter avatar under a select and a companion menu, clicked every way a host can tell apart. Check that a middle click reports the companion once with middle and the keys held, keeps the browser from starting its autoscroll, that a Cmd, Ctrl or Shift click reports that key alone, that a plain click and Enter report no key, and that a right-click opens the companion menu and selects nothing. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => (
		<CompanionSelectProvider onSelect={selectCompanion}>
			<CompanionMenuProvider menuFor={companionMenuFor}>
				<GutterTurn identity={BOT} />
			</CompanionMenuProvider>
		</CompanionSelectProvider>
	),
	play: async ({ canvas, userEvent }) => {
		await expectClickModifiers({
			target: canvas.getByRole("button", { name: BOT.name }),
			callback: selectCompanion,
			reported: [BOT.id],
			userEvent,
		})
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await userEvent.keyboard("{Escape}")
	},
})

const TimeFollowsNowHarness = () => {
	const [now, setNow] = useState(READ_ON)

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={READ_ON}
				now={now}
			>
				{ANSWER}
			</AssistantTurn>
			<Button onClick={() => setNow(now + 60_000)}>One minute later</Button>
			<Button onClick={() => setNow(now + 86_400_000)}>One day later</Button>
		</div>
	)
}

export const TimeFollowsNow = meta.story({
	tags: ["test-only"],
	render: () => <TimeFollowsNowHarness />,
	play: async ({ canvas, userEvent }) => {
		const article = canvas.getByLabelText("assistant message")

		await expect(timesIn(article)[0]).toHaveTextContent("Now")
		await userEvent.click(
			canvas.getByRole("button", { name: "One minute later" }),
		)
		await expect(timesIn(article)[0]).toHaveTextContent("1 minute ago")
		await userEvent.click(canvas.getByRole("button", { name: "One day later" }))
		await expect(canvas.getByLabelText("assistant message")).toBe(article)
		await expect(timesIn(article)[0]).toHaveTextContent("Yesterday")
	},
})

const LATE_QUESTION = "Can you check the migration before tomorrow?"

const LATE_ANSWER = "On it. I will run it against a fresh database."

const MORNING_ANSWER = "The migration is green on a fresh database."

export const ThreadCrossingADay = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<DaySeparator at={sentOn(9, 23, 48)} now={READ_ON} />
			<UserTurn
				copyText={LATE_QUESTION}
				sentAt={sentOn(9, 23, 48)}
				now={READ_ON}
			>
				{LATE_QUESTION}
			</UserTurn>
			<AssistantTurn
				author={SECOND}
				copyText={LATE_ANSWER}
				sentAt={sentOn(9, 23, 52)}
				now={READ_ON}
			>
				{LATE_ANSWER}
			</AssistantTurn>
			<DaySeparator at={sentOn(10, 0, 3)} now={READ_ON} />
			<AssistantTurn
				author={SECOND}
				copyText={MORNING_ANSWER}
				sentAt={sentOn(10, 0, 3)}
				now={READ_ON}
			>
				{MORNING_ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a conversation that runs past midnight. Check that one day line opens the thread, that exactly one more sits where the calendar day changes, and that the companion who answered on both sides of it is named again after it, as a new run.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const separators = slotsIn(canvasElement, "day-separator")
		const [yesterday, today] = separators
		const late = canvas.getByText(LATE_ANSWER)
		const morning = canvas.getByText(MORNING_ANSWER)

		await expect(separators).toHaveLength(2)
		await expect(yesterday).toHaveTextContent("Yesterday")
		await expect(today).toHaveTextContent("Today")
		await expect(
			yesterday.compareDocumentPosition(late) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			late.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			today.compareDocumentPosition(morning) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(canvas.getAllByText(SECOND.name)).toHaveLength(2)
		await expect(canvas.queryAllByRole("separator")).toHaveLength(0)
		await expect(
			timesIn(canvasElement).map((time) => time.textContent),
		).toEqual(["Yesterday", "Yesterday", "9 hours ago"])
	},
})

const PERSON_LINE = "Fieldnote went up in October, I think that page is old."

const ROLE_BOT: MessageAuthor = { ...LEAD, isLead: false, title: "Planner" }

const NOT_SENT = "The dinner, please. Book it for 20:00."

const retryTurn = fn()

const pxOf = (value: string) => Number.parseFloat(value)

const bubbleOf = (canvasElement: HTMLElement, text: string) => {
	const bubble = within(canvasElement)
		.getByText(text)
		.closest<HTMLElement>("[data-slot='message-bubble-content']")
	if (!bubble) throw new globalThis.Error(`No bubble holds ${text}`)
	return bubble
}

export const Speakers = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn
				author={ROLE_BOT}
				copyText={REPORT}
				sentAt={sentOn(10, 9, 20)}
				now={READ_ON}
			>
				{REPORT}
			</AssistantTurn>
			<PersonTurn
				name="Tom"
				copyText={PERSON_LINE}
				sentAt={sentOn(10, 9, 22)}
				now={READ_ON}
			>
				{PERSON_LINE}
			</PersonTurn>
			<UserTurn copyText={QUESTION} sentAt={sentOn(10, 9, 25)} now={READ_ON}>
				{QUESTION}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the anatomy every speaker shares. Check that each bubble has radius 16 and padding 18 on every side, its author line 20 high at the foot, the agent on the start side under 580 wide with its role badge, Tom and you on the end side under 480 wide with the author line aligned to the end.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const lines = slotsIn(canvasElement, "author-line")
		await expect(lines.map((line) => line.dataset.tone)).toEqual([
			"agent",
			"person",
			"you",
		])
		for (const line of lines)
			await expect(line.getBoundingClientRect().height).toBe(20)

		const agent = bubbleOf(canvasElement, REPORT)
		const style = getComputedStyle(agent)
		await expect([
			style.paddingTop,
			style.paddingInlineStart,
			style.paddingBottom,
		]).toEqual(["18px", "18px", "18px"])
		await expect(style.borderTopLeftRadius).toBe("16px")
		await expect(agent.getBoundingClientRect().width).toBeLessThanOrEqual(580)

		const own = bubbleOf(canvasElement, QUESTION)
		const person = bubbleOf(canvasElement, PERSON_LINE)
		await expect(own.getBoundingClientRect().right).toBe(
			person.getBoundingClientRect().right,
		)
		await expect(person.getBoundingClientRect().width).toBeLessThanOrEqual(480)
		await expect(
			slotIn(slotIn(canvasElement, "author-line"), "bot-title-badge"),
		).toHaveTextContent("Planner")
		await expect(
			pxOf(
				getComputedStyle(slotsIn(canvasElement, "message-bubble-text")[0])
					.fontSize,
			),
		).toBe(14)
	},
})

const PersonWithCustomImageTurn = () => (
	<div className="mx-auto max-w-170">
		<PersonTurn
			name="Tom"
			image={UPLOADED_AVATAR_IMAGE}
			copyText={PERSON_LINE}
			sentAt={sentOn(10, 9, 22)}
			now={READ_ON}
		>
			{PERSON_LINE}
		</PersonTurn>
	</div>
)

const expectPersonPictureInItsCircle = async (canvasElement: HTMLElement) => {
	const [avatar] = slotsIn(canvasElement, "user-avatar")
	const picture = await pictureOf(avatar)

	await expect(boxOf(picture)).toEqual(boxOf(avatar))
}

export const PersonWithCustomImage = meta.story({
	globals: { theme: "light" },
	render: () => <PersonWithCustomImageTurn />,
	parameters: {
		docs: {
			description: {
				story:
					"A person wearing an uploaded picture, speaking in a message. The author line sits inside the bubble's typeset, whose media rule spaces only the message's own images: the avatar picture stays out of it. Check that the picture fills its 20px circle exactly, centred, with no gap above and nothing spilling below. Pick `PersonWithCustomImageDark` for the dark theme. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: ({ canvasElement }) => expectPersonPictureInItsCircle(canvasElement),
})

export const PersonWithCustomImageDark = meta.story({
	globals: { theme: "dark" },
	render: () => <PersonWithCustomImageTurn />,
	parameters: {
		docs: {
			description: {
				story:
					"The same person and picture in the dark theme: the picture still fills its circle exactly, with no image outline drawn around it on the dark bubble. Pick `PersonWithCustomImage` for the light theme. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: ({ canvasElement }) => expectPersonPictureInItsCircle(canvasElement),
})

export const HoverActions = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn
				author={ROLE_BOT}
				copyText={REPORT}
				onPin={pin}
				onReply={reply}
				sentAt={sentOn(10, 9, 20)}
				now={READ_ON}
			>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check what a bubble offers once pointed at or focused. Check that the actions are absent at rest, that keyboard focus on the bubble draws a 2 px ring offset by 2 and shows Pin, Reply and Copy after a divider in the author line, and that the fill steps from white 5 to white 8 percent with no transition.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		pin.mockClear()
		reply.mockClear()
		await expect(canvas.queryByRole("button", { name: "Reply" })).toBeNull()

		const bubble = bubbleOf(canvasElement, REPORT)
		await userEvent.tab()
		await expect(bubble).toHaveFocus()
		await expect(getComputedStyle(bubble).outlineWidth).toBe("2px")
		await expect(getComputedStyle(bubble).outlineOffset).toBe("2px")

		const surface = bubble.querySelector<HTMLElement>("[aria-hidden='true']")
		if (!surface) throw new globalThis.Error("No bubble surface")
		await expect(getComputedStyle(surface).transitionDuration).toBe("0s")

		await userEvent.click(canvas.getByRole("button", { name: "Reply" }))
		await expect(reply).toHaveBeenCalledTimes(1)
		await userEvent.click(canvas.getByRole("button", { name: "Pin" }))
		await expect(pin).toHaveBeenCalledTimes(1)
		await expect(canvas.getByRole("button", { name: "Copy" })).toBeVisible()
	},
})

export const Endings = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn author={ROLE_BOT} sentAt={sentOn(10, 9, 41)} now={READ_ON}>
				{REPORT}
			</AssistantTurn>
			<AssistantTurn
				author={ROLE_BOT}
				state="cancelled"
				sentAt={sentOn(10, 9, 41)}
				now={READ_ON}
			>
				{PARTIAL}
			</AssistantTurn>
			<AssistantTurn
				author={ROLE_BOT}
				state="failed"
				onRetry={retryTurn}
				sentAt={sentOn(10, 9, 41)}
				now={READ_ON}
			>
				{PARTIAL}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the three ways an answer ends. Check that a finished answer shows its time, a stopped one adds a divider and Stopped after the time, and a failed one drops the time for This response failed and a Retry button 22 high.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		retryTurn.mockClear()
		await expect(
			slotIn(canvasElement, "author-line-stopped"),
		).toHaveTextContent("Stopped")
		await expect(slotIn(canvasElement, "author-line-failed")).toHaveTextContent(
			"This response failed",
		)
		const retry = canvas.getByRole("button", { name: "Retry" })
		await expect(retry.getBoundingClientRect().height).toBe(22)
		await userEvent.click(retry)
		await expect(retryTurn).toHaveBeenCalledTimes(1)
	},
})

export const Working = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn
				author={ROLE_BOT}
				state="streaming"
				work={
					<ActivityIndicator
						kind="writing"
						name={ROLE_BOT.name}
						blot={ROLE_BOT.blot}
						seed={ROLE_BOT.id}
						elapsedSeconds={14}
						stoppable
						onStop={stopTurn}
					/>
				}
			>
				{PARTIAL}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while an agent writes its answer. Check that the work line takes the author line's slot at the same 20 height, with the agent name, is writing… and the elapsed time, and that its avatar slot holds a Stop control named Stop Atlas.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotsIn(canvasElement, "author-line")).toHaveLength(0)
		const work = slotIn(canvasElement, "bot-working")
		await expect(work.getBoundingClientRect().height).toBe(20)
		await expect(
			canvas.getByRole("button", { name: "Stop Atlas" }),
		).toBeInTheDocument()
	},
})

export const Quoted = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<UserTurn copyText={QUESTION} repliedTo={[QUOTED_BOT]}>
				{QUESTION}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a reply. Check that the quoted message sits inside the bubble as a card, padding 8 and radius 10, one line of excerpt, 8 above the words, and that pressing it jumps to the quoted message.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		jumpToQuoted.mockClear()
		const card = canvas.getByRole("button", { name: /^Skippy: / })
		await expect(getComputedStyle(card).paddingTop).toBe("8px")
		await expect(getComputedStyle(card).borderTopLeftRadius).toBe("10px")
		await userEvent.click(card)
		await expect(jumpToQuoted).toHaveBeenCalledTimes(1)
	},
})

export const RepliesToTwo = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<UserTurn copyText={QUESTION} repliedTo={[QUOTED_EXCERPT, QUOTED_WHOLE]}>
				{QUESTION}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5 of Selection and Reply: a message sent in reply to a passage of one message and to the whole of another. Check that one card stands per replied message, in the order they were replied to, 4 apart and 8 above the words, that the passage shows inside curly quotes while the whole message shows bare, and that pressing a card jumps to its own message. `Quoted` covers a single reply.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		jumpToExcerpt.mockClear()
		jumpToWhole.mockClear()
		const [excerpt, whole] = canvas.getAllByRole("button", {
			name: /^(Atlas|Skippy): /,
		})
		await expect(excerpt).toHaveAccessibleName(
			`Atlas: “${QUOTED_EXCERPT.excerpt}”`,
		)
		await expect(excerpt).toHaveTextContent(`“${QUOTED_EXCERPT.excerpt}”`)
		await expect(whole).toHaveAccessibleName(`Skippy: ${KEPT_SKILL}`)
		await expect(
			whole.getBoundingClientRect().top -
				excerpt.getBoundingClientRect().bottom,
		).toBe(4)
		await expect(
			canvas.getByText(QUESTION).getBoundingClientRect().top -
				whole.getBoundingClientRect().bottom,
		).toBe(8)

		await userEvent.click(whole)
		await expect(jumpToWhole).toHaveBeenCalledOnce()
		await expect(jumpToExcerpt).not.toHaveBeenCalled()
		await userEvent.click(excerpt)
		await expect(jumpToExcerpt).toHaveBeenCalledOnce()
	},
})

export const DeletedAuthor = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn author={GONE} sentAt={sentOn(9, 14, 2)} now={READ_ON}>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for an answer whose agent was deleted since. Check that the author line keeps the name in the muted colour instead of an agent colour.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "author-line")).toHaveAttribute(
			"data-tone",
			"deleted",
		)
	},
})

export const ReportedByRoutine = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<AssistantTurn author={ROLE_BOT} cause={SCHEDULED_CAUSE}>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for an answer a routine opened rather than a message. Check that the routine title sits above the bubble and the author line still names the agent at the foot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "turn-cause-title")).toHaveTextContent(
			SCHEDULED_CAUSE.routineTitle,
		)
		await expect(slotIn(canvasElement, "author-line")).toBeInTheDocument()
	},
})

export const NotSent = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<UserTurn
				state="failed"
				failureReason="The connection dropped."
				onRetry={retryTurn}
				sentAt={sentOn(10, 14, 31)}
				now={READ_ON}
			>
				{NOT_SENT}
			</UserTurn>
		</div>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Reach for this for a message of yours that never left. Check that the bubble is dimmed, that under it on the end side an alert icon reads Not sent. The connection dropped. in the error colour, and that Retry sends it again.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		retryTurn.mockClear()
		await expect(slotIn(canvasElement, "turn-not-sent")).toHaveTextContent(
			"Not sent. The connection dropped.",
		)
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(retryTurn).toHaveBeenCalledTimes(1)
	},
})

export const Queued = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-170 flex-col gap-3">
			<UserTurn state="queued" onCancel={cancelQueued}>
				{QUEUED}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message written while an agent still answers. Check that its author line is the Waiting to be sent chip, 28 high, and that its close button cancels the message.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		cancelQueued.mockClear()
		const chip = slotIn(canvasElement, "author-line-queued")
		await expect(chip.getBoundingClientRect().height).toBe(28)
		await userEvent.click(
			canvas.getByRole("button", { name: "Cancel this message" }),
		)
		await expect(cancelQueued).toHaveBeenCalledTimes(1)
	},
})
