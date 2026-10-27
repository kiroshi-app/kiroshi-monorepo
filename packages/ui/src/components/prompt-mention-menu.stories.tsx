import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectCompanionPictureShape,
	FRAME_POLL,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/bots.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	type MentionBot,
	PromptMentionMenu,
	type PromptMentionMenuProps,
} from "@workspace/ui/components/prompt-mention-menu"

const CROWDED_BOTS = [...CONVERSATION_BOTS, ...LONG_NAMED_BOTS]

const SPACE_BOTS: MentionBot[] = [
	{
		id: "bot-atlas",
		name: "Atlas",
		title: "Editor",
		blot: BLOT_HUES.blue,
	},
	{
		id: "bot-margaux",
		name: "Margaux",
		title: "Research",
		blot: BLOT_HUES.red,
		isOutside: true,
	},
	{ id: "bot-basile", name: "Basile", blot: BLOT_HUES.purple },
	{
		id: "bot-nolan",
		name: "Nolan",
		blot: BLOT_HUES.yellow,
		isOutside: true,
	},
	{ id: "bot-clemence", name: "Clémence", blot: BLOT_HUES.pink },
	{ id: "bot-dorian", name: "Dorian", blot: BLOT_HUES.orange },
	{
		id: "bot-octave",
		name: "Octave",
		blot: BLOT_HUES.green,
		isOutside: true,
	},
	{ id: "bot-elia", name: "Elia", blot: BLOT_HUES.green },
	{ id: "bot-faust", name: "Faust", blot: BLOT_HUES.cyan },
	{
		id: "bot-paloma",
		name: "Paloma",
		blot: BLOT_HUES.pink,
		isOutside: true,
	},
	{ id: "bot-gaspard", name: "Gaspard", blot: BLOT_HUES.yellow },
	{ id: "bot-helene", name: "Hélène", blot: BLOT_HUES.red },
	{
		id: "bot-quentin",
		name: "Quentin",
		blot: BLOT_HUES.cyan,
		isOutside: true,
	},
	{ id: "bot-ines", name: "Ines", blot: BLOT_HUES.blue },
	{
		id: "bot-rosalie",
		name: "Rosalie",
		blot: BLOT_HUES.orange,
		isOutside: true,
	},
	{ id: "bot-jules", name: "Jules", blot: BLOT_HUES.purple },
	{
		id: "bot-sacha",
		name: "Sacha",
		blot: BLOT_HUES.green,
		isOutside: true,
	},
	{ id: "bot-kenza", name: "Kenza", blot: BLOT_HUES.pink },
	{
		id: "bot-theo",
		name: "Théo",
		blot: BLOT_HUES.blue,
		isOutside: true,
	},
	{ id: "bot-lucien", name: "Lucien", blot: BLOT_HUES.yellow },
	{
		id: "bot-ursule",
		name: "Ursule",
		blot: BLOT_HUES.red,
		isOutside: true,
	},
	{
		id: "bot-victor",
		name: "Victor",
		blot: BLOT_HUES.cyan,
		isOutside: true,
	},
	{
		id: "bot-wanda",
		name: "Wanda",
		blot: BLOT_HUES.purple,
		isOutside: true,
	},
	{
		id: "bot-xavier",
		name: "Xavier",
		blot: BLOT_HUES.orange,
		isOutside: true,
	},
	{
		id: "bot-yasmine",
		name: "Yasmine",
		blot: BLOT_HUES.red,
		isOutside: true,
	},
	{
		id: "bot-zoe",
		name: "Zoé",
		blot: BLOT_HUES.yellow,
		isOutside: true,
	},
	{
		id: "bot-ambre",
		name: "Ambre",
		blot: BLOT_HUES.green,
		isOutside: true,
	},
	{
		id: "bot-bastien",
		name: "Bastien",
		blot: BLOT_HUES.pink,
		isOutside: true,
	},
	{
		id: "bot-celeste",
		name: "Céleste",
		blot: BLOT_HUES.cyan,
		isOutside: true,
	},
	{
		id: "bot-damien",
		name: "Damien",
		blot: BLOT_HUES.blue,
		isOutside: true,
	},
]

const LONG_NAMED_SPACE_BOTS: MentionBot[] = [
	...CONVERSATION_BOTS,
	{ ...LONG_NAMED_BOTS[0], title: "Writer" },
	{ ...LONG_NAMED_BOTS[1], title: "On call", isOutside: true },
]

const NAME_TO_COUNT_GAP = 4

const ROW_EDGE_PADDING = 8

const TRAILING_SLOT_WIDTH = 56

const PANEL_AT_REST = ["none", "matrix(1, 0, 0, 1, 0, 0)"]

const panelEnteredIn = (root: HTMLElement) => {
	const panel = root.querySelector<HTMLElement>(
		'[data-slot="prompt-mention-menu"] > *',
	)

	if (!panel?.querySelector('[role="listbox"]')) {
		throw new Error("The menu drew no panel around its listbox")
	}

	return waitFor(
		() => expect(PANEL_AT_REST).toContain(getComputedStyle(panel).transform),
		{ ...FRAME_POLL, timeout: 5000 },
	)
}

const FOOTER_TEXT = /^Keep typing to reach/

const namesOf = (options: HTMLElement[]) =>
	options.map(
		(option) =>
			option.querySelector('[data-slot="prompt-mention-name"]')?.textContent,
	)

const countedNameOf = (row: HTMLElement) => {
	const name = row.querySelector<HTMLElement>(
		'[data-slot="prompt-mention-name"]',
	)
	const count = row.querySelector<HTMLElement>(
		'[data-slot="prompt-mention-count"]',
	)

	if (!name || !count) throw new Error("The row drew no counted name")

	return {
		name,
		count,
		gap:
			count.getBoundingClientRect().left - name.getBoundingClientRect().right,
		tail:
			row.getBoundingClientRect().right - count.getBoundingClientRect().right,
	}
}

const CountingMenu = (props: PromptMentionMenuProps) => {
	const [counts, setCounts] = useState<Record<string, number>>({
		"bot-atlas": 1,
	})

	return (
		<PromptMentionMenu
			{...props}
			counts={counts}
			onSelect={(id, isOutside) => {
				props.onSelect(id, isOutside)
				setCounts((named) => ({ ...named, [id]: (named[id] ?? 0) + 1 }))
			}}
		/>
	)
}

const ComposedMenu = (props: PromptMentionMenuProps) => {
	const [draft, setDraft] = useState("@")

	return (
		<PromptMentionMenu {...props} query={draft.replace("@", "")}>
			<PromptInput
				aria-label="Message"
				onValueChange={setDraft}
				value={draft}
			/>
		</PromptMentionMenu>
	)
}

const OPENED_BY_THE_COMPOSER =
	"`apps/app/src/components/thread-menu.tsx:75` opens it over the composer with the companions `apps/app/src/lib/conversations/roster-conversations.ts:94` lists for the conversation and its space."

const COUNTED_BY_THE_COMPOSER =
	"`apps/app/src/components/thread-menu.tsx:78` counts the mentions the draft already holds and hands them to the menu as data."

const meta = preview.meta({
	title: "Conversation/Prompt/PromptMentionMenu",
	component: PromptMentionMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The mention popup of the composer, and the only way to bring a companion into a conversation. The host hands it every companion of the space, each flagged `isOutside` when it is not in the conversation yet. An empty query lists only companions already in the conversation, the first six of them, so a conversation with none seated draws no menu at all on a bare arobase; beneath them, once the host names the space through `spaceName`, a footer counts how many more of that space typing reaches. The panel carries the `shadow-popover` elevation it shares with `PromptCommandMenu`, a soft shadow in light and a hairline halo over a deeper shadow in dark. A typed query a typed query matches the whole space case-insensitively, companions of the conversation first, then a *Not in this conversation* boundary above the rest, drawn dimmed with an add glyph. Only a row carrying the crown of the lead or the add glyph draws the 56px trailing slot; every other row gives that width to its name and title badge. A mention reaches exactly one companion, so a selection reports a single companion id plus whether it was outside, and the menu closes on it. A row whose companion the draft already names carries the count of those mentions after its name, given by the host as data. It draws only: reading the arobase in the draft, owning `open` and `query`, and writing the mention back into the text all belong to the host. ArrowUp/ArrowDown travel and wrap, Enter and Tab select, Escape or a press outside dismisses, and a query matching no companion renders no menu at all. Reach for `PromptCommandMenu` for the slash commands of the same composer.",
			},
		},
	},
	args: {
		bots: CONVERSATION_BOTS,
		leadId: CONVERSATION_BOTS[0].id,
		open: true,
		query: "",
		onSelect: fn(),
		onDismiss: fn(),
		children: <PromptInput aria-label="Message" defaultValue="@" />,
	},
	argTypes: {
		open: { control: "boolean" },
		query: { control: "text" },
		leadId: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="flex h-[32rem] w-[34rem] max-w-full items-end">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: the menu is open on an empty query, so every companion of the conversation is listed and the first row is the active one. Check that the panel sits above the composer on its leading edge, that each row pairs an avatar with a name, that exactly one row carries the highlight, and that Escape reports a dismissal to the host. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(CONVERSATION_BOTS.length)
		await expect(options[0]).toHaveAttribute("aria-selected", "true")
		await expect(options[1]).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Escape}")
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const Pictured = meta.story({
	args: {
		bots: [
			{ ...CONVERSATION_BOTS[0], image: UPLOADED_AVATAR_IMAGE },
			...CONVERSATION_BOTS.slice(1),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A companion wearing its picture, listed above companions drawn as their glyph. Check that the picture fills its 24px slot as a rounded square with no border, that it adds nothing to the option's name, and that the rows below keep their glyph on their colour. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const [pictured, drawn] = canvas.getAllByRole("option")
		const [picture] = slotsIn(pictured, "bot-identity-avatar")

		await expectCompanionPictureShape(picture)
		await expect(drawn.querySelector("img")).toBeNull()
		await expect(slotsIn(drawn, "companion-field")).toHaveLength(1)
	},
})

export const Lead = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The companion that leads the conversation, marked. Check that the crown falls on the lead and on nobody else, that it never stands alone as the only sign of the role since *Lead* is announced beside it, and that the mark follows the companion rather than the first row. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(options[0]).toHaveAccessibleName("Atlas Lead")
		await expect(options[1]).toHaveAccessibleName("Basile")
	},
})

export const Filtered = meta.story({
	args: { query: "a" },
	parameters: {
		docs: {
			description: {
				story:
					"A typed query narrows the list to the companions whose name carries it, matched case-insensitively, and the highlight falls back to the first survivor. Check that the panel shrinks to the remaining rows and that clicking one reports that companion's id rather than the highlighted one. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(5)
		await expect(options[0]).toHaveAccessibleName("Atlas Lead")

		await userEvent.click(options[1])
		await expect(args.onSelect).toHaveBeenCalledWith("bot-basile", false)
	},
})

export const LeadFilteredOut = meta.story({
	args: { query: "e" },
	parameters: {
		docs: {
			description: {
				story:
					"A query that leaves the lead out of the matches. Check that no crown is drawn at all — the mark states who leads, so a list without the lead in it carries none, and the first row is never crowned by position. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(options[0]).toHaveAccessibleName("Basile")
		await expect(canvas.queryByText("Lead")).not.toBeInTheDocument()
	},
})

export const KeyboardTravel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The keyboard contract, with focus never leaving the composer: ArrowDown and ArrowUp move the highlight by one and wrap at both ends, Enter and Tab select whatever is highlighted. Check that neither arrow moves the caret in the textarea and that Enter selects instead of submitting the prompt. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")
		const last = CONVERSATION_BOTS.length - 1

		await userEvent.keyboard("{ArrowUp}")
		await expect(options[last]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[0]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{ArrowDown}{ArrowDown}")
		await expect(options[2]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledWith("bot-clemence", false)

		await userEvent.keyboard("{Tab}")
		await expect(args.onSelect).toHaveBeenCalledTimes(2)
	},
})

export const SpaceOpened = meta.story({
	args: { bots: SPACE_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"The popover opened on an empty query in a space of thirty companions, twelve of them in the conversation, listed by the host with outsiders interleaved. Check that exactly the first six companions of the conversation show in the host's order, with no scrollbar, no group label and no boundary, and that only the crowned lead row draws a trailing slot. `SpaceQueried` covers the same space once a name is typed. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const options = canvas.getAllByRole("option")
		const listbox = canvas.getByRole("listbox")

		await expect(options).toHaveLength(6)
		await expect(namesOf(options)).toEqual([
			"Atlas",
			"Basile",
			"Clémence",
			"Dorian",
			"Elia",
			"Faust",
		])
		await expect(listbox.scrollHeight).toBeLessThanOrEqual(listbox.clientHeight)
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()
		await expect(
			slotsIn(canvasElement, "prompt-mention-boundary"),
		).toHaveLength(0)
		await expect(slotsIn(canvasElement, "prompt-mention-footer")).toHaveLength(
			0,
		)
		await expect(
			options.map(
				(option) => slotsIn(option, "prompt-mention-trailing").length,
			),
		).toEqual([1, 0, 0, 0, 0, 0])
	},
})

export const SpaceQueried = meta.story({
	args: { bots: SPACE_BOTS, query: "AR" },
	parameters: {
		docs: {
			description: {
				story:
					"A query typed in capitals that reaches one companion of the conversation and one outside it, the outsider listed first by the host. Check that the companion of the conversation comes first, that a single *Not in this conversation* boundary sits above the outsider, that the outsider wears its title badge, a dimmed avatar and the add glyph, and that the arrows step over the boundary so Enter reports the outsider's id with its outside flag. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const options = canvas.getAllByRole("option")
		const boundaries = slotsIn(canvasElement, "prompt-mention-boundary")
		const [boundary] = boundaries

		await expect(namesOf(options)).toEqual(["Gaspard", "Margaux"])
		await expect(boundaries).toHaveLength(1)
		await expect(boundary).toHaveTextContent("Not in this conversation")
		await expect(
			canvas.getByRole("group", { name: "Not in this conversation" }),
		).toContainElement(options[1])
		await expect(
			boundary.compareDocumentPosition(options[1]) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(slotsIn(options[0], "prompt-mention-trailing")).toHaveLength(0)
		await expect(slotsIn(options[1], "prompt-mention-invite")).toHaveLength(1)
		await expect(options[1]).toHaveAccessibleName(
			"Margaux Research Add to this conversation",
		)
		await expect(
			getComputedStyle(
				slotsIn(options[1], "bot-identity-avatar")[0].parentElement as Element,
			).opacity,
		).toBe("0.7")
		await expect(canvas.queryByText(FOOTER_TEXT)).not.toBeInTheDocument()

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[1]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledWith("bot-margaux", true)
	},
})

export const SpaceMatchesInside = meta.story({
	args: { bots: SPACE_BOTS, query: "atl" },
	parameters: {
		docs: {
			description: {
				story:
					"A query whose only match is already in the conversation, in a space where outsiders exist. Check that no boundary row is drawn and no footer either, since the boundary only ever introduces companions outside the conversation. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getAllByRole("option")).toHaveLength(1)
		await expect(
			slotsIn(canvasElement, "prompt-mention-boundary"),
		).toHaveLength(0)
		await expect(canvas.queryByText(FOOTER_TEXT)).not.toBeInTheDocument()
	},
})

export const SpaceKeyboardTravel = meta.story({
	args: { bots: SPACE_BOTS, query: "e" },
	parameters: {
		docs: {
			description: {
				story:
					"A query reaching more companions than the panel shows, across the boundary. Check that the list scrolls instead of growing past the composer and that travelling with the arrows keeps the active row in view, the boundary included in the wrap but never highlighted. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.keyboard("{ArrowUp}")

		const options = canvas.getAllByRole("option")
		const last = options[options.length - 1]

		await expect(last).toHaveAttribute("aria-selected", "true")
		await expect(canvas.getByRole("listbox").scrollTop).toBeGreaterThan(0)
	},
})

export const LongContent = meta.story({
	args: {
		bots: LONG_NAMED_SPACE_BOTS,
		leadId: LONG_NAMED_BOTS[0].id,
		query: "e",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two companions named far past their row, one leading the conversation and one outside it, each with a title. Check that the title badge gives way first, then the name, each ending in an ellipsis, and that the trailing slot keeps its full width with the crown or the add glyph flush to the row's end. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await panelEnteredIn(canvasElement)

		const rows = [
			canvas.getByRole("option", { name: /Release notes editor/ }),
			canvas.getByRole("option", { name: /Incident triage/ }),
		]

		for (const row of rows) {
			const [name] = slotsIn(row, "prompt-mention-name")
			const [badge] = slotsIn(row, "bot-title-badge")
			const [trailing] = slotsIn(row, "prompt-mention-trailing")
			const mark = trailing.querySelector("svg") as SVGElement

			await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
			await expect(badge.scrollWidth).toBeGreaterThan(badge.clientWidth)
			await expect(trailing.getBoundingClientRect().width).toBe(
				TRAILING_SLOT_WIDTH,
			)
			await expect(
				row.getBoundingClientRect().right - mark.getBoundingClientRect().right,
			).toBeCloseTo(ROW_EDGE_PADDING, 0)
		}
	},
})

export const QueryChanged = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The composer drives the query for real: the highlight is moved down twice, then more of the name is typed. Check that the new match list starts on its first row again rather than keeping the old offset, and that typing never disturbs the menu the way the arrows do. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	render: (args) => <ComposedMenu {...args} />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("textbox", { name: "Message" }))
		await userEvent.keyboard("{ArrowDown}{ArrowDown}")

		await expect(canvas.getAllByRole("option")[2]).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.keyboard("do")

		const filtered = canvas.getAllByRole("option")
		await expect(filtered).toHaveLength(1)
		await expect(filtered[0]).toHaveAccessibleName("Dorian")
		await expect(filtered[0]).toHaveAttribute("aria-selected", "true")
	},
})

export const Empty = meta.story({
	args: { query: "zzz" },
	parameters: {
		docs: {
			description: {
				story:
					"The query matches no companion, so the menu renders nothing at all — no panel, no empty message, no keyboard capture. Check that the composer alone remains and that Enter reaches it, since the menu must not swallow a submission it has no row to answer with. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument()
	},
})

export const Counted = meta.story({
	args: { counts: { "bot-basile": 1, "bot-clemence": 3 } },
	parameters: {
		docs: {
			description: {
				story:
					"The draft already names two of the listed companions, one once and one three times, and says nothing of the others. Check that the count reads as part of the name it counts, one row-gap after its last glyph and nowhere near the trailing edge, that the number is announced as a phrase rather than as a bare glyph, and that a companion the draft never names renders exactly as it does everywhere else — no zero, no placeholder. " +
					COUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(canvas.getByText("\u00d71")).toBeVisible()
		await expect(canvas.getByText("\u00d73")).toBeVisible()

		await expect(options[1]).toHaveAccessibleName(
			"Basile 1 mention in the draft",
		)
		await expect(options[2]).toHaveAccessibleName(
			"Cl\u00e9mence 3 mentions in the draft",
		)
		await expect(options[3]).toHaveAccessibleName("Dorian")

		const { gap, tail } = countedNameOf(options[1])

		await expect(gap).toBeCloseTo(NAME_TO_COUNT_GAP, 0)
		await expect(tail).toBeGreaterThan(ROW_EDGE_PADDING)
	},
})

export const CountedLead = meta.story({
	args: { counts: { "bot-atlas": 2 } },
	parameters: {
		docs: {
			description: {
				story:
					"The lead of the conversation, already named twice in the draft. Check that the count sits between the name and the crown so the crown stays the last thing on the row, and that the two marks are read in that same order rather than fighting for the trailing edge. " +
					COUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getAllByRole("option")[0]

		await expect(row).toHaveAccessibleName("Atlas 2 mentions in the draft Lead")

		const { count } = countedNameOf(row)
		const crown = row.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-lead"]',
		)

		if (!crown) throw new Error("The row drew no crown beside its count")

		await expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(
			crown.getBoundingClientRect().left,
		)
		await expect(
			row.getBoundingClientRect().right - crown.getBoundingClientRect().right,
		).toBeCloseTo(ROW_EDGE_PADDING, 0)
	},
})

export const CountedLongName = meta.story({
	args: { bots: CROWDED_BOTS, counts: { "bot-release": 4 }, query: "notes" },
	parameters: {
		docs: {
			description: {
				story:
					"A count on a companion named far past the width of its row. Check that the name is the only part that gives way to an ellipsis and that the digits stay whole at the row's end, since a row with neither crown nor add glyph draws no trailing slot: a reader must never lose the number to the overflow of a name. " +
					COUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("option", { name: /Release notes editor/ })
		const { name, count, gap, tail } = countedNameOf(row)

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(count.scrollWidth).toBe(count.clientWidth)
		await expect(gap).toBeCloseTo(NAME_TO_COUNT_GAP, 0)
		await expect(tail).toBeCloseTo(ROW_EDGE_PADDING, 0)
		await expect(slotsIn(row, "prompt-mention-trailing")).toHaveLength(0)
	},
})

export const CountedAgain = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A row already at one, taken once more. Check that the count reads two the moment the row is picked, without the panel closing or the list reordering under the pointer, since the number answers the draft and not the selection. " +
					COUNTED_BY_THE_COMPOSER,
			},
		},
	},
	render: (args) => <CountingMenu {...args} />,
	play: async ({ canvas, userEvent }) => {
		const row = canvas.getAllByRole("option")[0]

		await expect(canvas.getByText("\u00d71")).toBeVisible()

		await userEvent.click(row)

		await expect(canvas.getByText("\u00d72")).toBeVisible()
		await expect(canvas.getByRole("listbox")).toBeInTheDocument()
	},
})

export const InDarkTheme = meta.story({
	args: { bots: SPACE_BOTS },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The opened popover under the dark theme, where a light-theme shadow vanishes against the dark surface. Check that the panel still lifts off the page through a hairline light halo over a deeper shadow, the same `shadow-popover` token the command popover wears, and that every row and its badge read on the dark popover surface. " +
					OPENED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const panel = canvas.getByRole("listbox").parentElement as HTMLElement
		const { boxShadow } = getComputedStyle(panel)

		await expect(document.documentElement).toHaveClass("dark")
		await expect(boxShadow).toContain("rgba(255, 255, 255, 0.16)")
		await expect(boxShadow).toContain("rgba(0, 0, 0, 0.7)")
		await expect(canvas.getAllByRole("option")).toHaveLength(6)
	},
})

export const CountedTitled = meta.story({
	args: { bots: SPACE_BOTS, counts: { "bot-atlas": 2 }, query: "atl" },
	parameters: {
		docs: {
			description: {
				story:
					"A titled companion the draft already names twice. Check the row reads name, title, count, the same order as the mention pill in the transcript, with the title pill held inside the group the count belongs to. " +
					COUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("option", { name: /^Atlas/ })
		const [name] = slotsIn(row, "prompt-mention-name")
		const [title] = slotsIn(row, "bot-title-badge")
		const [count] = slotsIn(row, "prompt-mention-count")

		await expect(title).toHaveTextContent("Editor")
		await expect(count).toHaveTextContent("×2")
		await expect(name.nextElementSibling).toBe(title)
		await expect(title.nextElementSibling).toBe(count)
		await expect(title.parentElement).toBe(count.parentElement)
	},
})
