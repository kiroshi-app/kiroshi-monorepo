import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectClickModifiers,
	expectSoloAvatarInBothThemes,
	expectSubjectIconInBothThemes,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import { MISSION_BOT } from "@workspace/ui/components/missions.fixtures"
import {
	type SearchResultKind,
	SearchResultRow,
	type SearchResultRowProps,
} from "@workspace/ui/components/search-result-row"

const PALETTE_WIDTH = 420

const NARROW_PALETTE_WIDTH = 320

const RESULTS_LABEL = "Search results"

const HOVERED_RESULTS_LABEL = "Search results under the pointer"

const QUERY_LABEL = "Search"

const QUERY = "parser"

const PAST_THE_LIST_LABEL = "Past the list"

const ACTIVE_OPTION_ID = "search-result-active"

const RESULT_LIST_ID = "search-result-list"

const PALETTE_RING_CLASS = "[--badge-ring:var(--color-popover)]"

const ROUTINE_BOT = {
	name: "Noor Beltran",
	seed: "bot-noor-beltran",
} as const

const IDENTITY_SIDE = 32

const KIND_ARGS: Record<SearchResultKind, SearchResultRowProps> = {
	message: {
		identity: { kind: "message", bot: MISSION_BOT },
		title: [
			{ key: "head", text: "The " },
			{ key: "match", text: "parser", isMatch: true },
			{ key: "tail", text: " drops every escaped newline" },
		],
		timestamp: "1h",
		parts: [
			{ key: "author", text: "Ada Martin" },
			{ key: "conversation", text: "Changelog cleanup" },
		],
		onOpen: fn(),
	},
	"message-from-you": {
		identity: { kind: "message-from-you", reader: "Steve Rivera" },
		title: [
			{ key: "head", text: "Can you rerun the " },
			{ key: "match", text: "parser", isMatch: true },
			{ key: "tail", text: " on the archive?" },
		],
		timestamp: "3h",
		parts: [
			{ key: "reader", text: "You" },
			{ key: "other", text: "Ada Martin" },
		],
		onOpen: fn(),
	},
	"chat-group": {
		identity: { kind: "chat-group" },
		title: [{ key: "title", text: "Changelog cleanup" }],
		timestamp: "Mon",
		parts: [{ key: "participants", text: "Atlas and Beacon" }],
		onOpen: fn(),
	},
	"chat-solo": {
		identity: { kind: "chat-solo", bot: MISSION_BOT },
		title: [{ key: "title", text: "Release notes review" }],
		timestamp: "Tue",
		parts: [{ key: "bot", text: "Ada Martin" }],
		onOpen: fn(),
	},
	mission: {
		identity: {
			kind: "mission",
			bot: MISSION_BOT,
			badge: "attention",
			mark: Icons.Linear,
		},
		title: [{ key: "title", text: "Migrate the run history table" }],
		timestamp: "2d",
		identifier: "OPE-51",
		parts: [
			{ key: "owner", text: "Ada Martin" },
			{ key: "state", text: "Waiting for you" },
		],
		onOpen: fn(),
	},
	routine: {
		identity: { kind: "routine", bot: ROUTINE_BOT },
		title: [{ key: "title", text: "Morning changelog digest" }],
		timestamp: "8d",
		parts: [
			{ key: "schedule", text: "Every weekday at 09:00" },
			{ key: "conversation", text: "Changelog cleanup" },
		],
		onOpen: fn(),
	},
}

const titleWeightOf = (canvasElement: HTMLElement) =>
	getComputedStyle(slotIn(canvasElement, "search-result-row-title")).fontWeight

type ResultListProps = {
	children: ReactNode
	label?: string
	id?: string
	width?: number
}

const ResultList = ({
	children,
	label = RESULTS_LABEL,
	id,
	width = PALETTE_WIDTH,
}: ResultListProps) => (
	<div
		aria-label={label}
		className={`flex flex-col gap-0.5 rounded-xl bg-popover p-1 ${PALETTE_RING_CLASS}`}
		id={id}
		role="listbox"
		style={{ width }}
	>
		{children}
	</div>
)

const Probe = ({ slot, tone }: { slot: string; tone: string }) => (
	<span className={`hidden ${tone}`} data-slot={slot} />
)

const surfaceOf = (canvasElement: HTMLElement, slot: string) =>
	getComputedStyle(slotIn(canvasElement, slot)).backgroundColor

const meta = preview.meta({
	title: "Navigation/SearchResultRow",
	component: SearchResultRow,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One hit of the search palette, in the six kinds a hit can take. It borrows the activity geometry of `RowAnatomy`, and marks the matched words of its title. It draws a hit and nothing else: the palette that holds it, its scope and its keyboard loop live above.",
			},
		},
	},
	args: KIND_ARGS.message,
	render: (args) => (
		<ResultList>
			<SearchResultRow {...args} />
		</ResultList>
	),
})

export const Message = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A message written by a companion, the nominal hit. Check that the excerpt is the title and stays at weight 400 because it is prose and not a name, that the matched word carries a `mark` on the translucent blue token, and that the context line reads the author then the conversation. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const matched = canvas.getByText("parser")

		await expect(matched.tagName).toBe("MARK")
		await expect(getComputedStyle(matched).backgroundColor).not.toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(titleWeightOf(canvasElement)).toBe("400")
		await expect(canvas.getByText("Changelog cleanup")).toBeVisible()
	},
})

export const MessageFromYou = meta.story({
	args: KIND_ARGS["message-from-you"],
	parameters: {
		docs: {
			description: {
				story:
					"The same prose hit when the reader wrote it. Check that the leading identity is the reader's initials rather than a companion, and that the title keeps the weight 400 the other message kind takes. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotIn(canvasElement, "user-avatar")).toBeVisible()
		await expect(titleWeightOf(canvasElement)).toBe("400")
		await expect(canvas.getByText("You")).toBeVisible()
	},
})

export const ChatGroup = meta.story({
	args: KIND_ARGS["chat-group"],
	parameters: {
		docs: {
			description: {
				story:
					"A room with several participants. Check that the identity is the room's 32px subject icon and not a single companion, that the title is a name and so takes weight 500, and that the context line is one sentence with no leading glyph in front of it. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			slotIn(canvasElement, "conversation-subject-icon").getBoundingClientRect()
				.width,
		).toBe(IDENTITY_SIDE)
		await expect(titleWeightOf(canvasElement)).toBe("500")
		await expect(canvas.getByText("Atlas and Beacon")).toBeVisible()
		await expect(
			slotsIn(canvasElement, "search-result-row-glyph"),
		).toHaveLength(0)
	},
})

export const ChatSolo = meta.story({
	args: KIND_ARGS["chat-solo"],
	parameters: {
		docs: {
			description: {
				story:
					"A thread held with one companion alone. Check that the context line reads exactly the parts the caller passed and nothing appended behind them: the words that tell a solo thread apart from a room of two are the palette's copy, not this component's. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(titleWeightOf(canvasElement)).toBe("500")
		await expect(
			slotIn(canvasElement, "search-result-row-parts").textContent,
		).toBe("Ada Martin")
	},
})

export const ThemesChatSolo = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: KIND_ARGS["chat-solo"],
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a one-companion thread in light and dark at once. Check that the companion's own 32px face leads the row in both themes, with no subject icon. Pick `ThemesChatGroup` for a room of several companions.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSoloAvatarInBothThemes(canvasElement, IDENTITY_SIDE),
})

export const ThemesChatGroup = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: KIND_ARGS["chat-group"],
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions with no colour picked, in light and dark at once. Check that a 32px subject icon on the neutral pair of each theme leads the row, the message square centred in it. Pick `ThemesChatGroupRed` for a coloured room.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, IDENTITY_SIDE),
})

export const ThemesChatGroupRed = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: {
		...KIND_ARGS["chat-group"],
		identity: { kind: "chat-group", color: BLOT_HUES.red, icon: "ShieldKey" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions coloured red, in light and dark at once. Check that the 32px subject icon keeps the neutral pair of each theme, as a room with no colour does, and shows the picked pictogram. Pick `ThemesChatGroup` for a room with no colour.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, IDENTITY_SIDE),
})

export const Mission = meta.story({
	args: KIND_ARGS.mission,
	parameters: {
		docs: {
			description: {
				story:
					"A mission hit, the only kind carrying a state badge and a ticket. Check that the badge dot sits on the companion and is ringed against the palette surface, and that the platform mark and the identifier open the context line ahead of the owner and the state. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotIn(canvasElement, "bot-activity-dot")).toHaveAttribute(
			"data-badge",
			"attention",
		)
		await expect(canvas.getByText("OPE-51")).toBeVisible()
		await expect(titleWeightOf(canvasElement)).toBe("500")
	},
})

export const Routine = meta.story({
	args: KIND_ARGS.routine,
	parameters: {
		docs: {
			description: {
				story:
					"A routine hit. Check that its context line opens on the repeat glyph, which is what separates a scheduled run from the mission kind that also names a companion and a state. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(titleWeightOf(canvasElement)).toBe("500")
		await expect(canvas.getByText("Every weekday at 09:00")).toBeVisible()
		await expect(slotIn(canvasElement, "search-result-row-glyph")).toBeVisible()
	},
})

export const Active = meta.story({
	args: { isActive: true },
	parameters: {
		docs: {
			description: {
				story:
					"The row the keyboard loop currently sits on. Check that the row takes the muted surface at full strength, which is what tells the reader where the keyboard sits. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	render: (args) => (
		<>
			<Probe slot="muted-probe" tone="bg-muted" />
			<ResultList>
				<SearchResultRow {...args} />
			</ResultList>
		</>
	),
	play: async ({ canvas, canvasElement }) => {
		const row = canvas.getByRole("option")

		await expect(getComputedStyle(row).backgroundColor).toBe(
			surfaceOf(canvasElement, "muted-probe"),
		)
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		pseudo: { hover: "#search-result-hovered button" },
		docs: {
			description: {
				story:
					"Rest, the pointer and keyboard focus side by side. Check that the row draws no surface of its own at rest so the palette behind it shows through, that the pointer answer is the muted surface at half strength so it never reads as the active row, and that a row the palette moves focus onto adds a ring on top of whichever surface it already carries.",
			},
		},
	},
	render: (args) => (
		<>
			<ResultList>
				<SearchResultRow {...args} />
			</ResultList>
			<ResultList id="search-result-hovered" label={HOVERED_RESULTS_LABEL}>
				<SearchResultRow
					{...args}
					title={[{ key: "title", text: "Hovered result" }]}
				/>
			</ResultList>
		</>
	),
	play: async ({ canvas, userEvent }) => {
		const [rested] = canvas.getAllByRole("option")

		await expect(getComputedStyle(rested).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await userEvent.keyboard("{ArrowDown}")
		rested.focus()

		await expect(rested).toHaveFocus()
		await expect(getComputedStyle(rested).boxShadow).not.toBe("none")
	},
})

export const AsListboxOption = meta.story({
	tags: ["test-only"],
	args: {
		isActive: true,
		id: ACTIVE_OPTION_ID,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The row as the palette owns it, with the wiring a reader needs around it: the query field is a combobox that owns the list through `aria-controls`, so the option it points at with `aria-activedescendant` is a logical descendant of the focused element and is actually announced. Check that the pointed id resolves inside the owned list to the option carrying the selected state, that its accessible name carries the title, and that no row is in the tab order — one press of Tab leaves the field and lands past the whole list, because the palette drives the list from the arrow keys and never from Tab.",
			},
		},
	},
	render: (args) => (
		<>
			<input
				aria-activedescendant={ACTIVE_OPTION_ID}
				aria-controls={RESULT_LIST_ID}
				aria-expanded
				aria-label={QUERY_LABEL}
				readOnly
				role="combobox"
				value={QUERY}
			/>
			<ResultList id={RESULT_LIST_ID}>
				<SearchResultRow {...args} />
				<SearchResultRow
					{...args}
					id="search-result-second"
					isActive={false}
					title={[{ key: "title", text: "The second hit" }]}
				/>
			</ResultList>
			<button type="button">{PAST_THE_LIST_LABEL}</button>
		</>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		const field = canvas.getByRole("combobox")
		const owned = canvasElement.querySelector(
			`#${field.getAttribute("aria-controls")}`,
		)
		const [selected, rest] = canvas.getAllByRole("option")

		if (!owned) throw new Error("The combobox owns no list")

		await expect(field).toHaveAttribute("aria-expanded", "true")
		await expect(
			owned.querySelector(`#${field.getAttribute("aria-activedescendant")}`),
		).toBe(selected)
		await expect(selected).toHaveAttribute("aria-selected", "true")
		await expect(rest).toHaveAttribute("aria-selected", "false")
		await expect(selected).toHaveAttribute("tabindex", "-1")

		field.focus()
		await userEvent.tab()

		await expect(
			canvas.getByRole("button", { name: PAST_THE_LIST_LABEL }),
		).toHaveFocus()
	},
})

export const ActiveUnderPointer = meta.story({
	tags: ["test-only"],
	args: { isActive: true },
	parameters: {
		pseudo: { hover: true },
		docs: {
			description: {
				story:
					"The row the keyboard sits on, with the pointer resting on it too. Check that it keeps the muted surface at full strength instead of lightening to the half-strength pointer answer: the pointer never takes a row away from the keyboard, and the two surfaces are close enough that a row flickering between them reads as a bug. Reach for `States` when what you are checking is a row the keyboard is not on.",
			},
		},
	},
	render: (args) => (
		<>
			<Probe slot="muted-probe" tone="bg-muted" />
			<ResultList>
				<SearchResultRow {...args} />
			</ResultList>
		</>
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(
			getComputedStyle(canvas.getByRole("option")).backgroundColor,
		).toBe(surfaceOf(canvasElement, "muted-probe"))
	},
})

export const WithBadgeWhileActive = meta.story({
	tags: ["test-only"],
	args: KIND_ARGS.mission,
	parameters: {
		docs: {
			description: {
				story:
					"Two mission rows on the palette surface, one of them active. The badge ring is a hole punched through whatever is behind the dot, so check that the resting row punches the palette it is placed on and the active row punches the muted surface it draws itself — a ring naming a surface the row is not on paints a pale halo instead of disappearing.",
			},
		},
	},
	render: (args) => (
		<>
			<Probe slot="muted-probe" tone="bg-muted" />
			<ResultList>
				<SearchResultRow {...args} isActive={false} />
				<SearchResultRow
					{...args}
					isActive
					title={[{ key: "title", text: "Retire the legacy importer" }]}
				/>
			</ResultList>
		</>
	),
	play: async ({ canvasElement }) => {
		const [resting, active] = slotsIn(canvasElement, "search-result-row")
		const [restingDot, activeDot] = slotsIn(canvasElement, "bot-activity-dot")
		const palette = resting.parentElement

		if (!palette) throw new Error("The rows sit in no palette")

		await expect(getComputedStyle(restingDot).boxShadow).toContain(
			getComputedStyle(palette).backgroundColor,
		)
		await expect(getComputedStyle(activeDot).boxShadow).toContain(
			surfaceOf(canvasElement, "muted-probe"),
		)
		await expect(getComputedStyle(resting).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(getComputedStyle(active).backgroundColor).toBe(
			surfaceOf(canvasElement, "muted-probe"),
		)
	},
})

export const LongContent = meta.story({
	args: {
		title: [
			{ key: "head", text: "Rewrite the changelog " },
			{ key: "match", text: "parser", isMatch: true },
			{
				key: "tail",
				text: " so that every escaped newline survives the round trip through the archive",
			},
		],
		parts: [
			{ key: "author", text: "Ada Martin" },
			{
				key: "conversation",
				text: "Changelog cleanup, archive migration and the long tail of the release notes",
			},
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A title and a context line longer than their lanes. Check that both end on an ellipsis rather than wrapping, that the timestamp keeps its width and its place instead of being pushed out, and that the identifier and the leading glyph are never the part that gets cut. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const row = canvas.getByRole("option")
		const title = slotIn(canvasElement, "search-result-row-title")
		const parts = slotIn(canvasElement, "search-result-row-parts")
		const timestamp = slotIn(canvasElement, "search-result-row-timestamp")

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
		await expect(parts.scrollWidth).toBeGreaterThan(parts.clientWidth)
		await expect(getComputedStyle(parts).textOverflow).toBe("ellipsis")
		await expect(timestamp.getBoundingClientRect().right).toBeLessThanOrEqual(
			row.getBoundingClientRect().right,
		)
	},
})

export const Activated = meta.story({
	args: { onOpen: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The row taken by the pointer and then by the keyboard. Check that the whole row is one option named by its title, and that either way of activating it reports exactly once — reach for this over `States` when what you are checking is the handler and not the surface. The palette draws it under `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const row = canvas.getByRole("option", { name: /drops every escaped/ })

		await userEvent.click(row)
		await expect(args.onOpen).toHaveBeenCalledTimes(1)

		row.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenCalledTimes(2)
	},
})

export const OpensWithClickModifiers = meta.story({
	tags: ["test-only"],
	args: { onOpen: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The row clicked every way a host can tell apart. Check that a middle click reports once with middle and the keys held, keeps the browser from starting its autoscroll, that a Cmd, Ctrl or Shift click reports that key alone, that a plain click and Enter report no key, and that a right-click reports nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expectClickModifiers({
			target: canvas.getByRole("option"),
			callback: args.onOpen,
			reported: [],
			userEvent,
		})
	},
})

export const InNarrowPalette = meta.story({
	tags: ["test-only"],
	args: KIND_ARGS.mission,
	parameters: {
		docs: {
			description: {
				story:
					"The row squeezed to the 320px reflow floor. Check that the timestamp stays inside the row rather than overflowing it, which is the width where the title lane runs out of room first.",
			},
		},
	},
	render: (args) => (
		<ResultList width={NARROW_PALETTE_WIDTH}>
			<SearchResultRow {...args} />
		</ResultList>
	),
	play: async ({ canvas, canvasElement }) => {
		const row = canvas.getByRole("option").getBoundingClientRect()
		const timestamp = slotIn(canvasElement, "search-result-row-timestamp")

		await expect(timestamp.getBoundingClientRect().right).toBeLessThanOrEqual(
			row.right,
		)
	},
})
