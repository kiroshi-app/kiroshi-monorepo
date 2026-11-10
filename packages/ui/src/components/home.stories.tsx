import { Children, type ReactNode, useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import type { GreetingPeriod } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { HomeApplicationsBand } from "@workspace/ui/components/home-applications-band"
import {
	HomeComposer,
	HomeComposerSkeleton,
} from "@workspace/ui/components/home-composer"
import {
	HomeGreeting,
	HomeGreetingSkeleton,
} from "@workspace/ui/components/home-greeting"
import { HomeLayout } from "@workspace/ui/components/home-layout"
import {
	HomeArchivedLine,
	HomeAskedByLine,
	HomeMissionLine,
	HomeRequest,
	type HomeRoom,
	HomeRoomLine,
	HomeThinkingLine,
} from "@workspace/ui/components/home-lines"
import { HomeTranscript } from "@workspace/ui/components/home-transcript"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import { PROMPT_ATTACHMENTS } from "@workspace/ui/components/prompt-attachments.fixtures"
import { ToolApproval } from "@workspace/ui/components/tool-approval"
import { ToolQuestion } from "@workspace/ui/components/tool-question"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"

const ATLAS: HomeAgent = {
	id: "atlas",
	name: "Atlas",
	role: "Planner",
	hue: BLOT_HUES.blue,
}

const PICO: HomeAgent = {
	id: "pico",
	name: "Pico",
	role: "Builder",
	hue: BLOT_HUES.orange,
}

const JUNIPER: HomeAgent = {
	id: "juniper",
	name: "Juniper",
	role: "Writer",
	hue: BLOT_HUES.green,
}

const JUNO: HomeAgent = {
	id: "juno",
	name: "Juno",
	hue: BLOT_HUES.cyan,
}

const AGENTS = [ATLAS, PICO, JUNIPER]

const ATLAS_IDENTITY = {
	id: ATLAS.id,
	name: ATLAS.name,
	title: ATLAS.role,
	blot: ATLAS.hue,
}

const markOf = (fill: string, ink: string, letter: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="${fill}"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="${ink}">${letter}</text></svg>`,
	)}`

const APPLICATION_MARKS = [
	markOf("#f2f2f2", "#111111", "N"),
	markOf("#5e6ad2", "#ffffff", "L"),
	markOf("#2b2b2e", "#ffffff", "G"),
	markOf("#4a154b", "#ffffff", "S"),
	markOf("#1a73e8", "#ffffff", "C"),
]

const LISBON_OFFSITE: HomeRoom = {
	title: "Lisbon offsite",
	href: "#lisbon-offsite",
	icon: "Globe",
}

const OFFSITE_BUDGET: HomeRoom = {
	title: "Offsite budget",
	href: "#offsite-budget",
	icon: "CreditCard",
}

const at = (hours: number, minutes: number) =>
	new Date(2026, 10, 9, hours, minutes).getTime()

const NOW = at(15, 0)

const FLIGHTS_ASK =
	"Can you find flights to Lisbon for the offsite, 12 to 15 March?"

const FLIGHTS_ANSWER =
	"Three direct flights from Paris on the 12th. The 07:40 is the cheapest at €148 return and lands before 10."

const OFFSITE_ASK =
	"Can you organise the Lisbon offsite? 12 to 15 March, 14 people, flights and a venue near the river."

const OFFSITE_ANSWER =
	"On it. I'm setting it up with Pico for travel and Juno for the venue, and I'll come back here with what I need from you."

const RELAY = `The offsite is nearly ready. Pico found flights for all 14 of you and Juno shortlisted two venues by the river; the full plan is in [Lisbon offsite](#lisbon-offsite).

- Flights: 07:40 from Paris on the 12th, €2,072 for the group
- Venue: LX Factory or Casa do Rio, both free on those dates
- Total: €9,480, under the €10,000 you set

**What I need from you:** pick the venue, and I'll book both before the fares move on Friday.`

const BOOK_IT = "Casa do Rio. Go ahead and book."

const BOOKING =
	"Booking now. Pico is on it, and you'll see it here once everything is confirmed."

const BLOCKED_RELAY =
	"The flights are booked, but Casa do Rio refused the deposit: they only take a bank transfer. **What I need from you:** say yes and Pico sends the €1,200 transfer today."

const DEPOSIT_ASK =
	"The flights are booked, 14 seats on the 07:40. Juno needs one answer from you before paying Casa do Rio."

const DEPOSIT_QUESTION = {
	question:
		"Casa do Rio holds the room until Thursday. When should the €1,200 deposit go out?",
	header: "Deposit",
	options: [
		{
			label: "Today",
			description: "The room is locked in and the price can't change.",
		},
		{
			label: "Thursday morning",
			description: "Keeps the money until headcount is final.",
		},
	],
}

type HomePanelProps = { children: ReactNode }

const HomePanel = ({ children }: HomePanelProps) => (
	<div className="h-212 w-343 overflow-clip rounded-xl border border-foreground/6 bg-card">
		{children}
	</div>
)

const selectedAgent = fn()
const attached = fn()
const sent = fn()
const dismissedBand = fn()
const openedArchive = fn()
const removedAttachment = fn()

let raisedSendFailure: string | undefined

type EmptyHomeProps = {
	agent?: HomeAgent
	period?: GreetingPeriod
	firstName?: string
	draft?: string
	hasBand?: boolean
	attachments?: PromptAttachment[]
	after?: ReactNode
}

const EmptyHome = ({
	agent = ATLAS,
	period = "morning",
	firstName = "Sam",
	draft,
	hasBand = true,
	attachments,
	after,
}: EmptyHomeProps) => (
	<HomeLayout stage="empty">
		<HomeGreeting agent={agent} firstName={firstName} period={period} />
		<HomeComposer
			agents={AGENTS}
			attachments={attachments}
			band={
				hasBand ? (
					<HomeApplicationsBand
						agentName={agent.name}
						marks={APPLICATION_MARKS}
						onDismiss={dismissedBand}
					/>
				) : undefined
			}
			defaultValue={draft}
			onAttach={attached}
			onRemoveAttachment={removedAttachment}
			onSelectAgent={selectedAgent}
			onSubmit={sent}
			selectedAgentId={agent.id}
		/>
		{after}
	</HomeLayout>
)

const ATLAS_COMPOSER = (
	<HomeComposer
		agents={AGENTS}
		onAttach={attached}
		onSelectAgent={selectedAgent}
		onSubmit={sent}
		selectedAgentId={ATLAS.id}
	/>
)

type ConversationHomeProps = { children: ReactNode; composer?: ReactNode }

const ConversationHome = ({ children, composer }: ConversationHomeProps) => (
	<HomeLayout
		composer={composer ?? ATLAS_COMPOSER}
		stage="conversation"
		transcript={
			<HomeTranscript
				rows={Children.toArray(children).map((turn, index) => ({
					key: `turn-${index}`,
					render: () => turn,
				}))}
			/>
		}
	/>
)

const HOME_STAGE_GAP = 16

const homeFrameOf = (canvasElement: HTMLElement) => {
	const viewport = canvasElement.querySelector<HTMLElement>(
		'[data-slot="message-scroller-viewport"]',
	)
	const composer = canvasElement.querySelector<HTMLElement>(
		'[data-slot="home-layout-composer"]',
	)
	if (!viewport || !composer) throw new Error("The Home stage is not rendered")
	return { viewport, composer }
}

const rowBoxesOf = (viewport: HTMLElement) =>
	Array.from(
		viewport.querySelectorAll<HTMLElement>(
			'[data-slot="message-scroller-item"]',
		),
		(row) => row.getBoundingClientRect(),
	)

const expectNoSidewaysScroll = async (viewport: HTMLElement) => {
	await expect(viewport.scrollWidth).toBe(viewport.clientWidth)
}

const expectHomeFrame = async (canvasElement: HTMLElement) => {
	const { viewport, composer } = homeFrameOf(canvasElement)
	await waitFor(() => {
		const lastRow = rowBoxesOf(viewport).at(-1)
		expect(
			Math.round(composer.getBoundingClientRect().top - (lastRow?.bottom ?? 0)),
		).toBe(HOME_STAGE_GAP)
	})
	const rows = rowBoxesOf(viewport)
	for (const [index, row] of rows.slice(1).entries()) {
		await expect(Math.round(row.top - rows[index].bottom)).toBe(HOME_STAGE_GAP)
	}
	await expectNoSidewaysScroll(viewport)
	const column = composer.getBoundingClientRect()
	const transcript = viewport.getBoundingClientRect()
	await expect([transcript.left, transcript.right]).toEqual([
		column.left,
		column.right,
	])
}

const expectRoomLinksTo = async (
	canvasElement: HTMLElement,
	room: HomeRoom,
) => {
	const links = canvasElement.querySelectorAll('[data-slot="home-room-link"]')
	await expect(links.length).toBeGreaterThan(0)
	for (const link of links) {
		await expect(link).toHaveAttribute("href", room.href)
	}
}

type YourTurnProps = { text: string; sentAt: number }

const YourTurn = ({ text, sentAt }: YourTurnProps) => (
	<UserTurn copyText={text} name="Sam" sentAt={sentAt}>
		{text}
	</UserTurn>
)

type AtlasTurnProps = { text: string; sentAt: number }

const AtlasTurn = ({ text, sentAt }: AtlasTurnProps) => (
	<AssistantTurn copyText={text} identity={ATLAS_IDENTITY} sentAt={sentAt}>
		<Markdown>{text}</Markdown>
	</AssistantTurn>
)

const meta = preview.meta({
	title: "Conversation/Home/Home",
	component: HomeLayout,
	globals: { theme: "dark" },
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The Home panel, one story per artboard of the Paper file Kiroshi, Home. An empty Home centres the greeting and the composer; a Home with a conversation sits on the composer at the bottom. The title bar and the rail stay out: they are drawn by the app frame around this panel.",
			},
		},
	},
	decorators: [
		(Story) => (
			<HomePanel>
				<Story />
			</HomePanel>
		),
	],
	beforeEach: () => {
		selectedAgent.mockClear()
		dismissedBand.mockClear()
		openedArchive.mockClear()
		removedAttachment.mockClear()
	},
})

const withDescription = (story: string) => ({
	docs: { description: { story } },
})

export const WithAFirstName = meta.story({
	name: "1a · With a first name",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"Reach for this as the nominal Home: the reader's first name is known, the agent has no Application yet, so the band shows. Check the greeting says the name and the send button stays idle and disabled on an empty field.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Morning, Sam. What’s next?" }),
		).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled()
	},
})

export const WithoutAFirstName = meta.story({
	name: "1b · Without a first name",
	render: () => <EmptyHome firstName="" />,
	parameters: withDescription(
		"Reach for this when the account carries no first name: the greeting drops the name and keeps the period. Pick `1a` for the named greeting.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Morning. What’s next?" }),
		).toBeVisible()
	},
})

export const Morning = meta.story({
	name: "2a · Morning, 05:00 to 11:59",
	render: () => <EmptyHome period="morning" />,
	parameters: withDescription(
		"The greeting from 05:00 to 11:59. `greetingPeriodOf` picks the period from the local hour.",
	),
})

export const Afternoon = meta.story({
	name: "2b · Afternoon, 12:00 to 17:59",
	render: () => <EmptyHome period="afternoon" />,
	parameters: withDescription("The greeting from 12:00 to 17:59."),
})

export const Evening = meta.story({
	name: "2c · Evening, 18:00 to 21:59",
	render: () => <EmptyHome period="evening" />,
	parameters: withDescription("The greeting from 18:00 to 21:59."),
})

export const Night = meta.story({
	name: "2d · Night, 22:00 to 04:59",
	render: () => <EmptyHome period="night" />,
	parameters: withDescription(
		"The greeting from 22:00 to 04:59, the one period that asks rather than greets. Without a first name it reads Still up? What’s next?, a case the file does not draw.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Still up, Sam? What’s next?" }),
		).toBeVisible()
	},
})

export const BandShown = meta.story({
	name: "3a · Atlas has no Application, band shown",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"Reach for this when the selected agent has no Application: the band under the field suggests connecting some, up to five marks, and can be dismissed. Check the dismiss control carries a name and calls back, and that no composer control eases its colour on hover or press.",
	),
	play: async ({ canvas, userEvent }) => {
		const controls = [
			canvas.getByRole("button", { name: "Add files" }),
			canvas.getByRole("button", { name: "Atlas" }),
			canvas.getByRole("button", { name: "Send" }),
			canvas.getByRole("button", { name: "Hide this suggestion" }),
		]
		if (isInBrowserRunner()) {
			await withMotionAllowed(async () => {
				for (const control of controls) {
					await expect(getComputedStyle(control).transitionDuration).toBe("0s")
				}
			})
		}
		await userEvent.click(
			canvas.getByRole("button", { name: "Hide this suggestion" }),
		)
		await expect(dismissedBand).toHaveBeenCalledOnce()
	},
})

export const PickerOpen = meta.story({
	name: "3b · Picker open, switching to Pico",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"The agent picker open from the chip: every agent with its avatar, name and role, a check on the selected one. Arrow keys move through the list, Escape closes it and gives focus back to the chip; the story leaves it open on Pico.",
	),
	play: async ({ canvas, userEvent }) => {
		const chip = canvas.getByRole("button", { name: "Atlas" })
		await userEvent.click(chip)
		const menu = await screen.findByRole("menu")
		await expect(
			screen.getByRole("menuitemradio", { name: /Atlas/ }),
		).toHaveAttribute("aria-checked", "true")
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(menu).not.toBeInTheDocument())
		await expect(chip).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await screen.findByRole("menu")
		await waitFor(() =>
			expect(
				screen.getByRole("menuitemradio", { name: /Atlas/ }),
			).toHaveFocus(),
		)
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() =>
			expect(screen.getByRole("menuitemradio", { name: /Pico/ })).toHaveFocus(),
		)
	},
})

export const NoBand = meta.story({
	name: "3c · Pico has Applications, no band",
	render: () => <EmptyHome agent={PICO} hasBand={false} />,
	parameters: withDescription(
		"Reach for this once the selected agent has Applications: no band, the field card is the whole composer. Picking an agent in the menu hands its id back and closes the menu.",
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Pico" }))
		await userEvent.click(
			await screen.findByRole("menuitemradio", { name: /Atlas/ }),
		)
		await expect(selectedAgent).toHaveBeenCalledWith("atlas")
		await waitFor(() =>
			expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
		)
	},
})

export const PickerWithoutAgents = meta.story({
	name: "Picker without agents",
	tags: ["test-only"],
	render: () => (
		<HomeLayout stage="empty">
			<HomeComposer
				agents={[]}
				onAttach={attached}
				onSelectAgent={selectedAgent}
				selectedAgentId="atlas"
			/>
		</HomeLayout>
	),
	parameters: withDescription(
		"Proves the composer before any agent exists in the Space, a case no artboard draws: the chip keeps an accessible name and the field falls back to the plain placeholder, with no dangling agent name.",
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Agents" })).toBeVisible()
		await expect(canvas.getByRole("textbox")).toHaveAttribute(
			"placeholder",
			"Message",
		)
	},
})

export const FieldFilled = meta.story({
	name: "4a · Field filled",
	render: () => <EmptyHome draft={FLIGHTS_ASK} />,
	parameters: withDescription(
		"The field holds text: send fills in the Space colour and becomes enabled. Pick `3a` for the idle send button.",
	),
	play: async ({ canvas }) => {
		const send = canvas.getByRole("button", { name: "Send" })
		await expect(send).toBeEnabled()
		await expect(send).toHaveAttribute("data-filled", "true")
	},
})

export const SentThinking = meta.story({
	name: "4b · Sent, Atlas is thinking",
	render: () => (
		<ConversationHome>
			<DaySeparator
				at={at(9, 12)}
				note="Saved to Atlas in Conversations"
				now={NOW}
			/>
			<YourTurn sentAt={at(9, 12)} text={FLIGHTS_ASK} />
			<HomeThinkingLine agent={ATLAS} />
		</ConversationHome>
	),
	parameters: withDescription(
		"The first message sent from Home: the panel turns into a conversation sitting on the composer, the day divider says where it is saved, and the agent thinks.",
	),
	play: async ({ canvasElement }) => {
		await expectHomeFrame(canvasElement)
	},
})

export const FirstAnswer = meta.story({
	name: "4c · First answer",
	render: () => (
		<ConversationHome>
			<DaySeparator
				at={at(9, 12)}
				note="Saved to Atlas in Conversations"
				now={NOW}
			/>
			<YourTurn sentAt={at(9, 12)} text={FLIGHTS_ASK} />
			<AtlasTurn sentAt={at(9, 12)} text={FLIGHTS_ANSWER} />
		</ConversationHome>
	),
	parameters: withDescription(
		"The agent's first answer under the first message, the last turn right above the composer.",
	),
	play: async ({ canvasElement }) => {
		await expectHomeFrame(canvasElement)
	},
})

export const FilesAttached = meta.story({
	name: "4d · Files attached, before sending",
	render: () => <EmptyHome attachments={PROMPT_ATTACHMENTS} />,
	parameters: withDescription(
		"Files staged before the first message: the chips sit above the field inside the field card, as in Prompt, and send is enabled with the field empty. Removing a chip keeps focus in the composer. No artboard draws this state.",
	),
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getAllByRole("listitem")).toHaveLength(2)
		await expect(canvas.getByRole("textbox")).toHaveValue("")
		const send = canvas.getByRole("button", { name: "Send" })
		await expect(send).toBeEnabled()
		await expect(send).toHaveAttribute("data-filled", "true")
		await userEvent.click(
			canvas.getByRole("button", { name: /release-notes\.md/ }),
		)
		await expect(removedAttachment).toHaveBeenCalledWith("notes")
		await expect(canvas.getByRole("textbox")).toHaveFocus()
	},
})

const LONG_TRANSCRIPT = [
	{ isYours: true, text: FLIGHTS_ASK },
	{ isYours: false, text: FLIGHTS_ANSWER },
	{ isYours: true, text: OFFSITE_ASK },
	{ isYours: false, text: OFFSITE_ANSWER },
	{ isYours: true, text: BOOK_IT },
	{ isYours: false, text: BOOKING },
]

const LONG_TURNS = [9, 11].flatMap((hour) =>
	LONG_TRANSCRIPT.map(({ isYours, text }) =>
		isYours ? (
			<YourTurn key={`${hour}-${text}`} sentAt={at(hour, 0)} text={text} />
		) : (
			<AtlasTurn key={`${hour}-${text}`} sentAt={at(hour, 1)} text={text} />
		),
	),
)

export const LongTranscript = meta.story({
	name: "4e · Long transcript",
	render: () => <ConversationHome>{LONG_TURNS}</ConversationHome>,
	parameters: withDescription(
		"More turns than the panel holds: the transcript scrolls inside itself, follows the last turn, and the composer stays pinned at the bottom.",
	),
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvasElement.querySelector<HTMLElement>(
			'[data-slot="message-scroller-viewport"]',
		)
		await expect(viewport?.scrollHeight).toBeGreaterThan(
			viewport?.clientHeight ?? 0,
		)
		await expect(canvas.getByRole("button", { name: "Send" })).toBeVisible()
		await expectHomeFrame(canvasElement)
	},
})

export const ClippedTranscript = meta.story({
	name: "Transcript that does not scroll, clipped above the composer",
	tags: ["test-only"],
	render: () => (
		<HomeLayout
			composer={ATLAS_COMPOSER}
			stage="conversation"
			transcript={LONG_TURNS}
		/>
	),
	parameters: withDescription(
		"A transcript node that does not scroll itself and outgrows the stage: the transcript slot clips it, and the composer stays on top and reachable.",
	),
	play: async ({ canvas, canvasElement }) => {
		const transcript = canvasElement.querySelector<HTMLElement>(
			'[data-slot="home-layout-transcript"]',
		)
		await expect(transcript?.scrollHeight).toBeGreaterThan(
			transcript?.clientHeight ?? 0,
		)
		await expect(transcript).toHaveStyle({ overflowY: "hidden" })
		const field = canvas.getByRole("textbox")
		field.scrollIntoView({ block: "center" })
		const { left, top, width, height } = field.getBoundingClientRect()
		await expect(
			field.contains(
				document.elementFromPoint(left + width / 2, top + height / 2),
			),
		).toBe(true)
	},
})

const UNBREAKABLE = "x".repeat(300)

const CODE_ANSWER = `Here is the booking call Pico runs:

\`\`\`ts
const order = await duffel.orders.create({ selectedOffers: ["off_0000AEdGRhtp5AUUdJqMxo"], passengers: travellers.map(toDuffelPassenger), payments: [{ type: "balance", currency: "EUR", amount: "2072.00" }] })
\`\`\``

export const LongRows = meta.story({
	name: "Long rows, an unbreakable string and a code block stay in the column",
	tags: ["test-only"],
	render: () => (
		<ConversationHome>
			<YourTurn sentAt={at(14, 2)} text={UNBREAKABLE} />
			<AtlasTurn sentAt={at(14, 2)} text={UNBREAKABLE} />
			<YourTurn sentAt={at(14, 3)} text={OFFSITE_ASK.repeat(4)} />
			<AtlasTurn sentAt={at(14, 3)} text={RELAY} />
			<AtlasTurn sentAt={at(14, 4)} text={CODE_ANSWER} />
		</ConversationHome>
	),
	parameters: withDescription(
		"Rows the product does not author: they wrap or scroll inside their own bubble, and the transcript never scrolls sideways.",
	),
	play: async ({ canvasElement }) => {
		await expectHomeFrame(canvasElement)
	},
})

export const JumpToLatestShown = meta.story({
	name: "Scrolled up, the jump to latest button shows",
	tags: ["test-only"],
	render: () => <ConversationHome>{LONG_TURNS}</ConversationHome>,
	parameters: withDescription(
		"The reader scrolled back through a long transcript: the jump to latest button shows without widening the transcript, and brings the last turn back onto the composer.",
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		const { viewport } = homeFrameOf(canvasElement)
		await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0))
		viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))
		viewport.scrollTop = 0
		const jump = canvas.getByRole("button", { name: "Jump to latest" })
		await waitFor(() => expect(jump).toHaveAttribute("data-active", "true"))
		await expectNoSidewaysScroll(viewport)
		await Promise.all(
			jump.getAnimations().map((transition) => transition.finished),
		)
		await userEvent.click(jump)
		await expectHomeFrame(canvasElement)
	},
})

const SENT_ROWS: TranscriptItem[] = [
	{
		key: "day",
		render: () => (
			<DaySeparator
				at={at(9, 12)}
				note="Saved to Atlas in Conversations"
				now={NOW}
			/>
		),
	},
	{
		key: "first-ask",
		render: () => <YourTurn sentAt={at(9, 12)} text={FLIGHTS_ASK} />,
	},
	{
		key: "first-answer",
		render: () => <AtlasTurn sentAt={at(9, 12)} text={FLIGHTS_ANSWER} />,
	},
]

const AS_THE_APP_WIRES_IT = { anchorOnSend: true }

const SendingHome = () => {
	const [rows, setRows] = useState(SENT_ROWS)
	const send = (text: string) =>
		setRows((current) => [
			...current,
			{
				key: `sent-${current.length}`,
				isAnchor: true,
				render: () => <YourTurn sentAt={at(9, 14)} text={text} />,
			},
			{
				key: `thinking-${current.length}`,
				render: () => <HomeThinkingLine agent={ATLAS} />,
			},
		])

	return (
		<HomeLayout
			composer={
				<HomeComposer
					agents={AGENTS}
					onAttach={attached}
					onSelectAgent={selectedAgent}
					onSubmit={send}
					selectedAgentId={ATLAS.id}
				/>
			}
			stage="conversation"
			transcript={<HomeTranscript {...AS_THE_APP_WIRES_IT} rows={rows} />}
		/>
	)
}

export const SentFromTheComposer = meta.story({
	name: "A message sent from the composer sits on the composer",
	tags: ["test-only"],
	render: () => <SendingHome />,
	parameters: withDescription(
		"The app marks a message the reader sends as the anchor of a solo thread. On the Home the sent message still lands right above the composer, as 4b draws it, never lifted to the top of the panel.",
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByRole("textbox"), BOOK_IT)
		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await expect(await canvas.findByText(BOOK_IT)).toBeVisible()
		await expectHomeFrame(canvasElement)
	},
})

export const Loading = meta.story({
	name: "5a · Loading",
	render: () => (
		<HomeLayout stage="empty">
			<HomeGreetingSkeleton />
			<HomeComposerSkeleton />
		</HomeLayout>
	),
	parameters: withDescription(
		"Reach for this while the Space and its agents load: the greeting and the composer drawn as skeletons, Add files and send idle, nothing focusable.",
	),
})

export const CouldNotSend = meta.story({
	name: "5b · Couldn't send",
	render: () => (
		<>
			<EmptyHome draft={FLIGHTS_ASK} />
			<NoticeSurface />
		</>
	),
	beforeEach: () => () => {
		if (raisedSendFailure) endNotice(raisedSendFailure)
	},
	parameters: withDescription(
		"A send that failed: the failure notice says so, the message is back in the field and send is filled again. The notice is the window's notice surface, anchored where the shell anchors it.",
	),
	play: async () => {
		raisedSendFailure = raiseFailureNotice({
			title: "Couldn’t send that request",
			description: "Your message is back in the field.",
			action: { label: "Retry", onPress: fn() },
		})
		const titles = await screen.findAllByText("Couldn’t send that request")
		await expect(titles.length).toBeGreaterThan(0)
	},
})

export const FreshAfterRelaunch = meta.story({
	name: "6a · Fresh Home after relaunch",
	render: () => (
		<EmptyHome
			after={
				<HomeArchivedLine
					agentName="Atlas"
					onOpen={openedArchive}
					period="morning"
				/>
			}
			hasBand={false}
			period="afternoon"
		/>
	),
	parameters: withDescription(
		"Reach for this after a relaunch: the Home starts empty again and a line under the composer says where the earlier conversation went. Open it calls back.",
	),
	play: async ({ canvas, userEvent }) => {
		await expect(
			canvas.getByText(
				"This morning’s conversation with Atlas is archived in Conversations.",
			),
		).toBeVisible()
		await userEvent.click(canvas.getByRole("button", { name: "Open it" }))
		await expect(openedArchive).toHaveBeenCalledOnce()
	},
})

export const WorkingInOneRoom = meta.story({
	name: "7a · Working in one room",
	render: () => (
		<ConversationHome>
			<YourTurn sentAt={at(14, 2)} text={OFFSITE_ASK} />
			<AtlasTurn sentAt={at(14, 2)} text={OFFSITE_ANSWER} />
			<HomeRoomLine agent={ATLAS} room={LISBON_OFFSITE} state="working" />
		</ConversationHome>
	),
	parameters: withDescription(
		"The agent went to work in a room: the line names it, as a link to the room.",
	),
	play: async ({ canvasElement }) => {
		await expectRoomLinksTo(canvasElement, LISBON_OFFSITE)
		await expectHomeFrame(canvasElement)
	},
})

export const TwoRoomsInARow = meta.story({
	name: "7b · Two rooms in a row",
	render: () => (
		<ConversationHome>
			<YourTurn sentAt={at(14, 2)} text={OFFSITE_ASK} />
			<AtlasTurn sentAt={at(14, 2)} text={OFFSITE_ANSWER} />
			<HomeRoomLine
				agent={ATLAS}
				at={at(14, 9)}
				room={LISBON_OFFSITE}
				state="done"
			/>
			<HomeRoomLine agent={ATLAS} room={OFFSITE_BUDGET} state="working" />
		</ConversationHome>
	),
	parameters: withDescription(
		"One line per room: the room the agent left turns done with its time, the next one works.",
	),
	play: async ({ canvasElement }) => {
		await expectHomeFrame(canvasElement)
	},
})

export const RelaysFromTheRooms = meta.story({
	name: "8a · Atlas relays from the rooms",
	render: () => (
		<ConversationHome>
			<AtlasTurn sentAt={at(14, 2)} text={OFFSITE_ANSWER} />
			<HomeRoomLine
				agent={ATLAS}
				at={at(14, 9)}
				room={LISBON_OFFSITE}
				state="done"
			/>
			<HomeRoomLine
				agent={ATLAS}
				at={at(14, 16)}
				room={OFFSITE_BUDGET}
				state="done"
			/>
			<AtlasTurn sentAt={at(14, 17)} text={RELAY} />
		</ConversationHome>
	),
	parameters: withDescription(
		"The agent comes back from its rooms with an ordinary answer: done lines stay in the history above it.",
	),
	play: async ({ canvasElement }) => {
		await expectHomeFrame(canvasElement)
	},
})

export const ApprovalWaits = meta.story({
	name: "9a · An approval waits on you",
	render: () => (
		<ConversationHome
			composer={
				<HomeRequest
					askedBy={<HomeAskedByLine agent={PICO} room={LISBON_OFFSITE} />}
				>
					<ToolApproval
						description="Book 14 seats on the 07:40 from Paris to Lisbon on 12 March, €2,072 in total."
						onAllowOnce={fn()}
						onDeny={fn()}
						parameters={[{ id: "seats", label: "seats", value: "14" }]}
						tool="Duffel · create_order"
					/>
				</HomeRequest>
			}
		>
			<AtlasTurn sentAt={at(14, 17)} text={RELAY} />
			<YourTurn sentAt={at(14, 21)} text={BOOK_IT} />
		</ConversationHome>
	),
	parameters: withDescription(
		"An agent in a room needs an approval: the approval takes the composer's place, the asked-by line above it says who and where.",
	),
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="home-composer"]'),
		).toBeNull()
		await expectHomeFrame(canvasElement)
	},
})

export const QuestionWaits = meta.story({
	name: "9b · A question waits on you",
	render: () => (
		<ConversationHome
			composer={
				<ToolQuestion
					askedBy={<HomeAskedByLine agent={JUNO} room={LISBON_OFFSITE} />}
					onAnswer={fn()}
					onDeny={fn()}
					questions={[DEPOSIT_QUESTION]}
				/>
			}
		>
			<YourTurn sentAt={at(14, 21)} text={BOOK_IT} />
			<AtlasTurn sentAt={at(14, 24)} text={DEPOSIT_ASK} />
		</ConversationHome>
	),
	parameters: withDescription(
		"An agent in a room asks a question: the question takes the composer's place, the asked-by line in its header. The story picks Today, as drawn.",
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("link", { name: "Lisbon offsite" }),
		).toBeVisible()
		await expectRoomLinksTo(canvasElement, LISBON_OFFSITE)
		await expect(
			canvasElement.querySelector('[data-slot="home-composer"]'),
		).toBeNull()
		await expectHomeFrame(canvasElement)
		await userEvent.click(canvas.getByText("Today"))
	},
})

export const MissionCompleted = meta.story({
	name: "9c · A mission completed",
	render: () => (
		<ConversationHome>
			<YourTurn sentAt={at(14, 21)} text={BOOK_IT} />
			<AtlasTurn sentAt={at(14, 22)} text={BOOKING} />
			<HomeMissionLine
				at={at(14, 51)}
				room={LISBON_OFFSITE}
				state="completed"
				title="Book flights and venue for Lisbon"
			/>
		</ConversationHome>
	),
	parameters: withDescription(
		"A mission ended well: the line carries Completed as text, in the success colour.",
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Completed")).toBeVisible()
		await expectHomeFrame(canvasElement)
	},
})

export const MissionBlocked = meta.story({
	name: "9d · A mission blocked",
	render: () => (
		<ConversationHome>
			<YourTurn sentAt={at(14, 21)} text={BOOK_IT} />
			<AtlasTurn sentAt={at(14, 22)} text={BOOKING} />
			<HomeMissionLine
				at={at(14, 38)}
				room={LISBON_OFFSITE}
				state="blocked"
				title="Book flights and venue for Lisbon"
			/>
			<AtlasTurn sentAt={at(14, 39)} text={BLOCKED_RELAY} />
		</ConversationHome>
	),
	parameters: withDescription(
		"A mission is stuck: the line carries Blocked as text, in the destructive colour, and the agent relays what it needs.",
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Blocked")).toBeVisible()
		await expectHomeFrame(canvasElement)
	},
})
