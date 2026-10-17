import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonClippedAtBottomOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { MISSION_BOT } from "@workspace/ui/components/missions.fixtures"
import {
	SearchPalette,
	type SearchPaletteProps,
	type SearchPaletteResult,
	type SearchRestingGroup,
	type SearchResultGroup,
	type SearchTab,
} from "@workspace/ui/components/search-palette"

const QUERY = "parser"

const SPACE_NAME = "Studio"

const MESSAGES_FOUND = 12

const SHOWN_PER_KIND = 3

const POPUP_HEIGHT = 584

const ELEVEN_HITS = 11

const NARROW_WIDTH = 320

const NARROW_VIEWPORT = {
	narrow: {
		name: "Narrow",
		styles: { width: `${NARROW_WIDTH}px`, height: "844px" },
	},
}

const ROUTINE_BOT = {
	name: "Noor Beltran",
	seed: "bot-noor-beltran",
} as const

const messageAt = (rank: number): SearchPaletteResult => ({
	id: `message-${rank}`,
	identity: { kind: "message", bot: MISSION_BOT },
	title: [
		{ key: "head", text: "The " },
		{ key: "match", text: QUERY, isMatch: true },
		{ key: "tail", text: ` drops escaped newline ${rank}` },
	],
	timestamp: `${rank}h`,
	parts: [
		{ key: "author", text: "Ada Martin" },
		{ key: "conversation", text: "Changelog cleanup" },
	],
	onOpen: fn(),
})

const MESSAGES: SearchPaletteResult[] = Array.from({ length: 10 }, (_, index) =>
	messageAt(index + 1),
)

const CHATS: SearchPaletteResult[] = [
	{
		id: "chat-changelog",
		identity: {
			kind: "chat-group",
		},
		title: [{ key: "title", text: "Changelog cleanup" }],
		timestamp: "Mon",
		parts: [{ key: "participants", text: "Atlas and Beacon" }],
		onOpen: fn(),
	},
	{
		id: "chat-release",
		identity: { kind: "chat-solo", bot: MISSION_BOT },
		title: [{ key: "title", text: "Release notes review" }],
		timestamp: "Tue",
		parts: [{ key: "bot", text: "Ada Martin" }],
		onOpen: fn(),
	},
]

const MISSIONS: SearchPaletteResult[] = [
	{
		id: "mission-run-history",
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
]

const ROUTINES: SearchPaletteResult[] = [
	{
		id: "routine-digest",
		identity: { kind: "routine", bot: ROUTINE_BOT },
		title: [{ key: "title", text: "Morning changelog digest" }],
		timestamp: "8d",
		parts: [{ key: "schedule", text: "Every weekday at 09:00" }],
		onOpen: fn(),
	},
]

const RESULTS: SearchResultGroup[] = [
	{ kind: "messages", total: MESSAGES_FOUND, results: MESSAGES },
	{ kind: "chats", total: CHATS.length, results: CHATS },
	{ kind: "missions", total: MISSIONS.length, results: MISSIONS },
	{ kind: "routines", total: ROUTINES.length, results: ROUTINES },
]

const ELEVEN: SearchResultGroup[] = [
	{ kind: "messages", total: 7, results: MESSAGES.slice(0, 7) },
	{ kind: "chats", total: CHATS.length, results: CHATS },
	{ kind: "missions", total: MISSIONS.length, results: MISSIONS },
	{ kind: "routines", total: ROUTINES.length, results: ROUTINES },
]

const ONE_HIT: SearchResultGroup[] = [
	{ kind: "chats", total: 1, results: [CHATS[0] as SearchPaletteResult] },
]

type RestingSeed = {
	id: string
	title: string
	timestamp: string
	part: string
}

const restingRow = (
	identity: SearchPaletteResult["identity"],
	{ id, title, timestamp, part }: RestingSeed,
): SearchPaletteResult => ({
	id,
	identity,
	title: [{ key: "title", text: title }],
	timestamp,
	parts: [{ key: "part", text: part }],
	onOpen: fn(),
})

const RESTING_CHATS: SearchPaletteResult[] = [
	{
		id: "resting-chat-onboarding",
		title: "Onboarding copy pass",
		timestamp: "10m",
		part: "Atlas",
	},
	{
		id: "resting-chat-changelog",
		title: "Changelog cleanup",
		timestamp: "1h",
		part: "Beacon",
	},
	{
		id: "resting-chat-release",
		title: "Release notes review",
		timestamp: "Mon",
		part: "Ada Martin",
	},
	{
		id: "resting-chat-triage",
		title: "Weekly triage",
		timestamp: "Fri",
		part: "Atlas",
	},
].map((seed) => restingRow({ kind: "chat-solo", bot: MISSION_BOT }, seed))

const RESTING_MISSIONS: SearchPaletteResult[] = [
	{
		id: "resting-mission-run-history",
		title: "Migrate the run history table",
		timestamp: "2d",
		part: "Waiting for you",
	},
	{
		id: "resting-mission-parser",
		title: "Split the parser transport",
		timestamp: "3d",
		part: "Running",
	},
].map((seed) =>
	restingRow({ kind: "mission", bot: MISSION_BOT, mark: Icons.Linear }, seed),
)

const RESTING_ROUTINES: SearchPaletteResult[] = [
	{
		id: "resting-routine-digest",
		title: "Morning changelog digest",
		timestamp: "8d",
		part: "Every weekday at 09:00",
	},
	{
		id: "resting-routine-standup",
		title: "Standup reminder",
		timestamp: "9d",
		part: "Every weekday at 10:00",
	},
	{
		id: "resting-routine-backup",
		title: "Weekly backup report",
		timestamp: "12d",
		part: "Every Sunday at 22:00",
	},
	{
		id: "resting-routine-triage",
		title: "Inbox triage sweep",
		timestamp: "20d",
		part: "Every hour",
	},
].map((seed) => restingRow({ kind: "routine", bot: ROUTINE_BOT }, seed))

const RESTING: SearchRestingGroup[] = [
	{ kind: "routines", results: RESTING_ROUTINES },
	{ kind: "chats", results: RESTING_CHATS },
	{ kind: "missions", results: RESTING_MISSIONS },
]

const palette = async () => {
	const popup = await screen.findByRole("dialog", { name: "Search" })
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const bodyOf = (popup: HTMLElement) => slotIn(popup, "search-palette-body")

const contentTopOf = (body: HTMLElement) =>
	body.getBoundingClientRect().top +
	Number.parseFloat(getComputedStyle(body).paddingTop)

const Harness = (args: SearchPaletteProps) => {
	const [tab, setTab] = useState<SearchTab>(args.tab)
	const [query, setQuery] = useState(args.query)

	const changeTab = (next: SearchTab) => {
		args.onTabChange(next)
		setTab(next)
	}

	const changeQuery = (next: string) => {
		args.onQueryChange(next)
		setQuery(next)
	}

	return (
		<SearchPalette
			{...args}
			onQueryChange={changeQuery}
			onTabChange={changeTab}
			query={query}
			tab={tab}
		/>
	)
}

const meta = preview.meta({
	title: "Overlays/SearchPalette",
	component: SearchPalette,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The search surface of the app, opened over whatever the reader was doing. It composes its own popup rather than the shared dialog content because the query line and the tab row are pinned and only the body under them scrolls. It searches the current space only and carries no scope control. It holds one height whatever the body holds, so a keystroke never moves a row under the reader's pointer. It reads nothing: the query, the tab, the results, the resting rows and the loading flag are all props, and every gesture is a callback, so the host owns the search itself. Focus stays on the query line at all times and the row the keyboard sits on is pointed at with `aria-activedescendant`, which is why the rows are options of one listbox rather than buttons in a tree. On the All tab each kind gets a head naming it and counting what it found, cut to three rows with a See all that moves the reader to that kind's own tab; every other tab is one flat list. While the query is empty every tab answers with the resting rows it was handed or, when it has none, with a panel that says what to do about it.",
			},
		},
	},
	args: {
		open: true,
		query: QUERY,
		tab: "all" as SearchTab,
		spaceName: SPACE_NAME,
		results: RESULTS,
		resting: RESTING,
		isLoading: false,
		activeResultId: "message-1",
		onOpenChange: fn(),
		onQueryChange: fn(),
		onTabChange: fn(),
	},
	render: (args) => <Harness {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every kind answering one query, on the All tab. Check that each kind carries a head naming it and counting what it found, that the twelve messages are cut to the three rows the head announces with a See all beside them while the kinds that fit draw none, that the rows are numbered from one straight through the sections rather than restarting at each head, and that focus never leaves the query line while the row it points at is the one drawn as selected. Check too that the options are exactly the rows: the heads and their See all stand outside the lists, so a reader is never told a section title or a filter is a result they can open. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const popup = await palette()
		const body = bodyOf(popup)
		const field = within(popup).getByRole("combobox")

		await waitFor(() => expect(field).toHaveFocus())
		await expect(canvas.queryByRole("dialog")).toBeNull()

		const heads = slotsIn(body, "search-palette-section-head")
		await expect(heads).toHaveLength(4)
		await expect(heads[0]).toHaveTextContent(`Messages${MESSAGES_FOUND}`)
		await expect(within(popup).queryByRole("switch")).toBeNull()

		const messages = within(popup).getByRole("listbox", { name: "Messages" })
		await expect(slotsIn(messages, "search-result-row")).toHaveLength(
			SHOWN_PER_KIND,
		)
		await expect(slotsIn(body, "search-palette-see-all")).toHaveLength(1)

		const selected = within(popup).getAllByRole("option", { selected: true })
		await expect(selected).toHaveLength(1)
		await expect(field.getAttribute("aria-activedescendant")).toBe(
			selected[0]?.id,
		)
		const lists = within(popup).getAllByRole("listbox")
		const owned = field.getAttribute("aria-controls")?.split(" ")

		await expect(field).toHaveAttribute("aria-expanded", "true")
		await expect(owned).toEqual(lists.map((list) => list.id))
		await expect(lists.some((list) => list.contains(selected[0] ?? null))).toBe(
			true,
		)

		const options = within(popup).getAllByRole("option")
		await expect(options).toEqual(slotsIn(body, "search-result-row"))
		await expect(
			within(popup).getByRole("button", { name: "See all" }),
		).not.toHaveAttribute("aria-selected")
	},
})

export const OneKind = meta.story({
	args: { tab: "messages" },
	parameters: {
		docs: {
			description: {
				story:
					"The Messages tab alone. Check that the section heads are gone entirely — a single kind names itself through the active pill, so a head would repeat it — that every message the host handed over is drawn instead of the three the All tab keeps, and that the tenth row and beyond carry no keycap because no digit reaches them. Pick `Default` when what you are checking is the grouping. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const body = bodyOf(popup)

		await expect(slotsIn(body, "search-palette-section-head")).toHaveLength(0)
		await expect(within(popup).getAllByRole("listbox")).toHaveLength(1)
		await expect(within(popup).queryAllByRole("group")).toHaveLength(0)
		await expect(within(popup).getAllByRole("option")).toHaveLength(
			MESSAGES.length,
		)
	},
})

export const ChangingTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The gesture that swaps the body: the All tab, then Conversations, then back through See all. Check that the press reports the tab it selects and that the body follows it — grouped and cut on All, flat and whole on a kind — and that See all is nothing more than that same gesture drawn on the head of the kind that overflows. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await palette()
		const body = bodyOf(popup)
		const reader = within(popup)

		await userEvent.click(reader.getByRole("tab", { name: "Conversations" }))
		await expect(args.onTabChange).toHaveBeenCalledWith("chats")
		await waitFor(async () => {
			await expect(slotsIn(body, "search-palette-section-head")).toHaveLength(0)
		})
		await expect(reader.getAllByRole("option")).toHaveLength(CHATS.length)

		await userEvent.click(reader.getByRole("tab", { name: "All" }))
		await waitFor(async () => {
			await expect(slotsIn(body, "search-palette-see-all")).toHaveLength(1)
		})

		await userEvent.click(reader.getByRole("button", { name: "See all" }))
		await expect(args.onTabChange).toHaveBeenLastCalledWith("messages")
		await waitFor(async () => {
			await expect(reader.getAllByRole("option")).toHaveLength(MESSAGES.length)
		})
	},
})

export const OneHit = meta.story({
	args: { results: ONE_HIT, activeResultId: "chat-changelog" },
	parameters: {
		docs: {
			description: {
				story:
					"A query one chat answers, and nothing else. Check that the popup stands at its full height with a single row in it rather than shrinking around it — the height is the same number `ManyHits` asserts — so the query line and the tab row sit where the reader last saw them and the next keystroke does not move them. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()

		await expect(within(popup).getAllByRole("option")).toHaveLength(1)
		await expect(popup.getBoundingClientRect().height).toBe(POPUP_HEIGHT)
	},
})

export const ManyHits = meta.story({
	args: { results: ELEVEN },
	parameters: {
		docs: {
			description: {
				story:
					"Eleven hits spread over the four kinds, more than the body can show at once. Check that the popup is exactly as tall as it is in `OneHit`, that the overflow is taken by the body alone — it scrolls, the query line and the tab row do not move, and that no row is dropped to make the palette fit. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const body = bodyOf(popup)
		const handed = ELEVEN.flatMap((group) => group.results)

		await expect(handed).toHaveLength(ELEVEN_HITS)
		await expect(popup.getBoundingClientRect().height).toBe(POPUP_HEIGHT)
		await expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
		await expect(slotIn(popup, "search-palette-query")).toBeVisible()
		await expect(slotIn(popup, "search-palette-tabs")).toBeVisible()
	},
})

export const Resting = meta.story({
	args: { query: "", activeResultId: "resting-chat-onboarding" },
	parameters: {
		docs: {
			description: {
				story:
					"The palette the moment it opens, with nothing typed yet. Check that the three kinds that can rest stand in the order chats, missions, routines whatever order the host handed them over in, that each head names its kind and counts nothing — no search has run, so there is no total to report — that a kind holding more rows than the three the All tab keeps offers a See all onto its own tab while the missions kind, whose two rows are all drawn already, offers none, and that the rows are numbered from one straight across the sections rather than restarting at each head. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await palette()
		const body = bodyOf(popup)
		const heads = slotsIn(body, "search-palette-section-head")

		await expect(heads.map((head) => head.textContent)).toEqual([
			"Recent conversationsSee all",
			"Recent missions",
			"RoutinesSee all",
		])
		await expect(
			within(popup)
				.getAllByRole("listbox")
				.map((list) => slotsIn(list, "search-result-row").length),
		).toEqual([SHOWN_PER_KIND, RESTING_MISSIONS.length, SHOWN_PER_KIND])
		await expect(slotsIn(body, "search-palette-rest")).toHaveLength(0)

		const [chats] = slotsIn(body, "search-palette-see-all")

		await userEvent.click(chats as HTMLElement)
		await expect(args.onTabChange).toHaveBeenCalledWith("chats")
	},
})

export const RestingMessages = meta.story({
	args: { query: "", tab: "messages", activeResultId: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The Messages tab with nothing typed. Check that it answers with an instruction rather than rows — no message is recent, every message is only ever reached by typing — that the instruction names the space it will read and warns that matching is by whole words, that it offers no button, and that a listbox is still rendered under it so the query line points at an element that exists. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)
		const panel = slotIn(bodyOf(popup), "search-palette-rest")

		await expect(reader.getByText("Search every message")).toBeVisible()
		await expect(panel).toHaveTextContent(SPACE_NAME)
		await expect(panel.querySelector("button")).toBeNull()
		await expect(reader.queryAllByRole("option")).toHaveLength(0)
		await expect(reader.getByRole("listbox")).toBeEmptyDOMElement()
		await expect(reader.getByRole("combobox")).toHaveAttribute(
			"aria-controls",
			reader.getByRole("listbox").id,
		)
	},
})

export const RestingOneKind = meta.story({
	args: { query: "", tab: "chats", activeResultId: "resting-chat-onboarding" },
	parameters: {
		docs: {
			description: {
				story:
					"The Conversations tab with nothing typed. Check that every resting conversation the host handed over is drawn rather than the three the All tab keeps, that the one head naming the kind carries no count and no See all — the tab the See all would move to is the one the reader is already on — and that the popup keeps the height it has everywhere else. Pick `Resting` for the three kinds side by side. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const body = bodyOf(popup)
		const [head] = slotsIn(body, "search-palette-section-head")

		await expect(head?.textContent).toBe("Recent conversations")
		await expect(within(popup).getAllByRole("option")).toHaveLength(
			RESTING_CHATS.length,
		)
		await expect(slotsIn(body, "search-palette-see-all")).toHaveLength(0)
		await expect(slotsIn(body, "search-palette-rest")).toHaveLength(0)
	},
})

export const RestingKindEmpty = meta.story({
	args: {
		query: "",
		tab: "missions",
		resting: [{ kind: "chats", results: RESTING_CHATS }],
		activeResultId: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The Missions tab in a space where no mission has been opened. Check that the panel carries the mark of the kind the reader asked for rather than a magnifier, that it names the space so the emptiness reads as local and not as a broken palette, and that it offers no button, since the palette only ever searches this space. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)
		const panel = slotIn(bodyOf(popup), "search-palette-rest")

		await expect(reader.getByText("No mission here yet")).toBeVisible()
		await expect(panel).toHaveTextContent(`No missions in ${SPACE_NAME} yet.`)
		await expect(panel.querySelector("button")).toBeNull()
		await expect(reader.queryAllByRole("option")).toHaveLength(0)
	},
})

export const RestingNothing = meta.story({
	args: { query: "", resting: [], activeResultId: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The All tab on a fresh account: nothing typed, nothing opened in any kind. Check that it falls back to the instruction the Messages tab carries rather than claiming nothing matches — no query has been asked, so there is nothing for an empty state to report on — and that it offers no button, since the palette only ever searches this space. Pick `Empty` for the sentence a search that came back with nothing earns. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)

		await expect(reader.getByText("Search every message")).toBeVisible()
		await expect(reader.getByRole("listbox")).toBeEmptyDOMElement()
		await expect(reader.queryByText("Nothing here matches")).toBeNull()
		await expect(
			slotIn(bodyOf(popup), "search-palette-rest").querySelector("button"),
		).toBeNull()
	},
})

export const RestingLoading = meta.story({
	args: {
		query: "",
		tab: "chats",
		resting: [],
		isLoading: true,
		activeResultId: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The Conversations tab at rest while the resting rows are still being read. Check that the body draws the results skeleton rather than the panel: the panel states that nothing has ever been opened here, which is a claim the palette cannot make until the read comes back. Pick `RestingKindEmpty` for the same tab once it has. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)

		await expect(slotsIn(bodyOf(popup), "search-palette-rest")).toHaveLength(0)
		await expect(reader.queryAllByRole("option")).toHaveLength(0)
		await expect(bodyOf(popup)).toHaveAttribute("aria-busy", "true")
	},
})

export const RestingAllLoading = meta.story({
	args: {
		query: "",
		resting: [],
		isLoading: true,
		activeResultId: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The All tab at rest while the resting rows are still being read. Check that the query line and the tabs stay put, that the body draws the Recent conversations head at the top of the body over three row skeletons, then the Recent missions head with row skeletons running to the bottom of the palette, the last one cut by the edge, each at the height of a loaded result row, and that the body reads busy. Pick `LoadingFirstQuery` for a search in flight, which draws no head. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)
		const body = bodyOf(popup)

		const list = await expectSkeletonClippedAtBottomOf(body)
		const skeleton = slotIn(body, "search-palette-skeleton")
		await expect(skeleton).toHaveAttribute("aria-hidden", "true")
		const heads = slotsIn(body, "search-palette-section-head")
		await expect(heads.map((head) => head.textContent)).toEqual([
			"Recent conversations",
			"Recent missions",
		])
		await expect(heads[0]?.getBoundingClientRect().top).toBe(contentTopOf(body))
		await expect(
			skeleton.firstElementChild?.lastElementChild?.children,
		).toHaveLength(3)
		const [firstRow] = slotsIn(list, "list-skeleton-row")
		await expect(firstRow?.getBoundingClientRect().height).toBe(52)

		await expect(reader.queryAllByRole("option")).toHaveLength(0)
		await expect(body).toHaveAttribute("aria-busy", "true")
		await expect(reader.getAllByRole("tab")).toHaveLength(5)
	},
})

export const Empty = meta.story({
	args: { results: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A query nothing in the space answers. Check that the empty state names the space that was searched and quotes the query back, so a reader who mistyped sees it, and that it offers no button, since the palette only ever searches this space. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)

		await expect(reader.getByRole("listbox")).toBeEmptyDOMElement()
		await expect(reader.getByText("Nothing here matches")).toBeVisible()
		await expect(
			reader.getByText(`No results for “${QUERY}” in ${SPACE_NAME}`, {
				exact: false,
			}),
		).toHaveTextContent(`“${QUERY}”`)
		await expect(
			slotIn(bodyOf(popup), "search-palette-empty").querySelector("button"),
		).toBeNull()
	},
})

export const Loading = meta.story({
	args: { isLoading: true },
	parameters: {
		docs: {
			description: {
				story:
					"A second search running while the first one is still on screen. Check that not one row is taken away and that the body reports itself busy instead — a palette that blanks between two keystrokes flickers, and the rows it drops were the answer to what the reader had typed a moment before. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)

		await expect(slotsIn(bodyOf(popup), "search-result-row")).toHaveLength(7)
		await expect(reader.queryByText("Nothing here matches")).toBeNull()
		await expect(bodyOf(popup)).toHaveAttribute("aria-busy", "true")
	},
})

export const LoadingFirstQuery = meta.story({
	args: { isLoading: true, results: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The very first search of the session, still in flight, with nothing to keep on screen. Check that the query line and the tabs stay put, that the body draws result row skeletons from where the first result lands down to the bottom of the palette, the last one cut by the edge, each at the height of a loaded result row, with no section head, and that the empty state stays away while the body reads busy: it claims nothing matches, which is a statement the palette cannot make until the search comes back. Pick `RestingAllLoading` for the All tab at rest, which heads its rows, and `Empty` for this body once the search has come back. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async () => {
		const popup = await palette()
		const reader = within(popup)
		const body = bodyOf(popup)

		const list = await expectSkeletonClippedAtBottomOf(body)
		await expect(slotsIn(body, "search-palette-section-head")).toHaveLength(0)
		const [firstRow] = slotsIn(list, "list-skeleton-row")
		await expect(firstRow?.getBoundingClientRect().height).toBe(52)
		await expect(firstRow?.getBoundingClientRect().top).toBe(contentTopOf(body))

		await expect(reader.queryAllByRole("option")).toHaveLength(0)
		await expect(reader.queryByText("Nothing here matches")).toBeNull()
		await expect(body).toHaveAttribute("aria-busy", "true")
		await expect(reader.getByRole("combobox")).toHaveAttribute(
			"aria-expanded",
			"true",
		)
		await expect(reader.getAllByRole("tab")).toHaveLength(5)
	},
})

export const Narrow = meta.story({
	tags: ["test-only"],
	globals: { viewport: { value: "narrow" } },
	parameters: {
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"The palette on a 320px window, the narrowest surface the shell reflows to. Check that the tab strip keeps every tab inside the row — the strip scrolls sideways instead — that it draws no scrollbar of its own, since a reader whose system paints scrollbars permanently would otherwise get a bar across the tab labels, and that pressing a tab still swaps the body. Pick `Default` for the palette with room for all five tabs at once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await palette()
		const reader = within(popup)
		const row = slotIn(popup, "search-palette-tabs")
		const strip = reader.getByRole("tablist")

		await expect(window.innerWidth).toBe(NARROW_WIDTH)
		await expect(strip.getBoundingClientRect().right).toBeLessThanOrEqual(
			row.getBoundingClientRect().right,
		)
		await expect(getComputedStyle(strip).scrollbarWidth).toBe("none")
		await expect(strip.clientHeight).toBe(strip.offsetHeight)

		await userEvent.click(reader.getByRole("tab", { name: "Conversations" }))
		await expect(args.onTabChange).toHaveBeenCalledWith("chats")
	},
})

export const ArrowKeyTabs = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The tab strip walked with the arrow keys. A tab here is a search kind, so selecting one runs another query: the arrows move focus and stop there, and the kind changes only on Enter or Space. Check that walking the strip reports nothing to the host and leaves All selected, and that the press on the tab the arrows reached is what reports it. The tool question card does the opposite, because a tab there only swaps which question is on screen. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const reader = within(await palette())
		const all = reader.getByRole("tab", { name: "All" })

		all.focus()
		await userEvent.keyboard("{ArrowRight}")

		const messages = reader.getByRole("tab", { name: "Messages" })

		await expect(messages).toHaveFocus()
		await expect(all).toHaveAttribute("aria-selected", "true")
		await expect(messages).toHaveAttribute("aria-selected", "false")
		await expect(args.onTabChange).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")
		await expect(args.onTabChange).toHaveBeenCalledWith("messages")

		reader.getByRole("tab", { name: "Conversations" }).focus()
		await userEvent.keyboard(" ")
		await expect(args.onTabChange).toHaveBeenLastCalledWith("chats")
	},
})

export const ReducedMotion = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The palette for a reader who asked the system to stop moving things. The registry tab transitions every property it changes; the palette drops that under `prefers-reduced-motion`, so the selected fill lands on the pressed tab in a single frame. Check that every tab reports a transition of no duration, and that pressing one still reports the kind. The app assembles it at `apps/app/src/App.tsx:1239`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const reader = within(await palette())

		for (const tab of reader.getAllByRole("tab")) {
			await expect(getComputedStyle(tab).transitionDuration).toBe("0s")
		}

		await userEvent.click(reader.getByRole("tab", { name: "Conversations" }))
		await expect(args.onTabChange).toHaveBeenCalledWith("chats")
	},
})
