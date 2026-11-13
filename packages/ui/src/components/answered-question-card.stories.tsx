import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	hueScopeOf,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	type AnsweredQuestion,
	type AnsweredQuestionAuthor,
	AnsweredQuestionCard,
} from "@workspace/ui/components/answered-question-card"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { RosterBot } from "@workspace/ui/components/roster"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

const COMPANION: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const VIEWER: AnsweredQuestionAuthor = { name: "Sam", isViewer: true }

const MEMBER: AnsweredQuestionAuthor = { name: "Maya Okafor" }

const sentOn = (hours: number, minutes: number) =>
	new Date(2026, 9, 10, hours, minutes).getTime()

const ASKED_AT = sentOn(9, 21)

const ANSWERED_AT = sentOn(9, 24)

const READ_ON = sentOn(9, 30)

const MIGRATION_ASK = "Before I start the migration, three quick choices."

const MIGRATION_ANSWERS: AnsweredQuestion[] = [
	{
		question: "How much of the database should the migration cover?",
		header: "Scope",
		options: [
			{ label: "Every table", description: "One window, one rollback" },
			{ label: "Schema only", description: "The data stays put" },
		],
		selected: ["Every table"],
	},
	{
		question: "When should it run?",
		header: "Window",
		options: [
			{ label: "Tonight", description: "After the last deploy" },
			{ label: "Saturday", description: "Lowest traffic of the week" },
		],
		selected: ["Tonight"],
	},
	{
		question: "What happens if a step fails?",
		header: "Rollback",
		options: [
			{ label: "Roll back", description: "Restore the snapshot" },
			{ label: "Stop and ask", description: "" },
		],
		selected: ["Roll back"],
	},
]

const CHANNEL_ASK = "Which channel should this release ship to?"

const CHANNEL_ANSWERS: AnsweredQuestion[] = [
	{
		question: CHANNEL_ASK,
		header: "Release channel",
		options: [
			{ label: "Stable", description: "Every user, today" },
			{ label: "Beta", description: "Early access for a week first" },
			{ label: "Internal", description: "The team only" },
		],
		selected: ["Beta"],
	},
]

const NOTIFY_ASK = "Who should hear about the release?"

const NOTIFY_ANSWERS: AnsweredQuestion[] = [
	{
		question: NOTIFY_ASK,
		header: "Notify",
		options: [
			{ label: "Support", description: "Ahead of the tickets" },
			{ label: "Sales", description: "For the renewal calls" },
			{ label: "Marketing", description: "For the changelog post" },
		],
		selected: ["Marketing", "Support"],
	},
]

const NAME_ASK = "What should the new service be called?"

const NAME_ANSWERS: AnsweredQuestion[] = [
	{
		question: NAME_ASK,
		header: "Service name",
		options: [
			{ label: "ledger", description: "" },
			{ label: "accounts", description: "" },
		],
		selected: [],
		freeText:
			"Call it billing-core for now, we'll rename it once the finance team has picked a name for the whole product line.",
	},
]

const LONG_ASK = "Where should the export land?"

const LONG_ANSWERS: AnsweredQuestion[] = [
	{
		question: LONG_ASK,
		header: "Export destination",
		options: [
			{
				label: "The shared archive bucket the finance team reads every month",
				description:
					"Kept for seven years, encrypted at rest, readable by the auditors only",
			},
		],
		selected: ["The shared archive bucket the finance team reads every month"],
	},
	{
		question: "Which path?",
		header: "Path",
		options: [],
		selected: [],
		freeText:
			"s3://kiroshi-finance-archive/exports/2026/october/reconciliation-ledger-full-snapshot.parquet",
	},
]

type AnsweredRunProps = {
	lead?: string
	ask: string
	followUp?: string
	author: AnsweredQuestionAuthor
	questions: AnsweredQuestion[]
	width?: string
}

const AnsweredRun = ({
	lead,
	ask,
	followUp,
	author,
	questions,
	width = "max-w-2xl",
}: AnsweredRunProps) => (
	<div
		{...hueScopeOf("green")}
		className={cn("mx-auto flex flex-col px-6", width)}
	>
		<TurnGroup>
			{lead ? (
				<AssistantTurn
					copyText={lead}
					identity={COMPANION}
					sentAt={ASKED_AT}
					now={READ_ON}
				>
					{lead}
				</AssistantTurn>
			) : null}
			<AssistantTurn
				copyText={ask}
				identity={COMPANION}
				sentAt={ASKED_AT}
				now={READ_ON}
			>
				{ask}
			</AssistantTurn>
			<AssistantTurn framed copyText="" identity={COMPANION}>
				<AnsweredQuestionCard
					author={author}
					answeredAt={ANSWERED_AT}
					questions={questions}
				/>
			</AssistantTurn>
			{followUp ? (
				<AssistantTurn copyText={followUp} identity={COMPANION}>
					{followUp}
				</AssistantTurn>
			) : null}
		</TurnGroup>
	</div>
)

const meta = preview.meta({
	title: "Conversation/Tools/AnsweredQuestionCard",
	component: AnsweredQuestionCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The record of an answered agent question, posted in the companion's column right under the message that asked it, as the content of one soft agent bubble, under the bubbleless reply that asked. Each question shows its header and the options chosen, painted in the Space's person bubble colour, then a line says who answered and when, and the agent's author line closes the bubble as its foot. Use `ToolQuestion` while the question still waits for an answer.",
			},
		},
	},
})

const cardIn = (root: HTMLElement) => slotIn(root, "answered-question-card")

const choicesIn = (root: HTMLElement) =>
	slotsIn(root, "answered-question-choice")

const spokenTextOf = (root: HTMLElement) => {
	const spoken = root.cloneNode(true) as HTMLElement

	for (const hidden of spoken.querySelectorAll('[aria-hidden="true"]')) {
		hidden.remove()
	}

	return spoken.textContent
}

const spaceOf = (root: HTMLElement) =>
	root.querySelector<HTMLElement>("[data-hue]") as HTMLElement

const expectRowsPaintedFromSpace = async (root: HTMLElement) => {
	const spaceBubble = tokenStyleIn(
		spaceOf(root),
		"bg-(--user-bubble)",
		"backgroundColor",
	)

	for (const row of choicesIn(root)) {
		await expect(getComputedStyle(row).backgroundColor).toBe(spaceBubble)
	}
}

const answerTurnIn = (root: HTMLElement) =>
	cardIn(root).closest<HTMLElement>(
		'[data-slot="message-bubble"]',
	) as HTMLElement

const answerBubbleIn = (root: HTMLElement) =>
	slotIn(answerTurnIn(root), "message-bubble-content")

const surfaceOf = (bubbleContent: HTMLElement) =>
	getComputedStyle(bubbleContent.firstElementChild as Element).backgroundColor

const expectAgentFoot = async (answer: HTMLElement) => {
	const lines = slotsIn(answer, "author-line")
	const agent = lines.at(-1) as HTMLElement

	await expect(lines).toHaveLength(2)
	await expect(agent.parentElement).toBe(answer)
	await expect(agent).toHaveAttribute("data-tone", "agent")
	await expect(slotIn(agent, "author-line-name")).toHaveTextContent(
		COMPANION.name,
	)
}

const expectOneAgentBubble = async (root: HTMLElement) => {
	const answerTurn = answerTurnIn(root)
	const answerContent = answerBubbleIn(root)
	const answer = getComputedStyle(answerContent)

	await expect(slotsIn(answerTurn, "message-bubble")).toHaveLength(0)
	await expect(slotsIn(answerTurn, "message-bubble-content")).toHaveLength(1)
	await expect(answerTurn).toHaveAttribute("data-variant", "soft")
	await expect(answerContent).toContainElement(cardIn(root))
	await expect(getComputedStyle(answerTurn).maxWidth).toBe("580px")
	await expect([
		answer.paddingTop,
		answer.paddingInlineEnd,
		answer.paddingBottom,
		answer.paddingInlineStart,
	]).toEqual(["18px", "18px", "18px", "18px"])
	await expect(answer.borderStartStartRadius).toBe("16px")
	await expect(surfaceOf(answerContent)).not.toBe("rgba(0, 0, 0, 0)")
	await expectAgentFoot(answerContent)
}

const expectAnswererLine = async (root: HTMLElement, label: string) => {
	const [line] = slotsIn(cardIn(root), "author-line")

	await expect(slotsIn(cardIn(root), "author-line")).toHaveLength(1)
	await expect(line).toHaveAttribute("data-tone", "person")
	await expect(slotIn(line, "author-line-name")).toHaveTextContent(label)
	await expect(slotIn(line, "user-avatar")).toBeVisible()
	await expect(slotIn(line, "message-time")).toBeVisible()
	await expect(line.getBoundingClientRect().left).toBe(
		cardIn(root).getBoundingClientRect().left,
	)
}

export const YouAnswered = meta.story({
	render: () => (
		<AnsweredRun
			ask={MIGRATION_ASK}
			author={VIEWER}
			questions={MIGRATION_ANSWERS}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the reader answered the question themselves, here three questions at once. Each block reads its header then its chosen row, the key chip giving the option's place in its question, then You answered beside the reader's round initials and the answer time, and the agent's author line is the bubble's foot. Check that one bubble holds it all, wearing the same surface, radius, padding and width as the turn above it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = cardIn(canvasElement)

		await expect(canvas.getAllByRole("group")).toHaveLength(3)
		await expect(
			spokenTextOf(canvas.getByRole("group", { name: "Scope" })),
		).toBe("ScopeEvery tableOne window, one rollback")
		await expect(choicesIn(card)).toHaveLength(3)
		await expectOneAgentBubble(canvasElement)
		await expectAnswererLine(canvasElement, "You answered")
		await expectRowsPaintedFromSpace(canvasElement)
		await expect(getComputedStyle(canvas.getByText("Every table")).color).toBe(
			tokenStyleIn(
				spaceOf(canvasElement),
				"text-(--user-bubble-foreground)",
				"color",
			),
		)
	},
})

export const YouAnsweredDark = YouAnswered.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})

export const MemberAnswered = meta.story({
	render: () => (
		<AnsweredRun
			ask={CHANNEL_ASK}
			author={MEMBER}
			questions={CHANNEL_ANSWERS}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when another member of the Space answered. The line under the answers names them beside their round initials and the answer time, above the agent's author line; the chosen row is the second option, so its key chip reads 2.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [choice] = choicesIn(cardIn(canvasElement))

		await expectOneAgentBubble(canvasElement)
		await expectAnswererLine(canvasElement, "Maya Okafor answered")
		await expect(choice).toHaveTextContent(/^2Beta/)
		for (const hidden of choice.querySelectorAll('[aria-hidden="true"]')) {
			await expect(hidden.textContent).not.toContain("Beta")
		}
		await expectRowsPaintedFromSpace(canvasElement)
	},
})

export const MemberAnsweredDark = MemberAnswered.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})

export const MultiSelect = meta.story({
	render: () => (
		<AnsweredRun ask={NOTIFY_ASK} author={VIEWER} questions={NOTIFY_ANSWERS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the question allowed several answers. Each selected option gets its own chosen row, in the order the question listed them, whatever order they were picked in.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = choicesIn(cardIn(canvasElement)).map((row) => row.textContent)

		await expect(rows).toEqual([
			"1SupportAhead of the tickets",
			"3MarketingFor the changelog post",
		])
	},
})

export const MultiSelectDark = MultiSelect.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})

export const FreeText = meta.story({
	render: () => (
		<AnsweredRun ask={NAME_ASK} author={VIEWER} questions={NAME_ANSWERS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the reader wrote their own answer instead of picking an option. The text sits in a chosen row with no key chip, wrapping over as many lines as it needs.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [row] = choicesIn(cardIn(canvasElement))

		await expectAnswererLine(canvasElement, "You answered")
		await expect(row.children).toHaveLength(2)
		await expect(row).toHaveTextContent(/^Call it billing-core/)
	},
})

export const FreeTextDark = FreeText.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})

export const LongContent = meta.story({
	render: () => (
		<AnsweredRun
			ask={LONG_ASK}
			author={MEMBER}
			questions={LONG_ANSWERS}
			width="w-[30rem] max-w-full"
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for an option whose label and description run long, and a written answer with no break opportunity. Both wrap inside their row while the bubble holds its 360px minimum width; nothing spills past the bubble's edge, and the line above the agent's foot still names the member who answered.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const answer = answerBubbleIn(canvasElement)
		const { right, width } = answer.getBoundingClientRect()

		await expect(width).toBeGreaterThanOrEqual(360)
		await expectAnswererLine(canvasElement, "Maya Okafor answered")
		for (const row of choicesIn(answer)) {
			await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
			await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(right)
		}
	},
})

export const LongContentDark = LongContent.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})
