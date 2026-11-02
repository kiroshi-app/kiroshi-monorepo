import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn, slotsIn } from "@workspace/storybook/story-utils"
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
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PROMPT_ATTACHMENTS } from "@workspace/ui/components/prompt-attachments.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptMentionMenu } from "@workspace/ui/components/prompt-mention-menu"
import { PromptQueue } from "@workspace/ui/components/prompt-queue"
import { PromptReply } from "@workspace/ui/components/prompt-reply"
import { RichBlockPending } from "@workspace/ui/components/rich-block-pending"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
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

type PanelProps = {
	face: MessageAuthor
	rows?: TranscriptItem[]
	composer?: ReactNode
	placeholder?: string
	children?: ReactNode
	overlay?: ReactNode
}

const Panel = ({
	face,
	rows,
	composer,
	placeholder,
	children,
	overlay,
}: PanelProps) => (
	<div className="relative h-[847px] w-[1072px]" {...hueScopeOf("blue")}>
		<ContentCard isLandmark={false}>
			<ThreadLayout
				header={
					<AppHeader
						leading={
							<HeaderIdentityButton
								blot={face.blot}
								connection="ready"
								name={face.name}
								seed={face.id}
							/>
						}
					/>
				}
				rows={rows}
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
		{overlay}
	</div>
)

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
		const answer = slotIn(canvasElement, "markdown")
		await expect(getComputedStyle(answer).fontSize).toBe("16px")
		await expect(getComputedStyle(answer).lineHeight).toBe("26px")
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
		text: "Here they are. Tandem charges **per team**, Fieldnote **per seat**, and we sit in between at **$15 per person** on the annual plan. The three are on slide 6 of [Pricing deck](https://example.com).",
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
		text: "You're right. Fieldnote is **$18 per seat** since October 3, not $14. I've corrected slide 6.",
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
		text: "Done. The table is on the pricing draft behind the preview flag, with Fieldnote at $18 and the three columns Lena asked for. Nothing is live yet.",
		time: at(10, 14),
	},
]

export const Conversations2 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
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
3. **Saturday**: free morning, checkout at 12:00.`

export const Conversations4 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
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
					"Artboard Conversations 4: an answer taller than the viewport, with a heading, a table and a list. Check the bubble keeps padding 18 around rich content. The sticky author line the artboard draws at the viewport edge is not wired yet: `AuthorLine` carries the `isSticky` drawing, the turn does not pin it.",
			},
		},
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
		<Panel face={ATLAS} placeholder="Message Lisbon flights">
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
				<InitialsAvatar name={tone === "you" ? "Sam" : "Tom"} size={20} />
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
	own: "outline-(--foreground) outline-2 outline-offset-2",
	grey: "outline-2 outline-primary outline-offset-2",
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
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Components MessageBubble states. Check each row: at rest, hovered (fill to white 8 percent, Pin, Reply and Copy after a divider) and keyboard focused (a 2 px ring at offset 2, Space colour on grey bubbles, near-white on yours). The hovered and focused samples draw their state's classes on purpose, since a still frame raises no pointer; the live hover and focus are proved in `Conversation/Message/Turn` `HoverActions`, the right-click menu in `Conversation/Message/MessageActions`.",
			},
		},
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
						avatar={<InitialsAvatar name="Sam" size={20} />}
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
			<Caption>Queued · stuck to the viewport</Caption>
			<div className="flex items-center gap-10">
				<AuthorLineQueued onCancel={noop} />
				<div className="relative w-90 rounded-2xl bg-bubble p-4.5 pt-12">
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
				</div>
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
						sentAt={at(9, 44)}
						repliedTo={{
							author: "Atlas",
							excerpt:
								"France leads with 412 people, then Germany with 268 and Spain with 190.",
							from: "assistant",
							onJump: noop,
						}}
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
						<UserTurn sentAt={at(15, 2)}>
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
						<UserTurn sentAt={at(15, 5)}>
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
					onMore={noop}
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

const writingRow = (label?: string, seconds = 14): TranscriptItem => ({
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
			<Markdown>{ANSWER_PARTIAL}</Markdown>
		</AssistantTurn>
	),
})

export const Work2 = meta.story({
	render: () => <Panel face={ATLAS} rows={[...ATLAS_ROWS, writingRow()]} />,
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
			rows={[...ATLAS_ROWS, writingRow("Read waitlist.csv", 21)]}
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

const MENTION_ROW: TranscriptItem = rowOf({
	key: "w5",
	from: "you",
	text: "@Pico make it a chart once Atlas is done.",
	time: at(9, 41),
})

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

export const Queue1 = meta.story({
	render: () => (
		<Panel
			face={ATLAS}
			rows={[...ATLAS_ROWS, writingRow()]}
			composer={
				<div className="flex flex-col">
					<PromptQueue
						agentName="Atlas"
						items={[{ id: "q", text: "Can you split it by country?" }]}
						readerName="Sam"
					/>
					<PromptInput
						leading={<PromptAttachButton onAttach={noop} />}
						onSubmit={noop}
						placeholder="Message Atlas"
					/>
				</div>
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Queue 1: a message sent while Atlas answers waits in the tray above the field, the field stays open.",
			},
		},
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
			composer={
				<div className="flex flex-col">
					<PromptQueue
						agentName="Pico"
						items={[{ id: "q", text: "Use the same blue as the deck." }]}
						readerName="Sam"
					/>
					<PromptInput
						leading={<PromptAttachButton onAttach={noop} />}
						onSubmit={noop}
						placeholder="Message Atlas"
					/>
				</div>
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
				<div className="flex flex-col">
					<PromptQueue
						agentName="Atlas"
						items={[{ id: "q", text: "Can you split it by country?" }]}
						readerName="Sam"
					/>
					<PromptInput
						leading={ATTACH}
						onSubmit={noop}
						defaultValue="And by city for France?"
					/>
				</div>
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
	},
})

export const MotionBeforeAndAfter = meta.story({
	render: () => (
		<div className="flex flex-col gap-8 p-14" {...hueScopeOf("blue")}>
			<Caption>A bubble appears · label shimmer · hover a bubble</Caption>
			<div className="flex w-170 flex-col gap-3">
				<AssistantTurn
					author={ATLAS}
					sentAt={at(9, 20)}
					copyText="Yes, all 14 checks passed."
				>
					Yes, all 14 checks passed.
				</AssistantTurn>
				{workLine(ATLAS, "writing", { elapsedSeconds: 9 })}
			</div>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Motion before and after. A live arrival fades in and lifts 8 over 200 ms (proved in `Conversation/Message/Transcript`), the work label sweeps left to right every 1.8 s, the avatar field moves only while the agent works, hover is instant. Under reduced motion, which the test browser emulates, every one of these is still: the play reads that back.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shimmer = slotIn(canvasElement, "text-shimmer")
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
}

const MarkdownAnswer = ({ source }: MarkdownAnswerProps) => (
	<div className="w-170 p-14" {...hueScopeOf("blue")}>
		<RosterProvider bots={MENTIONED_BOTS}>
			<AssistantTurn author={ATLAS} sentAt={at(9, 41)}>
				<Markdown>{source}</Markdown>
			</AssistantTurn>
		</RosterProvider>
	</div>
)

const MARKDOWN_CHECK =
	"a markdown answer already shipped, shown in the Final page bubble to check it against the PNG."

export const Markdown7 = meta.story({
	render: () => <MarkdownAnswer source={MARKDOWN_7} />,
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
	render: () => <MarkdownAnswer source={MARKDOWN_8} />,
	parameters: {
		docs: {
			description: {
				story: `Artboard Markdown 8: ${MARKDOWN_CHECK} Code, table, inline and display math. The diagram is left out: its block scrolls without keyboard access in a 580 bubble, which the mermaid block's own ticket owns.`,
			},
		},
	},
})
