import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	expectCompanionPictureShape,
	glyphIn,
	isInBrowserRunner,
	lineHeightOf,
	realPointer,
	shown,
	slotIn,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import {
	CompanionMenuContent,
	CompanionMenuProvider,
} from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import { Icons } from "@workspace/ui/components/icons"
import { MarkProvider } from "@workspace/ui/components/mark-context"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import type { RosterMenuSection } from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import { HOVER_INTENT_DELAY_MS } from "@workspace/ui/components/tooltip-hint"
import {
	AssistantTurn,
	PersonTurn,
	TURN_AVATAR_SIZE,
	type TurnCause,
	TurnGroup,
	type TurnState,
	UserTurn,
} from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line in the other direction."

const RUN = [
	"Two packages, and the line between them only runs one way.",
	"`@workspace/ui` holds the design system: primitives, tokens and the stories that document them.",
	"`app` holds the Tauri shell and consumes that system. Nothing goes back the other way.",
]

const QUEUED = "And then run the test suite once that lands."

const cancelQueued = fn()

const reply = fn()

const pin = fn()

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

const QUOTED_READER = {
	author: "You",
	excerpt: QUESTION,
	from: "user",
	onJump: jumpToQuoted,
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

const TABLE_INTRO = "Here is what each chapter covers."

const TABLE = `| § | Subject |
| --- | --- |
| 1–2 | The right mental model |
| 3 | Context as a scarce resource |
| 4–5 | Framing a request, writing a ticket |`

const LEAD: MessageAuthor = {
	id: "bot-atlas",
	name: "Atlas",
	blot: "blue",
	isLead: true,
}

const SECOND: MessageAuthor = {
	id: "bot-basile",
	name: "Basile",
	blot: "purple",
}

const GONE: MessageAuthor = {
	id: "bot-elia",
	name: "Elia",
	isDeleted: true,
}

const ROOM: RosterBot[] = [LEAD, SECOND]

const RELEASE_MANAGER = "Release manager"

const TITLED_ROOM: { author: MessageAuthor; message: string }[] = [
	{
		author: { ...LEAD, title: "Ops" },
		message: "The release notes are ready to read.",
	},
	{
		author: SECOND,
		message: "The migration is green on a fresh database.",
	},
	{
		author: {
			id: "bot-elia",
			name: "Elia of the Migration and Release Desk",
			title: RELEASE_MANAGER,
		},
		message: "I am holding the tag until both of you sign off.",
	},
	{
		author: {
			id: "bot-nyx",
			name: "Nyx",
			title: "Release manager for the whole platform",
		},
		message: "I will publish once the tag is cut.",
	},
]

const DELETED_TITLED: MessageAuthor = {
	...GONE,
	title: RELEASE_MANAGER,
}

const firstCharacterLeft = (element: HTMLElement) =>
	element.getBoundingClientRect().left +
	Number.parseFloat(getComputedStyle(element).paddingInlineStart)

const LEAD_RUN = [
	"I have the release notes. The migration is not mine.",
	"<@bot-basile> owns that script, and <@bot-elia> wrote the fixture it reads.",
]

const SECOND_REPLY =
	"Taken. The migration is green on a fresh database, so <@bot-atlas> can publish."

const MENTION_OPENING = "<@bot-basile> has the fixture."

const WORD_OPENING = "Basile has the fixture."

const GONE_REPLY =
	"The fixture still names the old columns. Somebody will have to rewrite it."

const TURN_STATES: TurnState[] = [
	"streaming",
	"complete",
	"cancelled",
	"failed",
]

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: "blue",
}

const NO_SPACES: Space[] = []

const NO_MEMBERSHIPS: string[] = []

const NO_SECTIONS: RosterMenuSection[] = []

const stopTurn = fn()

const PICTURED: MessageAuthor = { ...LEAD, image: UPLOADED_AVATAR_IMAGE }

const PARTIAL = ANSWER.slice(0, 48)

const MARKED_BOT_ID = "bot-lyra"

const MARKED_FACE: RosterBot = {
	id: MARKED_BOT_ID,
	name: "Lyra",
	blot: "purple",
}

const bubbleStyleOf = (node: Element) => {
	const bubble = node.closest<HTMLElement>(
		'[data-slot="message-bubble-content"]',
	)
	if (!bubble) throw new globalThis.Error("This node sits in no bubble")
	return getComputedStyle(bubble)
}

const MarkHandoff = () => {
	const [delivered, setDelivered] = useState(false)

	return (
		<MarkProvider>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => setDelivered(!delivered)}
				>
					{delivered ? "Rewind to working" : "Land the turn"}
				</Button>
				<UserTurn>How is this workspace laid out?</UserTurn>
				{delivered ? (
					<AssistantTurn
						botId={MARKED_BOT_ID}
						identity={MARKED_FACE}
						carriesMark
						copyText={ANSWER}
					>
						{ANSWER}
					</AssistantTurn>
				) : (
					<ActivityIndicator botId={MARKED_BOT_ID} kind="thinking" />
				)}
			</div>
		</MarkProvider>
	)
}

const TESTS =
	"Beside what they test: Vitest drives the stories in `@workspace/ui`, and `cargo test` covers the Tauri host."

const MarkedHistory = () => {
	const [working, setWorking] = useState(false)

	return (
		<MarkProvider>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => setWorking(!working)}
				>
					{working ? "Land the turn" : "Start a new turn"}
				</Button>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<TurnGroup>
					<AssistantTurn
						botId={MARKED_BOT_ID}
						identity={MARKED_FACE}
						copyText={ANSWER}
					>
						{ANSWER}
					</AssistantTurn>
				</TurnGroup>
				<UserTurn>And where do the tests live?</UserTurn>
				<TurnGroup carriesMark>
					<AssistantTurn
						identity={working ? undefined : MARKED_FACE}
						botId={MARKED_BOT_ID}
						copyText={TESTS}
					>
						{TESTS}
					</AssistantTurn>
				</TurnGroup>
				{working ? (
					<ActivityIndicator botId={MARKED_BOT_ID} kind="thinking" />
				) : null}
			</div>
		</MarkProvider>
	)
}

const RENDERED_BY_THE_THREAD =
	"`apps/app/src/components/thread-turn.tsx:98` renders the companion row of every transcript, from the row `apps/app/src/lib/chat/screen-model.ts:101` publishes."

const STOPPED_FROM_THE_WORKING_ROW =
	"`apps/app/src/components/thread-screen.tsx:1045` hands the stop of a seated companion to its working row alone, and `apps/app/src/components/thread-turn.tsx:97` hands its bubbles none, so a bubble gutter draws the same avatar whether its companion is working or idle."

const CAUSED_BY_THE_RUN =
	"`apps/app/src/components/thread-screen.tsx:637` passes the cause of the run, from the reported runs and the mission summons the thread holds."

const PERSON = "Ada Moreau"

const PERSON_RUN = [
	"I read the diff on my side.",
	"The token rename looks safe to me.",
	"Ship it once the stories are green.",
]

const expectPersonTurn = async (article: HTMLElement) => {
	const avatar = slotIn(article, "user-avatar")
	const { width } = avatar.getBoundingClientRect()
	const radius = Number.parseFloat(getComputedStyle(avatar).borderTopLeftRadius)

	await expect(width).toBe(TURN_AVATAR_SIZE)
	await expect(radius).toBeGreaterThanOrEqual(width / 2)
	await expect(botIdentityAvatars(article)).toHaveLength(0)
	for (const bubble of slotsIn(article, "message-bubble")) {
		await expect(bubble).toHaveAttribute("data-variant", "soft")
	}
}

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
					"The transcript rows, one anatomy for every speaker but the reader. Every other row reads from the same left edge: a 40px gutter, then a header line above the bubble on the row that opens a run, and nothing under the bubble but a state line. The avatar sits in the gutter of the row that closes a run, its bottom edge level with that row's bubble, so a single row carries both the header above its bubble and the avatar beside it. `sentAt` with `now` writes the send time after the name on that header line, how long ago today, Yesterday, then calendar days, with the full date on hover or keyboard focus of the time; a row inside a run shows its own hours and minutes in the gutter while the pointer rests on it, and a row without `sentAt` draws no time at all. `UserTurn` is a bubble that can offer a retry when the prompt never reached the agent, and that holds the wait for a prompt written while another turn runs — `queued` draws it a step back from a sent prompt, with its own way out; `AssistantTurn` is the companion's bubble, with the companion's avatar in the gutter. The reader's own row is the exception: `UserTurn` sits against the right edge with no avatar and no name, its send time above the bubble on the row that opens a run and beside it on hover inside one, while `PersonTurn` draws another person's initials in a round avatar and a companion keeps its hexagon. A long answer arrives as a run of rows, one per paragraph: wrap those in `TurnGroup` and it tells each row where it sits, so nothing counts rows by hand, and pass `identity` on the rows that open and close the run — a row with no `identity` falls back to its `author`, the opening row names it in the header and the closing row draws the same companion avatar beside its bubble. A block that already draws its own frame — a table — takes `bare`, which drops the bubble behind it rather than boxing the same grid twice. `copyText` is per bubble and holds that bubble's own words — a row handed an empty one, as a turn that stopped before writing is, offers no copy at all. Both take the transport's completion verbatim as `state`, so a screen maps nothing. A row given `onReply` reveals a second action ahead of copy, and a row given `repliedTo` is wrapped in the quote of the message it answers — both report to the screen and neither knows what is being quoted. `messageId` anchors the row so the scroller can be asked to bring it back, and it is set once per message: a message split into a run puts it on the group instead of on every paragraph. The gutter avatar never stops anything: the stop of a working companion rides its working row (`ActivityIndicator`) under the bubbles, so a wave is still ended one seat at a time and the avatar above stays the same companion control whether that companion is working or idle. `footer` puts a line of the screen's own under the bubble, in the very slot a completion label uses, so a row never carries two footers and the label wins whenever the state produces one. Neither scrolls or animates the list — that belongs to the scroller around them.",
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
					"Reach for this for the nominal exchange: a prompt that landed and an answer that finished. Check that the prompt sits right with no avatar beside it while the answer sits left behind one, and that hovering either bubble fades in a copy action on its outer side — the reader's own words are as copyable as the companion's. Pick `Run` for an answer that arrived in several parts. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("user message")).toBeVisible()
		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
	},
})

export const Run = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<TurnGroup>
				<UserTurn copyText="How is this workspace laid out?">
					How is this workspace laid out?
				</UserTurn>
				<UserTurn copyText="Keep it short.">Keep it short.</UserTurn>
			</TurnGroup>
			<TurnGroup>
				{RUN.map((paragraph) => (
					<AssistantTurn key={paragraph} identity={BOT} copyText={paragraph}>
						{paragraph}
					</AssistantTurn>
				))}
			</TurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the shape a real answer takes: one paragraph per row, published as each one closes. Check that the run reads as one block — tight spacing, and the corner facing a neighbour pulled in to less than half the corner facing away, which is what makes the rows read as one bubble rather than three — and that a single avatar marks it from the last row while the rows above it keep it out of their gutter. Every bubble carries its own copy, and copying one takes that paragraph alone: there is no action anywhere for the answer entire, because the reader points at the part they want. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const answers = canvas.getAllByLabelText("assistant message")
		await expect(answers).toHaveLength(3)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
		await expect(botIdentityAvatars(answers[2])).toHaveLength(1)
		await expect(canvas.getAllByRole("button", { name: "Copy" })).toHaveLength(
			5,
		)

		const closing = canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="message-bubble-content"]',
		)[1]
		const corners = getComputedStyle(closing)
		await expect(Number.parseFloat(corners.borderEndEndRadius)).toBeGreaterThan(
			Number.parseFloat(corners.borderStartEndRadius) * 2,
		)
	},
})

export const PersonInThread = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText="How is this workspace laid out?">
				How is this workspace laid out?
			</UserTurn>
			<AssistantTurn copyText={ANSWER} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
			<PersonTurn name={PERSON} copyText={QUESTION} onReply={reply}>
				{QUESTION}
			</PersonTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a shared conversation: the reader's own prompt, a companion's answer and a message another person wrote. Check that the other person sits on the companion's side with a round avatar and a soft bubble, named above it with no badge, while only the reader's own words wear the blue bubble.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("user message")).toBeVisible()
		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
		const person = canvas.getByLabelText(`message from ${PERSON}`)
		await expect(within(person).getByText(PERSON)).toBeVisible()
		await expectPersonTurn(person)
	},
})

export const PersonPicture = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<PersonTurn name={PERSON} image={UPLOADED_AVATAR_IMAGE}>
				{QUESTION}
			</PersonTurn>
			<PersonTurn name="Noor">{QUESTION}</PersonTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the two faces a person turn takes: the picture the person uploaded, and their initials when they have none. Check that both are round and the size of a companion's gutter avatar.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [pictured, initialed] = canvas.getAllByRole("article")
		await expectPersonTurn(pictured)
		await expectPersonTurn(initialed)
		await expect(within(initialed).getByText("N")).toBeInTheDocument()
	},
})

export const PersonRun = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<TurnGroup>
				{PERSON_RUN.map((paragraph) => (
					<PersonTurn key={paragraph} name={PERSON} copyText={paragraph}>
						{paragraph}
					</PersonTurn>
				))}
			</TurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a person who wrote several messages in a row. Check that the run reads as one block with the companion run corners, the name above the first bubble only and the avatar beside the last one only.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const turns = canvas.getAllByLabelText(`message from ${PERSON}`)
		await expect(turns).toHaveLength(3)
		await expect(canvas.getAllByText(PERSON)).toHaveLength(1)
		await expect(slotsIn(canvasElement, "user-avatar")).toHaveLength(1)
		await expectPersonTurn(turns[2])

		const middle = slotIn(turns[1], "message-bubble-content")
		const corners = getComputedStyle(middle)
		await expect(Number.parseFloat(corners.borderEndEndRadius)).toBeGreaterThan(
			Number.parseFloat(corners.borderStartStartRadius) * 2,
		)
	},
})

export const Mark = meta.story({
	render: () => <MarkHandoff />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to watch the companion's mark change homes. While the turn runs the mark belongs to the working row; when the turn lands that row goes and the closing `AssistantTurn` claims it in the gutter. Both name the same companion: the mark is that companion's, inside this transcript (`ThreadLayout` names the transcript for a real screen), and whichever of the two is on screen claims it. Check that the avatar, the header line and the bubble all appear at rest on the frame the row lands: nothing slides, fades or scales in, with or without reduced motion. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const marks = () =>
			canvasElement.querySelectorAll('[data-slot="shared-mark"]')

		await expect(marks()).toHaveLength(1)

		await userEvent.click(canvas.getByRole("button", { name: "Land the turn" }))
		await waitFor(() =>
			expect(getComputedStyle(canvas.getByText(ANSWER)).opacity).toBe("1"),
		)

		await expect(marks()).toHaveLength(1)

		const gutter = canvasElement.querySelector<HTMLElement>(
			'[data-slot="message-gutter"]',
		)
		const landed = gutter?.firstElementChild

		await expect(landed).toBeInTheDocument()
		await expect(gutter?.getBoundingClientRect().height).toBe(
			landed?.getBoundingClientRect().height,
		)
	},
})

export const MarkAcrossRuns = meta.story({
	render: () => <MarkedHistory />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the transcript has history: every answered run keeps its own avatar, but only the newest group is told `carriesMark`, so only its closing row answers to the transcript's mark. Start a new turn and check that the mark leaves the newest gutter for the working row, which appears at rest, while the avatar above it does not budge. Pick `Mark` for the handoff itself, and `Primitives/SharedMark` for the invariant underneath it. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const gutterAvatars = () =>
			canvasElement.querySelectorAll(
				'[data-from="assistant"] [data-slot="message-gutter"] > *',
			)
		const marked = () => canvasElement.querySelectorAll('[data-state="marked"]')

		await expect(gutterAvatars()).toHaveLength(2)
		await expect(marked()).toHaveLength(1)

		const settled = gutterAvatars()[0].getBoundingClientRect()

		await userEvent.click(
			canvas.getByRole("button", { name: "Start a new turn" }),
		)
		await waitFor(() => expect(gutterAvatars()).toHaveLength(1))

		await expect(marked()).toHaveLength(1)
		await expect(gutterAvatars()[0].getBoundingClientRect().top).toBe(
			settled.top,
		)
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{TURN_STATES.map((state) => {
				const text = state === "streaming" ? ANSWER.slice(0, 48) : ANSWER
				return (
					<AssistantTurn
						key={state}
						state={state}
						copyText={text}
						identity={BOT}
					>
						{text}
					</AssistantTurn>
				)
			})}
			<AssistantTurn state="cancelled" copyText="" identity={BOT}>
				{""}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every completion the transport can report, in order, then the row a turn stopped before writing anything leaves behind. Check that `cancelled` keeps the partial text it had when Stop was pressed and marks it `Stopped` rather than treating it as an error, that `failed` still offers its copy since the words it did write are worth taking, and that the empty row is the only one without one — an empty bubble has nothing to hand over. Pick `Error` for the user side of a prompt that never reached the agent at all. The four states are stacked in a column no transcript assembles, and `streaming` is in it only to keep the list exhaustive: `apps/app/src/lib/chat/screen-model.ts:102` closes every block it publishes, so no row ever reaches a screen while its answer is still arriving. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("button", { name: "Copy" })).toHaveLength(
			4,
		)
	},
})

export const Table = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText="What does the guide cover?">
				What does the guide cover?
			</UserTurn>
			<TurnGroup>
				<AssistantTurn
					copyText={TABLE_INTRO}
					identity={BOT}
					sentAt={sentOn(10, 9, 21)}
					now={READ_ON}
				>
					{TABLE_INTRO}
				</AssistantTurn>
				<AssistantTurn
					bare
					copyText={TABLE}
					identity={BOT}
					sentAt={sentOn(10, 9, 22)}
					now={READ_ON}
				>
					<Markdown>{TABLE}</Markdown>
				</AssistantTurn>
			</TurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the row a table lands in. A table frames and fills itself, so the row is `bare`: no bubble behind it, no padding around it, and one box around the grid instead of two. Check that the sentence above it keeps its bubble and opens the run with the header, that the table sits flush against the gutter and closes the run with the avatar at its foot, and that the row's copy stays beside the frame rather than out at the edge of the transcript. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const table = canvas.getByRole("group", { name: "Table" })

		await expect(table).toBeVisible()
		await expect(
			bubbleStyleOf(canvas.getByText(TABLE_INTRO)).paddingLeft,
		).not.toBe("0px")
		await expect(bubbleStyleOf(table).paddingLeft).toBe("0px")
		const [, tableRow] = canvas.getAllByLabelText("assistant message")
		await expect(slotsIn(canvasElement, "message-time-line")).toHaveLength(0)
		await expect(timesIn(slotIn(tableRow, "message-gutter"))).toHaveLength(0)
		await expect(botIdentityAvatars(tableRow)).toHaveLength(1)
	},
})

export const Error = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn
				state="failed"
				copyText="How is this workspace laid out?"
				onRetry={fn()}
			>
				How is this workspace laid out?
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the write to the CLI was rejected, so the prompt exists in the transcript but the agent never saw it. Both actions live left of the bubble, on the outer side as on every row, but they do not behave alike: the retry is pinned, since a way out nobody can see is not offered at all, while the copy stays behind a hover like every other. Check that the retry is there before the pointer is, that it sits nearest the bubble, and that the text is preserved verbatim for the resend. Pick `Variants` when the agent did answer and it was the turn that failed. `apps/app/src/components/thread-turn.tsx:81` renders the reader row of every transcript.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(retry).toBeVisible()

		await userEvent.click(retry)
		await waitFor(() => expect(retry).toBeVisible())
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
					"Reach for this to check the two multi-line paths: a pasted prompt keeps its blank lines in one bubble, and a companion row that was handed more than one paragraph still renders them verbatim. Check that both bubbles stop widening at their cap. Pick `Run` for the split the screen normally performs before it gets here. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
})

export const Pending = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={ANSWER}>{ANSWER}</UserTurn>
			<UserTurn state="queued" copyText={QUEUED} onCancel={cancelQueued}>
				{QUEUED}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The composer stays writable while a turn runs, so a prompt that cannot be sent yet waits here instead. A sent prompt tops the stack, then the `queued` one below it: one step back from the reader's own fill, a spinner beside it and its footer naming the wait. Check that the queued row offers no retry, that its cancel is pinned rather than waiting for a hover, and that only the spinner moves. Pick `Error` for a prompt that was sent and never landed. `apps/app/src/components/thread-turn.tsx:81` renders the reader row of every transcript.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		cancelQueued.mockClear()

		const cancel = canvas.getByRole("button", { name: "Cancel this message" })

		await expect(slotsIn(canvasElement, "turn-pending-spinner")).toHaveLength(1)
		await expect(cancel).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText("Waiting to be sent")).toBeVisible()

		await userEvent.click(cancel)
		await expect(cancelQueued).toHaveBeenCalledTimes(1)
	},
})

export const Reply = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} onReply={reply}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn copyText={ANSWER} identity={BOT} onReply={reply}>
				{ANSWER}
			</AssistantTurn>
			<AssistantTurn copyText={TESTS} identity={BOT}>
				{TESTS}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The affordance that starts a reply, on both sides of the transcript: a row given `onReply` reveals it beside copy on hover or on keyboard focus, and the last row here, given none, offers nothing at all — a screen that cannot answer a message must not draw the invitation. Check that pressing it reports the row it belongs to and changes nothing in the transcript: staging the reply is the screen's business, and `AI/PromptReply` is where it lands. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		reply.mockClear()

		const replies = canvas.getAllByRole("button", { name: "Reply" })

		await expect(replies).toHaveLength(2)

		await userEvent.click(replies[0])
		await expect(reply).toHaveBeenCalledTimes(1)
	},
})

export const Pinned = meta.story({
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
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The bookmark a reader drops on a row, beside the reply it sits next to. A row given `onPin` offers it on hover or on keyboard focus like the rest; a row already pinned keeps the control on screen without hover and names it `Unpin`, so the transcript shows at a glance what is bookmarked. Pressing it reports the row and changes nothing here — holding the list is the screen's business, and `AI/PinnedMessages` is where it reads. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		pin.mockClear()

		const unpin = canvas.getByRole("button", { name: "Unpin" })

		await expect(unpin).toBeVisible()
		await expect(unpin).not.toHaveClass(/opacity-0/)

		await userEvent.click(canvas.getByRole("button", { name: "Pin" }))
		await expect(pin).toHaveBeenCalledTimes(1)
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
					"The same actions the hover row offers, reached by right-clicking the bubble instead of hunting for a button: pin, then reply and copy behind a separator, each carrying the icon and the label its button carries — a pinned row says `Unpin` in both places. A row is handed only the actions it was given a handler for, and the last row here, given none at all, keeps the browser's own menu rather than drawing an empty one. Check that the menu grows out of the pointer, that choosing a row reports it and closes, and that right-clicking a second bubble hands the menu over rather than leaving two open. The bubble stays selectable under the menu, because a reader copies a passage of an answer far more often than they right-click it; the registry trigger's own `select-none` is overridden here and only comes back on a coarse pointer, where a drag is a scroll and a long press is the way in. That coarse branch is a media query the runner cannot emulate, so the play reads the rule rather than the effect. " +
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
			"Pin",
			"Reply",
			"Copy",
		])
		await expect(within(menu).getByRole("separator")).toBeInTheDocument()

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

export const Quoted = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn copyText={ANSWER} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
			<UserTurn copyText={QUESTION} repliedTo={QUOTED_BOT}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn copyText={TESTS} identity={BOT} repliedTo={QUOTED_READER}>
				{TESTS}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A message that answers another one is wrapped in a frame that carries the quote above the bubble, both on the same secondary fill. Check that the frame hugs the bubble on both sides of the transcript, that the excerpt stays on one line whatever it quotes, and that pressing it asks the screen to jump rather than moving anything here. Pick `AI/MessageScroller → Jump` for the other end of that request. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		jumpToQuoted.mockClear()

		const quotes = canvas.getAllByRole("button", { name: /Skippy|You/ })

		await expect(quotes).toHaveLength(2)

		await userEvent.click(quotes[0])
		await expect(jumpToQuoted).toHaveBeenCalledTimes(1)
	},
})

export const Authored = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A conversation held by several bots, where every row has to say who wrote it. Hand `AssistantTurn` an `author` and it names the bot above the bubble and draws that bot's avatar in the gutter — the row keeps the gutter it always had, so nothing is passed twice. The bot that leads wears a crown beside its name. In a run the name and the avatar are written once, the name on the row that opens it and the avatar on the row that closes it: the block reads as one bot speaking, not as the same name repeated. `<@bot-id>` in the text is drawn as a chip by `Markdown`, resolved against `RosterProvider`, and an id the conversation does not know still draws as an unknown bot rather than leaking the raw text. Check that Atlas is named once over its two rows, that the crown is on Atlas alone, and that a message from a conversation with a single bot — every other story here — is untouched by all of this. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<RosterProvider bots={ROOM}>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<UserTurn>Who is taking the migration?</UserTurn>
				<TurnGroup>
					{LEAD_RUN.map((paragraph) => (
						<AssistantTurn key={paragraph} author={LEAD} copyText={paragraph}>
							<Markdown>{paragraph}</Markdown>
						</AssistantTurn>
					))}
				</TurnGroup>
				<AssistantTurn author={SECOND} copyText={SECOND_REPLY}>
					<Markdown>{SECOND_REPLY}</Markdown>
				</AssistantTurn>
			</div>
		</RosterProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		const named = [
			...canvasElement.querySelectorAll(
				'[data-from="assistant"] [data-slot="message-author"]',
			),
		].map((header) => header.textContent)

		await expect(named).toHaveLength(2)
		await expect(named[0]).toContain("Atlas")
		await expect(named[1]).toContain("Basile")
		await expect(
			canvasElement.querySelectorAll('[data-slot="message-author-lead"]'),
		).toHaveLength(1)
		await expect(canvas.getByText("Unknown companion")).toBeVisible()

		const [name] = canvasElement.querySelectorAll<HTMLElement>(
			'[data-from="assistant"] [data-slot="message-author"]',
		)
		const [bubble] = canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="message"]:has([data-slot="message-author"]) [data-slot="message-bubble-content"]',
		)
		await expect(firstCharacterLeft(name)).toBeCloseTo(
			firstCharacterLeft(bubble),
			0,
		)
	},
})

export const Titled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A conversation where three of the four companions carry a title. The title is written in a pill right after the name, the same pill the roster row wears, so a reader tells an ops companion from a release companion without opening the roster. A companion with no title keeps the bare name, no pill and no gap held for one. The column here is 320px wide on purpose: the pill has no width cap of its own, so a long title is written whole beside a short name, gives way beside a name long enough to fill the line, and never pushes the crown or the header out of the column. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<div className="flex w-92 flex-col gap-6 px-6">
			{TITLED_ROOM.map(({ author, message }) => (
				<AssistantTurn author={author} copyText={message} key={author.id}>
					{message}
				</AssistantTurn>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const headers = slotsIn(canvasElement, "message-author")
		const [titled, untitled, longName, longTitle] = headers

		await expect(headers).toHaveLength(4)
		await expect(slotIn(titled, "bot-title-badge")).toHaveTextContent("Ops")
		await expect(
			untitled.querySelector('[data-slot="bot-title-badge"]'),
		).toBeNull()

		const yielded = slotIn(longName, "bot-title-badge")
		const name = longName.firstElementChild as HTMLElement

		await expect(yielded).toHaveTextContent(RELEASE_MANAGER)
		await expect(yielded.scrollWidth).toBeGreaterThan(yielded.clientWidth)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)

		const room = slotIn(longTitle, "bot-title-badge")

		await expect(room.scrollWidth).toBeLessThanOrEqual(room.clientWidth)

		const column = slotIn(canvasElement, "message").parentElement as HTMLElement

		for (const header of headers) {
			await expect(header.getBoundingClientRect().right).toBeLessThanOrEqual(
				column.getBoundingClientRect().right,
			)
		}
	},
})

export const TitledDeleted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An author deleted since it wrote, still carrying its title. The name dims, and the pill dims with it, so the two read as one line written by someone who has left rather than a dead name next to a live label. Check that the pill sits at the same weight as the name, before the bin, and that the message under it stays as readable as any other. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn author={DELETED_TITLED} copyText={ANSWER}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const header = slotIn(canvasElement, "message-author")
		const badge = slotIn(header, "bot-title-badge")
		const name = header.firstElementChild as HTMLElement

		await expect(badge).toHaveTextContent(RELEASE_MANAGER)
		await expect(getComputedStyle(badge).color).toBe(
			getComputedStyle(name).color,
		)
		await expect(slotIn(header, "message-author-deleted")).toBeVisible()
	},
})

export const OpenedByMention = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bubble whose first word is a companion. A mention is taller than the words around it, so a bubble that opens with one is padded evenly on the four sides instead of pressing the chip against its top edge — the space above the mention, below it and to its left is the same. A bubble that opens with words keeps the padding it always had, which is what the second row here is for. Check that the two bubbles read as the same bubble, one holding a chip and the other holding a sentence. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<RosterProvider bots={ROOM}>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<AssistantTurn copyText={MENTION_OPENING} identity={BOT}>
					<Markdown>{MENTION_OPENING}</Markdown>
				</AssistantTurn>
				<AssistantTurn copyText={WORD_OPENING} identity={BOT}>
					<Markdown>{WORD_OPENING}</Markdown>
				</AssistantTurn>
			</div>
		</RosterProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		const chip = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention"]',
		)
		const bubble = chip?.closest<HTMLElement>(
			'[data-slot="message-bubble-content"]',
		)

		if (!chip || !bubble) throw new globalThis.Error("The bubble drew no chip")

		const around = bubble.getBoundingClientRect()
		const mention = chip.getBoundingClientRect()
		const left = mention.left - around.left

		await expect(mention.top - around.top).toBeCloseTo(left, 0)
		await expect(around.bottom - mention.bottom).toBeCloseTo(left, 0)

		const words = bubbleStyleOf(canvas.getByText(WORD_OPENING))

		await expect(words.paddingLeft).toBe(`${Math.round(left)}px`)
		await expect(words.paddingTop).toBe("10px")
	},
})

export const DeletedAuthor = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The companion that wrote this was deleted since. Its message is history and stays legible: the bubble is the ordinary one, only the name is dimmed and marked with a bin so a reader knows nobody is behind it any more. The mark is an icon in the line and *Deleted companion* under it — on hover, and to a screen reader — so the row keeps its length and still says what it means. Check that the icon reads as a state rather than an action nobody can take, and that the row copies and quotes like any other. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<RosterProvider bots={ROOM}>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<AssistantTurn author={GONE} copyText={GONE_REPLY}>
					{GONE_REPLY}
				</AssistantTurn>
			</div>
		</RosterProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="message-author-deleted"]'),
		).toHaveAttribute("title", "Deleted companion")
		await expect(canvas.getByText(GONE_REPLY)).toBeVisible()
	},
})

export const PictureBesideBlot = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{[PICTURED, SECOND].map((author) => (
				<AssistantTurn
					author={author}
					copyText={ANSWER}
					key={author.id}
					state="complete"
				>
					{ANSWER}
				</AssistantTurn>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The gutter of a companion wearing its picture above the gutter of one drawn as its glyph. Check that the picture fills its 40px slot as a rounded square with no border, and that the drawn companion below keeps its glyph on its colour. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [picture, drawn] = botIdentityAvatars(canvasElement)

		await expectCompanionPictureShape(picture)
		await expect(drawn.querySelector("img")).toBeNull()
		await expect(slotsIn(drawn, "companion-field")).toHaveLength(1)
	},
})

export const NamedByIdentity = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn copyText={PARTIAL} identity={BOT} state="cancelled">
				{PARTIAL}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A row that names its gutter through `identity` rather than `author`: the screen hands the face it draws, as a thread with a single companion does. Check that the gutter draws that companion and that the header line above the bubble names it too, with no title badge since the face carries none. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("img", { hidden: true, name: BOT.name }),
		).toBeVisible()
		await expect(slotIn(canvasElement, "message-author")).toHaveTextContent(
			BOT.name,
		)
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

const LONG_CAUSE: TurnCause = {
	routineTitle:
		"Morning release digest, then the migration checklist, then everything the night left open",
	triggerSourceId: "file-watch",
}

const REPORT =
	"Three pull requests landed overnight and the migration is green on a fresh database."

export const ReportedByRoutine = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A run a routine opened. The row is an ordinary companion turn, and the line above the bubble names the routine that produced it instead of the companion that wrote it: the icon says what fired it — a clock face for a schedule — and it is quieter than a name line, because who wrote the words is already the avatar\u2019s job. Only the run that carries a cause loses its name line; the run under it is untouched. Check that the gutter avatar is exactly the one the row always had, and that a screen reader hears the line as a routine report before it hears the title. " +
					CAUSED_BY_THE_RUN,
			},
		},
	},
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn author={LEAD} cause={SCHEDULED_CAUSE} copyText={REPORT}>
				{REPORT}
			</AssistantTurn>
			<AssistantTurn author={SECOND} copyText={ANSWER}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const cause = slotIn(canvasElement, "turn-cause")

		await expect(cause).toHaveTextContent("Routine report")
		await expect(slotIn(cause, "turn-cause-title")).toHaveTextContent(
			SCHEDULED_CAUSE.routineTitle,
		)
		await expect(glyphIn(cause, Icons.Calendar)).toHaveAttribute(
			"aria-hidden",
			"true",
		)

		const named = slotsIn(canvasElement, "message-author")

		await expect(named).toHaveLength(1)
		await expect(named[0]).toHaveTextContent(SECOND.name)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(2)
	},
})

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

export const ReportedByLongTitle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A routine whose title outruns the width the transcript gives it. The line stays a single line and truncates, so the row above the bubble never grows a second line and never pushes the icon off it. Check the icon holds its size while the title alone gives way. " +
					CAUSED_BY_THE_RUN,
			},
		},
	},
	render: () => (
		<div className="flex max-w-xs flex-col gap-6 px-6">
			<AssistantTurn author={LEAD} cause={LONG_CAUSE} copyText={REPORT}>
				{REPORT}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const cause = slotIn(canvasElement, "turn-cause")
		const title = slotIn(cause, "turn-cause-title")
		const icon = glyphIn(cause, Icons.File)

		if (!icon) throw new globalThis.Error("The line drew no trigger icon")

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(title),
		)
		await expect(icon.getBoundingClientRect().width).toBeCloseTo(12, 0)
	},
})

export const Footnoted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A row the screen hands a line to put under the bubble — here, the trace a companion leaves when it keeps a skill. The node lands in the slot a turn already reserves for the state it ended in, so a note and a completion label never draw two footers, and the state wins: the stopped row below writes `Stopped` and drops the note it was given. Check that the line sits under the bubble and outside it, quieter than the answer, and starts exactly where the bubble does. Pick `Variants` for the labels the state produces on its own. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn copyText={ANSWER} footer={KEPT_SKILL} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
			<AssistantTurn
				copyText={ANSWER}
				footer={KEPT_SKILL}
				identity={BOT}
				state="cancelled"
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const [noted, stopped] = slotsIn(canvasElement, "message-footer")

		await expect(noted).toHaveTextContent(KEPT_SKILL)
		await expect(stopped).toHaveTextContent("Stopped")
		await expect(stopped).not.toHaveTextContent(KEPT_SKILL)

		const bubble = slotIn(canvasElement, "message-bubble")

		await expect(noted.getBoundingClientRect().left).toBeCloseTo(
			bubble.getBoundingClientRect().left,
			0,
		)
		await expect(noted.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			bubble.getBoundingClientRect().bottom,
		)
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

const HOSTLESS_GUTTER_PLACEMENT = { inlineStart: 24, blockEndToBubble: 0 }

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

const gutterPlacement = (gutter: HTMLElement) => {
	const row = gutter.closest<HTMLElement>('[data-slot="message"]')
	if (!row) throw new globalThis.Error("This gutter sits in no row")
	const placed = gutter.getBoundingClientRect()
	const framed = row.getBoundingClientRect()
	const bubble = slotIn(row, "message-bubble-content").getBoundingClientRect()
	return {
		inlineStart: placed.left - framed.left,
		blockEndToBubble: bubble.bottom - placed.bottom,
	}
}

export const CompanionMenuOnGutter = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The avatar in the gutter, hosting the companion menu a provider hands it — the same menu the roster row opens, on the face the transcript already draws. The gutter is the first column of the row and the bubble is the second, so the avatar sits beside the bubble rather than inside it and the two menus never share a trigger. Check that a right-click on the avatar opens the companion menu, that the avatar keeps the very column and row it holds with no provider, that the gutter stays hidden from screen readers since nothing focusable was added to it, and that no hover or left-click does anything the avatar did not do before. Pick `CompanionMenuOffGutter` for the transcript as it renders with no provider around it, and `CompanionMenuUnanswered` for a provider that knows nothing about this companion. " +
					RENDERED_BY_THE_THREAD,
			},
		},
	},
	render: () => (
		<CompanionMenuProvider menuFor={companionMenuFor}>
			<GutterTurn identity={BOT} />
		</CompanionMenuProvider>
	),
	play: async ({ canvasElement }) => {
		const gutter = slotIn(canvasElement, "message-gutter")

		await expect(gutter).toHaveAttribute("aria-hidden", "true")
		await expect(gutterPlacement(gutter)).toEqual(HOSTLESS_GUTTER_PLACEMENT)

		await rightClickOn(gutter)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))

		await expect(screen.getAllByRole("menu")).toHaveLength(1)
	},
})

export const CompanionMenuOffGutter = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The same row with no provider above it, which is every transcript that has not been handed companion menus. Check that a right-click on the avatar opens nothing and leaves the browser its own menu.",
			},
		},
	},
	render: () => <GutterTurn identity={BOT} />,
	play: async ({ canvasElement }) => {
		const gutter = slotIn(canvasElement, "message-gutter")
		const { defaulted } = await rightClickOn(gutter)

		await expect(gutterPlacement(gutter)).toEqual(HOSTLESS_GUTTER_PLACEMENT)
		await expect(defaulted).toBe(true)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

export const CompanionMenuUnanswered = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A provider mounted over a companion it holds no menu for — a transcript where one seat was taken by a companion the screen has not published actions for yet. Check that the avatar behaves as if no provider were there at all: the right-click opens nothing and the browser keeps its own menu. `CompanionMenuOffGutter` is the same absence reached the other way, with no provider mounted.",
			},
		},
	},
	render: () => (
		<CompanionMenuProvider menuFor={companionMenuFor}>
			<GutterTurn identity={SECOND} />
		</CompanionMenuProvider>
	),
	play: async ({ canvasElement }) => {
		const gutter = slotIn(canvasElement, "message-gutter")
		const { defaulted } = await rightClickOn(gutter)

		await expect(defaulted).toBe(true)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

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

export const CompanionSelectOnGutter = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The gutter avatar at rest under a mounted select, once as a glyph and once carrying a picture. Check that each avatar is a button named after the companion, that the gutter is no longer hidden from assistive technology, that it keeps its column and row, and that the button takes the same rounded square whether it holds a glyph or a picture. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableGutters />,
	play: async ({ canvas, canvasElement }) => {
		const [blot, pictured] = gutterSelects(canvas)
		const [gutter] = slotsIn(canvasElement, "message-gutter")

		if (!blot || !pictured || !gutter)
			throw new globalThis.Error("Two gutters expected")

		await expect(gutter).not.toHaveAttribute("aria-hidden")
		await expect(gutterPlacement(gutter)).toEqual(HOSTLESS_GUTTER_PLACEMENT)
		await expect(getComputedStyle(blot).borderRadius).toBe(
			getComputedStyle(pictured).borderRadius,
		)
		await expect(getComputedStyle(blot).boxShadow).toBe("none")
	},
})

const REMOVED_HOVER_RING_CLASSES = [
	"hover:ring-2",
	"hover:ring-muted-foreground",
	"hover:ring-offset-2",
	"hover:ring-offset-background",
]

export const CompanionSelectOnGutterHovered = meta.story({
	tags: ["test-only"],
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { hover: true },
		docs: {
			description: {
				story: `The two gutter avatars with the pointer resting on them, in both themes at once, drawn by the pseudo-state addon. The select dims its target instead of ringing it: the stop veils the face because pressing it ends work, while the select only opens the companion, so it lowers the avatar to 70 percent opacity and leaves the face in view. Check by eye in the light and the dark theme that the blot and the picture read as dimmed by the same amount, with no ring and no shadow around either, and that each stays recognizable against the page background. The pseudo-state addon rewrites no hover rule under the vitest runner, so the play asserts the computed shadow and the hover classes rather than a computed opacity and transition. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableGutters />,
	play: async ({ canvas }) => {
		const buttons = gutterSelects(canvas)

		await expect(buttons).toHaveLength(4)
		for (const button of buttons) {
			await expect(getComputedStyle(button).boxShadow).toBe("none")
			await expect(button).toHaveClass(
				"hover:not-focus-visible:opacity-70",
				"hover:transition-none",
				"motion-reduce:transition-none",
			)
			for (const ringClass of REMOVED_HOVER_RING_CLASSES)
				await expect(button).not.toHaveClass(ringClass)
		}
	},
})

export const CompanionSelectOnGutterFocused = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The gutter avatar reached by the keyboard. Check that Tab lands on it and that it wears the focus ring the stop button already wears. A focused avatar does not dim under the pointer: opacity composites the element with its own shadow, so the dim would fade the focus ring with it and drop it below the 3:1 a focus indicator needs. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableGutters />,
	play: async ({ canvas, userEvent }) => {
		const [blot] = gutterSelects(canvas)

		if (!blot) throw new globalThis.Error("The gutter drew no button")

		await userEvent.tab()

		await expect(blot).toHaveFocus()
		await expect(getComputedStyle(blot).filter).toContain("drop-shadow")
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
		await expect(selectCompanion).toHaveBeenLastCalledWith(BOT.id)

		button.focus()
		await userEvent.keyboard("{Enter}")
		await expect(selectCompanion).toHaveBeenCalledTimes(2)
		await userEvent.keyboard(" ")
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
		await expect(selectCompanion).toHaveBeenLastCalledWith(BOT.id)

		await rightClickOn(button)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
	},
})

export const WorkingCompanionStopsFromItsRow = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A working companion with an earlier landed bubble above its working row, under the select and the companion menu the app mounts. The stop lives on the working row alone. Check that the bubble gutter carries no stop glyph, no veil and no control named after stopping, that pressing it opens the companion as it does when the companion is idle, that a right-click still opens the companion menu, and that the stop on the working row reports the stop. " +
					STOPPED_FROM_THE_WORKING_ROW,
			},
		},
	},
	render: () => (
		<CompanionSelectProvider onSelect={selectCompanion}>
			<CompanionMenuProvider menuFor={companionMenuFor}>
				<div className="mx-auto flex max-w-2xl flex-col gap-6">
					<AssistantTurn author={BOT} copyText={ANSWER}>
						{ANSWER}
					</AssistantTurn>
					<ActivityIndicator
						blot={BOT.blot}
						kind="thinking"
						name={BOT.name}
						onStop={stopTurn}
						seed={BOT.id}
						stoppable
					/>
				</div>
			</CompanionMenuProvider>
		</CompanionSelectProvider>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		selectCompanion.mockClear()
		stopTurn.mockClear()
		const gutter = slotIn(canvasElement, "message-gutter")
		const avatar = within(gutter).getByRole("button", { name: BOT.name })

		await expect(
			within(gutter).queryByRole("button", { name: /stop/i }),
		).toBeNull()
		await expect(slotsIn(gutter, "bot-working-stop-glyph")).toHaveLength(0)
		await expect(avatar).toHaveClass("hover:not-focus-visible:opacity-70")

		await userEvent.click(
			canvas.getByRole("button", { name: `Stop ${BOT.name}` }),
		)
		await expect(stopTurn).toHaveBeenCalledTimes(1)
		await expect(selectCompanion).not.toHaveBeenCalled()

		await userEvent.click(avatar)
		await expect(selectCompanion).toHaveBeenLastCalledWith(BOT.id)
		await expect(stopTurn).toHaveBeenCalledTimes(1)

		await rightClickOn(avatar)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
	},
})

const READER = "Shoto Puget"

const expectTimeOnHeadLine = async (
	article: HTMLElement,
	at: number,
	wording: string,
) => {
	const [time] = timesIn(article)
	const bubble = slotIn(article, "message-bubble-content")
	const name = slotIn(article, "message-author").firstElementChild
	const label = time.getBoundingClientRect()

	await expect(time).toHaveTextContent(new RegExp(`^${wording}$`))
	await expect(time).toHaveAttribute("datetime", new Date(at).toISOString())
	await expect(time).not.toHaveAttribute("title")
	await expect(getComputedStyle(time).fontSize).toBe("12px")
	await expect(getComputedStyle(time).fontVariantNumeric).toBe("tabular-nums")
	await expect(label.bottom).toBeLessThanOrEqual(
		bubble.getBoundingClientRect().top,
	)
	if (name) {
		const named = name.getBoundingClientRect()
		await expect(label.left).toBeGreaterThan(named.right)
		await expect(label.top).toBeLessThan(named.bottom)
	}
	await expect(slotsIn(article, "message-time-line")).toHaveLength(0)
}

const expectRowAnatomy = async (article: HTMLElement) => {
	const row = article.getBoundingClientRect()
	const gutter = slotIn(article, "message-gutter").getBoundingClientRect()
	const header = slotIn(article, "message-author")
	const bubble = slotIn(article, "message-bubble-content")
	const name = header.firstElementChild as HTMLElement

	await expect(gutter.left - row.left).toBe(24)
	await expect(gutter.width).toBe(TURN_AVATAR_SIZE)
	await expect(header.getBoundingClientRect().top - row.top).toBe(8)
	await expect(gutter.bottom).toBe(bubble.getBoundingClientRect().bottom)
	await expect(header.getBoundingClientRect().height).toBe(20)
	await expect(
		bubble.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
	).toBe(4)
	await expect(name.getBoundingClientRect().left).toBe(
		bubble.getBoundingClientRect().left + 14,
	)
	await expect(getComputedStyle(name).fontSize).toBe("13px")
	await expect(getComputedStyle(name).fontWeight).toBe("500")
	await expect(getComputedStyle(bubble).borderTopLeftRadius).toBe("18px")
}

const READER_CONTENT_INSET = 24

const expectReaderRow = async (article: HTMLElement) => {
	const bubble = slotIn(article, "message-bubble-content")

	await expect(slotsIn(article, "user-avatar")).toHaveLength(0)
	await expect(slotsIn(article, "message-author")).toHaveLength(0)
	await expect(slotsIn(article, "message-gutter")).toHaveLength(0)
	await expect(within(article).queryByText(READER)).toBeNull()
	await expect(timesIn(article)).toHaveLength(1)
	await expect(
		article.getBoundingClientRect().right -
			bubble.getBoundingClientRect().right,
	).toBe(READER_CONTENT_INSET)
}

const expectReaderHeadTime = async (article: HTMLElement, wording: string) => {
	const [time] = timesIn(article)
	const label = time.getBoundingClientRect()
	const bubble = slotIn(
		article,
		"message-bubble-content",
	).getBoundingClientRect()

	await expect(time).toHaveTextContent(new RegExp(`^${wording}$`))
	await expect(getComputedStyle(time).opacity).toBe("1")
	await expect(label.bottom).toBeLessThanOrEqual(bubble.top)
	await expect(bubble.right - label.right).toBe(14)
}

const ReaderMessageRow = () => (
	<div className="mx-auto flex max-w-2xl flex-col px-6">
		<UserTurn
			name={READER}
			copyText={QUESTION}
			sentAt={sentOn(10, 9, 28)}
			now={READ_ON}
		>
			{QUESTION}
		</UserTurn>
	</div>
)

export const ReaderMessage = meta.story({
	render: () => <ReaderMessageRow />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the reader's own message. It sits against the right edge of the column with no avatar and no name: the send time on its own line above the bubble, flush right with the bubble's text, and the solid bubble under it with nothing below. Check that nothing names the reader, that the bubble is the user bubble with white text, and that hovering the bubble reveals the copy action on its left.",
			},
		},
	},
	play: async ({ canvas }) => {
		const article = canvas.getByLabelText("user message")

		await expectReaderRow(article)
		await expectReaderHeadTime(article, "2 minutes ago")
		await expect(slotIn(article, "message-bubble")).toHaveAttribute(
			"data-variant",
			"solid",
		)
	},
})

export const ReaderMessageDark = ReaderMessage.extend({
	globals: { theme: "dark" },
})

const CompanionMessageRow = () => (
	<div className="mx-auto flex max-w-2xl flex-col px-6">
		<AssistantTurn
			author={{ ...SECOND, title: "Ops" }}
			copyText={ANSWER}
			sentAt={sentOn(10, 9, 21)}
			now={READ_ON}
		>
			{ANSWER}
		</AssistantTurn>
	</div>
)

export const CompanionMessage = meta.story({
	render: () => <CompanionMessageRow />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a companion message on its own. The dithered hexagon sits in the gutter, its bottom edge level with the bubble's, the name, the title badge and the send time share the line above the bubble, and nothing sits under it. Check that the badge is centred on the name line and that the time sits after it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const article = canvas.getByLabelText("assistant message")
		const badge = slotIn(article, "bot-title-badge").getBoundingClientRect()
		const header = slotIn(article, "message-author").getBoundingClientRect()

		await expectRowAnatomy(article)
		await expectTimeOnHeadLine(article, sentOn(10, 9, 21), "9 minutes ago")
		await expect(botIdentityAvatars(article)).toHaveLength(1)
		await expect(
			Math.abs(badge.top + badge.height / 2 - (header.top + header.height / 2)),
		).toBeLessThanOrEqual(1)
	},
})

export const CompanionMessageDark = CompanionMessage.extend({
	globals: { theme: "dark" },
})

const RunOfThreeRows = () => (
	<div className="mx-auto flex max-w-2xl flex-col px-6">
		<TurnGroup>
			{RUN.map((paragraph, index) => (
				<AssistantTurn
					key={paragraph}
					author={SECOND}
					copyText={paragraph}
					sentAt={sentOn(10, 9, 21 + index)}
					now={READ_ON}
				>
					{paragraph}
				</AssistantTurn>
			))}
		</TurnGroup>
	</div>
)

const RUN_ROW_INSETS = [
	{ top: 8, bottom: 2 },
	{ top: 2, bottom: 2 },
	{ top: 2, bottom: 4 },
]

export const RunOfThree = meta.story({
	render: () => <RunOfThreeRows />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for three messages a companion sent in a row. The name and the time open the run once, on its head row, and the avatar closes it once, beside the third bubble; the middle row keeps an empty gutter, the two rows under the head keep no header, and their bubbles join the one above on the left corners. Check that nothing is written under any bubble and that the run reads as one block.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const articles = canvas.getAllByLabelText("assistant message")
		const [head, middle, last] = articles.map((article) =>
			getComputedStyle(slotIn(article, "message-bubble-content")),
		)

		await expect(canvas.getAllByText(SECOND.name)).toHaveLength(1)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
		await expect(botIdentityAvatars(articles[2])).toHaveLength(1)
		await expectTimeOnHeadLine(articles[0], sentOn(10, 9, 21), "9 minutes ago")
		for (const [index, article] of articles.entries()) {
			const style = getComputedStyle(article)
			await expect({
				top: Number.parseFloat(style.paddingTop),
				bottom: Number.parseFloat(style.paddingBottom),
			}).toEqual(RUN_ROW_INSETS[index])
		}
		for (const inner of articles.slice(1)) {
			await expect(slotsIn(inner, "message-author")).toHaveLength(0)
		}
		await expect(
			getComputedStyle(slotIn(articles[1], "message-gutter")).opacity,
		).toBe("0")
		await expect([
			head.borderTopLeftRadius,
			head.borderBottomLeftRadius,
		]).toEqual(["18px", "8px"])
		await expect([
			middle.borderTopLeftRadius,
			middle.borderBottomLeftRadius,
		]).toEqual(["8px", "8px"])
		await expect([
			last.borderTopLeftRadius,
			last.borderBottomLeftRadius,
		]).toEqual(["8px", "18px"])
	},
})

export const RunOfThreeDark = RunOfThree.extend({
	globals: { theme: "dark" },
})

const avatarsIn = (row: HTMLElement) => [
	...botIdentityAvatars(row),
	...slotsIn(row, "user-avatar"),
]

const expectAvatarAtRunFoot = async (rows: HTMLElement[]) => {
	const [opening] = rows
	const closing = rows[rows.length - 1]
	const gutter = slotIn(closing, "message-gutter").getBoundingClientRect()
	const bubble = slotIn(closing, "message-bubble-content")

	await expect(slotsIn(opening, "message-author")).toHaveLength(1)
	for (const row of rows) {
		await expect(avatarsIn(row)).toHaveLength(row === closing ? 1 : 0)
		if (row !== opening)
			await expect(slotsIn(row, "message-author")).toHaveLength(0)
	}
	await expect(gutter.bottom).toBe(bubble.getBoundingClientRect().bottom)
}

const expectRunAndSingle = async (rows: HTMLElement[]) => {
	await expect(rows).toHaveLength(4)
	await expectAvatarAtRunFoot(rows.slice(0, 3))
	await expectAvatarAtRunFoot(rows.slice(3))
}

const RUN_AND_SINGLE_STORY =
	"Check that the run names its speaker once, above its first bubble, and draws the avatar once, beside its last bubble with both bottom edges level, and that the single row carries the header above its bubble and the avatar beside that same bubble."

export const ReaderRunAndSingle = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-6">
			<TurnGroup>
				{RUN.map((paragraph, index) => (
					<UserTurn
						key={paragraph}
						name={READER}
						copyText={paragraph}
						onPin={pin}
						onReply={reply}
						sentAt={sentOn(10, 9, 21 + index)}
						now={READ_ON}
					>
						{paragraph}
					</UserTurn>
				))}
			</TurnGroup>
			<UserTurn
				name={READER}
				copyText={QUESTION}
				sentAt={sentOn(10, 9, 28)}
				now={READ_ON}
			>
				{QUESTION}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the reader's own messages, in a run of three and on their own. Every bubble meets the right edge of the column and no row draws an avatar or a name. The row that opens the run and the single row write their send time above the bubble, flush right; the two rows inside the run keep theirs hidden and write it left of the bubble, beside its first line, while the pointer rests on the row or focus is inside it, as a companion's inner row does in its gutter. Check that hovering an inner row reveals its time and its pin, reply and copy actions without painting the row.",
			},
		},
	},
	play: async ({ canvas }) => {
		const rows = canvas.getAllByLabelText("user message")
		const [head, middle, last, single] = rows

		await expect(rows).toHaveLength(4)
		for (const row of rows) await expectReaderRow(row)
		await expectReaderHeadTime(head, "9 minutes ago")
		await expectReaderHeadTime(single, "2 minutes ago")
		for (const inner of [middle, last]) {
			const [clock] = timesIn(inner)
			await expect(getComputedStyle(clock).opacity).toBe("0")
			await expect(clock.getBoundingClientRect().right).toBeLessThanOrEqual(
				slotIn(inner, "message-bubble-content").getBoundingClientRect().left,
			)
		}

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		const [clock] = timesIn(middle)
		const middleAtRest = getComputedStyle(middle).backgroundColor
		const revealed = ["Pin", "Reply", "Copy"].map((name) =>
			within(middle).getByRole("button", { name }),
		)

		await pointer.hover(slotIn(middle, "message-bubble-content"))
		await waitFor(() => expect(getComputedStyle(clock).opacity).toBe("1"))
		await expect(clock).toHaveTextContent(/^09:22$/)
		for (const action of revealed)
			await waitFor(() => expect(getComputedStyle(action).opacity).toBe("1"))
		await expect(getComputedStyle(middle).backgroundColor).toBe(middleAtRest)

		await pointer.hover(head)
		await waitFor(() => expect(getComputedStyle(clock).opacity).toBe("0"))
		await pointer.unhover(head)
	},
})

export const ReaderRunAndSingleDark = ReaderRunAndSingle.extend({
	globals: { theme: "dark" },
})

const UNBROKEN =
	"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

export const ReaderUnbrokenSqueezed = meta.story({
	render: () => (
		<div className="w-[320px] px-6">
			<UserTurn copyText={UNBROKEN} sentAt={sentOn(10, 9, 28)} now={READ_ON}>
				{UNBROKEN}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The reader's message holding one string with no break in it, a pasted hash, in a column squeezed to 320 pixels. Check that the string wraps inside the bubble, that the bubble still meets the right edge of the column, and that nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const article = slotIn(canvasElement, "message")
		const content = slotIn(article, "message-bubble-content")
		const bubble = content.getBoundingClientRect()
		const { paddingTop, paddingBottom } = getComputedStyle(content)
		const oneLineHeight =
			lineHeightOf(content) +
			Number.parseFloat(paddingTop) +
			Number.parseFloat(paddingBottom)
		const column = article.parentElement as HTMLElement

		await expectReaderRow(article)
		await expect(bubble.height).toBeGreaterThan(oneLineHeight)
		await expect(bubble.left).toBeGreaterThanOrEqual(
			column.getBoundingClientRect().left,
		)
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

export const PersonRunAndSingle = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-6">
			<TurnGroup>
				{RUN.map((paragraph, index) => (
					<PersonTurn
						key={paragraph}
						name={PERSON}
						copyText={paragraph}
						sentAt={sentOn(10, 9, 21 + index)}
						now={READ_ON}
					>
						{paragraph}
					</PersonTurn>
				))}
			</TurnGroup>
			<PersonTurn
				name={PERSON}
				copyText={QUESTION}
				sentAt={sentOn(10, 9, 28)}
				now={READ_ON}
			>
				{QUESTION}
			</PersonTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story: `Reach for this for where another person's round avatar sits, in a run of three and on its own. ${RUN_AND_SINGLE_STORY}`,
			},
		},
	},
	play: async ({ canvas }) => {
		await expectRunAndSingle(canvas.getAllByLabelText(`message from ${PERSON}`))
	},
})

export const CompanionRunAndSingle = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-6">
			<TurnGroup>
				{RUN.map((paragraph, index) => (
					<AssistantTurn
						key={paragraph}
						author={SECOND}
						copyText={paragraph}
						sentAt={sentOn(10, 9, 21 + index)}
						now={READ_ON}
					>
						{paragraph}
					</AssistantTurn>
				))}
			</TurnGroup>
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={sentOn(10, 9, 28)}
				now={READ_ON}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story: `Reach for this for where a companion's hexagon sits, in a run of three and on its own. ${RUN_AND_SINGLE_STORY}`,
			},
		},
	},
	play: async ({ canvas }) => {
		await expectRunAndSingle(canvas.getAllByLabelText("assistant message"))
	},
})

export const InnerRowHovered = meta.story({
	render: () => <RunOfThreeRows />,
	parameters: {
		pseudo: { hover: '[data-slot="message"]:nth-child(2)' },
		docs: {
			description: {
				story:
					"Reach for this for the pointer resting on a row inside a run. The row keeps its resting background and writes its own hours and minutes in the empty gutter, level with the first line of its bubble; the head row keeps its resting background and its header. Check the unchanged background and the gutter time in the light and the dark theme, and that the gutter time opens the full date on hover.",
			},
		},
	},
	play: async ({ canvas }) => {
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		const [head, middle] = canvas.getAllByLabelText("assistant message")
		const gutter = slotIn(middle, "message-gutter")
		const [clock] = timesIn(gutter)
		const bubble = slotIn(middle, "message-bubble-content")
		const middleAtRest = getComputedStyle(middle).backgroundColor
		const headAtRest = getComputedStyle(head).backgroundColor

		await pointer.hover(bubble)
		await waitFor(() => expect(getComputedStyle(gutter).opacity).toBe("1"))
		await expect(clock).toHaveTextContent(/^09:22$/)
		await expect(getComputedStyle(clock).fontSize).toBe("11px")
		await expect(clock.getBoundingClientRect().right).toBeCloseTo(
			gutter.getBoundingClientRect().right,
			0,
		)
		await expect(getComputedStyle(middle).backgroundColor).toBe(middleAtRest)
		await expect(middle.getBoundingClientRect().width).toBe(
			head.getBoundingClientRect().width,
		)

		await pointer.hover(head)
		await waitFor(() => expect(getComputedStyle(gutter).opacity).toBe("0"))
		await expect(getComputedStyle(head).backgroundColor).toBe(headAtRest)
		await pointer.unhover(head)
	},
})

export const InnerRowHoveredDark = InnerRowHovered.extend({
	globals: { theme: "dark" },
})

export const PersonTurnWithTime = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<PersonTurn
				name={PERSON}
				copyText={QUESTION}
				sentAt={sentOn(10, 9, 0)}
				now={READ_ON}
			>
				{QUESTION}
			</PersonTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message another person wrote, with its send time. Check that the time follows the person's name on the line above the grey bubble.",
			},
		},
	},
	play: async ({ canvas }) => {
		const article = canvas.getByLabelText(`message from ${PERSON}`)

		await expectTimeOnHeadLine(article, sentOn(10, 9, 0), "30 minutes ago")
	},
})

export const SentSecondsAgo = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={READ_ON - 20_000}
				now={READ_ON}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message that just landed. Check that its time reads Now rather than a count of seconds.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectTimeOnHeadLine(
			canvas.getByLabelText("assistant message"),
			READ_ON - 20_000,
			"Now",
		)
	},
})

export const SentYesterday = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={sentOn(9, 7, 0)}
				now={READ_ON}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message sent the day before. Check that its time reads Yesterday, capitalised, with the full date on hover.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectTimeOnHeadLine(
			canvas.getByLabelText("assistant message"),
			sentOn(9, 7, 0),
			"Yesterday",
		)
	},
})

const sentAt = (day: number, hours: number, minutes: number, now: number) => ({
	sentAt: sentOn(day, hours, minutes),
	now,
})

const AFTER_MIDNIGHT = sentAt(9, 0, 5, sentOn(10, 8, 0))

export const SentJustAfterMidnight = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<DaySeparator at={AFTER_MIDNIGHT.sentAt} now={AFTER_MIDNIGHT.now} />
			<AssistantTurn author={SECOND} copyText={ANSWER} {...AFTER_MIDNIGHT}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message sent just after midnight, read the next morning. Check that its time reads Yesterday, the same day the separator above it names.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotIn(canvasElement, "day-separator")).toHaveTextContent(
			"Yesterday",
		)
		await expectTimeOnHeadLine(
			canvas.getByLabelText("assistant message"),
			AFTER_MIDNIGHT.sentAt,
			"Yesterday",
		)
	},
})

const ACROSS_TWO_DAYS = sentAt(8, 23, 0, sentOn(10, 1, 0))

export const SentTwentySixHoursAgo = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<DaySeparator at={ACROSS_TWO_DAYS.sentAt} now={ACROSS_TWO_DAYS.now} />
			<AssistantTurn author={SECOND} copyText={ANSWER} {...ACROSS_TWO_DAYS}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message sent 26 hours ago, late in the evening two calendar days back. Check that its time counts calendar days and reads 2 days ago under a dated separator, never Yesterday.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotIn(canvasElement, "day-separator")).toHaveTextContent(
			"October 8",
		)
		await expectTimeOnHeadLine(
			canvas.getByLabelText("assistant message"),
			ACROSS_TWO_DAYS.sentAt,
			"2 days ago",
		)
	},
})

export const SentInTheFuture = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={READ_ON + 120_000}
				now={READ_ON}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a send time two minutes ahead of the reader's clock, as a skewed host clock produces. Check that it reads Now rather than a future phrase.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectTimeOnHeadLine(
			canvas.getByLabelText("assistant message"),
			READ_ON + 120_000,
			"Now",
		)
	},
})

export const SendTimeTooltip = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn
				author={SECOND}
				copyText={ANSWER}
				sentAt={sentOn(9, 23, 48)}
				now={READ_ON}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the exact send time. The full date lives on the time alone: resting the pointer on the bubble opens nothing. Check that resting the pointer on the time, or reaching it with Tab, opens the house tooltip with the full date and time in the reader's time zone.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const [time] = timesIn(canvasElement)
		const bubble = slotIn(canvasElement, "message-bubble-content")
		const fullDate = "Friday, October 9, 2026 at 23:48"

		await userEvent.hover(bubble)
		await new Promise((settle) => setTimeout(settle, HOVER_INTENT_DELAY_MS * 3))
		await expect(screen.queryByRole("tooltip")).toBeNull()

		await userEvent.hover(time)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(fullDate)
		await userEvent.unhover(time)
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())

		await userEvent.tab()
		await expect(time).toHaveFocus()
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(fullDate)
	},
})

export const NoSendTime = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} now={READ_ON}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn author={SECOND} copyText={ANSWER} now={READ_ON}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for messages that carry no send time. Check that no time renders, on the header line or in the gutter, and that nothing is held open under either bubble.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(timesIn(canvasElement)).toHaveLength(0)
		await expect(slotsIn(canvasElement, "message-time-line")).toHaveLength(0)
		for (const bubble of slotsIn(canvasElement, "message-bubble-content")) {
			const content = bubble.closest('[data-slot="message-content"]')
			if (!content) throw new globalThis.Error("This bubble sits in no content")
			await expect(content.getBoundingClientRect().bottom).toBeCloseTo(
				bubble.getBoundingClientRect().bottom,
				0,
			)
		}
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
