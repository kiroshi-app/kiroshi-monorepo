import type { ReactNode } from "react"
import { expect, fireEvent, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	expectClickModifiers,
	isInBrowserRunner,
	shown,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/bots.fixtures"
import {
	CompanionMenuContent,
	CompanionMenuProvider,
} from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { Markdown } from "@workspace/ui/components/markdown"
import { Mention } from "@workspace/ui/components/mention"
import { RosterProvider } from "@workspace/ui/components/roster"
import type { RosterMenuSection } from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import { UserTurn } from "@workspace/ui/components/turn"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const ROOM = [...CONVERSATION_BOTS.slice(0, 3), ...LONG_NAMED_BOTS]

const spaceAroundAvatar = (canvasElement: HTMLElement) => {
	const chip = canvasElement.querySelector('[data-slot="bot-mention"]')
	const avatar = chip?.querySelector('[data-slot="bot-identity-avatar"]')

	if (!avatar || !chip) throw new Error("The sentence drew no avatar")

	const around = chip.getBoundingClientRect()
	const drawn = avatar.getBoundingClientRect()

	return {
		left: drawn.left - around.left,
		above: drawn.top - around.top,
		below: around.bottom - drawn.bottom,
	}
}

const Conversation = ({ children }: { children: ReactNode }) => (
	<RosterProvider bots={ROOM}>
		<p className="max-w-md text-sm leading-6">{children}</p>
	</RosterProvider>
)

type MessageProps = { source: string }

const Message = ({ source }: MessageProps) => (
	<RosterProvider bots={ROOM}>
		<div className="max-w-md">
			<Markdown>{source}</Markdown>
		</div>
	</RosterProvider>
)

const pills = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll<HTMLElement>('[data-slot="bot-mention"]')

const counts = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll<HTMLElement>('[data-slot="bot-mention-count"]')

const HANDOVER =
	"I stopped at the failing migration — <@bot-basile> owns that script, and <@bot-ghost> wrote the fixture it reads."

const LITERAL = "Write `<@bot-atlas>` to name Atlas in a message."

const PAIR = "Ask <@bot-atlas> <@bot-atlas> to split the failing suite."

const CROWD =
	"Fan the migration out to <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> and let <@bot-basile> collect the diffs."

const GHOST_PAIR = "<@bot-ghost> <@bot-ghost> were the ones holding that lock."

const LONG_PAIR = "Ask <@bot-release> <@bot-release> for the two changelogs."

const NEIGHBOURS = "Ask <@bot-atlas> <@bot-basile> to trade notes."

const APART = "Ask <@bot-atlas> first, then ask <@bot-atlas> for a second pass."

const BUILT_BY_THE_SPAN =
	"`packages/ui/src/components/markdown/mention.tsx:25` builds the chip from the id and the count the mention plugin marked on the span."

const meta = preview.meta({
	title: "Conversation/Message/Mention",
	component: Mention,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A bot named inside the words of a message. The transcript carries a mention as `<@bot-id>` in the text and this is what that id becomes: a chip in the flow of the sentence, avatar and name together, tinted from the colour it inherits so it reads the same in a bot's bubble and in the reader's own. The id is resolved against the bots the conversation holds — `RosterProvider` names them once around the transcript, so nothing threads a roster down to each message. An id the conversation does not know still draws a chip rather than leaking the raw `<@…>` at the reader: a silhouette and *Unknown bot*, which is what a mention of a bot that left looks like. The name truncates instead of pushing the line, and the avatar is hidden from screen readers so the mention is announced as the name alone. `Markdown` does the parsing, so a mention written inside code stays literal.",
			},
		},
	},
	args: { botId: "bot-atlas" },
	argTypes: {
		botId: {
			control: "select",
			options: [...ROOM.map((bot) => bot.id), "bot-ghost"],
		},
	},
	render: (args) => (
		<Conversation>
			Ask <Mention {...args} /> to take the next pass.
		</Conversation>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a companion the conversation holds. The chip is exactly as tall as the line it sits on, so it never pushes the line height, and the avatar keeps the same space on its left, above it and below it. Check that the avatar is the same drawing the roster gives that companion and that the words either side keep their spacing. Pick `Unknown` for an id the conversation cannot resolve. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Atlas")).toBeVisible()

		const { left, above, below } = spaceAroundAvatar(canvasElement)

		await expect(above).toBeCloseTo(left, 0)
		await expect(below).toBeCloseTo(left, 0)
	},
})

export const Unknown = meta.story({
	args: { botId: "bot-ghost" },
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a companion the conversation does not know — deleted, or never part of it. Check that the chip keeps its shape and dims rather than disappearing, that a silhouette replaces the avatar, and that the reader is told *Unknown agent* instead of being shown a raw id. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Unknown agent")).toBeVisible()
	},
})

export const LongName = meta.story({
	args: { botId: "bot-release" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion whose name is a sentence of its own. Check that the chip truncates at a fixed width and the paragraph keeps wrapping normally — one long name never forces a line of its own. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-name"]',
		)

		if (!name) throw new Error("The chip drew no name")

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
	},
})

export const InText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"What a real message looks like: two mentions inside one paragraph, one resolved and one not, parsed out of the text by `Markdown`. Check that both chips sit in the flow rather than on their own line, and that the sentence reads as a sentence — the mention replaces the id, it does not interrupt the prose. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={HANDOVER} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Basile")).toBeVisible()
		await expect(canvas.getByText("Unknown agent")).toBeVisible()
	},
})

export const InCode = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The escape hatch: a mention written inside code. Check that `<@bot-atlas>` between backticks stays the literal text a reader typed — a message explaining the syntax must be able to show it. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={LITERAL} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("<@bot-atlas>")).toBeVisible()
		await expect(pills(canvasElement)).toHaveLength(0)
	},
})

export const Counted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same companion named twice in a row, which is how a message addresses two live instances of it. Check that the two tokens draw one chip carrying `×2` rather than two chips side by side, that the space that separated them is gone, and that the multiplier keeps the count from reading as the instance ordinal a live row and a message author show after a name. A screen reader hears *Atlas 2 mentions*: the glyph is hidden and the count spelled out beside it. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={PAIR} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(1)
		await expect(canvas.getByText("×2")).toBeVisible()
		await expect(canvas.getByText("Atlas")).toBeVisible()
		await expect(canvas.getByText("2 mentions")).toBeInTheDocument()
	},
})

export const CountedToNine = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nine repeats of one companion, the widest count a single digit reaches, next to a companion named once. Check that the counted chip is exactly as tall as the plain one and sits on the same baseline, that `×9` sits inside the chip one space after the name, and that its digit is drawn in the tabular figures the rest of the app counts with. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={CROWD} />,
	play: async ({ canvas, canvasElement }) => {
		const [counted, plain] = [...pills(canvasElement)]

		await expect(canvas.getByText("×9")).toBeVisible()
		await expect(canvas.getByText("9 mentions")).toBeInTheDocument()

		const [count] = [...counts(canvasElement)]

		if (!count) throw new Error("The chip drew no count")

		await expect(getComputedStyle(count).fontVariantNumeric).toContain(
			"tabular-nums",
		)

		const drawn = counted.getBoundingClientRect()
		const beside = plain.getBoundingClientRect()

		await expect(drawn.height).toBeCloseTo(beside.height, 1)
		await expect(drawn.top).toBeCloseTo(beside.top, 1)
	},
})

export const CountedUnknown = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A repeated id the conversation cannot resolve. Check that an unknown id collapses on exactly the same rule as a known one: one dimmed chip with a silhouette, *Unknown agent* and the count, never two identical unknown chips in a row. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={GHOST_PAIR} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(1)
		await expect(
			canvasElement.querySelector('[data-unknown="true"]'),
		).not.toBeNull()
		await expect(canvas.getByText("Unknown agent")).toBeVisible()
		await expect(canvas.getByText("2 mentions")).toBeInTheDocument()
	},
})

export const CountedLongName = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A count on a companion whose name is a sentence of its own. Check that the name is still the part that truncates and that the count stays whole and inside the chip: a reader must never lose the number to an ellipsis. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={LONG_PAIR} />,
	play: async ({ canvasElement }) => {
		const [pill] = [...pills(canvasElement)]
		const [count] = [...counts(canvasElement)]
		const name = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-name"]',
		)

		if (!pill || !name || !count) throw new Error("The chip drew no count")

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(count.scrollWidth).toBe(count.clientWidth)
		await expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(
			pill.getBoundingClientRect().right,
		)
	},
})

export const DifferentBotsAdjacent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Two different companions named back to back. Check that adjacency alone collapses nothing: two ids means two chips, each with its own avatar and no count. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={NEIGHBOURS} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(2)
		await expect(canvas.getByText("Atlas")).toBeVisible()
		await expect(canvas.getByText("Basile")).toBeVisible()
		await expect(counts(canvasElement)).toHaveLength(0)
	},
})

export const RepeatedApart = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same companion named twice with words in between. Check that only whitespace collapses a repeat: prose between the two tokens means the reader wrote two mentions in two places, so the sentence keeps two chips and no count. " +
					BUILT_BY_THE_SPAN,
			},
		},
	},
	render: () => <Message source={APART} />,
	play: async ({ canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(2)
		await expect(counts(canvasElement)).toHaveLength(0)
	},
})

const NO_SPACES: Space[] = []

const NO_MEMBERSHIPS: string[] = []

const NO_SECTIONS: RosterMenuSection[] = []

const [WORDY] = LONG_NAMED_BOTS

const COMPANION_MENU_LABEL = `Actions for ${WORDY.name}`

const editCompanion = fn()

const deleteCompanion = fn()

const replyToMessage = fn()

const companionMenuFor = (companionId: string) =>
	companionId === WORDY.id ? (
		<CompanionMenuContent
			companion={{ id: WORDY.id, name: WORDY.name }}
			isPinned={false}
			memberships={NO_MEMBERSHIPS}
			onDelete={deleteCompanion}
			onEdit={editCompanion}
			sections={NO_SECTIONS}
			spaces={NO_SPACES}
		/>
	) : null

const ASKED = "Ask <@bot-release> for the changelog before the release."

const rightClickOn = (target: HTMLElement) => {
	const bounds = target.getBoundingClientRect()
	const coords = { clientX: bounds.left + 4, clientY: bounds.top + 4 }

	fireEvent.pointerDown(target, { button: 2, ...coords })
	return fireEvent.contextMenu(target, coords)
}

const pillIn = (canvasElement: HTMLElement) => {
	const [pill] = [...pills(canvasElement)]
	if (!pill) throw new Error("The sentence drew no chip")
	return pill
}

export const CompanionMenuOnPill = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mention the reader wrote, in the reader's own bubble, hosting the companion menu a provider hands it — the same menu the roster row opens, reached from the name inside the sentence. The companion here is the one whose name truncates, which is the case worth watching: check that the chip keeps its ellipsis and stays in the flow of the line, that the menu opens on a right-click carrying the whole name in its label, and that the bubble's own message menu stays shut rather than opening underneath it. Pick `CompanionMenuOffPill` for a transcript with no provider around it.",
			},
		},
	},
	render: () => (
		<CompanionMenuProvider menuFor={companionMenuFor}>
			<RosterProvider bots={ROOM}>
				<div className="mx-auto max-w-md">
					<UserTurn copyText={ASKED} onReply={replyToMessage}>
						<Markdown>{ASKED}</Markdown>
					</UserTurn>
				</div>
			</RosterProvider>
		</CompanionMenuProvider>
	),
	play: async ({ canvasElement }) => {
		const pill = pillIn(canvasElement)
		const name = pill.querySelector<HTMLElement>(
			'[data-slot="bot-mention-name"]',
		)

		if (!name) throw new Error("The chip drew no name")

		await expect(getComputedStyle(pill).display).toBe("inline-flex")
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)

		rightClickOn(pill)

		const menu = await shown(
			await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }),
		)

		await expect(screen.getAllByRole("menu")).toHaveLength(1)
		await expect(
			within(menu).getByRole("menuitem", { name: "Open settings" }),
		).toBeVisible()
	},
})

export const CompanionMenuOffPill = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The same mention with no provider above it, which is every transcript that has not been handed companion menus. Check that a right-click on the chip opens nothing and leaves the browser its own menu.",
			},
		},
	},
	render: () => <Message source={ASKED} />,
	play: async ({ canvasElement }) => {
		const defaulted = rightClickOn(pillIn(canvasElement))

		await expect(defaulted).toBe(true)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

const selectCompanion = fn()

const UNKNOWN_ASKED = "Ask <@bot-ghost> for the changelog before the release."

const SELECT_NOT_YET_RENDERED =
	"No screen mounts `CompanionSelectProvider` yet: the thread hands it the select in OPE-328, so the story stays out of the sidebar until then."

type SelectableMessageProps = MessageProps & { withMenu?: boolean }

const SelectableMessage = ({ source, withMenu }: SelectableMessageProps) => {
	const message = (
		<CompanionSelectProvider onSelect={selectCompanion}>
			<Message source={source} />
		</CompanionSelectProvider>
	)

	return withMenu ? (
		<CompanionMenuProvider menuFor={companionMenuFor}>
			{message}
		</CompanionMenuProvider>
	) : (
		message
	)
}

const paragraphOf = (pill: HTMLElement) => {
	const paragraph = pill.closest("p")
	if (!paragraph) throw new Error("The chip sits in no paragraph")
	return paragraph
}

export const CompanionSelectOnPill = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `A mention at rest under a mounted select. Check that the chip is a button named after the companion, that it stays inline in its sentence at the text colour and font of the words around it, and that its background is the tint it wears with no select. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={ASKED} />,
	play: async ({ canvas, canvasElement }) => {
		const pill = pillIn(canvasElement)
		const paragraph = paragraphOf(pill)

		await expect(pill.tagName).toBe("BUTTON")
		await expect(canvas.getByRole("button", { name: WORDY.name })).toBe(pill)
		await expect(getComputedStyle(pill).display).toBe("inline-flex")
		await expect(getComputedStyle(pill).color).toBe(
			getComputedStyle(paragraph).color,
		)
		await expect(getComputedStyle(pill).fontFamily).toBe(
			getComputedStyle(paragraph).fontFamily,
		)
		await expect(pill).toHaveClass("bg-current/10")
		await expect(getComputedStyle(pill).boxShadow).toBe("none")
	},
})

export const CompanionSelectOnPillHovered = meta.story({
	tags: ["test-only"],
	parameters: {
		pseudo: { hover: true },
		docs: {
			description: {
				story: `The same mention with the pointer resting on it, drawn by the pseudo-state addon. Check by eye that the chip's own tint deepens, with no second surface colour behind it. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={ASKED} />,
	play: async ({ canvasElement }) => {
		const pill = pillIn(canvasElement)

		await expect(pill).toHaveClass("hover:bg-current/20")
		await expect(getComputedStyle(pill).transitionDuration).toBe("0s")
	},
})

const MOTION_UTILITY = /(^|:)!?(transition|duration)(-|!|$)|\[transition/

export const CompanionSelectOnPillHoveredWithMotion = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The same mention for a reader who left the motion preference at its default, the one case the reduced-motion test browser cannot see. The pointer cannot rest on the chip under the test runner, so the play reads the transition the chip carries into its hover, press and selection: check that the tint deepens on hover in a single frame, with no fade, exactly as it does under reduced motion. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={ASKED} />,
	play: async ({ canvasElement }) => {
		const pill = pillIn(canvasElement)

		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await expect(
				window.matchMedia("(prefers-reduced-motion: no-preference)").matches,
			).toBe(true)
			await expect(pill).toHaveClass("hover:bg-current/20")
			await expect(colourTransitionsOf(pill)).toEqual([])
			await expect(
				[...pill.classList].filter((name) => MOTION_UTILITY.test(name)),
			).toEqual([])
		})
	},
})

const ReaderBubble = ({ source }: MessageProps) => (
	<CompanionSelectProvider onSelect={selectCompanion}>
		<RosterProvider bots={ROOM}>
			<div className="mx-auto max-w-md">
				<UserTurn copyText={source} onReply={replyToMessage}>
					<Markdown>{source}</Markdown>
				</UserTurn>
			</div>
		</RosterProvider>
	</CompanionSelectProvider>
)

export const CompanionSelectOnPillFocused = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `The mention reached by the keyboard inside the reader's own bubble, the surface the chip is hardest to ring on. Check that Tab lands on the chip and that its ring is drawn in the text colour of the bubble, so it holds against the bubble fill in either theme. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <ReaderBubble source={ASKED} />,
	play: async ({ canvasElement, userEvent }) => {
		const pill = pillIn(canvasElement)

		await userEvent.tab()

		await expect(pill).toHaveFocus()
		await expect(getComputedStyle(pill).boxShadow).toContain(
			getComputedStyle(pill).color,
		)
	},
})

export const CompanionSelectOnCountedPill = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `A repeated mention collapsed into one counted chip, under a mounted select. Check that the chip is one button named after the companion with the count spoken after the name, and that a click reports the companion id once. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={LONG_PAIR} />,
	play: async ({ canvas, userEvent }) => {
		selectCompanion.mockClear()
		const [pill, ...others] = canvas.getAllByRole("button")

		if (!pill) throw new Error("The sentence drew no chip")

		await expect(others).toHaveLength(0)
		await expect(pill).toHaveAccessibleName(expect.stringContaining(WORDY.name))

		await userEvent.click(pill)
		await expect(selectCompanion).toHaveBeenCalledTimes(1)
		await expect(selectCompanion).toHaveBeenLastCalledWith(
			WORDY.id,
			NO_CLICK_MODIFIERS,
		)
	},
})

export const CompanionSelectWithClickModifiers = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `A mention under a mounted select and a companion menu, clicked every way a host can tell apart. Check that a middle click reports the companion once with middle and the keys held, keeps the browser from starting its autoscroll, that a Cmd, Ctrl or Shift click reports that key alone, that a plain click and Enter report no key, and that a right-click opens the companion menu and selects nothing. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={ASKED} withMenu />,
	play: async ({ canvasElement, userEvent }) => {
		await expectClickModifiers({
			target: pillIn(canvasElement),
			callback: selectCompanion,
			reported: [WORDY.id],
			userEvent,
		})
		await expect(await screen.findByRole("menu")).toBeVisible()
		await userEvent.keyboard("{Escape}")
	},
})

export const CompanionSelectOnUnknownPill = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `A mention the conversation cannot resolve, under a mounted select. Check that the chip is the dimmed span it is with no select, with nothing for Tab to reach. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={UNKNOWN_ASKED} />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const pill = pillIn(canvasElement)

		await expect(pill.tagName).toBe("SPAN")
		await expect(pill).toHaveAttribute("data-unknown", "true")
		await expect(canvas.queryByRole("button")).toBeNull()

		await userEvent.tab()
		await expect(pill).not.toHaveFocus()
	},
})

export const CompanionSelectFromPill = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story: `A mention under both a select and a companion menu. Check that a click, Enter and Space each report the companion id once, and that a right-click still opens the companion menu without reporting a select. ${SELECT_NOT_YET_RENDERED}`,
			},
		},
	},
	render: () => <SelectableMessage source={ASKED} withMenu />,
	play: async ({ canvasElement, userEvent }) => {
		selectCompanion.mockClear()
		const pill = pillIn(canvasElement)

		await userEvent.click(pill)
		await expect(selectCompanion).toHaveBeenCalledTimes(1)
		await expect(selectCompanion).toHaveBeenLastCalledWith(
			WORDY.id,
			NO_CLICK_MODIFIERS,
		)

		pill.focus()
		await userEvent.keyboard("{Enter}")
		await expect(selectCompanion).toHaveBeenCalledTimes(2)
		await userEvent.keyboard(" ")
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
		await expect(selectCompanion).toHaveBeenLastCalledWith(
			WORDY.id,
			NO_CLICK_MODIFIERS,
		)

		rightClickOn(pill)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await expect(selectCompanion).toHaveBeenCalledTimes(3)
	},
})

const TITLED_ATLAS = { ...ROOM[0], title: "Research lead" }

const TitledConversation = ({ children }: { children: ReactNode }) => (
	<RosterProvider bots={[TITLED_ATLAS]}>
		<p className="max-w-md text-sm leading-6">{children}</p>
	</RosterProvider>
)

const isOneLine = (element: HTMLElement) =>
	element.getBoundingClientRect().height <=
	Number.parseFloat(
		getComputedStyle(element.parentElement as HTMLElement).lineHeight,
	)

export const WithTitle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a companion that carries a title. Check that the title pill sits right after the name, whole and without an ellipsis while the line has room, and that the chip stays as tall as the line. Pick `Unknown` for an id with no companion behind it, `WithTitleCounted` for the same chip carrying a count.",
			},
		},
	},
	render: () => (
		<TitledConversation>
			Ask <Mention botId={TITLED_ATLAS.id} /> to take the next pass.
		</TitledConversation>
	),
	play: async ({ canvasElement }) => {
		const pill = slotIn(canvasElement, "bot-mention")
		const name = slotIn(pill, "bot-mention-name")
		const title = slotIn(pill, "bot-title-badge")

		await expect(title).toHaveTextContent("Research lead")
		await expect(name.nextElementSibling).toBe(title)
		await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
		await expect(isOneLine(pill)).toBe(true)
	},
})

export const UnknownWithoutTitle = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A mention of an id the conversation cannot resolve, in a conversation whose companions carry titles. Check that the chip draws no title pill: there is no companion to borrow one from.",
			},
		},
	},
	render: () => (
		<TitledConversation>
			Ask <Mention botId="bot-ghost" /> to take the next pass.
		</TitledConversation>
	),
	play: async ({ canvas, canvasElement }) => {
		const pill = slotIn(canvasElement, "bot-mention")

		await expect(canvas.getByText("Unknown agent")).toBeVisible()
		await expect(slotsIn(pill, "bot-title-badge")).toHaveLength(0)
	},
})

export const WithTitleCounted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A titled companion named three times in a row, in a sentence too narrow for the whole chip. Check the order reads name, title, count, that the title gives way first with an ellipsis, and that the count stays whole, on one line and in tabular figures.",
			},
		},
	},
	render: () => (
		<TitledConversation>
			<span className="inline-block w-36">
				<Mention botId={TITLED_ATLAS.id} count={3} />
			</span>
		</TitledConversation>
	),
	play: async ({ canvasElement }) => {
		const pill = slotIn(canvasElement, "bot-mention")
		const name = slotIn(pill, "bot-mention-name")
		const title = slotIn(pill, "bot-title-badge")
		const count = slotIn(pill, "bot-mention-count")

		await expect(name.nextElementSibling).toBe(title)
		await expect(title.nextElementSibling).toBe(count)
		await expect(count).toHaveTextContent("×3")
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(count.scrollWidth).toBe(count.clientWidth)
		await expect(getComputedStyle(count).fontVariantNumeric).toContain(
			"tabular-nums",
		)
		await expect(isOneLine(pill)).toBe(true)
	},
})
