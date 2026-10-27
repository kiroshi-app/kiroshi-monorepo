import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	hueScopeOf,
	listExhaustively,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { CodeSnippet } from "@workspace/ui/components/code-snippet"
import {
	BLOT_HUES,
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"
import { Markdown } from "@workspace/ui/components/markdown"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleCollapsible,
	MessageBubbleContent,
	MessageBubbleGroup,
	type MessageBubbleVariant,
} from "@workspace/ui/components/message-bubble"

const MESSAGE_BUBBLE_VARIANTS = listExhaustively<MessageBubbleVariant>({
	solid: true,
	soft: true,
	tint: true,
	outline: true,
	ghost: true,
	bare: true,
	danger: true,
})

const THREAD_WIDTH = "w-[34rem] max-w-full"

type SpaceTintScopeProps = { blot: BotAvatarBlot; children: ReactNode }

const SpaceTintScope = ({ blot, children }: SpaceTintScopeProps) => (
	<div {...hueScopeOf(blot)}>{children}</div>
)

const USER_PROMPT =
	"Summarise yesterday's onboarding call and pull out the follow-ups."

const USER_MARKDOWN_PROMPT =
	"Check **the export owner** in [the runbook](https://example.com/runbook) before running `bun run migrate`."

const WHITE_INK = "rgb(255, 255, 255)"

const AGENT_REPLY =
	"Three follow-ups came out of it: send Ada Martin the revised quote, book the migration window, and confirm who owns the data export."

const USER_LONG_PROMPT =
	"We are migrating two workspaces on the same weekend and the second one still runs the legacy export. Walk me through the order of operations, and tell me where it can go wrong so I can brief the team on Monday."

const AGENT_LONG_REPLY = [
	"Freeze writes on the legacy workspace first. Everything downstream assumes the export is a snapshot, so a single late write is enough to make the two workspaces disagree about the same record.",
	"Then run the export against the frozen copy and check the row counts before you touch the target. The export is cheap to repeat and expensive to undo, which is why it goes before the cutover rather than after it.",
	"Cut the first workspace over, wait for one full sync cycle, and only then start the second. Running them in parallel halves the wall clock and doubles the number of places a failure can hide.",
	"The failure most teams hit is the export finishing while a scheduled job is still writing. Disable the scheduler explicitly instead of trusting the freeze, and keep the legacy workspace readable for a week so you can diff anything that looks wrong on Monday.",
]

const meta = preview.meta({
	title: "Conversation/Message/MessageBubble",
	component: MessageBubble,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One turn of a chat transcript. `solid` is the Kiroshi blue and is reserved for what the user sent; the agent answers in `soft`. Wrap consecutive turns in `MessageBubbleGroup`, and reach for `MessageBubbleCollapsible` when an answer is long enough to bury the rest of the thread.",
			},
		},
	},
	args: {
		variant: "soft",
		align: "start",
	},
	argTypes: {
		variant: { control: "select", options: MESSAGE_BUBBLE_VARIANTS },
		align: { control: "inline-radio", options: ["start", "end"] },
	},
	render: (args) => (
		<MessageBubbleGroup className={THREAD_WIDTH}>
			<MessageBubble {...args}>
				<MessageBubbleContent>{AGENT_REPLY}</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The pairing every transcript is built from: the user in `solid` blue pinned to the trailing edge, the agent in `soft` on the leading edge. Check that the two surfaces stay distinguishable in both themes and that each bubble hugs its own content, free to span the whole row when the message is long enough. Reach for `Variants` instead when you need to compare a surface in isolation. `packages/ui/src/components/turn.tsx:340` draws the reader in `solid` and `packages/ui/src/components/turn.tsx:492` the companion in `soft`.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<Markdown>{USER_MARKDOWN_PROMPT}</Markdown>
				</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>{AGENT_REPLY}</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas }) => {
		const sent = canvas.getByText(USER_PROMPT).closest("[data-slot]")
		const received = canvas.getByText(AGENT_REPLY).closest("[data-slot]")
		const whiteInk = [
			sent,
			canvas.getByText("the export owner"),
			canvas.getByText("the runbook"),
			canvas.getByText("bun run migrate"),
		]

		for (const ink of whiteInk) {
			await expect(ink && getComputedStyle(ink).color).toBe(WHITE_INK)
		}

		await expect(sent?.closest("[data-align]")).toHaveAttribute(
			"data-variant",
			"solid",
		)
		await expect(received?.closest("[data-align]")).toHaveAttribute(
			"data-align",
			"start",
		)
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Every surface the bubble can wear, stacked in a column no transcript assembles. A turn only ever asks for four of them — `solid` and `tint` at `packages/ui/src/components/turn.tsx:340`, `soft` and `bare` at `packages/ui/src/components/turn.tsx:492` — so `outline`, `ghost` and `danger` are here to keep the exhaustive list honest rather than to be read. A variant added to `MessageBubbleVariant` without a row here is a type error.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			{MESSAGE_BUBBLE_VARIANTS.map((variant) => (
				<MessageBubble key={variant} variant={variant} align="start">
					<MessageBubbleContent>{variant}</MessageBubbleContent>
				</MessageBubble>
			))}
		</MessageBubbleGroup>
	),
})

export const LongContent = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Reach for this when an answer runs past a screenful: a four-paragraph reply clamped by `MessageBubbleCollapsible`. Check that the fade mask lands on a clamped line rather than mid-glyph, that the trigger reads `Show more` before expanding and `Show less` after, and that the surface re-measures instead of snapping. `Default` covers the length a bubble handles without a collapsible. No screen collapses a bubble: `MessageBubbleCollapsible` has no caller outside this story and `packages/ui/src/components/message-bubble.mounted.test.tsx:105`, so this one holds the trigger rather than a state a reader meets.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_LONG_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>
					<MessageBubbleCollapsible collapsedLines={4}>
						{AGENT_LONG_REPLY.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</MessageBubbleCollapsible>
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Show more" })
		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(trigger)

		await expect(
			canvas.getByRole("button", { name: "Show less" }),
		).toHaveAttribute("aria-expanded", "true")
	},
})

const ATTACHMENT = { id: "brief", name: "brief.pdf" }

const SNIPPET = "bun run build"

const selectedText = () => window.getSelection()?.toString() ?? ""

export const TextSelection = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Double-click inside a bubble to select that message whole, ready for a copy. Check that the highlight spans every paragraph and stops at the attachment chip, that a second double-click moves the highlight instead of adding one, and that a double-click inside the fence keeps the native word selection. Both bubbles are the ones `packages/ui/src/components/turn.tsx:340` and `packages/ui/src/components/turn.tsx:492` build, filled by `apps/app/src/components/turn-body.tsx:7`.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments items={[ATTACHMENT]} onOpen={() => {}} />
					<p>{USER_PROMPT}</p>
				</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>
					{AGENT_LONG_REPLY.slice(0, 2).map((paragraph) => (
						<p key={paragraph}>{paragraph}</p>
					))}
					<CodeSnippet code={SNIPPET} language="bash" />
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.dblClick(canvas.getByText(USER_PROMPT))

		await expect(selectedText()).toBe(USER_PROMPT)

		await userEvent.dblClick(canvas.getByText(AGENT_LONG_REPLY[0]))

		await expect(window.getSelection()?.rangeCount).toBe(1)
		await expect(selectedText()).toContain(AGENT_LONG_REPLY[1])

		await userEvent.dblClick(
			canvasElement.querySelector("pre code") as HTMLElement,
		)

		await expect(selectedText()).not.toContain(AGENT_LONG_REPLY[1])
	},
})

export const SpaceTinted = meta.story({
	parameters: {
		layout: "padded",
		docs: {
			description: {
				story:
					"What the user sent, read inside a space that carries a colour: `solid` takes the space colour at full strength in light and a deepened variant in dark, `tint` keeps the queued opacity over the same colour. Check that the ink stays legible on all eight colours in both themes, and that a bubble outside any tinted space keeps the Kiroshi blue of `Default`. `packages/ui/src/components/turn.tsx:340` picks `tint` for a prompt still in the outbox and `solid` for one that left, under the space colour the shell sets.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-4">
			{BLOT_TINTS.map((blot) => (
				<SpaceTintScope key={blot} blot={blot}>
					<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
						<MessageBubble variant="solid" align="end">
							<MessageBubbleContent>{`Sent in the ${blot} space`}</MessageBubbleContent>
						</MessageBubble>
						<MessageBubble variant="tint" align="end">
							<MessageBubbleContent>{`Queued in the ${blot} space`}</MessageBubbleContent>
						</MessageBubble>
					</MessageBubbleGroup>
				</SpaceTintScope>
			))}
		</div>
	),
	play: async ({ canvas }) => {
		const sent = canvas
			.getByText("Sent in the blue space")
			.closest("[data-slot]")

		await expect(sent?.closest("[data-hue]")).toHaveAttribute(
			"data-hue",
			String(BLOT_HUES.blue),
		)
	},
})

const SHORT_REPLY = "Booked."

const UNBREAKABLE_REPLY =
	"migration-window-exports-rollback-attachment-manifest-digest"

const MAX_INLINE_SIZE_FRACTION = 0.85

const inlineSizeOf = (element: Element) => element.getBoundingClientRect().width

type ComparedWidthsProps = { className: string }

const ComparedWidths = ({ className }: ComparedWidthsProps) => (
	<MessageBubbleGroup spacing="default" className={className}>
		<MessageBubble variant="soft" align="start">
			<MessageBubbleContent>{SHORT_REPLY}</MessageBubbleContent>
		</MessageBubble>
		<MessageBubble variant="soft" align="start">
			<MessageBubbleContent>{AGENT_LONG_REPLY[0]}</MessageBubbleContent>
		</MessageBubble>
		<MessageBubble variant="soft" align="start">
			<MessageBubbleContent>{UNBREAKABLE_REPLY}</MessageBubbleContent>
		</MessageBubble>
	</MessageBubbleGroup>
)

export const ContentWidths = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a change touches how wide a bubble is allowed to get: a two-word answer, a paragraph past the cap and a sixty-character unbreakable string, in a 34rem column where all three still fit on their own terms. Check that the short one hugs its text and that the long one stops at 85 percent of the column. `NarrowContainer` gives the same three a container too narrow for the unbreakable one. The three bodies come from `apps/app/src/components/turn-body.tsx:10`, which measures nothing and shortens nothing.",
			},
		},
	},
	render: () => <ComparedWidths className={THREAD_WIDTH} />,
	play: async ({ canvasElement }) => {
		const group = slotIn(canvasElement, "message-bubble-group")
		const [, long] = slotsIn(canvasElement, "message-bubble")
		const [shortContent, longContent] = slotsIn(
			canvasElement,
			"message-bubble-content",
		)

		await expect(inlineSizeOf(shortContent)).toBeLessThan(
			inlineSizeOf(longContent),
		)
		await expect(inlineSizeOf(longContent)).toBeCloseTo(inlineSizeOf(long), 0)
		await expect(inlineSizeOf(longContent) / inlineSizeOf(group)).toBeCloseTo(
			MAX_INLINE_SIZE_FRACTION,
			2,
		)
	},
})

export const NarrowContainer = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the window is as narrow as the product allows: the same three replies in a 320 pixel container, where the unbreakable string is wider than the surface it is given. Check that it breaks across lines inside that surface and that nothing scrolls sideways. `ContentWidths` compares the three at thread width. Same bodies from `apps/app/src/components/turn-body.tsx:10`, in the narrowest window the app runs in.",
			},
		},
	},
	render: () => <ComparedWidths className="w-80" />,
	play: async ({ canvasElement }) => {
		const group = slotIn(canvasElement, "message-bubble-group")
		const contents = slotsIn(canvasElement, "message-bubble-content")
		const [shortContent, , unbreakableContent] = contents

		await expect(
			unbreakableContent.getBoundingClientRect().height,
		).toBeGreaterThan(shortContent.getBoundingClientRect().height)

		for (const content of contents) {
			await expect(content.scrollWidth).toBeLessThanOrEqual(
				content.clientWidth + 1,
			)
			await expect(content.getBoundingClientRect().right).toBeLessThanOrEqual(
				group.getBoundingClientRect().right + 1,
			)
		}
	},
})
