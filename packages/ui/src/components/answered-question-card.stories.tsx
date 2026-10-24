import type { CSSProperties, ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	type AnsweredQuestion,
	type AnsweredQuestionAuthor,
	AnsweredQuestionCard,
} from "@workspace/ui/components/answered-question-card"
import { blotTint } from "@workspace/ui/components/companion-colour"
import type { RosterBot } from "@workspace/ui/components/roster"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

const COMPANION: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: "blue",
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

type SpaceColumnProps = { children: ReactNode; width?: string }

const SpaceColumn = ({ children, width = "max-w-2xl" }: SpaceColumnProps) => (
	<div
		data-space-tint="green"
		style={{ "--space-tint": blotTint("green") } as CSSProperties}
		className={cn("mx-auto flex flex-col px-6", width)}
	>
		{children}
	</div>
)

type AnsweredRunProps = {
	ask: string
	author: AnsweredQuestionAuthor
	questions: AnsweredQuestion[]
	width?: string
}

const AnsweredRun = ({ ask, author, questions, width }: AnsweredRunProps) => (
	<SpaceColumn width={width}>
		<TurnGroup>
			<AssistantTurn
				copyText={ask}
				identity={COMPANION}
				sentAt={ASKED_AT}
				now={READ_ON}
			>
				{ask}
			</AssistantTurn>
			<AssistantTurn bare copyText="" identity={COMPANION}>
				<AnsweredQuestionCard
					author={author}
					answeredAt={ANSWERED_AT}
					questions={questions}
				/>
			</AssistantTurn>
		</TurnGroup>
	</SpaceColumn>
)

const meta = preview.meta({
	title: "Conversation/Tools/AnsweredQuestionCard",
	component: AnsweredQuestionCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The record of an answered agent question, posted in the companion's column right under the message that asked it. The author line says who answered and when, then each question shows its header and the options chosen, painted in the Space's person bubble colour. Use `ToolQuestion` while the question still waits for an answer.",
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

const softBubbleOf = (root: HTMLElement) =>
	slotIn(
		root.querySelector('[data-variant="soft"]') as HTMLElement,
		"message-bubble-content",
	)

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
					"Reach for this when the reader answered the question themselves, here three questions at once. The author line reads You answered beside the reader's initials, and each block reads its header then its chosen row, the key chip giving the option's place in its question. Check that the card's top-start corner tightens where it meets the bubble above.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = cardIn(canvasElement)
		const cardStyle = getComputedStyle(card)

		await expect(canvas.getByText("You answered")).toBeVisible()
		await expect(canvas.getAllByRole("group")).toHaveLength(3)
		await expect(
			spokenTextOf(canvas.getByRole("group", { name: "Scope" })),
		).toBe("ScopeEvery tableOne window, one rollback")
		await expect(choicesIn(card)).toHaveLength(3)
		await expect(cardStyle.backgroundColor).toBe(
			getComputedStyle(softBubbleOf(canvasElement).firstElementChild as Element)
				.backgroundColor,
		)
		await expect(cardStyle.borderStartStartRadius).toBe("6px")
		await expect(cardStyle.borderEndStartRadius).toBe("18px")
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
					"Reach for this when another member of the Space answered. The author line names them beside their initials; the chosen row is the second option, so its key chip reads 2.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [choice] = choicesIn(cardIn(canvasElement))

		await expect(canvas.getByText("Maya Okafor answered")).toBeVisible()
		await expect(choice).toHaveTextContent(/^2Beta/)
		for (const hidden of choice.querySelectorAll('[aria-hidden="true"]')) {
			await expect(hidden.textContent).not.toContain("Beta")
		}
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
					"Reach for this for an option whose label and description run long, and a written answer with no break opportunity. Both wrap inside their row while the card holds its 360px minimum width; nothing spills past the card's edge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const card = cardIn(canvasElement)
		const { right } = card.getBoundingClientRect()

		await expect(card.getBoundingClientRect().width).toBeGreaterThanOrEqual(360)
		for (const row of choicesIn(card)) {
			await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
			await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(right)
		}
	},
})

export const LongContentDark = LongContent.extend({
	globals: { theme: "dark" },
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})
