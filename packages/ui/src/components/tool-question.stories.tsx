import type { ComponentProps, CSSProperties, ReactNode } from "react"
import { expect, fireEvent, fn, spyOn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	expectControlFrame,
	expectInverseAtRest,
	isInBrowserRunner,
	lineHeightOf,
	realPointer,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { CATALOGUE_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	ToolQuestion,
	type ToolQuestionAnswers,
	type ToolQuestionItem,
	type ToolQuestionNotice,
	type ToolQuestionProps,
} from "@workspace/ui/components/tool-question"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"
import { chat } from "@workspace/ui/lib/i18n-en/chat"

const FRAMEWORK_QUESTION: ToolQuestionItem = {
	question: "Which framework should the dashboard use?",
	header: "Framework",
	options: [
		{
			label: "Next.js",
			description: "Server rendering and routing out of the box.",
			preview: "bun create next-app dashboard",
		},
		{
			label: "Vite",
			description: "A thin dev server, no framework opinions.",
			preview: "bun create vite dashboard",
		},
		{
			label: "Remix",
			description: "Nested routes with loaders on every level.",
		},
	],
}

const REGISTRY_QUESTION: ToolQuestionItem = {
	question: "Where should the components come from?",
	header: "Component registry and design token source",
	options: [
		{ label: "Base UI", description: "The primitives already vendored." },
		{ label: "Radix", description: "A second set to install and keep." },
	],
}

const SCOPE_QUESTION: ToolQuestionItem = {
	question: "Which surfaces should the migration cover?",
	header: "Scope",
	multiSelect: true,
	options: [
		{ label: "Chat", description: "The transcript and its composer." },
		{ label: "Settings", description: "Every panel of the settings dialog." },
		{ label: "Onboarding", description: "The first-run screens only." },
		{ label: "Marketing", description: "The public site, out of the app." },
	],
}

const NAMING_QUESTION: ToolQuestionItem = {
	question: "What should the package be called?",
	header: "Naming",
	options: [
		{ label: "@workspace/tokens", description: "Matches the ui package." },
		{ label: "@workspace/design", description: "Wider than tokens alone." },
	],
}

const RELEASE_QUESTION: ToolQuestionItem = {
	question: "When should it ship?",
	header: "Release",
	options: [
		{ label: "Now", description: "Cut a release from this branch." },
		{ label: "Next week", description: "Wait for the audit to land." },
	],
}

const ASKED_BY_THE_SESSION =
	"`apps/app/src/lib/onboarding/onboarding-steps.ts:52` posts this step as a question of its own, and `apps/app/src/components/thread-prompt.tsx:103` draws it with no Skip, since a posted request cannot be denied."

const POSTED_BY_ONBOARDING =
	"`apps/app/src/components/thread-prompt.tsx:103` mounts the card for the `AskUserQuestion` the session raised, inside the turn `apps/app/src/components/thread-screen.tsx:628` is asking on."

const meta = preview.meta({
	title: "Conversation/Tools/ToolQuestion",
	component: ToolQuestion,
	parameters: {
		docs: {
			description: {
				component:
					"The question panel of one `AskUserQuestion` call, drawn on the composer shell: one to four questions, answered in a single pass and submitted once. Only one question is ever on screen. With several, a segmented control takes the place of the header label and each answered segment carries a check. Answering a single-select question moves the panel to the next one still waiting, and the foot ends on `Next` until none is left to wait for, then on `Send`.\n\nEvery option is one row, and the whole row is the control, named by its label and described by its description, with its 1-based digit in a key chip. A chosen row takes the Space bubble colour. Every question also takes an answer of the reader's own, exclusive with the options: typing clears the picks, picking clears the text. The panel reports one string per question: the picked labels joined by `, `, or the typed text. While `minimised` is true the same component draws the waiting bar instead.",
			},
		},
	},
	args: {
		questions: [FRAMEWORK_QUESTION],
		onAnswer: fn(),
		onDeny: fn(),
	},
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl">
				<Story />
			</div>
		),
	],
})

const boxOf = (element: Element) => element.getBoundingClientRect()

const PLAN_QUESTION: ToolQuestionItem = {
	question: "Which plan should Northwind start on?",
	header: "Plan",
	options: [
		{ label: "Starter", description: "One seat and the core features." },
		{ label: "Team", description: "Up to ten seats and shared Spaces." },
		{
			label: "Enterprise",
			description: "Unlimited seats, single sign-on and audit logs.",
		},
	],
}

const CHANNELS_QUESTION: ToolQuestionItem = {
	question: "Where should the launch be announced?",
	header: "Channels",
	multiSelect: true,
	options: [
		{ label: "Newsletter", description: "The monthly email to customers." },
		{ label: "Blog", description: "A post on the Northwind site." },
		{ label: "Social", description: "A thread on every Northwind account." },
	],
}

const LONG_QUESTION: ToolQuestionItem = {
	...PLAN_QUESTION,
	question:
		"Northwind runs three warehouses and a storefront that all share one catalogue, so which plan should the whole team start on before the spring launch?",
}

const NORTHWIND_TINT: BotAvatarBlot = "green"

const ARTBOARD =
	"Light and dark side by side, in the composer slot of the green Space Northwind, whose bubble colour paints every chosen row. "

type InComposerSlotProps = { children: ReactNode }

const InComposerSlot = ({ children }: InComposerSlotProps) => (
	<div
		className="surface-shell px-(--shell-inset) pt-6 pb-(--shell-inset)"
		data-space-tint={NORTHWIND_TINT}
		data-testid="space"
		style={{ "--space-tint": blotTint(NORTHWIND_TINT) } as CSSProperties}
	>
		{children}
	</div>
)

const inComposerSlot = (args: ToolQuestionProps) => (
	<InComposerSlot>
		<ToolQuestion {...args} />
	</InComposerSlot>
)

const narrowComposerSlot = (args: ToolQuestionProps) => (
	<div className="w-[320px]" data-testid="column">
		<InComposerSlot>
			<ToolQuestion {...args} />
		</InComposerSlot>
	</div>
)

const panelsIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getAllByRole("form")

const backgroundOf = (element: Element) =>
	getComputedStyle(element).backgroundColor

const expectChosenPaint = async (row: HTMLElement) => {
	const bubble = tokenStyleIn(row, "surface-user-bubble", "backgroundColor")
	await waitFor(() => expect(backgroundOf(row)).toBe(bubble))
	await expect(getComputedStyle(row).color).toBe(
		tokenStyleIn(row, "text-user-bubble-foreground", "color"),
	)
}

const OWN_ANSWER = "Wait until the spring catalogue is ready"

export const NothingChosen = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { questions: [PLAN_QUESTION], onMinimise: fn() },
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `Artboard 1.1: one single-select question waiting on its first pick. ${ARTBOARD}The header label sits above the question, Minimize top right. Every row carries its 1-based digit in a key chip and the foot hint names the range, but no digit key is bound. Send is drawn at 40% while nothing is chosen and the own-answer field is empty; it stays reachable, and pressing it says what is missing. Skip calls \`onDeny\`, Minimize calls \`onMinimise\`.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panels = panelsIn(canvasElement)
		await expect(panels).toHaveLength(2)

		for (const panel of panels) {
			const card = within(panel)
			await expect(backgroundOf(panel)).toBe(
				tokenStyleIn(panel, "bg-muted", "backgroundColor"),
			)
			await expect(card.getByText(PLAN_QUESTION.header)).toBeVisible()

			for (const [index, option] of PLAN_QUESTION.options.entries()) {
				const row = card.getByRole("radio", { name: option.label })
				await expect(row).toHaveAccessibleDescription(option.description)
				await expect(row).toHaveAttribute("aria-checked", "false")
				await expect(slotIn(row, "tool-question-key")).toHaveTextContent(
					String(index + 1),
				)
				await expect(backgroundOf(row)).toBe(
					tokenStyleIn(row, "bg-card", "backgroundColor"),
				)
			}

			await expect(
				card.getByText("Press 1-3 to choose, Return to send."),
			).toBeVisible()
			const send = card.getByRole("button", { name: chat.toolQuestion.submit })
			await expect(send).toHaveTextContent(chat.toolQuestion.send)
			await expect(send).toHaveAttribute("aria-disabled", "true")
			await expect(getComputedStyle(send).opacity).toBe("0.4")

			panel.focus()
			await userEvent.keyboard("2")
			for (const row of card.getAllByRole("radio"))
				await expect(row).toHaveAttribute("aria-checked", "false")
		}

		const light = within(panels[0] as HTMLElement)
		await userEvent.click(
			light.getByRole("button", { name: chat.toolQuestion.skip }),
		)
		await expect(args.onDeny).toHaveBeenCalledTimes(1)
		await userEvent.click(
			light.getByRole("button", { name: chat.toolQuestion.minimise }),
		)
		await expect(args.onMinimise).toHaveBeenCalledTimes(1)
	},
})

export const OptionChosen = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { questions: [PLAN_QUESTION], onMinimise: fn() },
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `Artboard 1.2: Team chosen. ${ARTBOARD}The chosen row takes the Space bubble colour with its ink: the key chip at 10% ink, the digit at 80%, the description at 70%, and a heavy check in the trailing slot. Send is drawn at full strength. Pick \`ChosenRowFollowsSpaceTint\` for the same row repainted by another Space.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		for (const panel of panelsIn(canvasElement)) {
			const card = within(panel)
			const chosen = card.getByRole("radio", { name: "Team" })
			await userEvent.click(chosen)

			await expect(chosen).toHaveAttribute("aria-checked", "true")
			await expectChosenPaint(chosen)
			await expect(
				slotIn(chosen, "tool-question-mark").querySelector("svg"),
			).not.toBeNull()
			await expect(
				slotIn(
					card.getByRole("radio", { name: "Starter" }),
					"tool-question-mark",
				).childElementCount,
			).toBe(0)
			await expect(
				card.getByRole("button", { name: chat.toolQuestion.submit }),
			).not.toHaveAttribute("aria-disabled")
		}
	},
})

export const ChosenRowFollowsSpaceTint = meta.story({
	tags: ["test-only"],
	args: { questions: [PLAN_QUESTION] },
	render: inComposerSlot,
	parameters: {
		docs: {
			description: {
				story:
					"The chosen row of artboard 1.2 reads the Space bubble colour rather than a fixed accent: switching the Space from green to blue repaints the row it already holds, with no new pick.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const space = canvas.getByTestId("space")
		const chosen = canvas.getByRole("radio", { name: "Team" })
		await userEvent.click(chosen)
		await expectChosenPaint(chosen)
		const green = backgroundOf(chosen)

		space.dataset.spaceTint = "blue"
		space.style.setProperty("--space-tint", blotTint("blue"))

		await waitFor(() => expect(backgroundOf(chosen)).not.toBe(green))
		await expectChosenPaint(chosen)
	},
})

export const SeveralChecked = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { questions: [CHANNELS_QUESTION], onMinimise: fn() },
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `Artboard 1.3: a multi-select question with Newsletter and Social checked. ${ARTBOARD}The hint line under the question says any may apply, each checked row wears the bubble colour with a filled ink circle holding a check, an unchecked row keeps an empty ring, and the foot hint says the digits toggle.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		for (const panel of panelsIn(canvasElement)) {
			const card = within(panel)
			await expect(
				card.getByRole("group", { name: CHANNELS_QUESTION.question }),
			).toBeVisible()
			await expect(card.getByText(chat.toolQuestion.pickAny)).toBeVisible()

			for (const label of ["Newsletter", "Social"]) {
				const row = card.getByRole("checkbox", { name: label })
				await userEvent.click(row)
				await expect(row).toHaveAttribute("aria-checked", "true")
				await expectChosenPaint(row)
				const mark = slotIn(row, "tool-question-mark")
					.firstElementChild as HTMLElement
				await expect(backgroundOf(mark)).toBe(
					tokenStyleIn(row, "bg-user-bubble-foreground", "backgroundColor"),
				)
			}

			const unchecked = card.getByRole("checkbox", { name: "Blog" })
			await expect(unchecked).toHaveAttribute("aria-checked", "false")
			const ring = slotIn(unchecked, "tool-question-mark")
				.firstElementChild as HTMLElement
			await expect(
				Number.parseFloat(getComputedStyle(ring).borderTopWidth),
			).toBeGreaterThan(0)
			await expect(getComputedStyle(ring).borderTopColor).toBe(
				tokenStyleIn(unchecked, "border-foreground/17", "borderTopColor"),
			)

			await expect(
				card.getByText("Press 1-3 to toggle, Return to send."),
			).toBeVisible()
		}
	},
})

export const OwnAnswerTyping = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { questions: [PLAN_QUESTION], onMinimise: fn() },
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		pseudo: { focus: `input[aria-label="${chat.toolQuestion.freeText}"]` },
		docs: {
			description: {
				story: `Artboard 1.4: an answer of the reader's own, typed into the field under the options. ${ARTBOARD}While the field holds focus it wears a 3px ring in the ring colour at 30% and a caret in the ring colour; while it holds text it ends on a check in the same colour, the picks are dropped, and the foot hint shrinks to the Return key alone.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		for (const panel of panelsIn(canvasElement)) {
			const card = within(panel)
			const field = card.getByLabelText(chat.toolQuestion.freeText)
			const frame = field.parentElement as HTMLElement

			await expect(
				frame.querySelector('[data-slot="tool-question-own-answer-check"]'),
			).toBeNull()
			await userEvent.type(field, OWN_ANSWER)

			const check = slotIn(frame, "tool-question-own-answer-check")
			await expect(getComputedStyle(check).color).toBe(
				tokenStyleIn(frame, "text-ring", "color"),
			)
			await expect(getComputedStyle(field).caretColor).toBe(
				tokenStyleIn(frame, "text-ring", "color"),
			)
			await expect(getComputedStyle(frame).boxShadow).not.toBe("none")
			await expect(card.getByText(chat.toolQuestion.hint.send)).toBeVisible()
			for (const row of card.getAllByRole("radio"))
				await expect(row).toHaveAttribute("aria-checked", "false")
		}
	},
})

export const SeveralQuestions = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: {
		questions: [PLAN_QUESTION, CHANNELS_QUESTION, RELEASE_QUESTION],
		onMinimise: fn(),
	},
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `Artboard 1.5: three questions, the first answered. ${ARTBOARD}A segmented control takes the place of the header label: the segment on screen is lifted on the card colour, an answered one leads with a green check. Picking Team handed the panel over to Channels, and while a question still waits after this one the foot ends on Next with an arrow, and the hint says Return goes there.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		for (const panel of panelsIn(canvasElement)) {
			const card = within(panel)
			await userEvent.click(card.getByRole("radio", { name: "Team" }))

			const answered = card.getByRole("tab", { name: PLAN_QUESTION.header })
			const shown = card.getByRole("tab", { name: CHANNELS_QUESTION.header })
			await expect(shown).toHaveAttribute("aria-selected", "true")
			const lifted = tokenStyleIn(shown, "bg-card", "backgroundColor")
			await waitFor(() => expect(backgroundOf(shown)).toBe(lifted))
			const check = answered.querySelector("svg") as SVGElement
			await expect(getComputedStyle(check).color).toBe(
				tokenStyleIn(answered, "text-bot-badge-done", "color"),
			)
			await expect(shown.querySelector("svg")).toBeNull()
			await expect(
				card.queryByText(PLAN_QUESTION.header, { selector: "p" }),
			).not.toBeInTheDocument()

			const next = card.getByRole("button", { name: chat.toolQuestion.next })
			await expect(next).toHaveTextContent(chat.toolQuestion.nextLabel)
			await expect(
				card.queryByRole("button", { name: chat.toolQuestion.submit }),
			).not.toBeInTheDocument()
			await expect(
				card.getByText("Press 1-3 to toggle, Return for the next question."),
			).toBeVisible()
		}
	},
})

export const WaitingBar = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: {
		questions: [PLAN_QUESTION],
		minimised: true,
		companionName: "Shoto",
		onExpand: fn(),
	},
	render: inComposerSlot,
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `Artboard 3.1: the panel folded into its waiting bar, drawn by the same component while \`minimised\` is true. ${ARTBOARD}An amber question mark, who is waiting, then the question on one clamped line, and Answer, which calls \`onExpand\`.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bars = slotsIn(canvasElement, "tool-question-waiting")
		await expect(bars).toHaveLength(2)
		await expect(within(canvasElement).queryByRole("form")).toBeNull()

		for (const bar of bars) {
			const strip = bar.firstElementChild as HTMLElement
			const question = within(bar).getByText(PLAN_QUESTION.question)
			await expect(
				within(bar).getByText("Shoto is waiting on your answer"),
			).toBeVisible()
			await expect(backgroundOf(strip)).toBe(
				tokenStyleIn(strip, "bg-question-bar", "backgroundColor"),
			)
			await expect(backgroundOf(strip.firstElementChild as HTMLElement)).toBe(
				tokenStyleIn(strip, "bg-warning", "backgroundColor"),
			)
			await expect(getComputedStyle(question).whiteSpace).toBe("nowrap")
		}

		await userEvent.click(
			within(bars[0] as HTMLElement).getByRole("button", {
				name: chat.toolQuestion.waiting.answer,
			}),
		)
		await expect(args.onExpand).toHaveBeenCalledTimes(1)
	},
})

export const WaitingBarNarrow = meta.story({
	args: {
		questions: [LONG_QUESTION],
		minimised: true,
		companionName: "Shoto",
		onExpand: fn(),
	},
	render: narrowComposerSlot,
	parameters: {
		docs: {
			description: {
				story:
					"The waiting bar of artboard 3.1 in a 320px column. The question gives way first and holds one clamped line, the title truncates only once the question has no room left, and Answer keeps its full size inside the column.",
			},
		},
	},
	play: async ({ canvas }) => {
		const column = canvas.getByTestId("column")
		const question = canvas.getByText(LONG_QUESTION.question)
		const answer = canvas.getByRole("button", {
			name: chat.toolQuestion.waiting.answer,
		})

		await expect(boxOf(question).height).toBeLessThanOrEqual(
			lineHeightOf(question),
		)
		await expect(answer.scrollWidth).toBe(answer.clientWidth)
		await expect(boxOf(answer).right).toBeLessThanOrEqual(boxOf(column).right)
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

export const LongQuestionNarrow = meta.story({
	args: { questions: [LONG_QUESTION], onMinimise: fn() },
	render: narrowComposerSlot,
	parameters: {
		docs: {
			description: {
				story:
					"A long question in a 320px column: it wraps over several lines inside the panel rather than truncating, and Minimize keeps its place top right.",
			},
		},
	},
	play: async ({ canvas }) => {
		const column = canvas.getByTestId("column")
		const question = canvas.getByText(LONG_QUESTION.question)

		await expect(boxOf(question).height).toBeGreaterThan(
			2 * lineHeightOf(question),
		)
		await expect(boxOf(question).right).toBeLessThanOrEqual(boxOf(column).right)
		await expect(
			canvas.getByRole("button", { name: chat.toolQuestion.minimise }),
		).toBeVisible()
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

const hasFocusRing = (element: HTMLElement) => {
	const style = getComputedStyle(element)
	return style.outlineStyle !== "none" || style.boxShadow !== "none"
}

export const KeyboardFocusRings = meta.story({
	tags: ["test-only"],
	args: { questions: [PLAN_QUESTION, CHANNELS_QUESTION], onMinimise: fn() },
	render: inComposerSlot,
	parameters: {
		docs: {
			description: {
				story:
					"Tab walks the panel from the segments to Send, and every control it lands on draws a visible ring: the segment, Minimize, the option row, the own-answer field through its frame, Skip and Send.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const field = canvas.getByLabelText(chat.toolQuestion.freeText)
		const stops = [
			[canvas.getByRole("tab", { name: PLAN_QUESTION.header }), null],
			[canvas.getByRole("button", { name: chat.toolQuestion.minimise }), null],
			[canvas.getByRole("radio", { name: "Starter" }), null],
			[field, field.parentElement],
			[canvas.getByRole("button", { name: chat.toolQuestion.skip }), null],
			[canvas.getByRole("button", { name: chat.toolQuestion.next }), null],
		] as const

		await expect(canvas.getByRole("form")).toHaveFocus()
		for (const [control, frame] of stops) {
			await userEvent.tab()
			await expect(control).toHaveFocus()
			await expect(control.matches(":focus-visible")).toBe(true)
			await waitFor(() =>
				expect(hasFocusRing((frame ?? control) as HTMLElement)).toBe(true),
			)
		}
	},
})

export const SingleSelect = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One question that holds at most one answer: picking a second option replaces the first rather than adding to it. Reach for this to check the whole row picks the option (the description, the padding, anywhere but the preview), that Send loses its 40% once a pick is held, that the preview appears only under the picked option, and that Skip calls `onDeny`. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const submit = canvas.getByRole("button", { name: /send answers/i })
		await expect(submit).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(
			canvas.getByText("Server rendering and routing out of the box."),
		)
		await expect(submit).not.toHaveAttribute("aria-disabled")
		await expect(
			canvas.getByText("bun create next-app dashboard"),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("radio", { name: /Vite/ }))
		await expect(
			canvas.queryByText("bun create next-app dashboard"),
		).not.toBeInTheDocument()

		await userEvent.click(submit)
		await expect(args.onAnswer).toHaveBeenCalledTimes(1)
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Vite",
		})

		await userEvent.click(
			canvas.getByRole("button", { name: chat.toolQuestion.skip }),
		)
		await expect(args.onDeny).toHaveBeenCalledTimes(1)
	},
})

export const MultiSelect = meta.story({
	args: { questions: [SCOPE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The same question with `multiSelect` true: several options hold at once and the answer is their labels joined by `, `, in the order they were picked. Check that picking a second option keeps the first, that picking a held option lets it go, and that the card stays put — a question still being built must not be taken as done. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Onboarding/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Marketing/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Marketing/ }))

		await userEvent.click(canvas.getByRole("button", { name: /send answers/i }))
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[SCOPE_QUESTION.question]: "Chat, Onboarding",
		})
	},
})

export const FreeText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The answer the call never offered. Every question carries an own-answer field under its options, and what is typed there is reported as the whole answer: it is not a note attached to a pick. Check that typing drops whatever was picked, that the keyboard alone reaches the options, the field, Skip and Send, and that the answer is the typed text verbatim. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: /Remix/ }))

		await userEvent.type(
			canvas.getByLabelText("Other answer"),
			"TanStack Start, once it is stable",
		)
		await expect(canvas.getByRole("radio", { name: /Remix/ })).toHaveAttribute(
			"aria-checked",
			"false",
		)

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: chat.toolQuestion.skip }),
		).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toHaveFocus()
		await userEvent.keyboard("{Enter}")

		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "TanStack Start, once it is stable",
		})
	},
})

export const KeyboardOnly = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The card as a docked surface reached without the mouse: it is a form that takes focus the moment it appears, so the reader never hunts for it above the composer. Enter does exactly what the primary button does — it hands over the next question still waiting, and sends the answers once none is. Enter on a question holding nothing does nothing, and every control that already answers to Enter — an option, a tab, the free-text field, a footer button — keeps its own behaviour. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const card = canvas.getByRole("form")
		await expect(card).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onAnswer).not.toHaveBeenCalled()
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()

		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await expect(
			canvas.getByRole("button", { name: /next question/i }),
		).toBeEnabled()

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()

		await userEvent.click(canvas.getByRole("radio", { name: /Now/ }))
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toBeEnabled()

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[SCOPE_QUESTION.question]: "Chat",
			[RELEASE_QUESTION.question]: "Now",
		})
	},
})

export const FourQuestions = meta.story({
	args: {
		questions: [
			FRAMEWORK_QUESTION,
			SCOPE_QUESTION,
			NAMING_QUESTION,
			RELEASE_QUESTION,
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The widest call the tool can make: four questions under four tabs, one on screen at a time. The primary button carries the reader through them: it reads `Next question` while another question still waits, and only becomes `Send answers` on the last one, so nothing is sent half-answered. Check that answering a single-select question hands over the next by itself, that pressing the button before the question on screen holds an answer keeps it on screen with an error, that a tab can be reached in any order once the reader wants to change an answer, that an answered tab carries its check, and that the send reports all four at once, keyed by question. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const primary = () =>
			canvas.getByRole("button", { name: /next question|send answers/i })

		await expect(canvas.getAllByRole("tab")).toHaveLength(4)
		await expect(primary()).toBeEnabled()

		await userEvent.click(canvas.getByRole("radio", { name: /Next\.js/ }))
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()
		await expect(
			canvas.queryByText(FRAMEWORK_QUESTION.question),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("checkbox", { name: /Settings/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await expect(primary()).toHaveAccessibleName(/next question/i)

		await userEvent.click(primary())
		await expect(canvas.getByText(NAMING_QUESTION.question)).toBeVisible()

		await userEvent.type(
			canvas.getByLabelText("Other answer"),
			"@workspace/foundations",
		)
		await userEvent.click(primary())
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
		await expect(primary()).toBeEnabled()

		await userEvent.click(canvas.getByRole("tab", { name: /framework/i }))
		await expect(
			canvas.getByRole("radio", { name: /Next\.js/ }),
		).toHaveAttribute("aria-checked", "true")

		await userEvent.click(canvas.getByRole("tab", { name: /release/i }))
		await userEvent.click(canvas.getByRole("radio", { name: /Next week/ }))
		await expect(primary()).toHaveAccessibleName(/send answers/i)

		await userEvent.click(primary())
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Next.js",
			[SCOPE_QUESTION.question]: "Settings, Chat",
			[NAMING_QUESTION.question]: "@workspace/foundations",
			[RELEASE_QUESTION.question]: "Next week",
		})
	},
})

export const Narrow = meta.story({
	args: {
		questions: [
			FRAMEWORK_QUESTION,
			SCOPE_QUESTION,
			NAMING_QUESTION,
			RELEASE_QUESTION,
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The four-tab card in a 320px column, the narrowest surface a transcript ever hands it. Check that the tab strip stays inside the column and scrolls sideways rather than pushing a tab out of it, that the four tabs hold one line by sharing a top edge, that every tab is still reachable by pointer and by arrow key, and that an option below still takes a press and hands the card over to the next question waiting. Pick `FourQuestions` for the same card with room to spread. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	render: (args) => (
		<div className="w-[320px] px-6" data-testid="column">
			<ToolQuestion {...args} />
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const column = canvas.getByTestId("column")
		const strip = canvas.getByRole("tablist")

		const tabs = canvas.getAllByRole("tab")
		const lineTop = boxOf(tabs[0]).top

		await expect(tabs).toHaveLength(4)
		await expect(boxOf(strip).right).toBeLessThanOrEqual(boxOf(column).right)
		for (const tab of tabs) {
			await expect(boxOf(tab).top).toBe(lineTop)
		}

		await userEvent.click(canvas.getByRole("tab", { name: /release/i }))
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()

		canvas.getByRole("tab", { name: NAMING_QUESTION.header }).focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()

		await userEvent.click(
			await canvas.findByRole("radio", { name: /Next week/ }),
		)
		await expect(canvas.getByText(FRAMEWORK_QUESTION.question)).toBeVisible()
	},
})

export const LongHeaderScrolls = meta.story({
	args: { questions: [REGISTRY_QUESTION, SCOPE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"A header too long for a 320px column, next to a short one. A tab never wraps and never grows past the strip, so a header wider than the whole column ends in an ellipsis instead of pushing the first tab off the button's edge: the strip keeps its one line inside the card and hands the tabs out of view to a sideways scroll, with no scrollbar drawn over them. Check that both tabs share a height and a top edge, that the segment track starts on the same line as Skip below, that the strip stops at the edge of the column, that the question below stays clear of the strip, and that walking the strip with the arrow keys brings the tab it lands on back into view. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	render: (args) => (
		<div className="w-[320px] px-6" data-testid="column">
			<ToolQuestion {...args} />
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const column = canvas.getByTestId("column")
		const strip = canvas.getByRole("tablist")
		const longTab = canvas.getByRole("tab", { name: REGISTRY_QUESTION.header })
		const shortTab = canvas.getByRole("tab", { name: SCOPE_QUESTION.header })
		const asked = canvas.getByText(REGISTRY_QUESTION.question)
		const skip = canvas.getByRole("button", { name: chat.toolQuestion.skip })

		await expect(
			canvas.getByRole("button", { name: chat.toolQuestion.next }),
		).toBeVisible()
		await expect(boxOf(longTab).height).toBe(boxOf(shortTab).height)
		await expect(boxOf(longTab).top).toBe(boxOf(shortTab).top)
		await expect(boxOf(strip).left).toBe(boxOf(skip).left)
		await expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
		await expect(boxOf(strip).right).toBeLessThanOrEqual(boxOf(column).right)
		await expect(boxOf(longTab).bottom).toBeLessThanOrEqual(boxOf(asked).top)
		await expect(boxOf(longTab).left).toBeGreaterThan(boxOf(strip).left)

		longTab.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(strip.scrollLeft).toBeGreaterThan(0)
		await expect(boxOf(shortTab).right).toBeLessThan(boxOf(strip).right)

		await userEvent.click(longTab)
		await userEvent.click(await canvas.findByRole("radio", { name: /Base UI/ }))
		await expect(boxOf(longTab).height).toBe(boxOf(shortTab).height)
	},
})

export const ArrowKeyTabs = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION, FRAMEWORK_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The tab strip walked with the arrow keys. A tab here changes nothing but which question is on screen, so walking is opening: the arrows select as they move and the card follows without a second press. Check that the question under the strip is the one the arrows landed on. The search palette does the opposite, because a tab there starts a query. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()

		canvas.getByRole("tab", { name: SCOPE_QUESTION.header }).focus()
		await userEvent.keyboard("{ArrowRight}")

		await expect(
			canvas.getByRole("tab", { name: RELEASE_QUESTION.header }),
		).toHaveAttribute("aria-selected", "true")
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
	},
})

export const ReducedMotion = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The card for a reader who asked the system to stop moving things. The registry tab transitions every property it changes; the card drops that under `prefers-reduced-motion`, so the fill moves from one tab to the next in a single frame. Check that every tab reports a transition of no duration, and that the strip still selects. " +
					POSTED_BY_ONBOARDING,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const tabs = canvas.getAllByRole("tab")

		for (const tab of tabs) {
			await expect(getComputedStyle(tab).transitionDuration).toBe("0s")
		}

		await userEvent.click(
			canvas.getByRole("tab", { name: RELEASE_QUESTION.header }),
		)
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
	},
})

const SHOTO: MessageAuthor = {
	id: "bot-shoto",
	name: "Shoto",
	blot: "green",
}

const askedByShoto = (args: ToolQuestionProps) => (
	<AssistantTurn author={SHOTO} fills>
		<ToolQuestion {...args} onDeny={undefined} />
	</AssistantTurn>
)

const expectAskedByShoto = async (canvasElement: HTMLElement, step: string) => {
	const bubble = slotIn(canvasElement, "message-bubble-content")

	await expect(slotIn(canvasElement, "message-gutter")).toBeVisible()
	await expect(slotIn(canvasElement, "message-author")).toHaveTextContent(
		"Shoto",
	)
	await expect(within(bubble).getByText(step)).toBeVisible()
	await expect(
		within(bubble).queryByRole("button", { name: chat.toolQuestion.skip }),
	).not.toBeInTheDocument()
}

type EnterHeldThenSent = {
	field: HTMLElement
	composingEvent: KeyboardEventInit
	onAnswer: ToolQuestionProps["onAnswer"]
	answer: ToolQuestionAnswers
}

const expectEnterHeldThenSent = async ({
	field,
	composingEvent,
	onAnswer,
	answer,
}: EnterHeldThenSent) => {
	const isDefaultKept = fireEvent.keyDown(field, {
		key: "Enter",
		...composingEvent,
	})
	await expect(isDefaultKept).toBe(true)
	await expect(onAnswer).not.toHaveBeenCalled()

	fireEvent.keyDown(field, { key: "Enter" })
	await expect(onAnswer).toHaveBeenCalledTimes(1)
	await expect(onAnswer).toHaveBeenCalledWith(answer)
}

const tokenColor = (token: string) => {
	const probe = document.createElement("div")
	probe.style.backgroundColor = `var(${token})`
	document.body.append(probe)
	const color = getComputedStyle(probe).backgroundColor
	probe.remove()
	return color
}

const SIGN_IN_URL =
	"claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Ainference&state=8f3c1a"

const WELCOME_STEP: ToolQuestionItem = {
	question: "Ready to start?",
	header: "Setup",
	optionsOnly: true,
	options: [
		{ label: "Start", description: "Three steps, about a minute." },
		{
			label: "Tell me more first",
			description: "What Kiroshi is, before you connect anything.",
		},
	],
}

const ACCOUNT_STEP: ToolQuestionItem = {
	question: "Use the account already on this machine?",
	header: "Your Claude account",
	optionsOnly: true,
	options: [
		{
			label: "Use this account",
			description:
				"Signed in with your Claude subscription, under your own login.",
		},
		{
			label: "Use another account",
			description: "Sign in again with a different one.",
		},
	],
}

const ACCESS_STEP: ToolQuestionItem = {
	question: "How do you want to connect?",
	header: "Your Claude account",
	optionsOnly: true,
	options: [
		{
			label: "Sign in with Claude",
			description:
				"Opens your browser once. Works with your Pro or Max subscription.",
		},
		{
			label: "Paste an API key",
			description: "Pay per use, with nothing to sign in to.",
		},
	],
}

const pasteKeyInstead = fn()

const CODE_STEP: ToolQuestionItem = {
	question: "Paste the code Claude gave you",
	header: "Sign in",
	options: [],
	link: { label: "Open this link and sign in", url: SIGN_IN_URL },
	entry: { label: "Then paste the code it gives you" },
	exit: { label: "Paste a key instead", onSelect: pasteKeyInstead },
}

const KEY_STEP: ToolQuestionItem = {
	question: "Paste your Anthropic API key",
	header: "API key",
	options: [],
	entry: { label: "Key", placeholder: "sk-ant-…", isSecret: true },
	exit: { label: "Sign in instead", onSelect: fn() },
}

const SIGN_IN_FAILED_STEP: ToolQuestionItem = {
	question: "Try again, or use a key instead?",
	header: "Sign in",
	optionsOnly: true,
	failure: {
		title: "Couldn’t sign you in",
		detail: "auth login exited with code 1",
	},
	options: [
		{ label: "Try again", description: "Opens your browser once more." },
		{
			label: "Paste an API key",
			description: "Pay per use, with nothing to sign in to.",
		},
	],
}

const KEY_FAILED = chat.onboarding.connection.keyFailed

const KEY_REFUSED_DETAIL = "API Error: 401 API key is invalid."

const KEY_FAILED_STEP: ToolQuestionItem = {
	question: "Try another key, or sign in?",
	header: "API key",
	optionsOnly: true,
	failure: { title: KEY_FAILED.title, detail: KEY_REFUSED_DETAIL },
	options: [
		{
			label: KEY_FAILED.anotherKey,
			description: "Paste a different Anthropic API key.",
		},
		{
			label: KEY_FAILED.signIn,
			description:
				"Opens your browser once. Works with your Pro or Max subscription.",
		},
	],
}

const FIRST_REPLY_STEP: ToolQuestionItem = {
	question: "That’s it working. Ready for the last one?",
	header: "Last step",
	optionsOnly: true,
	options: [
		{
			label: "Pick my first companion",
			description: "One more question, then you’re set up.",
		},
		{
			label: "Keep talking first",
			description: "Ask me a few more things. I’ll wait.",
		},
	],
}

const FIRST_COMPANION_STEP: ToolQuestionItem = {
	question: "Who should join first?",
	header: "First companion",
	options: [
		{
			label: "Scout, who looks things up",
			description: "Reads long pages and reports back short.",
		},
		{
			label: "Ledger, who keeps things in order",
			description: "Watches your files and says what changed.",
		},
		{
			label: "Maker, who writes code",
			description: "Edits the folders you point it at.",
		},
	],
}

const HAND_OFF_STEP: ToolQuestionItem = {
	question: "Where do you want to go?",
	header: "Done",
	optionsOnly: true,
	options: [
		{
			label: "Open Scout",
			description: "Say hello and give it something to look up.",
		},
		{
			label: "Stay here",
			description:
				"Keep talking to me. Scout is in the sidebar when you want it.",
		},
	],
}

export const StepWelcome = meta.story({
	args: { questions: [WELCOME_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The first onboarding step, asked the way every step is asked: a question bubble from Shoto, with the gutter avatar and the name line the transcript draws. Nothing here is a card of its own: the step is the question, and the two options are the whole answer. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, WELCOME_STEP.question)
	},
})

export const StepAccountDetected = meta.story({
	args: { questions: [ACCOUNT_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The account already signed in on the machine, offered as the first of two options. Check that the account line reads as an option rather than as a status, since taking it is the answer. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, ACCOUNT_STEP.question)
	},
})

export const StepSignInOrKey = meta.story({
	args: { questions: [ACCESS_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The fork between signing in and pasting a key. Both ways out of this step are options of the question, so neither is a control the reader has to look for elsewhere. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, ACCESS_STEP.question)
	},
})

export const StepPasteTheCode = meta.story({
	args: { questions: [CODE_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The step that waits on the browser: the sign-in link to carry away, then the code to bring back, drawn here holding the code so `Continue` takes a press. The way out to an API key sits beside the primary control as a low emphasis control, because it leaves the step rather than answering it: pressing it reports once to the host and leaves the question and the typed code where they are. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		pasteKeyInstead.mockClear()
		await expectAskedByShoto(canvasElement, CODE_STEP.question)

		const code = canvas.getByLabelText("Then paste the code it gives you")

		await userEvent.type(code, "Xk3nQ8#7f2a1c4e")
		await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled()

		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a key instead" }),
		)
		await expect(pasteKeyInstead).toHaveBeenCalledTimes(1)
		await expect(code).toHaveValue("Xk3nQ8#7f2a1c4e")
		await expect(canvas.getByText(CODE_STEP.question)).toBeVisible()
	},
})

export const StepPasteAnApiKey = meta.story({
	args: { questions: [KEY_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The same bubble with a single masked field, drawn empty. `Continue` is drawn at 40% but stays operable: pressing it with no key keeps the step open, marks the field invalid, describes it with the error and puts focus back in it. The key is never drawn, so a screen share during onboarding shows the step without showing the secret. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectAskedByShoto(canvasElement, KEY_STEP.question)
		const field = canvas.getByLabelText("Key")
		const primary = canvas.getByRole("button", { name: "Continue" })
		await expect(field).toHaveValue("")
		await expect(primary).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(primary)
		const error = await canvas.findByRole("alert")
		await expect(error).toHaveTextContent("Answer this question to continue.")
		await expect(field).toHaveAttribute("aria-invalid", "true")
		await expect(field).toHaveAccessibleDescription(
			"Answer this question to continue.",
		)
		await expect(field).toHaveFocus()
		await expect(canvas.getByText(KEY_STEP.question)).toBeVisible()
	},
})

export const StepSignInFailed = meta.story({
	args: { questions: [SIGN_IN_FAILED_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The sign-in that came back refused, in the very bubble that asks what to do about it. The failure is a block above the question line, not a card of its own, and the two ways forward are the options below it. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, SIGN_IN_FAILED_STEP.question)
	},
})

export const StepApiKeyFailed = meta.story({
	args: { questions: [KEY_FAILED_STEP] },
	render: (args) => (
		<div className="w-[320px] px-6" data-testid="column">
			<TurnGroup>
				<AssistantTurn author={SHOTO}>{KEY_FAILED.sentence}</AssistantTurn>
				<AssistantTurn fills>
					<ToolQuestion {...args} onDeny={undefined} />
				</AssistantTurn>
			</TurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The API key that came back refused, in a 320px column. The sentence that says what went wrong is the companion's own line above the card; inside it, the failure block with the raw agent line sits above the question, and the two ways forward are options below it. No key field and no link: the refused key is not asked for again in place. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const column = canvas.getByTestId("column")
		const form = canvas.getByRole("form")
		const sentence = canvas.getByText(KEY_FAILED.sentence)
		const failure = slotIn(canvasElement, "tool-question-failure")
		const question = canvas.getByText(KEY_FAILED_STEP.question)
		const detail = canvas.getByText(KEY_REFUSED_DETAIL)
		const radios = canvas.getAllByRole("radio")
		const follows = (a: Node, b: Node) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

		await expect(follows(sentence, form)).toBe(true)
		await expect(form).toContainElement(failure)
		await expect(follows(failure, question)).toBe(true)
		await expect(detail).toBeVisible()
		await expect(form).toHaveAccessibleDescription(KEY_FAILED.title)

		await expect(radios).toHaveLength(2)
		await expect(radios[0]).toHaveAccessibleName(
			expect.stringContaining(KEY_FAILED.anotherKey),
		)
		await expect(radios[1]).toHaveAccessibleName(
			expect.stringContaining(KEY_FAILED.signIn),
		)
		await expect(follows(question, radios[0] as Node)).toBe(true)

		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()

		const bounds = column.getBoundingClientRect()
		for (const element of [detail, ...radios]) {
			const rect = element.getBoundingClientRect()
			await expect(rect.left).toBeGreaterThanOrEqual(bounds.left)
			await expect(rect.right).toBeLessThanOrEqual(bounds.right)
		}
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

export const StepFirstReply = meta.story({
	args: { questions: [FIRST_REPLY_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The step after the first answer came back, asking whether to go on. Its two options are the whole answer, so no free-text field is drawn. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAskedByShoto(canvasElement, FIRST_REPLY_STEP.question)
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()
	},
})

export const StepFirstCompanion = meta.story({
	args: { questions: [FIRST_COMPANION_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"Three companions, one seat. The options carry what each one does, and the free-text field stays under them, because the reader may want a companion none of the three is. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAskedByShoto(canvasElement, FIRST_COMPANION_STEP.question)
		await expect(canvas.getByLabelText("Other answer")).toBeVisible()
	},
})

export const StepHandOff = meta.story({
	args: { questions: [HAND_OFF_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The last step, which hands the reader over to the app. The onboarding ends on a question like every other step, so nothing switches shape at the end. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, HAND_OFF_STEP.question)
	},
})

export const OptionsAsWholeAnswer = meta.story({
	args: { questions: [{ ...FRAMEWORK_QUESTION, optionsOnly: true }] },
	parameters: {
		docs: {
			description: {
				story:
					"A question whose listed options are the whole answer: the free-text field is dropped rather than disabled, because an onboarding step that only accepts what it offers must not draw a field that leads nowhere. Check that the options still answer and that nothing else changes. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("radio", { name: /Vite/ }))
		await userEvent.click(canvas.getByRole("button", { name: /send answers/i }))
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Vite",
		})
	},
})

export const NoSkip = meta.story({
	render: (args) => <ToolQuestion {...args} onDeny={undefined} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same panel asked by a host that offers no way to refuse. With no `onDeny`, Skip is not drawn at all: a disabled one would read as a way out that stopped working. Send keeps its place at the end of the foot. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: chat.toolQuestion.skip }),
		).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toBeVisible()
	},
})

export const EntryWithLink = meta.story({
	args: { questions: [CODE_STEP] },
	render: (args) => (
		<div className="w-[320px]">
			<ToolQuestion {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An entry question in a 320px column: its fields replace the option rows, so neither a radio nor the free-text field is drawn. The link is read only and cut to one line while the copy control keeps its full size beside it, and copying is announced in a polite region, and the refused write leaves the link on screen and says so in the same region, since a link nobody can copy is still a link that can be read out. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new DOMException("Write permission denied.", "NotAllowedError"),
		)

		await expect(canvas.queryByRole("radio")).not.toBeInTheDocument()
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()

		const link = canvas.getByLabelText("Open this link and sign in")
		const copy = canvas.getByRole("button", { name: "Copy" })

		await expect(link).toHaveAttribute("readonly")
		await expect(link).toHaveValue(SIGN_IN_URL)
		await expect(link.scrollWidth).toBeGreaterThan(link.clientWidth)
		await expect(copy.clientWidth).toBe(copy.scrollWidth)
		await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
			canvasElement.clientWidth,
		)
		await expect(
			getComputedStyle(link.parentElement as HTMLElement).backgroundColor,
		).toBe(tokenColor("--muted"))

		await userEvent.click(copy)
		await expect(
			await canvas.findByText(
				"Couldn’t copy. Select the link and copy it yourself.",
			),
		).toBeInTheDocument()
		await expect(link).toHaveValue(SIGN_IN_URL)

		writeText.mockResolvedValue()
		await userEvent.click(copy)
		await expect(writeText).toHaveBeenLastCalledWith(SIGN_IN_URL)
		await expect(
			await canvas.findByText("Link copied to clipboard"),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const EntryWithSecret = meta.story({
	args: { questions: [KEY_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"The entry question that holds a secret: the value is masked, and autocomplete and spell checking are off, so a key is neither stored by the browser nor sent to a dictionary. The primary control reads `Continue` in place of the send label and refuses an empty field, and Enter inside the field submits the question rather than reaching for the button. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Key")

		await expect(field).toHaveAttribute("type", "password")
		await expect(field).toHaveAttribute("autocomplete", "off")
		await expect(field).toHaveAttribute("spellcheck", "false")
		const primary = canvas.getByRole("button", { name: "Continue" })
		await expect(primary).toHaveTextContent(/^Continue$/)
		await expect(primary).toBeEnabled()

		await userEvent.type(field, "sk-ant-0f3c1a{Enter}")
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[KEY_STEP.question]: "sk-ant-0f3c1a",
		})
	},
})

export const Failure = meta.story({
	args: { questions: [SIGN_IN_FAILED_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"A failure carried by the question itself. The block sits above the question line inside the same card: a dot in the destructive token, the sentence that says what went wrong across the whole row, and the raw detail on a surface sized to its own text at the inline start. The question keeps its options below, and the form names the failure in its accessible description, so a screen reader hears what went wrong along with the question it asks. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const failure = slotIn(canvasElement, "tool-question-failure")
		const question = canvas.getByText(SIGN_IN_FAILED_STEP.question)
		const title = canvas.getByText("Couldn’t sign you in")
		const detail = canvas.getByText("auth login exited with code 1")
		const form = canvas.getByRole("form")

		await expect(form).toContainElement(failure)
		await expect(form).toHaveAccessibleDescription("Couldn’t sign you in")
		await expect(detail.getBoundingClientRect().width).toBeLessThan(
			title.getBoundingClientRect().width,
		)
		await expect(
			failure.compareDocumentPosition(question) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(getComputedStyle(detail).backgroundColor).toBe(
			tokenColor("--card"),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "tool-question-failure-dot"))
				.backgroundColor,
		).toBe(tokenColor("--destructive"))

		await expect(canvas.getByRole("radio", { name: /Try again/ })).toBeVisible()
	},
})

export const EntryNarrow = meta.story({
	args: { questions: [KEY_STEP] },
	render: (args) => (
		<div className="w-[320px] px-6" data-testid="column">
			<ToolQuestion {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The paste-a-key question in a 320px column. Check that the key field stays inside the column and that nothing in the card pushes it sideways. Pick `StepApiKeyFailed` for the same path coming back refused. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas }) => {
		const column = canvas.getByTestId("column")

		await expect(canvas.getByLabelText("Key")).toBeVisible()
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})

export const EntryComposing = meta.story({
	args: { questions: [KEY_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"Enter pressed inside an entry field while an input method is still composing. That Enter commits the composition, so the answer stays unsent; the next Enter, once nothing is composing, sends it. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Key")
		await userEvent.type(field, "sk-ant-0f3c1a")

		await expectEnterHeldThenSent({
			field,
			composingEvent: { isComposing: true },
			onAnswer: args.onAnswer,
			answer: { [KEY_STEP.question]: "sk-ant-0f3c1a" },
		})
	},
})

export const EntryComposingLegacyKeyCodeOnCode = meta.story({
	args: { questions: [CODE_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"The code field under an older WebKit, which reports a composition in flight only through keyCode 229. That Enter commits the composition, so the code stays unsent and the key keeps its default action; the next Enter, carrying neither signal, sends it once. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Then paste the code it gives you")
		await userEvent.type(field, "Xk3nQ8#7f2a1c4e")

		await expectEnterHeldThenSent({
			field,
			composingEvent: { keyCode: 229 },
			onAnswer: args.onAnswer,
			answer: { [CODE_STEP.question]: "Xk3nQ8#7f2a1c4e" },
		})
	},
})

export const EntryComposingLegacyKeyCodeOnKey = meta.story({
	args: { questions: [KEY_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"The API key field under an older WebKit, which reports a composition in flight only through keyCode 229. That Enter commits the composition, so the key stays unsent and the key event keeps its default action; the next Enter, carrying neither signal, sends it once. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Key")
		await userEvent.type(field, "sk-ant-0f3c1a")

		await expectEnterHeldThenSent({
			field,
			composingEvent: { keyCode: 229 },
			onAnswer: args.onAnswer,
			answer: { [KEY_STEP.question]: "sk-ant-0f3c1a" },
		})
	},
})

const APPLICATION_SCOPE_STEP: ToolQuestionItem = {
	question: "Who should get Linear?",
	header: "Linear",
	mark: CATALOGUE_APPLICATIONS.find(({ id }) => id === "linear")?.mark,
	optionsOnly: true,
	options: [
		{
			label: "Only Shoto",
			description:
				"Shoto reads and files Linear issues. No other companion does.",
		},
		{
			label: "Every companion",
			description: "Linear joins every companion, and every one you add later.",
		},
		{
			label: "Don't install",
			description: "Nothing is added. Shoto carries on without Linear.",
		},
	],
}

const verticalCentreOf = (element: Element) => {
	const { top, height } = element.getBoundingClientRect()
	return top + height / 2
}

export const ApplicationScope = meta.story({
	args: { questions: [APPLICATION_SCOPE_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E9: the one place in the product where an application's scope is picked. The question carries the application mark on its own line, centred with the text, and answers with three options and no free text. Send is drawn at 40% until an option is picked, and the controls keep the size every other question ships with. Pick `FailureWithAction` for a question that only reports a failure. " +
					ASKED_BY_THE_SESSION,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const mark = slotIn(canvasElement, "application-mark")
		const question = canvas.getByText(APPLICATION_SCOPE_STEP.question)
		const send = canvas.getByRole("button", { name: chat.toolQuestion.submit })

		await expect(mark.getBoundingClientRect().width).toBe(22)
		await expect(question.firstElementChild).toBe(mark)
		await expect(question.getBoundingClientRect().height).toBeLessThan(
			2 * lineHeightOf(question),
		)
		await expect(
			Math.abs(verticalCentreOf(mark) - verticalCentreOf(question)),
		).toBeLessThanOrEqual(1)

		await expect(canvas.getAllByRole("radio")).toHaveLength(3)
		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(send).toHaveAttribute("aria-disabled", "true")
		await expect(send.getBoundingClientRect().height).toBe(32)

		await userEvent.click(
			canvas.getByRole("radio", { name: /Every companion/ }),
		)
		await expect(send).not.toHaveAttribute("aria-disabled")
	},
})

const KEY_REFUSED_NOTICE: ToolQuestionNotice = {
	isNotice: true,
	header: "Sentry",
	failure: {
		title: "Sentry refused the key",
		detail: "401 Unauthorized: invalid auth token",
	},
	action: {
		label: "Open Settings",
		icon: Icons.Settings,
		onSelect: fn(),
	},
}

export const FailureWithAction = meta.story({
	args: { questions: [KEY_REFUSED_NOTICE], onDeny: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The upper bubble of artboard E11: an item declared a notice, a failure with nothing to answer. A notice takes no question text, so no option, no free text and no question line are drawn, the failure title names the form, and the primary action replaces Send, enabled without any answer, with its own label and leading glyph. Pick `Failure` when the failure still asks a question below it, and `NoticeInQueue` for a notice beside a question. `packages/ui/src/components/application-install-turn.tsx:30` posts the notice when the key an install needs was left out: no question, no dismiss, one action to Settings.",
			},
		},
	},
	play: async ({ canvas }) => {
		const action = canvas.getByRole("button", { name: "Open Settings" })

		await expect(canvas.getByRole("form")).toHaveAccessibleName(
			"Sentry refused the key",
		)
		await expect(canvas.queryByRole("radio")).not.toBeInTheDocument()
		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: chat.toolQuestion.submit }),
		).not.toBeInTheDocument()
		await expect(action.querySelector("svg")).not.toBeNull()
		await expect(action).toBeEnabled()

		action.click()
		await expect(KEY_REFUSED_NOTICE.action?.onSelect).toHaveBeenCalledTimes(1)
	},
})

export const NoticeInQueue = meta.story({
	tags: ["test-only"],
	args: { questions: [RELEASE_QUESTION, KEY_REFUSED_NOTICE] },
	parameters: {
		docs: {
			description: {
				story:
					"A question queued beside a notice. The notice has nothing to answer, so it never waits: picking the question's option keeps the card on the question, the primary control reads `Send answers` rather than `Next question`, and sending reports the question's answer alone. Pick `FailureWithAction` for a notice on its own. No request mixes the two: `packages/ui/src/components/application-install-turn.tsx:30` posts a notice alone and `apps/app/src/components/thread-prompt.tsx:114` maps questions the agent asked, never a notice beside them.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: /^Now/ }))

		await expect(canvas.getByRole("tab", { name: "Release" })).toHaveAttribute(
			"aria-selected",
			"true",
		)
		await expect(canvas.getByRole("tab", { name: "Sentry" })).toHaveAttribute(
			"aria-selected",
			"false",
		)

		const send = canvas.getByRole("button", { name: chat.toolQuestion.submit })
		await expect(send).toBeEnabled()
		await userEvent.click(send)

		await expect(args.onAnswer).toHaveBeenCalledTimes(1)
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[RELEASE_QUESTION.question]: "Now",
		})
	},
})

const INVERSE_BUTTONS =
	'button[type="submit"], [data-card="action"] [data-slot="button"]'

const INVERSE_TREATMENT =
	"The primary controls of the card in the inverse treatment of artboards V1e and V1f, light and dark side by side: `Send answers`, `Next question` on a card with a question still waiting, and the action of a notice, each filled with the `foreground` token with its label and glyph drawn with the `background` token. Skip stays ghost. "

const inverseButtonsIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLButtonElement>(INVERSE_BUTTONS),
]

const InverseButtonCards = (args: ComponentProps<typeof ToolQuestion>) => (
	<div className="flex flex-col gap-4">
		<ToolQuestion {...args} questions={[FRAMEWORK_QUESTION]} />
		<ToolQuestion {...args} questions={[SCOPE_QUESTION, REGISTRY_QUESTION]} />
		<div data-card="action">
			<ToolQuestion
				{...args}
				onDeny={undefined}
				questions={[KEY_REFUSED_NOTICE]}
			/>
		</div>
	</div>
)

export const InverseButtonsIdle = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: { description: { story: `${INVERSE_TREATMENT}At rest.` } },
	},
	render: InverseButtonCards,
	play: async ({ canvasElement }) => {
		const buttons = inverseButtonsIn(canvasElement)
		await expect(buttons.length).toBe(6)
		for (const button of buttons) await expectInverseAtRest(button)
		for (const skip of within(canvasElement).getAllByRole("button", {
			name: chat.toolQuestion.skip,
		}))
			await expect(getComputedStyle(skip).backgroundColor).not.toBe(
				tokenStyleIn(skip, "bg-foreground", "backgroundColor"),
			)
	},
})

export const InverseButtonsHover = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		pseudo: { hover: INVERSE_BUTTONS },
		docs: {
			description: {
				story: `${INVERSE_TREATMENT}Under the pointer, which the play drives only in the Vitest browser runner, the fill moves a fifth of the way toward the \`background\` token, a solid colour, so the label keeps its contrast.`,
			},
		},
	},
	render: InverseButtonCards,
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		for (const button of inverseButtonsIn(canvasElement)) {
			const rest = tokenStyleIn(button, "bg-foreground", "backgroundColor")
			await pointer.hover(button)
			await waitFor(() => expect(button.matches(":hover")).toBe(true))
			await waitFor(() =>
				expect(getComputedStyle(button).backgroundColor).not.toBe(rest),
			)
			await expect(getComputedStyle(button).color).toBe(
				tokenStyleIn(button, "text-background", "color"),
			)
			await pointer.unhover(button)
		}
	},
})

export const InverseButtonsFocusVisible = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		pseudo: { focusVisible: INVERSE_BUTTONS },
		docs: {
			description: {
				story: `${INVERSE_TREATMENT}Keyboard focus draws the primitive's own ring: the \`ring\` border on the fill and the translucent halo around it.`,
			},
		},
	},
	render: InverseButtonCards,
	play: async ({ canvasElement }) => {
		for (const button of inverseButtonsIn(canvasElement)) {
			const ring = tokenStyleIn(button, "border-ring", "borderTopColor")
			button.focus()
			await expect(button.matches(":focus-visible")).toBe(true)
			await waitFor(() =>
				expect(getComputedStyle(button).borderTopColor).toBe(ring),
			)
			await expect(getComputedStyle(button).backgroundColor).toBe(
				tokenStyleIn(button, "bg-foreground", "backgroundColor"),
			)
		}
	},
})

export const InverseButtonsPending = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { onAnswer: fn(() => new Promise(() => {})) },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story: `${INVERSE_TREATMENT}The only disabled state these buttons have: \`Send answers\` while the answers are on their way. The primitive halves the opacity of the whole button, fill and label together, so the label stays apart from its fill.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		for (const form of within(canvasElement).getAllByRole("form")) {
			const card = within(form)
			const send = card.getByRole("button", { name: chat.toolQuestion.submit })
			await userEvent.click(card.getByRole("radio", { name: /Vite/ }))
			await userEvent.click(send)
			await expect(send).toBeDisabled()
			await waitFor(() => expect(getComputedStyle(send).opacity).toBe("0.5"))
			await expectInverseAtRest(send)
		}
	},
})

export const ThemesLinkRowAtRest = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { questions: [CODE_STEP] },
	render: (args) => (
		<div className="w-[320px]">
			<ToolQuestion {...args} />
		</div>
	),
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story:
					"The link row on the frame of the artboard V1e text field, light and dark side by side: a `muted` fill, a 1px `input` outline and the `radius-control` corner around the read-only link and its copy control.",
			},
		},
	},
	play: async ({ canvas }) => {
		const links = canvas.getAllByLabelText("Open this link and sign in")
		await expect(links.length).toBe(2)
		for (const link of links)
			await expectControlFrame(link.parentElement as HTMLElement)
	},
})
