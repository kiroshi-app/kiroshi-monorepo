import type { ReactNode } from "react"
import {
	expect,
	fireEvent,
	fn,
	screen,
	userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AuthorLine,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import { ConversationArrivalRow } from "@workspace/ui/components/conversation-arrival-row"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { LIBRARY_LIGHTBOX_IMAGES } from "@workspace/ui/components/library.fixtures"
import { LibraryLightbox } from "@workspace/ui/components/library-lightbox"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { MessageAction } from "@workspace/ui/components/message-actions"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { MissionEventRow } from "@workspace/ui/components/mission-event-row"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import {
	MISSION_BOT,
	MISSION_NOW,
	MISSION_OPENED_AT,
	MISSION_TICKET,
	MISSION_TOOLS,
} from "@workspace/ui/components/missions.fixtures"
import {
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PROMPT_ATTACHMENTS } from "@workspace/ui/components/prompt-attachments.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptMentionMenu } from "@workspace/ui/components/prompt-mention-menu"
import { PromptQueue } from "@workspace/ui/components/prompt-queue"
import { PromptReply } from "@workspace/ui/components/prompt-reply"
import { RichBlockPending } from "@workspace/ui/components/rich-block-pending"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import { SIDEBAR_MAX_WIDTH } from "@workspace/ui/components/sidebar-resize"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import {
	ToolQuestion,
	type ToolQuestionItem,
} from "@workspace/ui/components/tool-question"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import {
	AssistantTurn,
	PersonTurn,
	UserTurn,
} from "@workspace/ui/components/turn"

const ATLAS: MessageAuthor = {
	id: "atlas",
	name: "Atlas",
	title: "Planner",
	blot: BLOT_HUES.blue,
}

const PICO: MessageAuthor = {
	id: "pico",
	name: "Pico",
	title: "Builder",
	blot: BLOT_HUES.orange,
}

const JUNIPER: MessageAuthor = {
	id: "juniper",
	name: "Juniper",
	title: "Writer",
	blot: BLOT_HUES.green,
}

const at = (hours: number, minutes: number) =>
	new Date(2026, 2, 4, hours, minutes).getTime()

const noop = fn()

const ANSWER_DONE =
	"France leads with **412** people, then Germany with 268 and Spain with 190. Most of this week's 86 came from Germany: 51 of them."

const ANSWER_PARTIAL =
	"France leads with **412** people, then Germany with 268 and Spain with 190. Let me check"

type Line =
	| { key: string; from: "you"; text: string; time: number }
	| {
			key: string
			from: "agent"
			author: MessageAuthor
			text: string
			time: number
	  }
	| { key: string; from: "person"; name: string; text: string; time: number }

const rowOf = (line: Line): TranscriptItem => ({
	key: line.key,
	render: () => {
		if (line.from === "you")
			return (
				<UserTurn name="Sam" sentAt={line.time} copyText={line.text}>
					{line.text}
				</UserTurn>
			)
		if (line.from === "person")
			return (
				<PersonTurn name={line.name} sentAt={line.time} copyText={line.text}>
					{line.text}
				</PersonTurn>
			)
		return (
			<AssistantTurn
				author={line.author}
				sentAt={line.time}
				copyText={line.text}
			>
				<Markdown>{line.text}</Markdown>
			</AssistantTurn>
		)
	},
})

const ATLAS_THREAD: Line[] = [
	{
		key: "c1",
		from: "agent",
		author: ATLAS,
		text: "Yes, all 14 checks passed at 9:12.",
		time: at(9, 20),
	},
	{ key: "c2", from: "you", text: "Who has the demo video?", time: at(9, 22) },
	{
		key: "c3",
		from: "agent",
		author: ATLAS,
		text: "Lena. She's recording it this afternoon, 60 seconds.",
		time: at(9, 22),
	},
	{ key: "c4", from: "you", text: "And the waitlist?", time: at(9, 25) },
	{
		key: "c5",
		from: "agent",
		author: ATLAS,
		text: "**1,240** people, up 86 since Monday.",
		time: at(9, 26),
	},
	{
		key: "c6",
		from: "you",
		text: "Can you split it by country?",
		time: at(9, 40),
	},
]

const ATLAS_ROWS = ATLAS_THREAD.map(rowOf)

const DONE_ROW = rowOf({
	key: "c7",
	from: "agent",
	author: ATLAS,
	text: ANSWER_DONE,
	time: at(9, 41),
})

const PINNED: PinnedMessage[] = [
	{
		id: "c1",
		author: "Atlas",
		avatar: <BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />,
		timestamp: "09:20",
		excerpt: "Yes, all 14 checks passed at 9:12.",
	},
]

const PANEL_WIDTH = 1072

const PANEL_HUE = hueScopeOf("blue")

const NARROWEST_PANEL_WIDTH = 1024 - SIDEBAR_MAX_WIDTH

type PanelProps = {
	face: MessageAuthor
	rows?: TranscriptItem[]
	queue?: ReactNode
	composer?: ReactNode
	placeholder?: string
	children?: ReactNode
	overlay?: ReactNode
	leading?: ReactNode
	header?: ReactNode
	hasPins?: boolean
	label?: string
	width?: number
}

const Panel = ({
	face,
	rows,
	queue,
	composer,
	placeholder,
	children,
	overlay,
	leading,
	header,
	hasPins = true,
	label,
	width = PANEL_WIDTH,
}: PanelProps) => (
	<div
		className="relative h-[847px]"
		{...PANEL_HUE}
		style={{ ...PANEL_HUE.style, width }}
	>
		<RosterProvider bots={MENTIONED_BOTS}>
			<ContentCard isLandmark={false}>
				<ThreadLayout
					header={
						header ?? (
							<AppHeader
								isFloating
								leading={
									leading ?? (
										<HeaderIdentityButton
											blot={face.blot}
											connection="ready"
											name={face.name}
											seed={face.id}
											title={face.title}
										/>
									)
								}
								trailing={
									hasPins ? (
										<PinnedMessages
											messages={PINNED}
											onJump={noop}
											onUnpin={noop}
										/>
									) : undefined
								}
							/>
						)
					}
					isHeaderFloating
					rows={rows}
					label={label}
					queue={queue}
					composer={
						composer ?? (
							<PromptInput
								leading={<PromptAttachButton onAttach={noop} />}
								onSubmit={noop}
								placeholder={placeholder ?? `Message ${face.name}`}
							/>
						)
					}
				>
					{children ?? null}
				</ThreadLayout>
			</ContentCard>
		</RosterProvider>
		{overlay}
	</div>
)

type ConversationHeaderProps = {
	name: string
	icon: string
}

const ConversationHeader = ({ name, icon }: ConversationHeaderProps) => (
	<HeaderConversationButton
		color={BLOT_HUES.green}
		icon={icon}
		name={name}
		onOpenSettings={noop}
	/>
)

const LISBON_HEADER = <ConversationHeader name="Lisbon offsite" icon="Globe" />

type WorkLineExtra = {
	label?: string
	elapsedSeconds?: number
	waitingOn?: "you" | "next"
}

const workLine = (
	author: MessageAuthor,
	kind: "thinking" | "writing" | "working" | "waiting",
	extra: WorkLineExtra,
) => (
	<ActivityIndicator
		blot={author.blot}
		botId={author.id}
		kind={kind}
		name={author.name}
		seed={author.id}
		stoppable
		onStop={noop}
		{...extra}
	/>
)

const standalone = (key: string, node: ReactNode): TranscriptItem => ({
	key,
	render: () => <div className="ps-4.5">{node}</div>,
})

const meta = preview.meta({
	title: "Conversation/Message/Thread",
	component: ThreadLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The Final page of the Paper file Kiroshi, Chat rethought, one story per artboard and named after it. The conversation artboards render the thread panel the app hands its header, transcript and prompt to; the rail, the sidebar and the title bar around it belong to `Navigation/AppFrame`. The Space colour is the blue Space accent, never a fixed hue.",
			},
		},
	},
	globals: { theme: "dark" },
})

export const Conversations1 = meta.story({
	render: () => <Panel face={ATLAS} rows={[...ATLAS_ROWS, DONE_ROW]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 1: a one to one conversation at rest. Check every bubble against the PNG: agent on the start side, you on the end side in the Space colour, the author line at the foot of each.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "author-line")).toHaveLength(7)
		const answer = slotIn(canvasElement, "markdown").querySelector("p")
		if (!answer) throw new Error("The answer draws no paragraph")
		await expect(getComputedStyle(answer).fontSize).toBe("14px")
		await expect(getComputedStyle(answer).lineHeight).toBe("24px")
	},
})

const LONG_DRAFT =
	"Thanks. Before Thursday, can you turn this into a one-page brief for the board? Lead with the 1,240 total and the 86 this week, then the split by country with France, Germany and Spain on top. Add one line on why Germany moved, and keep the tone plain: no forecast, just what we can see today. If the Berlin newsletter explains most of it, say so in one sentence and link the post."

export const Conversations1b = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[...ATLAS_ROWS, DONE_ROW]}
			composer={
				<PromptInput
					leading={<PromptAttachButton onAttach={noop} />}
					onSubmit={noop}
					defaultValue={LONG_DRAFT}
				/>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 1b: the same conversation while you write a long message. Check that the field grew to its lines, its buttons moved to a row below and its corners dropped to 24.",
			},
		},
	},
})

const PRICING: Line[] = [
	{
		key: "p1",
		from: "agent",
		author: ATLAS,
		text: "Here they are. Tandem charges **per team**, Fieldnote **per seat**, and we sit in between at **\\$15 per person** on the annual plan. The three are on slide 6 of [Pricing deck](https://example.com).",
		time: at(10, 3),
	},
	{
		key: "p2",
		from: "person",
		name: "Tom",
		text: "Fieldnote went up in October, I think that page is old.",
		time: at(10, 5),
	},
	{
		key: "p3",
		from: "agent",
		author: ATLAS,
		text: "You're right. Fieldnote is **\\$18 per seat** since October 3, not \\$14. I've corrected slide 6.",
		time: at(10, 6),
	},
	{
		key: "p4",
		from: "you",
		text: "Good catch. @Pico can you put the corrected table on the pricing draft?",
		time: at(10, 8),
	},
	{
		key: "p5",
		from: "agent",
		author: PICO,
		text: "Done. The table is on the pricing draft behind the preview flag, with Fieldnote at \\$18 and the three columns Lena asked for. Nothing is live yet.",
		time: at(10, 14),
	},
]

export const Conversations2 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			leading={<ConversationHeader name="Pricing page" icon="CreditCard" />}
			rows={PRICING.map(rowOf)}
			placeholder="Message Pricing page"
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 2: a group conversation with two agents, another person and you. Check that Tom sits on the end side with a grey bubble and his initial, and that each agent's name wears its own colour.",
			},
		},
	},
})

const TITLES: Line[] = [
	{
		key: "j1",
		from: "you",
		text: "A title for the 1.4 post?",
		time: at(14, 2),
	},
	{
		key: "j2",
		from: "agent",
		author: JUNIPER,
		text: "Share a Space, keep your agents.",
		time: at(14, 2),
	},
	{ key: "j3", from: "you", text: "Shorter.", time: at(14, 3) },
	{
		key: "j4",
		from: "agent",
		author: JUNIPER,
		text: "Your agents, shared.",
		time: at(14, 3),
	},
]

export const Conversations3 = meta.story({
	render: () => (
		<Panel
			face={JUNIPER}
			rows={[
				{
					key: "today",
					render: () => <DaySeparator at={at(14, 2)} now={at(14, 5)} />,
				},
				...TITLES.map(rowOf),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 3: a short conversation that rests on the prompt, opened by the day line. Check that Today sits centred in 12 medium, with no rules either side.",
			},
		},
	},
})

const OFFSITE_ANSWER = `## 🏖️ Lisbon offsite, March 12–14

Three places fit 12 people on those dates. My pick is **Casa do Rio**: it's the only one with a room for the whole team and a kitchen we can use, and it leaves €1,050 in the budget.

### The three places

| Place | Area | Per night | Note |
| --- | --- | --- | --- |
| **Casa do Rio** | Alfama | €1,650 | Best fit |
| Quinta Azul | Sintra | €1,420 | 40 min by train |
| Hotel Miradouro | Chiado | €2,100 | Over budget |

### How the three days go

1. **Thursday**: arrive by 15:00, dinner on the terrace at 20:00.
2. **Friday**: planning day in the big room, 9:30 to 17:00, lunch delivered.
3. **Saturday**: free morning, checkout at 12:00.

### What I still need from you

- The headcount by Friday, so I can confirm the room at Casa do Rio.
- Whether anyone arrives on Wednesday night, for the extra night.
- Dietary needs for the terrace dinner, the kitchen asks a week ahead.

### Getting there

Everyone flies into Lisbon. Casa do Rio is twenty minutes from the airport by taxi, about €25 a car, or forty minutes on the metro with one change at Alameda. I can book three cars for 14:00 on Thursday if you want everyone to arrive together.`

export const Conversations4 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			leading={LISBON_HEADER}
			placeholder="Message Lisbon offsite"
			rows={[
				{
					key: "today",
					render: () => <DaySeparator at={at(14, 10)} now={at(14, 12)} />,
				},
				rowOf({
					key: "l1",
					from: "you",
					text: "Find us a place in Lisbon for the offsite: 12 people, March 12 to 14, under €6,000.",
					time: at(14, 10),
				}),
				rowOf({
					key: "l2",
					from: "agent",
					author: ATLAS,
					text: OFFSITE_ANSWER,
					time: at(14, 12),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 4: an answer taller than the transcript, with a heading, a table and a list, read from its top. Check the bubble keeps padding 18 around rich content and that its author line stays pinned to the bottom edge on the sticky fill, under a hairline on its top edge and 18 from both bubble edges, until the bubble's own end scrolls into view.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const viewport = slotIn(canvasElement, "message-scroller-viewport")
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
		)
		await waitFor(
			() => {
				viewport.scrollTop = 0
				expect(stuckLinesIn(canvasElement)).toHaveLength(1)
			},
			{ timeout: 3000 },
		)
		const [line] = stuckLinesIn(canvasElement)
		await expect(
			Math.round(
				viewport.getBoundingClientRect().bottom -
					line.getBoundingClientRect().bottom,
			),
		).toBe(BUBBLE_PADDING)
	},
})

const MISSION_CODE = `Tom's right. Yesterday's change moved the callback to \`/auth/callback\`, but Google still has the old address on file, so it refuses the return.

The fix puts the old address back next to the new one, so both work:

\`\`\`ts
redirectUris: [
  "https://beta.app.example/auth/callback",
  "https://beta.app.example/login/google", // old
],
\`\`\`

Tests pass. It goes out in two minutes once you say yes.`

export const Conversations5 = meta.story({
	render: () => (
		<Panel
			face={PICO}
			header={
				<MissionHeader
					bot={MISSION_BOT}
					objective="Fix the Google sign-in redirect"
					ticket={MISSION_TICKET}
					tools={MISSION_TOOLS}
					state="ready_to_merge"
					isWorking={false}
					openedAt={MISSION_OPENED_AT}
					now={MISSION_NOW}
					onBack={noop}
				/>
			}
			rows={[
				rowOf({
					key: "m1",
					from: "person",
					name: "Tom",
					text: "Sign-in with Google lands on a blank page since this morning.",
					time: at(11, 10),
				}),
				rowOf({
					key: "m2",
					from: "agent",
					author: PICO,
					text: MISSION_CODE,
					time: at(11, 18),
				}),
				{
					key: "m3",
					render: () => (
						<MissionEventRow
							event={{
								id: "ready",
								kind: "ready",
								source: "github",
								createdAt: at(11, 24),
							}}
							now={at(11, 45)}
							tools={[]}
						/>
					),
				},
				rowOf({
					key: "m4",
					from: "you",
					text: "Ship it. I'll write to the three people myself.",
					time: at(11, 39),
				}),
				rowOf({
					key: "m5",
					from: "agent",
					author: PICO,
					text: "Live at 11:42. No failed sign-in since; I'll keep watching until 14:00.",
					time: at(11, 42),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 5: a mission thread, with a code block in an answer and a mission line between bubbles. Check the mission line is centred with its 6 dot.",
			},
		},
	},
})

const COUNTRY_SPLIT: ToolQuestionItem = {
	question: "Which signups should I split by country?",
	header: "Country split",
	options: [
		{ label: "This week only", description: "The 86 who joined since Monday" },
		{ label: "Everyone on the waitlist", description: "All 1,240 people" },
	],
}

export const Conversations6 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS.slice(2),
				rowOf({
					key: "q1",
					from: "agent",
					author: ATLAS,
					text: "I can split it two ways. One question first.",
					time: at(9, 41),
				}),
			]}
			composer={
				<ToolQuestion
					questions={[COUNTRY_SPLIT]}
					onAnswer={noop}
					onDeny={noop}
				/>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 6: an agent asks a question, which takes the prompt's place. Check the question panel sits where the prompt was, 720 wide.",
			},
		},
	},
})

export const Conversations7 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			leading={LISBON_HEADER}
			placeholder="Message Lisbon offsite"
			rows={[
				rowOf({
					key: "n1",
					from: "you",
					text: "Can you plan Friday evening for the team?",
					time: at(14, 30),
				}),
				rowOf({
					key: "n2",
					from: "agent",
					author: ATLAS,
					text: "Friday ends at 17:00 and the evening is free. Here are four ideas that work for 12 people. **Tell me which one you want and I'll book it.**",
					time: at(14, 30),
				}),
				{
					key: "n3",
					render: () => (
						<UserTurn
							name="Sam"
							state="failed"
							failureReason="The connection dropped."
							onRetry={noop}
							sentAt={at(14, 31)}
						>
							The dinner, please. Book it for 20:00.
						</UserTurn>
					),
				},
			]}
		/>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Artboard Conversations 7: a message of yours that did not send. Check the bubble is dimmed and that, under it on the end side, the alert icon, Not sent. The connection dropped. and Retry sit on one line. The rich accordion in Atlas's answer is a markdown block another ticket owns.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "turn-not-sent")).toHaveTextContent(
			"Not sent. The connection dropped.",
		)
	},
})

const LISBON_BOTS: RosterBot[] = [ATLAS]

export const Conversations8 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			hasPins={false}
			leading={<ConversationHeader name="Lisbon flights" icon="Globe" />}
			placeholder="Message Lisbon flights"
		>
			<ConversationEmptyState
				bots={LISBON_BOTS}
				icon="Rocket"
				title="Lisbon flights"
			/>
		</Panel>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Conversations 8: a new conversation before its first message. Check the empty state sits centred above the prompt.",
			},
		},
	},
})

type BubbleSampleState = "rest" | "hover" | "focus"

type BubbleSampleProps = {
	state: BubbleSampleState
	tone: "agent" | "person" | "you"
	text: string
}

const SAMPLE_ACTIONS = (
	<>
		<MessageAction label="Pin" onClick={noop}>
			<Icons.Pin />
		</MessageAction>
		<MessageAction label="Reply" onClick={noop}>
			<Icons.Reply />
		</MessageAction>
		<MessageAction label="Copy" onClick={noop}>
			<Icons.Copy />
		</MessageAction>
	</>
)

const sampleLineOf = (tone: BubbleSampleProps["tone"]) => {
	if (tone === "agent")
		return (
			<AuthorLine
				tone="agent"
				name="Atlas"
				badge="Planner"
				hue={ATLAS.blot}
				avatar={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />}
				time="09:20"
				actions={SAMPLE_ACTIONS}
			/>
		)
	return (
		<AuthorLine
			tone={tone}
			name={tone === "you" ? "You" : "Tom"}
			avatar={
				<InitialsAvatar
					name={tone === "you" ? "Sam" : "Tom"}
					size={20}
					isOnOwnBubble={tone === "you"}
				/>
			}
			time={tone === "you" ? "09:20" : "10:05"}
			actions={SAMPLE_ACTIONS}
		/>
	)
}

const SHOWN_HOVER = {
	own: "[&>span[aria-hidden]]:bg-user-bubble-hover [&_[data-slot=author-line-actions]]:flex",
	grey: "[&>span[aria-hidden]]:bg-bubble-hover [&_[data-slot=author-line-actions]]:flex",
} as const

const SHOWN_FOCUS = {
	own: "outline-(--foreground) outline-2 outline-offset-2 outline-solid",
	grey: "outline-2 outline-primary outline-offset-2 outline-solid",
} as const

const BubbleSample = ({ state, tone, text }: BubbleSampleProps) => {
	const surface = tone === "you" ? "own" : "grey"

	return (
		<MessageSideContext.Provider value={tone === "agent" ? "start" : "end"}>
			<MessageBubble
				variant={tone === "you" ? "solid" : "soft"}
				className="w-auto"
			>
				<MessageBubbleContent
					data-state={state}
					tabIndex={0}
					foot={sampleLineOf(tone)}
					className={
						state === "rest"
							? undefined
							: [
									SHOWN_HOVER[surface],
									state === "focus" ? SHOWN_FOCUS[surface] : "",
								].join(" ")
					}
				>
					{text}
				</MessageBubbleContent>
			</MessageBubble>
		</MessageSideContext.Provider>
	)
}

const SAMPLE_STATES: BubbleSampleState[] = ["rest", "hover", "focus"]

const SAMPLE_TEXT = {
	agent: "Yes, all 14 checks passed at 9:12.",
	person: "Fieldnote went up in October, I think that page is old.",
	you: "Is the build green?",
} as const

type CaptionProps = {
	children: ReactNode
}

const Caption = ({ children }: CaptionProps) => (
	<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
		{children}
	</p>
)

export const ComponentsMessageBubble = meta.story({
	render: () => (
		<div className="flex flex-col gap-10 p-14" {...hueScopeOf("blue")}>
			{(["agent", "person", "you"] as const).map((tone) => (
				<section key={tone} className="flex flex-col gap-3">
					<Caption>{`${tone} · rest, hover, focus`}</Caption>
					<div className="flex items-start gap-6">
						{SAMPLE_STATES.map((state) => (
							<BubbleSample
								key={state}
								state={state}
								tone={tone}
								text={SAMPLE_TEXT[tone]}
							/>
						))}
					</div>
				</section>
			))}
			<section className="flex flex-col gap-3">
				<Caption>Right click · same actions as hover, in a menu</Caption>
				<div className="w-90">
					<AssistantTurn
						author={ATLAS}
						sentAt={at(9, 20)}
						copyText={SAMPLE_TEXT.agent}
						onPin={noop}
						onReply={noop}
					>
						{SAMPLE_TEXT.agent}
					</AssistantTurn>
				</div>
			</section>
		</div>
	),
	play: async ({ canvasElement }) => {
		const [, , , , , , , , , turn] = slotsIn(
			canvasElement,
			"message-bubble-content",
		)
		if (!turn) throw new Error("The right-click sample is missing")
		const box = turn.getBoundingClientRect()
		const at = { clientX: box.left + 12, clientY: box.top + 12 }
		fireEvent.pointerDown(turn, { button: 2, ...at })
		fireEvent.contextMenu(turn, at)
		await expect(
			await screen.findByRole("menu", { name: "Message actions" }),
		).toBeInTheDocument()
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Components MessageBubble states. Check each row: at rest, hovered (fill to white 8 percent, Pin, Reply and Copy after a divider) and keyboard focused (a 2 px ring at offset 2, Space colour on grey bubbles, near-white on yours). The hovered and focused samples draw their state's classes on purpose, since a still frame raises no pointer; the live hover and focus are proved in `Conversation/Message/Turn` `HoverActions`, the right-click menu in `Conversation/Message/MessageActions`.",
			},
		},
	},
})

const STICKY_ANSWER =
	"Three places fit 12 people on those dates. My pick is Casa do Rio: it's the only one with a room for the whole team and a kitchen we can use, and it leaves €1,050 in the budget."

const StuckSample = () => (
	<section
		aria-label="Stuck author line"
		data-slot="message-scroller-viewport"
		className="h-26 w-90 overflow-y-auto"
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region takes keyboard focus so it can be scrolled
		tabIndex={0}
	>
		<MessageBubble variant="soft">
			<MessageBubbleContent
				foot={
					<AuthorLine
						tone="agent"
						name="Atlas"
						badge="Planner"
						hue={ATLAS.blot}
						avatar={
							<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />
						}
						time="14:12"
						isSticky
					/>
				}
			>
				{STICKY_ANSWER}
			</MessageBubbleContent>
		</MessageBubble>
	</section>
)

const stuckLinesIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "author-line").filter(
		(line) => line.dataset.stuck === "true",
	)

const ACTION_ROWS: TranscriptItem[] = [
	{
		key: "agent",
		render: () => (
			<AssistantTurn
				author={ATLAS}
				sentAt={at(9, 20)}
				copyText={SAMPLE_TEXT.agent}
				onReply={noop}
				onPin={noop}
			>
				{SAMPLE_TEXT.agent}
			</AssistantTurn>
		),
	},
	{
		key: "person",
		render: () => (
			<PersonTurn
				name="Tom"
				sentAt={at(10, 5)}
				copyText={SAMPLE_TEXT.person}
				onReply={noop}
				onPin={noop}
			>
				{SAMPLE_TEXT.person}
			</PersonTurn>
		),
	},
	{
		key: "you",
		render: () => (
			<UserTurn
				name="Sam"
				sentAt={at(10, 6)}
				copyText={SAMPLE_TEXT.you}
				onReply={noop}
				onPin={noop}
			>
				{SAMPLE_TEXT.you}
			</UserTurn>
		),
	},
]

const lineOf = (canvasElement: HTMLElement, tone: string) => {
	const line = slotsIn(canvasElement, "author-line").find(
		(candidate) => candidate.dataset.tone === tone,
	)
	if (!line) throw new Error(`No ${tone} author line`)
	return line
}

type ActionRow = {
	buttons: string[]
	dividerIsFirst: boolean
	isBeforeAvatar: boolean
}

const actionRowOf = (line: HTMLElement): ActionRow => {
	const row = slotIn(line, "author-line-actions")
	const avatar = slotIn(line, "author-line-name").previousElementSibling
	if (!avatar) throw new Error("No avatar before the name")
	return {
		buttons: Array.from(row.querySelectorAll("button")).map(
			(button) => button.getAttribute("aria-label") ?? "",
		),
		dividerIsFirst:
			row.firstElementChild?.getAttribute("aria-hidden") === "true",
		isBeforeAvatar:
			row.getBoundingClientRect().right <= avatar.getBoundingClientRect().left,
	}
}

export const UserAuthorLineMirrored = meta.story({
	render: () => (
		<div className="[&_[data-slot=author-line-actions]]:flex">
			<Panel face={ATLAS} rows={ACTION_ROWS} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your author line and another person's are the agent's mirrored, actions shown as on hover. Check the agent reads avatar, name, badge, time, divider, then Pin, Reply and Copy, and that yours and Tom's read Copy, Reply and Pin, the divider, then the avatar, the name and the time.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(actionRowOf(lineOf(canvasElement, "agent"))).toEqual({
			buttons: ["Pin", "Reply", "Copy"],
			dividerIsFirst: true,
			isBeforeAvatar: false,
		})
		for (const tone of ["person", "you"])
			await expect(actionRowOf(lineOf(canvasElement, tone))).toEqual({
				buttons: ["Copy", "Reply", "Pin"],
				dividerIsFirst: false,
				isBeforeAvatar: true,
			})
	},
})

const LONG_OWN_MESSAGE = [
	"Before we book anything for Lisbon, here is everything I know so far, so you can plan around it rather than guess.",
	"We are twelve, maybe thirteen if Lena's partner joins, arriving on Thursday the 12th and leaving on Saturday the 14th after lunch. Three people fly in from Berlin and land around 13:00, the rest come from Paris on the morning flight and should be at the airport by 11:30.",
	"The budget is €6,000 for everything: rooms, the planning room on Friday, food and getting around. I would rather keep €500 aside for surprises, so plan for €5,500 and tell me early if that does not hold.",
	"We need one room big enough for the whole team on Friday from 9:30 to 17:00, with a screen and decent wifi, and somewhere we can eat together on Thursday night. A kitchen we can use would be a bonus, two of us cook and it would save on the dinners.",
	"Dietary needs so far: two vegetarians, one vegan, one person who cannot eat nuts at all, so the kitchen has to know ahead. I will chase the others by Friday.",
	"Keep it walkable if you can. Half the team will not want taxis every morning, and the Saturday morning is free, so being close to the river or the old town would make that morning worth it.",
	"For Friday, the planning day matters more than the rooms. We will spend most of it on the roadmap for the spring, so we need a room where twelve people can sit around one table, a wall or a board we can write on, and a second smaller room for when we split into two groups after lunch.",
	"On Thursday night I would like the dinner to feel like the start of the offsite rather than another work evening. A terrace or a garden would be perfect, and if the place has its own kitchen we can do the dinner ourselves and spend the money on the Saturday lunch instead.",
	"Last thing: Marc needs a ground floor room or a lift, his knee is still healing. Please check that before anything else, it rules places out faster than the budget does.",
].join(" ")

const LISBON_DAY: TranscriptItem = {
	key: "today",
	render: () => <DaySeparator at={at(14, 10)} now={at(14, 12)} />,
}

const LISBON_QUESTION = rowOf({
	key: "question",
	from: "you",
	text: "Find us a place in Lisbon for the offsite: 12 people, March 12 to 14, under €6,000.",
	time: at(14, 10),
})

type ThemedPanelsProps = {
	rows: TranscriptItem[]
	width?: number
}

const ThemedPanels = ({ rows, width }: ThemedPanelsProps) => (
	<div className="flex flex-col">
		{(["Light", "Dark"] as const).map((theme) => (
			<section
				key={theme}
				aria-label={`${theme} theme`}
				className={theme === "Dark" ? "dark" : undefined}
			>
				<Panel
					face={ATLAS}
					leading={LISBON_HEADER}
					rows={rows}
					width={width}
					label={`Lisbon offsite, ${theme} theme`}
				/>
			</section>
		))}
	</div>
)

const paintedRgb = (...colours: string[]) => {
	const canvas = document.createElement("canvas")
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext("2d")
	if (!context) throw new Error("No 2D canvas to paint on")
	for (const colour of colours) {
		context.fillStyle = colour
		context.fillRect(0, 0, 1, 1)
	}
	return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
}

const widestChannelGap = (first: number[], second: number[]) =>
	Math.max(...first.map((channel, index) => Math.abs(channel - second[index])))

const BUBBLE_PADDING = 18

const AUTHOR_LINE_GAP = 8

const pinnedLineIn = async (viewport: HTMLElement, tone: string) => {
	await waitFor(() =>
		expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
	)
	await waitFor(
		() => {
			viewport.scrollTop = 0
			expect(lineOf(viewport, tone).dataset.stuck).toBe("true")
		},
		{ timeout: 3000 },
	)
	const line = lineOf(viewport, tone)
	return line
}

const stuckLineIn = async (viewport: HTMLElement, tone: string) => {
	const line = await pinnedLineIn(viewport, tone)
	const content = line.closest<HTMLElement>(
		'[data-slot="message-bubble-content"]',
	)
	const surface = content?.querySelector(":scope > span[aria-hidden='true']")
	const screen = line.closest('[data-slot="chat-layout"]')
	if (!content || !surface || !screen)
		throw new Error("The stuck line sits outside a painted bubble")
	return { line, content, surface, screen }
}

type StuckLine = Awaited<ReturnType<typeof stuckLineIn>>

const SURFACE_LAYER = /^linear-gradient\((.+), \1\)$/

const paintedBlockRgb = (line: HTMLElement) => {
	const block = getComputedStyle(line, "::before")
	const layer = SURFACE_LAYER.exec(block.backgroundImage)?.[1]
	if (!layer) throw new Error("The stuck block paints no bubble surface")
	return paintedRgb(block.backgroundColor, layer)
}

const paintedBubbleRgb = ({ screen, surface }: StuckLine) =>
	paintedRgb(
		getComputedStyle(screen).backgroundColor,
		getComputedStyle(surface).backgroundColor,
	)

const expectBlockHasHairline = async (line: HTMLElement) => {
	const block = getComputedStyle(line, "::before")
	await expect([block.borderTopWidth, block.borderTopStyle]).toEqual([
		"1px",
		"solid",
	])
	await expect(
		widestChannelGap(
			paintedRgb("#808080", block.borderTopColor),
			paintedRgb(
				"#808080",
				getComputedStyle(line).getPropertyValue("--shell-border"),
			),
		),
	).toBeLessThanOrEqual(1)
}

const expectBlockPaintsBubble = async (stuck: StuckLine) => {
	await expect(
		getComputedStyle(stuck.line, "::before").backgroundColor,
	).toMatch(/^rgb\(/)
	await expect(
		widestChannelGap(paintedBubbleRgb(stuck), paintedBlockRgb(stuck.line)),
	).toBeLessThanOrEqual(1)
}

const expectCleanCutStuckLine = async (
	canvasElement: HTMLElement,
	tone: string,
) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	for (const viewport of viewports) {
		const stuck = await stuckLineIn(viewport, tone)
		const { line, content } = stuck
		const block = getComputedStyle(line, "::before")
		const lineBox = line.getBoundingClientRect()
		await expect(
			Math.round(viewport.getBoundingClientRect().bottom - lineBox.bottom),
		).toBe(BUBBLE_PADDING)
		await expect(block.bottom).toBe(`-${BUBBLE_PADDING}px`)
		await expect(block.top).toBe(`-${BUBBLE_PADDING}px`)
		await expect(
			Math.round(
				(line.nextElementSibling?.getBoundingClientRect().top ?? 0) -
					slotIn(content, "message-bubble-text").getBoundingClientRect().bottom,
			),
		).toBe(AUTHOR_LINE_GAP + lineBox.height)
		await expect(block.left).toBe(`-${BUBBLE_PADDING}px`)
		await expect(
			Math.round(lineBox.left - content.getBoundingClientRect().left),
		).toBe(BUBBLE_PADDING)
		await expect(Math.round(lineBox.width + 2 * BUBBLE_PADDING)).toBe(
			Math.round(content.getBoundingClientRect().width),
		)
		await expect([
			block.borderBottomLeftRadius,
			block.borderBottomRightRadius,
		]).toEqual(["0px", "0px"])
		await expect(getComputedStyle(content).overflow).toBe("clip")
		await expectBlockHasHairline(line)
		await expectBlockPaintsBubble(stuck)
	}
}

const expectUnwrappedStuckBlockPaintsRestingBubble = async (
	canvasElement: HTMLElement,
) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	for (const viewport of viewports) {
		const line = await pinnedLineIn(viewport, "agent")
		const tokens = getComputedStyle(line)
		const restingBubble = paintedRgb(
			tokens.getPropertyValue("--card"),
			tokens.getPropertyValue("--bubble"),
		)
		await expect(
			widestChannelGap(restingBubble, paintedBlockRgb(line)),
		).toBeLessThanOrEqual(1)
		await expectBlockHasHairline(line)
	}
}

const expectHoveredStuckBlockPaintsBubble = async (
	canvasElement: HTMLElement,
	tone: string,
) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	if (!isInBrowserRunner()) return
	const pointer = await realPointer()
	for (const viewport of viewports) {
		const stuck = await stuckLineIn(viewport, tone)
		const resting = paintedBubbleRgb(stuck)
		await pointer.hover(slotIn(stuck.line, "author-line-name"))
		await stuckLineIn(viewport, tone)
		await waitFor(() =>
			expect(
				widestChannelGap(resting, paintedBubbleRgb(stuck)),
			).toBeGreaterThan(1),
		)
		await expectBlockHasHairline(stuck.line)
		await expectBlockPaintsBubble(stuck)
	}
	await pointer.unhover(viewports[1])
}

export const UserAuthorLineStuckOnALongMessage = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				rowOf({
					key: "brief",
					from: "you",
					text: LONG_OWN_MESSAGE,
					time: at(14, 10),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your message taller than the transcript, read from its top, light then dark. Check your author line stays pinned 18 above the transcript's bottom edge, the way an agent's does, on a block in your bubble's colour under a hairline, 18 from both bubble edges, that spans the bubble and runs square to the edge, so the message reads cut by the edge rather than closed.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectCleanCutStuckLine(canvasElement, "you"),
})

export const AgentAuthorLineStuckOnALongAnswer = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				LISBON_QUESTION,
				rowOf({
					key: "answer",
					from: "agent",
					author: ATLAS,
					text: OFFSITE_ANSWER,
					time: at(14, 12),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An answer taller than the transcript, read from its top, light then dark. Check the author line stays pinned 18 above the transcript's bottom edge on a block in the bubble's own grey under a hairline, 18 from both bubble edges, square at the foot and running to the edge, and that the answer scrolling under it is cut at the bubble's sides.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectCleanCutStuckLine(canvasElement, "agent"),
})

const surfaceOf = (line: HTMLElement) => {
	const surface = line
		.closest('[data-slot="message-bubble-content"]')
		?.querySelector<HTMLElement>(":scope > span[aria-hidden='true']")
	if (!surface) throw new Error("The author line sits outside a painted bubble")
	return surface
}

const scrollLineTo = async (
	viewport: HTMLElement,
	line: HTMLElement,
	isStuck: boolean,
) => {
	const surface = surfaceOf(line)
	await waitFor(
		() => {
			const bubble = surface.getBoundingClientRect()
			const frame = viewport.getBoundingClientRect()
			viewport.scrollTop +=
				bubble.bottom - frame.bottom + (isStuck ? -3 : 1) * BUBBLE_PADDING
			expect(line.dataset.stuck).toBe(String(isStuck))
		},
		{ timeout: 3000 },
	)
}

const authorLineGeometry = (line: HTMLElement) => {
	const bubble = surfaceOf(line).getBoundingClientRect()
	const lineBox = line.getBoundingClientRect()
	const footEdge =
		line.dataset.stuck === "true"
			? lineBox.bottom -
				Number.parseFloat(getComputedStyle(line, "::before").bottom)
			: bubble.bottom
	const inlineOffsets = (box: DOMRect) => [
		Math.round(box.left - bubble.left),
		Math.round(bubble.right - box.right),
	]
	return {
		padding: [...inlineOffsets(lineBox), Math.round(footEdge - lineBox.bottom)],
		size: [Math.round(lineBox.width), Math.round(lineBox.height)],
		contents: Array.from(line.querySelectorAll("*"), (child) =>
			child.getBoundingClientRect(),
		)
			.filter((box) => box.width > 0)
			.map(inlineOffsets),
	}
}

const expectSameGeometryStuck = async (canvasElement: HTMLElement) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	for (const viewport of viewports) {
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
		)
		for (const tone of ["agent", "you"]) {
			const line = lineOf(viewport, tone)
			await scrollLineTo(viewport, line, false)
			const inPlace = authorLineGeometry(line)
			await scrollLineTo(viewport, line, true)
			const stuck = authorLineGeometry(line)
			await expect(inPlace.padding).toEqual([
				BUBBLE_PADDING,
				BUBBLE_PADDING,
				BUBBLE_PADDING,
			])
			await expect(stuck).toEqual(inPlace)
		}
	}
}

export const AuthorLinesKeepTheirPaddingWhenStuck = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				rowOf({
					key: "brief",
					from: "you",
					text: LONG_OWN_MESSAGE,
					time: at(14, 10),
				}),
				rowOf({
					key: "answer",
					from: "agent",
					author: ATLAS,
					text: OFFSITE_ANSWER,
					time: at(14, 12),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your message and an answer, both taller than the transcript, light then dark. Scroll each until its end shows, then until its end hides under the bottom edge. Check the author line keeps 18 from both bubble edges and 18 above the foot of its block, with its avatar, name, badge and time where they rested, so nothing moves when it sticks.",
			},
		},
	},
	play: async ({ canvasElement }) => expectSameGeometryStuck(canvasElement),
})

export const UserAuthorLineStuckOnAHoveredMessage = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				rowOf({
					key: "brief",
					from: "you",
					text: LONG_OWN_MESSAGE,
					time: at(14, 10),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your long message read from its top with the pointer on it, light then dark. Check the stuck block under your author line turns the bubble's hover colour along with the bubble, at once, so the line never sits on a resting patch.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectHoveredStuckBlockPaintsBubble(canvasElement, "you"),
})

export const AgentAuthorLineStuckOnAHoveredAnswer = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				LISBON_QUESTION,
				rowOf({
					key: "answer",
					from: "agent",
					author: ATLAS,
					text: OFFSITE_ANSWER,
					time: at(14, 12),
				}),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A long answer read from its top with the pointer on it, light then dark. Check the stuck block under the author line darkens with the hovered bubble to the same grey, at once, and still hides the answer scrolling under it.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectHoveredStuckBlockPaintsBubble(canvasElement, "agent"),
})

export const AgentAuthorLineStuckOnAnUnwrappedAnswer = meta.story({
	tags: ["test-only"],
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels
			rows={[
				LISBON_DAY,
				LISBON_QUESTION,
				{
					key: "answer",
					render: () => (
						<AssistantTurn
							author={ATLAS}
							sentAt={at(14, 12)}
							copyText={OFFSITE_ANSWER}
							bare
						>
							<Markdown>{OFFSITE_ANSWER}</Markdown>
						</AssistantTurn>
					),
				},
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An unwrapped answer taller than the transcript, read from its top, light then dark. Check the stuck block under the author line keeps the resting agent bubble grey although no bubble surface sits around it.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectUnwrappedStuckBlockPaintsRestingBubble(canvasElement),
})

const LONG_ANSWER_ROWS = [
	LISBON_DAY,
	LISBON_QUESTION,
	rowOf({
		key: "answer",
		from: "agent",
		author: ATLAS,
		text: OFFSITE_ANSWER,
		time: at(14, 12),
	}),
]

const PINNED_BUBBLE_WIDTH = 580

const NARROWEST_PINNED_BUBBLE_WIDTH = 550

const jumpOf = (viewport: HTMLElement) => {
	const scroller = viewport.closest<HTMLElement>(
		'[data-slot="message-scroller"]',
	)
	if (!scroller) throw new Error("The viewport sits outside a transcript")
	return slotIn(scroller, "message-scroller-button")
}

const identityOf = (line: HTMLElement) => {
	const name = slotIn(line, "author-line-name")
	const badge = slotIn(line, "bot-title-badge")
	const time = badge.nextElementSibling
	if (!(time instanceof HTMLElement)) throw new Error("No time after the badge")
	return [name, badge, time]
}

const verticalCentreOf = (box: DOMRect) => (box.top + box.bottom) / 2

const horizontalCentreOf = (box: DOMRect) => (box.left + box.right) / 2

const expectIdentityInFull = async (line: HTMLElement) => {
	const lineCentre = verticalCentreOf(line.getBoundingClientRect())
	for (const element of identityOf(line)) {
		await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)
		await expect(
			Math.abs(verticalCentreOf(element.getBoundingClientRect()) - lineCentre),
		).toBeLessThanOrEqual(1)
	}
}

const expectLineInPlace = async (canvasElement: HTMLElement) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	for (const viewport of viewports) {
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
		)
		await waitFor(() => {
			expect(lineOf(viewport, "agent").dataset.stuck).toBe("false")
			expect(jumpOf(viewport).dataset.active).toBe("false")
		})
		await expect(
			getComputedStyle(lineOf(viewport, "agent"), "::before").display,
		).toBe("none")
		await expectIdentityInFull(lineOf(viewport, "agent"))
	}
}

const releaseFollow = (viewport: HTMLElement) =>
	viewport.dispatchEvent(
		new WheelEvent("wheel", { bubbles: true, deltaY: -200 }),
	)

const JUMP_SIZE = 32

const expectIconOnlyJumpOverTheInput = async (viewport: HTMLElement) => {
	const jump = jumpOf(viewport)
	const screen = viewport.closest('[data-slot="chat-layout"]')
	if (!screen) throw new Error("The transcript sits outside a thread")
	const input = slotIn(screen, "prompt-input").getBoundingClientRect()
	await waitFor(async () => {
		const box = jump.getBoundingClientRect()
		await expect(jump.dataset.active).toBe("true")
		await expect([box.width, box.height]).toEqual([JUMP_SIZE, JUMP_SIZE])
		await expect(
			Math.abs(horizontalCentreOf(box) - horizontalCentreOf(input)),
		).toBeLessThanOrEqual(1)
		await expect(box.bottom).toBeLessThanOrEqual(input.top)
	})
	await expect(jump).toHaveAccessibleName("Jump to latest")
	await expect(jump).toHaveTextContent("")
	await expect(jump.querySelector("svg")).toBeVisible()
	await expect(
		Number.parseFloat(getComputedStyle(jump).borderTopLeftRadius),
	).toBeGreaterThanOrEqual(JUMP_SIZE / 2)
}

const expectJumpFocusedWithARing = async (jump: HTMLElement) => {
	jump.focus()
	await userEvent.tab()
	await userEvent.tab({ shift: true })
	await expect(jump).toHaveFocus()
	await expect(jump.matches(":focus-visible")).toBe(true)
	await expect(getComputedStyle(jump).boxShadow).not.toBe("none")
}

const expectJumpTooltip = async (jump: HTMLElement) => {
	await userEvent.hover(jump)
	await expect(await screen.findByRole("tooltip")).toHaveTextContent(
		"Jump to latest",
	)
	await userEvent.unhover(jump)
}

type PinnedSamplesProps = {
	width: number
}

const PinnedSamples = ({ width }: PinnedSamplesProps) => (
	<div className="flex flex-col">
		{(["Light", "Dark"] as const).map((theme) => (
			<section
				key={theme}
				aria-label={`${theme} theme`}
				className={theme === "Dark" ? "dark bg-card p-4" : "bg-card p-4"}
			>
				<section
					aria-label={`Pinned author line, ${theme} theme`}
					data-slot="message-scroller-viewport"
					className="h-80 overflow-y-auto"
					style={{ width }}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region takes keyboard focus so it can be scrolled
					tabIndex={0}
				>
					<MessageBubble variant="soft">
						<MessageBubbleContent
							foot={
								<AuthorLine
									tone="agent"
									name="Atlas"
									badge="Planner"
									hue={ATLAS.blot}
									avatar={
										<BotIdentityAvatar
											hue={ATLAS.blot}
											seed="atlas"
											size={20}
										/>
									}
									time="14:12"
									isSticky
								/>
							}
						>
							<Markdown>{OFFSITE_ANSWER}</Markdown>
						</MessageBubbleContent>
					</MessageBubble>
				</section>
			</section>
		))}
	</div>
)

const expectPinnedWithoutJump = async (canvasElement: HTMLElement) => {
	const viewports = slotsIn(canvasElement, "message-scroller-viewport")
	await expect(viewports).toHaveLength(2)
	for (const viewport of viewports) {
		const line = await pinnedLineIn(viewport, "agent")
		const block = getComputedStyle(line, "::before")
		await expect(
			viewport.querySelector('[data-slot="message-scroller-button"]'),
		).toBeNull()
		await expect(block.left).toBe(`-${BUBBLE_PADDING}px`)
		await expect(
			Math.round(
				viewport.getBoundingClientRect().bottom -
					line.getBoundingClientRect().bottom,
			),
		).toBe(BUBBLE_PADDING)
		await expectBlockHasHairline(line)
		await expectIdentityInFull(line)
	}
}

export const AgentAuthorLineInPlace = meta.story({
	globals: { theme: "light" },
	render: () => <ThemedPanels rows={LONG_ANSWER_ROWS} />,
	parameters: {
		docs: {
			description: {
				story:
					"A long answer read to its end, light then dark. Check the author line rests in place at the foot of the bubble, 18 from its edges, on no bar and with no hairline, and that Jump to latest shows in neither position.",
			},
		},
	},
	play: async ({ canvasElement }) => expectLineInPlace(canvasElement),
})

export const AgentAuthorLineInPlaceAtTheNarrowestWidth = meta.story({
	globals: { theme: "light" },
	render: () => (
		<ThemedPanels rows={LONG_ANSWER_ROWS} width={NARROWEST_PANEL_WIDTH} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same answer in the thread the 1024 window leaves beside the widest sidebar, light then dark. Check the author line rests in place with its name, badge and time in full on one row.",
			},
		},
	},
	play: async ({ canvasElement }) => expectLineInPlace(canvasElement),
})

export const AgentAuthorLinePinned = meta.story({
	tags: ["test-only"],
	globals: { theme: "light" },
	render: () => <PinnedSamples width={PINNED_BUBBLE_WIDTH} />,
	parameters: {
		docs: {
			description: {
				story:
					"The author line pinned on its own, in a scroll region with no transcript around it, light then dark. Check the bar runs 56 high under a hairline, 18 from both bubble edges, on the bubble's grey.",
			},
		},
	},
	play: async ({ canvasElement }) => expectPinnedWithoutJump(canvasElement),
})

export const AgentAuthorLinePinnedAtTheNarrowestWidth = meta.story({
	tags: ["test-only"],
	globals: { theme: "light" },
	render: () => <PinnedSamples width={NARROWEST_PINNED_BUBBLE_WIDTH} />,
	parameters: {
		docs: {
			description: {
				story:
					"The pinned author line at the bubble width of the 1024 window beside the widest sidebar, light then dark. Check the name, badge and time stay in full on one row.",
			},
		},
	},
	play: async ({ canvasElement }) => expectPinnedWithoutJump(canvasElement),
})

export const AgentAuthorLineStuckWithJumpToLatestFloating = meta.story({
	globals: { theme: "light" },
	render: () => <ThemedPanels rows={LONG_ANSWER_ROWS} />,
	parameters: {
		docs: {
			description: {
				story:
					"A long answer read from its top, light then dark. Check the pinned bar carries no button while Jump to latest floats centred over the input as a 32 circle drawing only its arrow, named and tooltipped Jump to latest, and that the keyboard reaches it with a visible ring.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const viewports = slotsIn(canvasElement, "message-scroller-viewport")
		await expect(viewports).toHaveLength(2)
		for (const viewport of viewports) {
			releaseFollow(viewport)
			const line = await pinnedLineIn(viewport, "agent")
			await expectIconOnlyJumpOverTheInput(viewport)
			await expect(
				within(line).queryByRole("button", { name: "Jump to latest" }),
			).toBeNull()
			await expect(
				line.querySelector('[data-slot="message-scroller-button"]'),
			).toBeNull()
			await expectBlockHasHairline(line)
			await expectIdentityInFull(line)
		}
		await expectJumpFocusedWithARing(jumpOf(viewports[0]))
		await expectJumpTooltip(jumpOf(viewports[0]))
	},
})

const SCROLLED_UP_ROWS = [
	...LONG_ANSWER_ROWS,
	rowOf({
		key: "followup",
		from: "you",
		text: "Does Casa do Rio have a ground floor room?",
		time: at(14, 14),
	}),
	rowOf({
		key: "followup-answer",
		from: "agent",
		author: ATLAS,
		text: "Yes, two, both with step-free access from the street.",
		time: at(14, 15),
	}),
	rowOf({
		key: "booking",
		from: "you",
		text: "Book it.",
		time: at(14, 16),
	}),
	rowOf({
		key: "booked",
		from: "agent",
		author: ATLAS,
		text: "Booked for March 12 to 14. The confirmation is in your inbox.",
		time: at(14, 17),
	}),
]

export const ScrolledUpWithNothingStuckFloatsJumpToLatest = meta.story({
	globals: { theme: "light" },
	render: () => <ThemedPanels rows={SCROLLED_UP_ROWS} />,
	parameters: {
		docs: {
			description: {
				story:
					"A thread scrolled up to the end of a short message, with no author line pinned, light then dark. Check Jump to latest floats centred over the input as the same arrow-only circle, named Jump to latest, as on any thread read away from its end.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const viewports = slotsIn(canvasElement, "message-scroller-viewport")
		await expect(viewports).toHaveLength(2)
		for (const viewport of viewports) {
			const followup = viewport.querySelector('[data-message-id="followup"]')
			if (!followup) throw new Error("No follow-up row")
			releaseFollow(viewport)
			await waitFor(
				() => {
					viewport.scrollTop +=
						followup.getBoundingClientRect().bottom -
						viewport.getBoundingClientRect().bottom
					expect(stuckLinesIn(viewport)).toHaveLength(0)
					expect(jumpOf(viewport).dataset.active).toBe("true")
				},
				{ timeout: 3000 },
			)
			await expectIconOnlyJumpOverTheInput(viewport)
		}
	},
})

export const ComponentsAuthorLineAndWorkLine = meta.story({
	render: () => (
		<div className="flex flex-col gap-8 p-14" {...hueScopeOf("blue")}>
			<Caption>Identity</Caption>
			<div className="flex items-center gap-10">
				<AuthorLine
					tone="agent"
					name="Atlas"
					badge="Planner"
					hue={ATLAS.blot}
					avatar={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />}
					time="09:41"
				/>
				<AuthorLine
					tone="person"
					name="Lena"
					avatar={<InitialsAvatar name="Lena" size={20} />}
					time="10:02"
				/>
				<span className="surface-user-bubble on-user-bubble flex h-7 items-center rounded-[10px] px-2.5 text-user-bubble-foreground">
					<AuthorLine
						tone="you"
						name="You"
						avatar={<InitialsAvatar name="Sam" size={20} isOnOwnBubble />}
						time="10:08"
					/>
				</span>
				<AuthorLine
					tone="agent"
					name="Pico"
					badge="Lead"
					hue={PICO.blot}
					avatar={<BotIdentityAvatar hue={PICO.blot} seed="pico" size={20} />}
					time="10:14"
				/>
				<AuthorLine
					tone="deleted"
					name="Deleted agent"
					avatar={<span className="size-5 rounded-sm bg-foreground/12" />}
					time="Mon"
				/>
			</div>
			<Caption>Work line · same slot, same height</Caption>
			<div className="flex items-center gap-10">
				{workLine(ATLAS, "thinking", { elapsedSeconds: 4 })}
				{workLine(ATLAS, "writing", { elapsedSeconds: 9 })}
				{workLine(ATLAS, "working", {
					label: "mcp__linear__get_issue",
					elapsedSeconds: 21,
				})}
				{workLine(ATLAS, "waiting", {})}
				{workLine(PICO, "waiting", { waitingOn: "next" })}
			</div>
			<Caption>How an answer ends</Caption>
			<div className="flex items-center gap-10">
				<AuthorLine
					tone="agent"
					name="Atlas"
					badge="Planner"
					hue={ATLAS.blot}
					avatar={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />}
					time="09:41"
				/>
				<AuthorLine
					tone="agent"
					name="Atlas"
					hue={ATLAS.blot}
					avatar={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />}
					time="09:41"
					end="stopped"
				/>
				<AuthorLine
					tone="agent"
					name="Atlas"
					hue={ATLAS.blot}
					avatar={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={20} />}
					time="09:41"
					end="failed"
					onRetry={noop}
				/>
			</div>
			<Caption>Hover or focus · queued · stuck to the viewport</Caption>
			<div className="flex items-center gap-10">
				<span className="[&_[data-slot=author-line-actions]]:flex">
					{sampleLineOf("agent")}
				</span>
				<AuthorLineQueued onCancel={noop} />
				<StuckSample />
			</div>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Components AuthorLine and WorkLine states. Check every author line is 20 high, the work lines sit in the same 20, thinking, writing and the tool sweep their highlight while waiting for you and up next stay still, and the failed end carries a 22 high Retry.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const line of slotsIn(canvasElement, "bot-working"))
			await expect(line.getBoundingClientRect().height).toBe(20)
		await waitFor(() => expect(stuckLinesIn(canvasElement)).toHaveLength(1))
	},
})

export const ComponentsThreadFurniture = meta.story({
	render: () => (
		<div className="grid grid-cols-3 gap-12 p-14" {...hueScopeOf("blue")}>
			<section className="flex flex-col gap-3">
				<Caption>DaySeparator</Caption>
				<DaySeparator at={at(9, 0) - 86_400_000} now={at(9, 0)} />
			</section>
			<section className="flex flex-col gap-3">
				<Caption>ConversationArrivalRow</Caption>
				<ConversationArrivalRow
					bot={PICO}
					inviter={{ kind: "companion", bot: ATLAS }}
				/>
			</section>
			<section className="flex flex-col gap-3">
				<Caption>MissionEventRow</Caption>
				<MissionEventRow
					event={{
						id: "ready",
						kind: "ready",
						source: "github",
						createdAt: at(11, 24),
					}}
					now={at(11, 30)}
					tools={[]}
				/>
			</section>
			<section className="col-span-3 grid grid-cols-2 gap-12">
				<div className="flex flex-col gap-3">
					<Caption>PromptReply, wraps the input</Caption>
					<PromptReply
						quote={{
							author: "Atlas",
							excerpt:
								"France leads with 412 people, then Germany with 268 and Spain with 190.",
							from: "assistant",
							onJump: noop,
							onDismiss: noop,
						}}
					>
						<PromptInput
							leading={<PromptAttachButton onAttach={noop} />}
							defaultValue="And Spain, which cities?"
							onSubmit={noop}
						/>
					</PromptReply>
				</div>
				<div className="flex flex-col gap-3">
					<Caption>MessageQuote, inside a reply</Caption>
					<UserTurn
						name="Sam"
						sentAt={at(9, 44)}
						repliedTo={[
							{
								author: "Atlas",
								excerpt:
									"France leads with 412 people, then Germany with 268 and Spain with 190.",
								from: "assistant",
								onJump: noop,
							},
						]}
					>
						And Spain, which cities?
					</UserTurn>
				</div>
			</section>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Components Thread furniture: everything in the transcript that is not a bubble. Jump to latest is drawn by the transcript itself and proved in `Conversation/Message/Transcript`.",
			},
		},
	},
})

const IMAGE_SOURCE = LIBRARY_LIGHTBOX_IMAGES[0].src

export const Images1 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				{
					key: "i1",
					render: () => (
						<UserTurn name="Sam" sentAt={at(15, 2)}>
							<MessageAttachments
								items={[
									{
										id: "shot",
										name: "sidebar-windows.png",
										previewUrl: IMAGE_SOURCE,
									},
								]}
								onOpen={noop}
							/>
							The sidebar on Windows cuts the last row. Can you check?
						</UserTurn>
					),
				},
				{
					key: "i2",
					render: () => (
						<AssistantTurn author={ATLAS} sentAt={at(15, 3)}>
							<MessageAttachments
								items={[
									{
										id: "chart",
										name: "signups-by-country.png",
										previewUrl: LIBRARY_LIGHTBOX_IMAGES[1]?.src ?? IMAGE_SOURCE,
									},
								]}
								onOpen={noop}
							/>
							Here it is as a chart. France leads with 412, then Germany, Spain
							and Italy.
						</AssistantTurn>
					),
				},
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Images 1: one image above the words, in your bubble and in an answer.",
			},
		},
	},
})

export const Images2 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				{
					key: "i3",
					render: () => (
						<UserTurn name="Sam" sentAt={at(15, 5)}>
							<MessageAttachments
								items={LIBRARY_LIGHTBOX_IMAGES.slice(0, 3).map((image) => ({
									id: image.id,
									name: image.name,
									previewUrl: image.src,
								}))}
								onOpen={noop}
							/>
						</UserTurn>
					),
				},
				{
					key: "i4",
					render: () => (
						<AssistantTurn author={ATLAS} sentAt={at(15, 6)}>
							<MessageAttachments
								items={[{ id: "csv", name: "waitlist-by-country.csv" }]}
								onOpen={noop}
							/>
							And the raw list, one row per person.
						</AssistantTurn>
					),
				},
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Images 2: several images with no words, then a file in an answer.",
			},
		},
	},
})

export const Images3 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[DONE_ROW]}
			overlay={
				<LibraryLightbox
					count={2}
					image={LIBRARY_LIGHTBOX_IMAGES[0]}
					onClose={noop}
					onCopy={noop}
					onDownload={noop}
					onNext={noop}
					onPrevious={noop}
					position={1}
				/>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Images 3: an image opened from a bubble fills the panel, the rail kept visible beside it.",
			},
		},
	},
})

export const Work1 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS,
				standalone("w1", workLine(ATLAS, "thinking", { elapsedSeconds: 4 })),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 1: Atlas is thinking before any word, its work line alone under your message.",
			},
		},
	},
})

const writingRow = (
	label?: string,
	seconds = 14,
	partial = ANSWER_PARTIAL,
): TranscriptItem => ({
	key: "w2",
	render: () => (
		<AssistantTurn
			author={ATLAS}
			state="streaming"
			work={workLine(ATLAS, label ? "working" : "writing", {
				label,
				elapsedSeconds: seconds,
			})}
		>
			<Markdown>{partial}</Markdown>
		</AssistantTurn>
	),
})

export const Work2 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS,
				writingRow(
					undefined,
					9,
					"France leads with **412** people, then Germany with 268 and Spain",
				),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 2: Atlas writes, its work line in the author line slot of the bubble it fills.",
			},
		},
	},
})

export const Work3 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS,
				writingRow(
					"Read waitlist.csv",
					21,
					"France leads with **412** people, then Germany with 268 and Spain with 190. Let me check which of them signed up this week.",
				),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 3: Atlas runs a tool. Hover the work line: the avatar turns into the Stop square and the label reads Stop Atlas.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Stop Atlas" }),
		).toBeInTheDocument()
	},
})

export const Work4 = meta.story({
	render: () => <Panel face={ATLAS} rows={[...ATLAS_ROWS, DONE_ROW]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 4: the answer is done, the work line is the author line again and nothing moves.",
			},
		},
	},
})

const MENTION_ROW: TranscriptItem = {
	key: "w5",
	render: () => (
		<UserTurn name="Sam" sentAt={at(9, 41)}>
			<Markdown>{"<@pico> make it a chart once Atlas is done."}</Markdown>
		</UserTurn>
	),
}

export const Work5 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS.slice(1),
				writingRow(),
				MENTION_ROW,
				standalone("up", workLine(PICO, "waiting", { waitingOn: "next" })),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 5: a second agent is up next, its line still and dimmed under your message.",
			},
		},
	},
})

export const Work6 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			leading={LISBON_HEADER}
			placeholder="Message Lisbon offsite"
			rows={[
				{
					key: "today",
					render: () => <DaySeparator at={at(14, 30)} now={at(14, 31)} />,
				},
				rowOf({
					key: "r1",
					from: "you",
					text: "What does the offsite cost if more people come?",
					time: at(14, 30),
				}),
				{
					key: "r2",
					render: () => (
						<AssistantTurn
							author={ATLAS}
							state="streaming"
							fills
							work={workLine(ATLAS, "writing", { elapsedSeconds: 12 })}
						>
							<Markdown>
								It moves with headcount and nights, so I made you a small
								calculator. **Move the sliders, the total follows.**
							</Markdown>
							<RichBlockPending title="Offsite budget" />
						</AssistantTurn>
					),
				},
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 6: a rich block while it is being written, drawn as its frame with Building the view… and still placeholders. Streaming the real block in is wired by the app, not here.",
			},
		},
	},
})

const QUEUE_TUCKED_UNDER_INPUT = 6

const QUEUE_TRAY_PADDING = 6

const expectTrayDockedOnInput = async (root: HTMLElement) => {
	const input = slotIn(root, "prompt-input")
	input.scrollIntoView({ block: "center" })
	const tray = slotIn(root, "prompt-queue").getBoundingClientRect()
	const field = input.getBoundingClientRect()
	await expect(tray.top).toBeLessThan(field.top)
	await expect(tray.bottom - field.top).toBe(QUEUE_TUCKED_UNDER_INPUT)
	const lastRow = slotsIn(root, "prompt-queue-item").at(-1)
	await expect(field.top - (lastRow?.getBoundingClientRect().bottom ?? 0)).toBe(
		QUEUE_TRAY_PADDING,
	)
	await expect(
		input.contains(
			document.elementFromPoint(tray.left + tray.width / 2, tray.bottom - 1),
		),
	).toBe(true)
}

const sendQueuedNow = fn()

const removeQueued = fn()

export const Queue1 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS,
				writingRow(
					undefined,
					12,
					"France leads with **412** people, then Germany with 268 and Spain with 190. Most of this week's",
				),
			]}
			queue={
				<PromptQueue
					agentName="Atlas"
					items={[
						{ id: "city", text: "And by city for France?" },
						{ id: "top", text: "Top three only." },
					]}
					readerName="Sam"
					onSendNow={sendQueuedNow}
					onRemove={removeQueued}
				/>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Queue 1: two messages sent while Atlas answers wait in the tray above the field, in order, and the field stays open. Hover or focus a row for Send now and its remove button.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTrayDockedOnInput(canvasElement)

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		const [, second] = slotsIn(canvasElement, "prompt-queue-item")
		await pointer.hover(second)
		await pointer.click(
			within(second).getByRole("button", { name: "Send now" }),
		)
		await pointer.click(
			within(second).getByRole("button", { name: "Remove from the queue" }),
		)
		await expect(sendQueuedNow).toHaveBeenCalledOnce()
		await expect(sendQueuedNow).toHaveBeenCalledWith("top")
		await expect(removeQueued).toHaveBeenCalledOnce()
		await expect(removeQueued).toHaveBeenCalledWith("top")
	},
})

export const Queue2 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[
				...ATLAS_ROWS.slice(2),
				writingRow(),
				MENTION_ROW,
				standalone("up", workLine(PICO, "waiting", { waitingOn: "next" })),
			]}
			queue={
				<PromptQueue
					agentName="Pico"
					items={[{ id: "q", text: "Use the same blue as the deck." }]}
					readerName="Sam"
				/>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Queue 2: the queue waits on the agent up next, named in its header and its row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTrayDockedOnInput(canvasElement)
	},
})

const LONG_MESSAGE = [
	"Start with the total: 1,240 people on the waitlist, 86 of them this week.",
	"Then the split by country, France, Germany and Spain on top, the rest grouped.",
	"Add one line on why Germany moved this week.",
	"If the Berlin newsletter explains most of it, say so and link the post.",
	"Keep the tone plain: no forecast, only what we can see today.",
	"Put the chart Pico made at the bottom, full width.",
	"Send it to me before 17:00 so I can read it on the train.",
	"And copy Lena, she presents it.",
	"One more line to scroll inside the field.",
].join("\n")

const MENTION_BOTS = [PICO, { ...JUNIPER, isOutside: true }]

type StateCellProps = {
	caption: string
	children: ReactNode
}

const StateCell = ({ caption, children }: StateCellProps) => (
	<section className="flex w-180 flex-col gap-3">
		<Caption>{caption}</Caption>
		{children}
	</section>
)

const ATTACH = <PromptAttachButton onAttach={noop} />

export const PromptInputStates = meta.story({
	render: () => (
		<div
			className="grid grid-cols-[720px_720px] gap-x-16 gap-y-12 p-14"
			{...hueScopeOf("blue")}
		>
			<StateCell caption="1 · Empty · send disabled">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					placeholder="Message Atlas"
				/>
			</StateCell>
			<StateCell caption="2 · Typing · send enabled">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					defaultValue="Can you split it by country, and tell me which ones grew this week?"
				/>
			</StateCell>
			<StateCell caption="8 · Long message · grows to 8 lines, then scrolls inside the field">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					defaultValue={LONG_MESSAGE}
				/>
			</StateCell>
			<StateCell caption="3 · With attachments · each removable">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					defaultValue="The sidebar cuts the last row on Windows."
					attachments={
						<PromptAttachments items={PROMPT_ATTACHMENTS} onRemove={noop} />
					}
				/>
			</StateCell>
			<StateCell caption="4 · Replying to several messages · same chips as attachments">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					placeholder="Message Atlas"
					attachments={
						<PromptAttachments
							items={PROMPT_ATTACHMENTS.slice(0, 1)}
							onRemove={noop}
							replies={[
								{
									id: "a",
									author: "Atlas",
									excerpt: "France leads with 412 people",
								},
								{
									id: "l",
									author: "Lena",
									excerpt: "Germany was mostly the newsletter",
								},
							]}
							onRemoveReply={noop}
						/>
					}
				/>
			</StateCell>
			<StateCell caption="5 · Mention · @ opens agents above the field">
				<div className="pt-38">
					<PromptMentionMenu
						bots={MENTION_BOTS}
						open
						query=""
						onSelect={noop}
						onDismiss={noop}
					>
						<PromptInput
							leading={ATTACH}
							onSubmit={noop}
							defaultValue="Make it a chart @Pi"
						/>
					</PromptMentionMenu>
				</div>
			</StateCell>
			<StateCell caption="6 · While an agent works · the queue sits above the field">
				<ThreadLayout
					className="-mx-2 -mb-2 h-auto"
					contentClassName="p-0"
					queue={
						<PromptQueue
							agentName="Atlas"
							items={[{ id: "q", text: "Can you split it by country?" }]}
							readerName="Sam"
						/>
					}
					composer={
						<PromptInput
							leading={ATTACH}
							onSubmit={noop}
							defaultValue="And by city for France?"
						/>
					}
				>
					{null}
				</ThreadLayout>
			</StateCell>
			<StateCell caption="7 · Space offline · read only">
				<PromptInput
					leading={ATTACH}
					onSubmit={noop}
					offline={{ spaceName: "Studio", hostName: "Lena" }}
				/>
			</StateCell>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard PromptInput states, eight prompts 720 wide. Check the empty Send in white 8 percent, the filled one near-white, the long message capped at 8 lines with its 4 wide thumb, the chips at padding 4 and radius 12, the mention menu 300 wide and the offline field with empty button shells.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const prompts = slotsIn(canvasElement, "prompt-input")
		await expect(prompts).toHaveLength(8)
		for (const prompt of prompts)
			await expect(prompt.getBoundingClientRect().width).toBe(720)
		await expectTrayDockedOnInput(slotIn(canvasElement, "chat-layout"))
	},
})

type MotionRowProps = {
	movement: string
	before: ReactNode
	after: ReactNode
	curve: string
}

const MotionRow = ({ movement, before, after, curve }: MotionRowProps) => (
	<section className="grid grid-cols-[140px_380px_380px_minmax(0,1fr)] items-center gap-6 border-foreground/8 border-t pt-6">
		<p className="font-medium text-foreground text-sm">{movement}</p>
		<div>{before}</div>
		<div>{after}</div>
		<p className="text-muted-foreground text-xs">{curve}</p>
	</section>
)

type ArrivingBubbleProps = {
	isBefore: boolean
}

const ArrivingBubble = ({ isBefore }: ArrivingBubbleProps) =>
	isBefore ? (
		<span
			aria-hidden="true"
			className="block h-16 w-55 translate-y-2 rounded-bubble bg-bubble opacity-30"
		/>
	) : (
		<MessageBubble variant="soft" className="w-auto">
			<MessageBubbleContent>Yes, all 14 checks passed.</MessageBubbleContent>
		</MessageBubble>
	)

export const MotionBeforeAndAfter = meta.story({
	render: () => (
		<div className="flex flex-col gap-6 p-14" {...hueScopeOf("blue")}>
			<MotionRow
				movement="A bubble appears"
				before={<ArrivingBubble isBefore />}
				after={<ArrivingBubble isBefore={false} />}
				curve="Opacity 0 to 1, translate 8 to 0, 200 ms, cubic-bezier(0.16, 1, 0.3, 1). Only for a message that arrives live, never on load or on scroll back."
			/>
			<MotionRow
				movement="Label shimmer"
				before={workLine(ATLAS, "writing", {})}
				after={workLine(ATLAS, "writing", {})}
				curve="Highlight sweeps left to right, 1.8 s per pass, linear, loops. Stops the moment the answer is done."
			/>
			<MotionRow
				movement="Avatar at work"
				before={<BotIdentityAvatar hue={ATLAS.blot} seed="atlas" size={32} />}
				after={
					<BotIdentityAvatar
						hue={ATLAS.blot}
						kind="writing"
						seed="atlas"
						size={32}
						working
					/>
				}
				curve="Moves only while the agent works. On done it settles back to the still image without a fade."
			/>
			<MotionRow
				movement="Sticky author line"
				before={<StuckSample />}
				after={sampleLineOf("agent")}
				curve="No animation, follows the scroll one to one (position: sticky). It leaves with its bubble."
			/>
			<MotionRow
				movement="Hover a bubble"
				before={
					<BubbleSample state="rest" tone="agent" text={SAMPLE_TEXT.agent} />
				}
				after={
					<BubbleSample state="hover" tone="agent" text={SAMPLE_TEXT.agent} />
				}
				curve="Instant, 0 ms: fill 5 to 8 percent white, Pin, Reply and Copy appear. No colour transition on a control."
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Motion before and after. A live arrival fades in and lifts 8 over 200 ms (proved in `Conversation/Message/Transcript`), a highlight band crosses the work label left to right every 2 s, the avatar field moves only while the agent works, hover is instant. Under reduced motion, which the test browser emulates, every one of these is still: the play reads that back.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shimmer = slotIn(canvasElement, "shimmer-text")
		await expect(getComputedStyle(shimmer).animationName).toBe("none")
		const surface = slotIn(canvasElement, "message-bubble-content")
		await expect(getComputedStyle(surface).transitionDuration).toBe("0s")
	},
})

const MARKDOWN_7 = `## Launch week, the plan

Three things land before Thursday: **shared Spaces**, *a thread per mission*, and faster search. The old export is ~~kept~~ gone. The flag is \`search_v2\`.

### Who does what

- <@atlas> keeps the plan and the dates.
- <@juniper> writes the notes and the post.
- <@pico> prepares the build.

#### Order of the day

1. Freeze at 12:00.
2. Release notes reviewed by 15:00.
3. Tag and publish at 17:00.

- [x] Relay rate limits
- [ ] Sign the Windows build

---

> Kiroshi 1.4 lets you share a Space with your team. Everyone in it talks to the same agents.

The draft is on [the changelog](https://example.com). Write to press@example.com for the embargo.`

const MENTIONED_BOTS: RosterBot[] = [ATLAS, JUNIPER, PICO]

type MarkdownAnswerProps = {
	source: string
	author: MessageAuthor
	time: number
}

const MarkdownAnswer = ({ source, author, time }: MarkdownAnswerProps) => (
	<div className="w-170 p-14" {...hueScopeOf("blue")}>
		<RosterProvider bots={MENTIONED_BOTS}>
			<AssistantTurn author={author} sentAt={time}>
				<Markdown>{source}</Markdown>
			</AssistantTurn>
		</RosterProvider>
	</div>
)

const MARKDOWN_CHECK =
	"a markdown answer already shipped, shown in the Final page bubble to check it against the PNG."

export const Markdown7 = meta.story({
	render: () => (
		<MarkdownAnswer source={MARKDOWN_7} author={ATLAS} time={at(9, 41)} />
	),
	parameters: {
		docs: {
			description: {
				story: `Artboard Markdown 7: ${MARKDOWN_CHECK} Headings, mention pills, lists, tasks, rule and quote.`,
			},
		},
	},
})

const MARKDOWN_8 = `The fix keeps both addresses, so old and new callbacks work:

\`\`\`ts
redirectUris: [
  "https://beta.app.example/auth/callback",
  "https://beta.app.example/login/google", // old
],
\`\`\`

Failed sign-ins since 8:05, by provider:

| Provider | Failed | Since |
| --- | --- | --- |
| Google | 41 | 8:05 |
| Email | 0 | - |

At this rate the queue clears in $t = n / r = 41 / 12 \\approx 3.4$ minutes.

$$success\\ rate = 1 - failed / attempts$$`

export const Markdown8 = meta.story({
	render: () => (
		<MarkdownAnswer source={MARKDOWN_8} author={PICO} time={at(11, 18)} />
	),
	parameters: {
		docs: {
			description: {
				story: `Artboard Markdown 8: ${MARKDOWN_CHECK} Code, table, inline and display math. The diagram is left out: its block scrolls without keyboard access in a 580 bubble, which the mermaid block's own ticket owns.`,
			},
		},
	},
})
