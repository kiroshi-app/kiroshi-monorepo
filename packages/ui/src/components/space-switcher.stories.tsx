import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	mergeA11y,
	probedStyleOf,
	settled,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { Space } from "@workspace/ui/components/space"
import type { SpaceInvitation } from "@workspace/ui/components/space-invitations"
import {
	SpaceDots,
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: BLOT_HUES.blue, avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.green, avatarSeed: "vocca" },
	{
		id: "atelier",
		name: "Atelier",
		colour: BLOT_HUES.pink,
		avatarSeed: "atelier",
	},
	{
		id: "veille",
		name: "Veille",
		colour: BLOT_HUES.yellow,
		avatarSeed: "veille",
	},
	{
		id: "archives",
		name: "Archives",
		colour: BLOT_HUES.purple,
		avatarSeed: "archives",
	},
]

const BADGES: Record<string, BotBadge> = {
	perso: "done",
	atelier: "failed",
	veille: "attention",
}

const LONG_SPACES: Space[] = [
	{
		id: "perso",
		name: "Everything I have not filed anywhere else yet",
		colour: BLOT_HUES.blue,
		avatarSeed: "perso",
	},
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.green, avatarSeed: "vocca" },
]

const MANY_SPACES: Space[] = [
	...SPACES,
	{
		id: "lecture",
		name: "Lecture",
		colour: BLOT_HUES.red,
		avatarSeed: "lecture",
	},
	{
		id: "cuisine",
		name: "Cuisine",
		colour: BLOT_HUES.orange,
		avatarSeed: "cuisine",
	},
	{
		id: "musique",
		name: "Musique",
		colour: BLOT_HUES.cyan,
		avatarSeed: "musique",
	},
	{
		id: "jardin",
		name: "Jardin",
		colour: BLOT_HUES.green,
		avatarSeed: "jardin",
	},
]

const TITLE_BAR_LINE =
	"flex h-8.5 w-64 items-center gap-2 rounded-xl border border-border border-dashed px-2.5"

const NARROW_STRIP = "w-24 rounded-xl border border-border border-dashed py-2"

const POINTER = {
	button: 0,
	isPrimary: true,
	pointerId: 1,
	pointerType: "mouse",
}

const dotsIn = (root: HTMLElement) => slotsIn(root, "space-dot-button")

const stripDotsIn = (root: HTMLElement) =>
	dotsIn(root).map((button) => slotsIn(button, "space-dot")[0])

const dotNames = (root: HTMLElement) =>
	dotsIn(root).map((dot) => dot.getAttribute("aria-label"))

const RESTING_NAMES = SPACES.map((space) => `Open ${space.name}`)

const centreOf = (node: Element) => {
	const box = node.getBoundingClientRect()
	return {
		clientX: Math.round(box.left + box.width / 2),
		clientY: Math.round(box.top + box.height / 2),
	}
}

const liftBy = (handle: HTMLElement, byX: number) => {
	const from = centreOf(handle)
	fireEvent.pointerDown(handle, { ...POINTER, ...from })
	fireEvent.pointerMove(handle, {
		...POINTER,
		clientX: from.clientX + byX,
		clientY: from.clientY,
	})
	return from
}

const moveOver = (handle: HTMLElement, onto: Element) => {
	fireEvent.pointerMove(handle, { ...POINTER, ...centreOf(onto) })
}

const dropOver = (handle: HTMLElement, onto: Element) => {
	fireEvent.pointerUp(handle, { ...POINTER, ...centreOf(onto) })
	fireEvent.click(handle)
}

const ICON_SVG = 'svg:not([data-slot="space-avatar"] svg)'

const insertionOn = (root: HTMLElement) =>
	slotsIn(root, "space-insertion")[0]?.parentElement

const tintVisibleIn = (trigger: HTMLElement) =>
	slotsIn(trigger, "space-avatar")[0]?.checkVisibility()

const openMenu = async (trigger: HTMLElement) => {
	fireEvent.click(trigger)
	const menu = await settled(await screen.findByRole("menu"))
	await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
	return menu
}

const SwitcherLine = (props: SpaceSwitcherProps) => (
	<div className={TITLE_BAR_LINE}>
		<SpaceSwitcher {...props} />
	</div>
)

type LiveSwitcherProps = {
	spaces: Space[]
	badgesBySpaceId?: Record<string, BotBadge>
	onReorderSpaces?: (ids: string[]) => void
}

const LiveSwitcher = ({
	spaces,
	badgesBySpaceId,
	onReorderSpaces,
}: LiveSwitcherProps) => {
	const [order, setOrder] = useState(spaces)
	const [selectedSpaceId, setSelectedSpaceId] = useState(spaces[0].id)

	const reorder = (ids: string[]) => {
		onReorderSpaces?.(ids)
		setOrder((held) =>
			[...held].sort(
				(one, other) => ids.indexOf(one.id) - ids.indexOf(other.id),
			),
		)
	}

	return (
		<div className="flex w-64 flex-col gap-4">
			<SwitcherLine
				badgesBySpaceId={badgesBySpaceId}
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={order}
			/>
			<SpaceDots
				badgesBySpaceId={badgesBySpaceId}
				onReorderSpaces={reorder}
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={order}
			/>
		</div>
	)
}

const reorderSpaces = fn()

const badgeOn = (root: HTMLElement) =>
	slotsIn(root, "space-switcher-badge")[0]?.dataset.badge

const middleOf = (element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	return box.top + box.height / 2
}

const dotBadges = (root: HTMLElement) =>
	slotsIn(root, "space-dot-button").map(
		(button) => slotsIn(button, "space-dot")[0]?.dataset.badge,
	)

const meta = preview.meta({
	title: "Navigation/SpaceSwitcher",
	component: SpaceSwitcher,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The control that says which space a reader is in and moves them to another one. It is a 32px ghost button in the window's title bar: the space's tint as a 10px swatch, its name in the muted 13px line, then a chevron that says it opens. Pressing it opens a single-choice menu: every space with its tint and its rank as a Cmd shortcut hint, then any waiting invitations, then a single rule over an item to create one, and nothing else. `SpaceDots` is its companion for a pinned strip, one dot per space, the open one filled with its tint and larger, the rest muted and smaller, so the reader knows how many spaces exist and where they stand without opening anything. Both take the same selection props, so a host maps its store onto `spaces` and `selectedSpaceId` once and hands the pair the same callbacks; the dots alone take `onReorderSpaces`, since the order is the reader's to set: a dot is dragged to the place its space should hold. That order is not decoration, it is which space each `⌘1`…`⌘9` reaches and the order a swipe walks, so it is reported whole, as the full list of ids, and never applied here. A single space still shows the button, since creating a second one lives in its menu, but draws no dots, there is nothing to count. Reach for this at the top of a sidebar; `AppSidebar` mounts both and adds the swipe and the Cmd+digit chords that go with them.",
			},
		},
	},
	args: {
		spaces: SPACES,
		selectedSpaceId: "vocca",
		onSelectSpace: fn(),
		onCreateSpace: fn(),
		onAcceptInvitation: fn(),
		onDeclineInvitation: fn(),
		onRetryInvitation: fn(),
		onOpenChange: fn(),
	},
	render: (args) => <SwitcherLine {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Five spaces with the second one open, in the title bar it was sized for. Check the button is 32px tall with 8px corners, that it reads as the swatch, the space's name and a 12px chevron 8px apart, that the swatch carries the space's tint on a 3px radius, and that the button is one Tab stop announcing the open space rather than the word `button`. Pick `Open` for the menu it opens, `SingleSpace` for a reader who has never made a second one. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})

		await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(within(trigger).getByText("Vocca")).toBeVisible()
		await expect(tintVisibleIn(trigger)).toBe(true)
		await expect(trigger.getBoundingClientRect().height).toBe(32)
		await expect(getComputedStyle(trigger).borderStartStartRadius).toBe("8px")
		await expect(getComputedStyle(trigger).columnGap).toBe("8px")
		const avatar = slotsIn(trigger, "space-avatar")[0]
		await expect(avatar.getBoundingClientRect().width).toBe(12)
		await expect(avatar.dataset.recipe).toBe("compact")
	},
})

export const Open = meta.story({
	args: { hostBySpaceId: { vocca: "up" } },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The menu the press opens, on a joined space, which is the only place a space is chosen or created. Check the spaces are a single-choice group, one mark on the open one and arrows walking the whole list, that each row carries its tint and its rank as `⌘1`…`⌘5`, and that one rule then `Create a space` close the menu with nothing after it: no `Share`, no `Move up`, no `Move down`, no space settings and no `Leave space`, since the rail's Space logo opens the settings and the dots carry the order. Choosing a row reports the id and closes. Pick `Default` for the resting button. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const menu = await openMenu(
			canvas.getByRole("button", { name: /^Change space, Vocca open/ }),
		)

		const spaces = within(menu).getAllByRole("menuitemradio")
		await expect(spaces).toHaveLength(SPACES.length)
		for (const [rank, space] of SPACES.entries()) {
			await expect(spaces[rank]).toHaveAccessibleName(
				new RegExp(`^${space.name}`),
			)
		}
		await expect(spaces[1]).toHaveAttribute("aria-checked", "true")
		await expect(spaces[0]).toHaveAttribute("aria-checked", "false")
		await expect(within(menu).getByText("⌘1")).toBeInTheDocument()
		await expect(within(menu).getByText("⌘5")).toBeInTheDocument()

		const items = within(menu).getAllByRole("menuitem")
		await expect(items).toHaveLength(1)
		await expect(items[0]).toHaveAccessibleName("Create a space")
		for (const removed of [
			"Share",
			"Move up",
			"Move down",
			/space settings/i,
			"Leave space",
		]) {
			await expect(
				within(menu).queryByRole("menuitem", { name: removed }),
			).toBeNull()
		}
		const rules = within(menu).getAllByRole("separator")
		await expect(rules).toHaveLength(1)
		await expect(rules[0].nextElementSibling).toBe(items[0])
		await expect(items[0]).toBe(menu.lastElementChild)

		await userEvent.click(items[0])
		await expect(args.onCreateSpace).toHaveBeenCalled()

		await openMenu(canvas.getByRole("button", { name: /^Change space/ }))
		await userEvent.click(screen.getAllByRole("menuitemradio")[3])
		await expect(args.onSelectSpace).toHaveBeenCalledWith("veille")
	},
})

export const Keyboard = meta.story({
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The same menu reached without a pointer, which is the path a press-to-open trigger usually forgets. Check Enter on the button opens the menu and moves focus into it, that the first arrow reaches the first row and the next walks on, Enter reports the space under focus, and Escape closes the menu and hands focus back to the button rather than to the page. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		const menu = await settled(await screen.findByRole("menu"))
		await waitFor(() =>
			expect(menu.contains(document.activeElement)).toBe(true),
		)

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() =>
			expect(within(menu).getAllByRole("menuitemradio")[0]).toHaveFocus(),
		)

		await userEvent.keyboard("{ArrowDown}{Enter}")
		await expect(args.onSelectSpace).toHaveBeenCalledWith("vocca")

		await openMenu(trigger)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await expect(trigger).toHaveFocus()
	},
})

export const SingleSpace = meta.story({
	args: { spaces: [SPACES[0]], selectedSpaceId: "perso" },
	render: (args) => <LiveSwitcher spaces={args.spaces} />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A reader who has only ever had one space — the state every account opens in. Check the button still draws the name and still opens its menu, since creating the second space lives there, that no dot strip is drawn at all — a single dot would say nothing and would invite a press that changes nothing — and that a single rule sits between the list and `Create a space`. Pick `WithDots` for the strip once a second space exists. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})

		await expect(trigger).toBeVisible()
		await expect(slotsIn(canvasElement, "space-dots")).toHaveLength(0)

		const menu = await openMenu(trigger)
		await expect(within(menu).getAllByRole("separator")).toHaveLength(1)

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const Colourless = meta.story({
	args: {
		spaces: [
			{ id: "perso", name: "Perso", avatarSeed: "perso" },
			{ id: "vocca", name: "Vocca", avatarSeed: "vocca" },
			SPACES[2],
		],
		selectedSpaceId: "perso",
	},
	render: (args) => <LiveSwitcher spaces={args.spaces} />,
	parameters: {
		docs: {
			description: {
				story:
					"Spaces carrying no colour, which is what a space is created as. Check that their dots wear the muted neutral the strip already gives a closed space rather than borrowing a tint, that the open one is told apart by its shape — a horizontal pill at full weight where the closed ones stay muted circles — and that a coloured space beside them still shows its tint once opened. Pick `WithDots` for a strip where every space is tinted. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [open, ...closed] = stripDotsIn(canvasElement)

		await expect(open.style.backgroundColor).toBe("")
		for (const dot of closed) {
			await expect(dot.style.backgroundColor).toBe("")
			await expect(open.offsetWidth).toBeGreaterThan(dot.offsetWidth)
		}
	},
})

export const WithDots = meta.story({
	render: (args) => <LiveSwitcher spaces={args.spaces} />,
	parameters: {
		docs: {
			description: {
				story:
					"The button and its dot strip driven by one selection, which is how a sidebar mounts them. Check that pressing a dot moves the button's name with it, that the open dot is the only pill in a row of circles so the state never rests on colour alone, and that every dot is a named stop for a screen reader instead of an anonymous circle. Pick `Open` for the menu, `SingleSpace` for the strip's absent case. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const dots = slotsIn(canvasElement, "space-dot-button")
		await expect(dots).toHaveLength(SPACES.length)
		await expect(dots[0]).toHaveAttribute("aria-current", "true")

		await userEvent.click(dots[3])
		await expect(
			canvas.getByRole("button", { name: "Change space, Veille open" }),
		).toBeVisible()
		await expect(slotsIn(canvasElement, "space-dot-button")[3]).toHaveAttribute(
			"aria-current",
			"true",
		)
	},
})

export const Badges = meta.story({
	args: { badgesBySpaceId: BADGES },
	render: (args) => (
		<LiveSwitcher badgesBySpaceId={args.badgesBySpaceId} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Three of the five spaces carrying a badge while the reader sits in a fourth, which is how a companion working out of sight reaches them. Check every badged dot keeps its space's tint at its centre and wears the badge as a ring around it — the mark says something happened there, the tint still says which space it is — that the dots of the spaces with nothing stay exactly as they are drawn without badges, and that the button takes one mark of its own for the strongest badge waiting elsewhere, attention over failed, a done staying on its dot and off the button, drawn on the name's line and level with the middle of the letters so the name and the mark read as one pair. The marks are drawn and never spoken: the button's accessible name is still the open space, since a reader who moves there meets the rows that carry the news. Pick `BadgeRanking` for the order under a quieter set, `BadgeDoneElsewhere` for a done alone, `BadgeHere` for the badge that belongs to the space already open. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})

		await expect(badgeOn(trigger)).toBe("attention")

		const name = slotsIn(canvasElement, "space-switcher-name")[0]
		const badge = slotsIn(canvasElement, "space-switcher-badge")[0]
		await expect(middleOf(badge)).toBeCloseTo(middleOf(name), 0)

		await expect(dotBadges(canvasElement)).toEqual([
			"done",
			undefined,
			"failed",
			"attention",
			undefined,
		])
	},
})

export const BadgeRanking = meta.story({
	args: { badgesBySpaceId: { perso: "done", atelier: "failed" } },
	parameters: {
		docs: {
			description: {
				story:
					"Two spaces waiting, one done and one failed, with neither one open. Check the button wears the failed mark: a run that broke asks for the reader, a run that finished never marks the button, and the button has room for one mark only. Pick `Badges` for the full order with attention in it, `BadgeDoneElsewhere` for a done alone. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			badgeOn(canvas.getByRole("button", { name: "Change space, Vocca open" })),
		).toBe("failed")
	},
})

export const BadgeDoneElsewhere = meta.story({
	args: { badgesBySpaceId: { atelier: "done" } },
	render: (args) => (
		<LiveSwitcher badgesBySpaceId={args.badgesBySpaceId} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The only news in the account is a run that finished in a space the reader does not have open. Check the button carries no mark and its name is the open space alone: a done asks nothing of the reader, and a mark here read as news about the space already open. Its own dot in the strip still wears the done ring, so the news is not lost. Pick `BadgeRanking` for the failed mark a done never replaces. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})

		await expect(badgeOn(trigger)).toBeUndefined()
		await expect(dotBadges(canvasElement)).toEqual([
			undefined,
			undefined,
			"done",
			undefined,
			undefined,
		])
	},
})

export const BadgeHere = meta.story({
	args: { badgesBySpaceId: { vocca: "attention" } },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The only badge in the account belongs to the space the reader already has open. Check the button is left unmarked — the roster under it is already showing the companion that raised it, and a mark here would send the reader looking for a space that does not exist — while the space's own row in the menu still carries the ring, so the badge is not lost. Pick `Badges` for the mark the button takes when the news is elsewhere. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})

		await expect(badgeOn(trigger)).toBeUndefined()

		const menu = await openMenu(trigger)
		const open = within(menu).getAllByRole("menuitemradio")[1]
		await expect(slotsIn(open, "space-avatar")[0]?.dataset.attention).toBe("")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const BadgeAndLongName = meta.story({
	args: {
		spaces: LONG_SPACES,
		selectedSpaceId: "perso",
		badgesBySpaceId: { vocca: "attention" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space named as a sentence while another one is asking for the reader — the pair that puts the mark and the truncation on the same edge. Check the name gives way to the badge instead of running under it: the clipped end and its ellipsis stop before the mark on the same line, the mark keeps its full size rather than being squeezed, and the button still holds the width it had. Pick `LongContent` for the same name with nothing waiting, `Badges` for the mark on names that fit. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })
		const name = slotsIn(canvasElement, "space-switcher-name")[0]
		const badge = slotsIn(canvasElement, "space-switcher-badge")[0]

		const badgeBox = badge.getBoundingClientRect()

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
			badgeBox.left,
		)
		await expect(badgeBox.width).toBeCloseTo(8, 0)
		await expect(trigger.getBoundingClientRect().width).toBeLessThan(256)
	},
})

export const LongContent = meta.story({
	args: { spaces: LONG_SPACES, selectedSpaceId: "perso" },
	parameters: {
		docs: {
			description: {
				story:
					"A space named as a sentence, which is what happens when a reader treats the field as a note. Check the button clips the name with an ellipsis instead of pushing the trailing icon slot off the line or wrapping the header to two rows, and that the accessible name still carries the whole thing. Pick `Default` for names that fit. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })
		const line = canvasElement.querySelector<HTMLElement>(
			'[data-slot="space-switcher-name"]',
		)
		if (!line) throw new Error("Nothing here draws the space name")

		await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
		await expect(trigger.getBoundingClientRect().width).toBeLessThan(256)
	},
})

export const DragDotToPlace = meta.story({
	render: (args) => (
		<LiveSwitcher onReorderSpaces={reorderSpaces} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Placing a space by hand. A press on a dot that then moves lifts it: the dot comes off the strip a size larger with a shadow under it and follows the pointer, while the strip keeps every dot where it stood — the order is the host's to redraw, so nothing is torn out of the row on the strength of a gesture that has not landed yet. A line is drawn at the boundary the space would take, on the leading edge of the dot it would sit before, or on the trailing edge of the last one when it has passed them all. The dot under the pointer is what decides the place, never the pointer's distance from the row's start, so the gesture reads the same on a row that has wrapped onto three lines — `WrappedDots` is that case. Releasing reports the full new order of ids and nothing else: the open space stays open, the tints and the badges stay with their spaces, and the click a release would otherwise fire is swallowed so a drag never doubles as a selection. Pick `DragDotNowhere` for every way the gesture ends in nothing. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		reorderSpaces.mockClear()
		const handle = dotsIn(canvasElement)[0]
		const from = liftBy(handle, 12)

		await expect(getComputedStyle(handle).pointerEvents).toBe("none")
		await expect(centreOf(handle).clientX - from.clientX).toBeCloseTo(12, 0)
		await expect(dotNames(canvasElement)).toEqual(RESTING_NAMES)

		moveOver(handle, dotsIn(canvasElement)[3])
		await expect(insertionOn(canvasElement)).toBe(dotsIn(canvasElement)[4])

		dropOver(handle, dotsIn(canvasElement)[3])
		await expect(reorderSpaces).toHaveBeenCalledWith([
			"vocca",
			"atelier",
			"veille",
			"perso",
			"archives",
		])
		await waitFor(async () => {
			await expect(dotNames(canvasElement)).toEqual([
				"Open Vocca",
				"Open Atelier",
				"Open Veille",
				"Open Perso",
				"Open Archives",
			])
		})
		await expect(insertionOn(canvasElement)).toBeUndefined()

		const last = dotsIn(canvasElement)[4]
		liftBy(last, -12)
		moveOver(last, dotsIn(canvasElement)[0])
		await expect(insertionOn(canvasElement)).toBe(dotsIn(canvasElement)[0])

		dropOver(last, dotsIn(canvasElement)[0])
		await expect(reorderSpaces).toHaveBeenLastCalledWith([
			"archives",
			"vocca",
			"atelier",
			"veille",
			"perso",
		])
	},
})

export const DragDotNowhere = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<LiveSwitcher onReorderSpaces={reorderSpaces} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every way a lift ends in nothing. A press that never moves is still the plain click that opens the space, so the gesture costs the reader nothing to start. A dot released where it already stood reports nothing rather than a list identical to the one the host already holds. A release away from the row reports nothing and leaves the order as it stands. An interrupted pointer — a stream the browser takes back, a touch turned into a scroll — puts the dot down where it was and reports nothing, rather than filing it wherever the last move happened to be. Check all four, and that no lift starts at all from a press that carries a right button.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		reorderSpaces.mockClear()
		const handle = dotsIn(canvasElement)[2]

		await userEvent.click(handle)
		await expect(handle).toHaveAttribute("aria-current", "true")
		await expect(reorderSpaces).not.toHaveBeenCalled()

		const from = liftBy(handle, 10)
		await expect(getComputedStyle(handle).pointerEvents).toBe("none")
		fireEvent.pointerCancel(handle, POINTER)
		await expect(getComputedStyle(handle).pointerEvents).not.toBe("none")
		await expect(reorderSpaces).not.toHaveBeenCalled()

		liftBy(handle, 10)
		fireEvent.pointerUp(handle, { ...POINTER, ...from })
		await expect(reorderSpaces).not.toHaveBeenCalled()

		liftBy(handle, 10)
		fireEvent.pointerMove(handle, { ...POINTER, clientX: 4, clientY: 4 })
		await expect(insertionOn(canvasElement)).toBeUndefined()
		fireEvent.pointerUp(handle, { ...POINTER, clientX: 4, clientY: 4 })
		await expect(reorderSpaces).not.toHaveBeenCalled()

		fireEvent.pointerDown(handle, { ...POINTER, ...from, button: 2 })
		moveOver(handle, dotsIn(canvasElement)[0])
		await expect(getComputedStyle(handle).pointerEvents).not.toBe("none")
		await expect(dotNames(canvasElement)).toEqual(RESTING_NAMES)
	},
})

export const WrappedDots = meta.story({
	args: { spaces: MANY_SPACES, selectedSpaceId: "perso" },
	render: (args) => (
		<div className={NARROW_STRIP}>
			<SpaceDots {...args} onReorderSpaces={reorderSpaces} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Nine spaces in a strip too narrow to hold them, which is the sidebar at its most crowded. Check the row wraps onto further lines instead of shrinking the dots or scrolling sideways, and that a lift reads the dot under the pointer rather than how far the pointer has travelled from the row's start: the first dot of the second line sits at the same distance from that start as the first dot of the first line, and dropping on it must place the space there and nowhere else. Pick `DragDotToPlace` for the gesture on a row that fits on one line. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		reorderSpaces.mockClear()
		const tops = dotsIn(canvasElement).map((dot) =>
			Math.round(dot.getBoundingClientRect().top),
		)
		const wrapped = tops.findIndex((top) => top > tops[0])
		await expect(wrapped).toBeGreaterThan(0)

		const handle = dotsIn(canvasElement)[0]
		const below = dotsIn(canvasElement)[wrapped]
		await expect(centreOf(below).clientX).toBe(centreOf(handle).clientX)

		liftBy(handle, 12)
		moveOver(handle, below)
		await expect(insertionOn(canvasElement)).toBe(
			dotsIn(canvasElement)[wrapped + 1],
		)

		const expected = MANY_SPACES.map((space) => space.id).filter(
			(id) => id !== "perso",
		)
		expected.splice(wrapped, 0, "perso")

		dropOver(handle, below)
		await expect(reorderSpaces).toHaveBeenCalledWith(expected)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

const HOSTS: Record<string, SpaceHost> = {
	vocca: "up",
	atelier: "shared",
	veille: "down",
	archives: "connecting",
}

const LONG_HOSTED_SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: BLOT_HUES.blue, avatarSeed: "perso" },
	{
		id: "vocca",
		name: "Everything the team has not filed anywhere else yet",
		avatarSeed: "vocca",
	},
	{
		id: "veille",
		name: "Reading list shared with the whole studio this quarter",
		avatarSeed: "veille",
	},
]

const MOCKUP =
	"Measured against the Paper page `Mockup`, light on the left and dark on the right through the side-by-side theme layout."

const triggersIn = (root: HTMLElement) =>
	within(root).getAllByRole("button", { name: /^Change space/ })

const openMenuLikeItsTheme = async (trigger: HTMLElement) => {
	const before = screen.queryAllByRole("menu")
	fireEvent.click(trigger)
	const menu = await settled(
		await waitFor(() => {
			const opened = screen
				.getAllByRole("menu")
				.find((held) => !before.includes(held))
			if (!opened) throw new Error("The menu has not opened yet")
			return opened
		}),
	)
	menu.parentElement?.classList.toggle(
		"dark",
		Boolean(trigger.closest(".dark")),
	)
	return menu
}

const rowNamed = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("menuitemradio", { name: new RegExp(`^${name}`) })

const shortcutOf = (row: HTMLElement) =>
	slotsIn(row, "context-menu-shortcut")[0]

const AVATAR_STATE_OF_HOST: Record<SpaceHost, string> = {
	shared: "shared",
	up: "online",
	connecting: "connecting",
	down: "offline",
}

const MENU_DOT = 12

const ROW_AVATAR = 26

const ROW_HEIGHT = 40

const TRIGGER_DOT = 6.857

const avatarOn = (root: HTMLElement) => slotsIn(root, "space-avatar")[0]

const presenceDotOn = (root: HTMLElement) =>
	slotsIn(root, "space-avatar-dot")[0]

const expectRowAvatar = async (root: HTMLElement, host: SpaceHost | null) => {
	const avatar = avatarOn(root)
	await expect(avatar.dataset.state).toBe(
		host ? AVATAR_STATE_OF_HOST[host] : "local",
	)
	const row = root.getBoundingClientRect()
	const corner = avatar.getBoundingClientRect()
	await expect(row.height).toBe(ROW_HEIGHT)
	await expect(corner.width).toBe(ROW_AVATAR)
	await expect(corner.top - row.top).toBe((ROW_HEIGHT - ROW_AVATAR) / 2)
	await expect(slotsIn(root, "host-pill")).toHaveLength(0)
	if (host !== "up" && host !== "shared") {
		await expect(presenceDotOn(root)).toBeUndefined()
		return
	}
	const box = presenceDotOn(root).getBoundingClientRect()
	await expect(box.width).toBe(MENU_DOT)
	await expect(corner.right - (box.left + box.width / 2)).toBeCloseTo(
		0.36 * MENU_DOT,
		1,
	)
	await expect(corner.bottom - (box.top + box.height / 2)).toBeCloseTo(
		0.36 * MENU_DOT,
		1,
	)
}

const expectNameShown = async (name: HTMLElement) => {
	await expect(name.getBoundingClientRect().width).toBeGreaterThan(0)
	await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
}

const ROW_STATES: [string, SpaceHost | null][] = [
	["Perso", null],
	["Vocca", "up"],
	["Atelier", "shared"],
	["Veille", "down"],
	["Archives", "connecting"],
]

const expectRowDots = async (menu: HTMLElement) => {
	for (const [name, host] of ROW_STATES) {
		const row = rowNamed(menu, name)
		await expectNameShown(within(row).getByText(name))
		await expectRowAvatar(row, host)
		await expect(row.querySelectorAll(ICON_SVG)).toHaveLength(
			row.getAttribute("aria-checked") === "true" ? 1 : 0,
		)
	}
	await expect(
		within(menu).queryByText(/Unreachable|Remote|Connected/),
	).toBeNull()
}

const expectCreateLast = async (menu: HTMLElement) => {
	await expect(
		within(menu).queryByRole("menuitem", { name: "Join a space" }),
	).toBeNull()
	await expect(
		within(menu).queryByRole("menuitem", { name: "Leave space" }),
	).toBeNull()
	const create = within(menu).getByRole("menuitem", { name: "Create a space" })
	await expect(create).toBe(menu.lastElementChild)
	await expect(create.previousElementSibling).toHaveAttribute(
		"role",
		"separator",
	)
	await expect(within(menu).getAllByRole("separator")).toHaveLength(1)
}

const SIDE_BY_SIDE_MENU_A11Y = mergeA11y(
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
)

export const ThemesLocalSpaceMenu = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { hostBySpaceId: HOSTS, selectedSpaceId: "perso" },
	parameters: {
		a11y: SIDE_BY_SIDE_MENU_A11Y,
		docs: {
			description: {
				story: `${MOCKUP} The menu of a local space beside shared and joined ones (A7 rows). Check every 40px row carries its 26px SpaceAvatar, 7px from the row top, in the state of its host: the grey laptop badge for the local row, the 12px green dot cut out of the bottom end corner for the shared and the reachable rows, lines for the connecting one and hatched greys under a crossed red dot for the one that does not answer, every name shown in full and no state pill: the avatar is the only connection signal, and assistive technology reads the state after the name. No globe and no \`Unreachable\` remain, and a single rule then \`Create a space\` close the menu. Pick \`ThemesJoinedSpaceMenu\` for the menu of a joined space.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [light, dark] = triggersIn(canvasElement)
		for (const trigger of [light, dark]) {
			await expect(trigger).toHaveAccessibleName("Change space, Perso open")
			await expect(avatarOn(trigger).dataset.state).toBe("local")
		}
		await expect(slotsIn(canvasElement, "host-pill")).toHaveLength(0)

		for (const trigger of [light, dark]) {
			const menu = await openMenuLikeItsTheme(trigger)
			await expectRowDots(menu)
			await expectCreateLast(menu)
		}
	},
})

export const ThemesJoinedSpaceMenu = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { hostBySpaceId: HOSTS, selectedSpaceId: "veille" },
	parameters: {
		a11y: SIDE_BY_SIDE_MENU_A11Y,
		docs: {
			description: {
				story: `${MOCKUP} The menu of a joined space whose host does not answer. Check the open row keeps its mark and its muted dot and stays choosable, that the rows read their state to assistive technology after their name, and that the menu still closes on a rule then \`Create a space\`, with no \`Leave space\`: leaving lives in the space settings the rail's Space logo opens. Pick \`ThemesLocalSpaceMenu\` for the menu of a local space.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [light, dark] = triggersIn(canvasElement)

		for (const trigger of [light, dark]) {
			const menu = await openMenuLikeItsTheme(trigger)
			await expectRowDots(menu)
			const open = rowNamed(menu, "Veille")
			await expect(open).toHaveAttribute("aria-checked", "true")
			await expect(open).toHaveAccessibleName(/^Veille Not connected/)
			await expectCreateLast(menu)
		}
	},
})

const TITLE_BAR_HOSTS: [string, string, SpaceHost, string][] = [
	["atelier", "Atelier", "shared", "Shared"],
	["vocca", "Vocca", "up", "Online"],
	["archives", "Archives", "connecting", "Connecting…"],
	["veille", "Veille", "down", "Not connected"],
]

export const ThemesTitleBarHosts = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { hostBySpaceId: HOSTS },
	parameters: {
		docs: {
			description: {
				story: `${MOCKUP} The button in the title bar on a Space shared from this computer, a joined Space online, one connecting and one whose host does not answer. Check each line shows the Space name in full beside its avatar in the state of its host, that no state pill sits beside the button, and that the button names the state after the Space for assistive technology. Pick \`ThemesLocalSpaceMenu\` for the rows of the menu.`,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-2">
			{TITLE_BAR_HOSTS.map(([id]) => (
				<SwitcherLine key={id} {...args} selectedSpaceId={id} />
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		for (const [, name, host, label] of TITLE_BAR_HOSTS) {
			const triggers = within(canvasElement).getAllByRole("button", {
				name: `Change space, ${name} open, ${label}`,
			})
			await expect(triggers).toHaveLength(2)
			for (const trigger of triggers) {
				await expectNameShown(slotsIn(trigger, "space-switcher-name")[0])
				await expect(avatarOn(trigger).dataset.state).toBe(
					AVATAR_STATE_OF_HOST[host],
				)
			}
		}
		await expect(slotsIn(canvasElement, "host-pill")).toHaveLength(0)
	},
})

export const HostedLongNames = meta.story({
	args: {
		spaces: LONG_HOSTED_SPACES,
		hostBySpaceId: { vocca: "up", veille: "down" },
		selectedSpaceId: "perso",
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Joined spaces named as sentences, which their owner chose and the reader cannot shorten. Check each name clips to one line with an ellipsis while the avatar, its presence dot and the shortcut keep their full size inside the row. Pick `LongContent` for a long local name on the button.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const menu = await openMenu(
			canvas.getByRole("button", { name: /^Change space/ }),
		)

		for (const [name, host] of [
			["Everything", "up"],
			["Reading", "down"],
		] as const) {
			const row = rowNamed(menu, name)
			const label = within(row).getByText(new RegExp(`^${name}`))
			await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
			const end = row.getBoundingClientRect().right
			await expect(shortcutOf(row).getBoundingClientRect().right).toBeLessThan(
				end,
			)
			await expectRowAvatar(row, host)
		}

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

const EXPIRES_AT = new Date(2026, 9, 25).getTime()

const INVITED: Omit<SpaceInvitation, "state"> = {
	id: "studio",
	name: "Studio",
	colour: BLOT_HUES.blue,
	hostEmail: "noa@example.com",
	hostName: "Noa",
	expiresAt: EXPIRES_AT,
}

const SECOND_INVITED: Omit<SpaceInvitation, "state"> = {
	id: "atelier-sud",
	name: "Atelier Sud",
	colour: BLOT_HUES.cyan,
	hostEmail: "marc@example.com",
}

const PERSONAL: Space = {
	id: "personal",
	name: "Personal",
	colour: BLOT_HUES.green,
	avatarSeed: "personal",
}

const PERSONAL_OPEN = {
	spaces: [PERSONAL],
	selectedSpaceId: PERSONAL.id,
}

const JOINED_SPACES: Space[] = [
	PERSONAL,
	{
		id: "studio",
		name: "Studio",
		colour: BLOT_HUES.blue,
		avatarSeed: "studio",
	},
]

const INVITED_ARTBOARD =
	"Measured against the Paper page `Join an invited Space`, dark only."

const DARK = { theme: "dark" } as const

const openSwitcher = (root: HTMLElement) =>
	openMenu(within(root).getByRole("button", { name: /^Change space/ }))

const invitationsIn = (menu: HTMLElement) => slotsIn(menu, "space-invitation")

const invitationNamed = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("group", { name })

const causeOf = (row: HTMLElement) => slotsIn(row, "space-invitation-cause")[0]

const hostLineOf = (row: HTMLElement) => within(row).getByText(/^Invited by /)

const expiryLineOf = (row: HTMLElement) => within(row).queryByText(/^Expires /)

const invitationDotOn = (root: HTMLElement) =>
	slotsIn(root, "space-switcher-invitation")[0]

const expectInvitationDot = async (trigger: HTMLElement) => {
	const dot = invitationDotOn(trigger)
	await expect(dot).toHaveAttribute("aria-hidden", "true")
	const box = dot.getBoundingClientRect()
	const frame = trigger.getBoundingClientRect()
	await expect(box.width).toBe(7)
	await expect(box.top - frame.top).toBe(5)
	await expect(frame.right - box.right).toBe(2)
}

const expectGroupBetweenSpacesAnd = async (menu: HTMLElement, next: string) => {
	const group = slotsIn(menu, "space-invitations")[0]
	await expect(group.previousElementSibling).toHaveAttribute(
		"role",
		"separator",
	)
	await expect(
		group.previousElementSibling?.previousElementSibling,
	).toHaveAttribute("role", "group")
	await expect(group.nextElementSibling).toHaveAttribute("role", "separator")
	await expect(
		group.nextElementSibling?.nextElementSibling,
	).toHaveAccessibleName(next)
	await expect(within(group).getByText("Invitations")).toBeVisible()
}

const focusByArrows = async (
	target: HTMLElement,
	press: (keys: string) => Promise<void>,
) => {
	for (let step = 0; step < 12 && document.activeElement !== target; step++) {
		await press("{ArrowDown}")
	}
	await expect(target).toHaveFocus()
}

const expectFailedRow = async (
	row: HTMLElement,
	cause: string,
	onRetry: unknown,
	click: (element: Element) => Promise<void>,
) => {
	const line = causeOf(row)
	await expect(line).toHaveTextContent(cause)
	await expect(row).toHaveAccessibleDescription(cause)
	const icon = line.querySelector("svg")
	if (!icon) throw new Error("The cause line draws no alert icon")
	await expect(icon.getBoundingClientRect().width).toBe(14)
	await expect(getComputedStyle(icon).color).toBe(getComputedStyle(line).color)
	await expect(getComputedStyle(line).color).not.toBe(
		getComputedStyle(hostLineOf(row)).color,
	)
	const retry = within(row).getByRole("menuitem", { name: "Try again" })
	await expect(retry).toHaveAccessibleDescription(cause)
	await expect(within(retry).getByRole("status")).toHaveTextContent("Try again")
	await expect(expiryLineOf(row)).toBeNull()
	await expect(retry.tagName).toBe("BUTTON")
	await expect(
		within(row).getByRole("menuitem", { name: "Decline" }),
	).not.toHaveAttribute("aria-disabled", "true")
	await click(retry)
	await expect(onRetry).toHaveBeenCalledWith(INVITED.id)
	await expect(screen.getByRole("menu")).toBeVisible()
}

const FREE_HUE = 210

const FREE_HUE_SPACES = SPACES.map((space) =>
	space.id === "vocca" ? { ...space, colour: FREE_HUE } : space,
)

export const FreeHue = meta.story({
	args: {
		spaces: FREE_HUE_SPACES,
		invitations: [{ ...INVITED, colour: FREE_HUE, state: "waiting" }],
	},
	render: (args) => (
		<div className="flex w-64 flex-col gap-4">
			<SwitcherLine {...args} />
			<SpaceDots
				onSelectSpace={args.onSelectSpace}
				selectedSpaceId={args.selectedSpaceId}
				spaces={args.spaces}
			/>
		</div>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Vocca open at a hue outside the eight presets, 210, with an invitation to a Space at that hue. Check that the swatch, the open dot and the invitation's mark wear 210 rather than the nearest preset. Pick `Default` for preset hues.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [swatch] = slotsIn(canvasElement, "space-avatar")
		await expect(swatch).toHaveAttribute("data-colour", String(FREE_HUE))
		const openDot = slotsIn(canvasElement, "space-dot").find(
			(dot) => dot.dataset.hue !== undefined,
		)
		await expect(openDot).toHaveAttribute("data-hue", String(FREE_HUE))

		const menu = await openSwitcher(canvasElement)
		const [invitation] = invitationsIn(menu)
		if (!invitation) throw new Error("The invitation is missing")
		await expect(slotsIn(invitation, "space-avatar")[0]).toHaveAttribute(
			"data-colour",
			String(FREE_HUE),
		)
	},
})

export const InvitationAtRest = meta.story({
	globals: DARK,
	name: "3 Invitation waiting, menu closed",
	args: { ...PERSONAL_OPEN, invitations: [{ ...INVITED, state: "waiting" }] },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3 of the Mockup page: Tom has one Space, Personal, and the Studio invitation waits. At rest the menu is closed and the trigger shows Personal with the invitation dot on its top end corner, and names the invitation. Pick `M2InvitationWaiting` for the open menu.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectInvitationDot(
			within(canvasElement).getByRole("button", {
				name: "Change space, Personal open, 1 invitation",
			}),
		)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

export const M1NoInvitation = meta.story({
	globals: DARK,
	name: "M1 No invitation",
	args: PERSONAL_OPEN,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M1: no invitation is waiting, so the switcher is the one on main, and the one a decline brings back. Check the trigger carries no invitation dot and its name says nothing of invitations, and that the menu holds no Invitations group.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: "Change space, Personal open",
		})
		await expect(invitationDotOn(trigger)).toBeUndefined()
		const menu = await openSwitcher(canvasElement)
		await expect(slotsIn(menu, "space-invitations")).toHaveLength(0)
		await expect(within(menu).getAllByRole("separator")).toHaveLength(1)
	},
})

export const M2InvitationWaiting = meta.story({
	globals: DARK,
	name: "M2 Invitation waiting",
	args: { ...PERSONAL_OPEN, invitations: [{ ...INVITED, state: "waiting" }] },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M2, artboard 3.1 of the Mockup page: one invitation waits. Check the 7px primary dot sits on the trigger's top end corner and the trigger names it, that the 280px menu places a rule then an Invitations group between Personal and Create a space, that the row reads the Space name (14/20) over who invited and when it expires (12/16), and that Accept and Decline, 28px tall with a 12px radius in 13px medium and indented 18px under the ring, are real buttons the arrow keys reach, each reporting the invitation id.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: "Change space, Personal open, 1 invitation",
		})
		await expectInvitationDot(trigger)

		const menu = await openSwitcher(canvasElement)
		await expect(menu.getBoundingClientRect().width).toBe(280)
		await expectGroupBetweenSpacesAnd(menu, "Create a space")
		const row = invitationNamed(menu, INVITED.name)
		await expect(hostLineOf(row)).toHaveTextContent(
			`Invited by ${INVITED.hostEmail}`,
		)
		const expiry = expiryLineOf(row)
		await expect(expiry).toHaveTextContent("Expires Oct 25")
		await expect(expiry?.previousElementSibling).toBe(hostLineOf(row))
		for (const line of [hostLineOf(row), expiry]) {
			if (!line) throw new Error("The invitation row lost a line")
			await expect(getComputedStyle(line).fontSize).toBe("12px")
			await expect(getComputedStyle(line).lineHeight).toBe("16px")
		}
		const name = within(row).getByText(INVITED.name)
		await expect(getComputedStyle(name).fontSize).toBe("14px")
		await expect(getComputedStyle(name).lineHeight).toBe("20px")

		const accept = within(row).getByRole("menuitem", { name: "Accept" })
		await expect(accept.tagName).toBe("BUTTON")
		const ring = avatarOn(row)
		for (const action of [
			accept,
			within(row).getByRole("menuitem", { name: "Decline" }),
		]) {
			const style = getComputedStyle(action)
			await expect(action.getBoundingClientRect().height).toBe(28)
			await expect(style.borderRadius).toBe("12px")
			await expect(style.fontSize).toBe("13px")
			await expect(style.fontWeight).toBe("500")
		}
		await expect(
			accept.getBoundingClientRect().left - ring.getBoundingClientRect().left,
		).toBe(22)

		await focusByArrows(accept, userEvent.keyboard)
		await userEvent.keyboard("{Enter}")
		await expect(args.onAcceptInvitation).toHaveBeenCalledWith(INVITED.id)
		await expect(screen.getByRole("menu")).toBeVisible()

		const decline = within(row).getByRole("menuitem", { name: "Decline" })
		await expect(decline.tagName).toBe("BUTTON")
		await userEvent.keyboard("{ArrowDown}")
		await expect(decline).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onDeclineInvitation).toHaveBeenCalledWith(INVITED.id)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const M3TwoInvitationsWaiting = meta.story({
	globals: DARK,
	name: "M3 Two invitations waiting",
	args: {
		...PERSONAL_OPEN,
		invitations: [
			{ ...INVITED, state: "waiting" },
			{ ...SECOND_INVITED, state: "waiting" },
		],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M3: two invitations wait, stacked in the order given, each with its own pair of buttons. Check the trigger counts both and that each pair reports its own invitation.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: "Change space, Personal open, 2 invitations",
		})
		await expectInvitationDot(trigger)
		const menu = await openSwitcher(canvasElement)
		const rows = invitationsIn(menu)
		await expect(rows).toHaveLength(2)
		await expect(rows[0]).toHaveAccessibleName(INVITED.name)
		await expect(rows[1]).toHaveAccessibleName(SECOND_INVITED.name)
		await userEvent.click(
			within(rows[1]).getByRole("menuitem", { name: "Accept" }),
		)
		await expect(args.onAcceptInvitation).toHaveBeenCalledWith(
			SECOND_INVITED.id,
		)
	},
})

const SwitcherOpenedFromOutside = ({
	onOpenChange,
	...props
}: SpaceSwitcherProps) => {
	const [isOpen, setIsOpen] = useState(true)
	return (
		<SwitcherLine
			{...props}
			onOpenChange={(next) => {
				onOpenChange?.(next)
				setIsOpen(next)
			}}
			open={isOpen}
		/>
	)
}

export const OpenedOnInvitation = meta.story({
	globals: DARK,
	name: "Opened on the second invitation",
	args: {
		invitations: [
			{ ...INVITED, state: "waiting" },
			{ ...SECOND_INVITED, state: "waiting" },
		],
		focusedInvitationId: SECOND_INVITED.id,
	},
	render: (args) => <SwitcherOpenedFromOutside {...args} />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} Row 3, opened from outside: the host passes \`open\` and \`focusedInvitationId\`, as a join link does, and the menu opens with no press, anchored under the trigger exactly where a press opens it, keyboard focus on the named invitation's Accept. \`focusedInvitationId\` applies to every opening while it is set, so the host clears it once the menu closes. Check it opens on its own, that focus sits on the second Accept and the arrow keys walk on from it, that Escape reports \`onOpenChange(false)\`, and that a press reopens it at the same place with a single anchoring event.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const menu = await settled(await screen.findByRole("menu"))
		await expect(menu.getBoundingClientRect().width).toBe(280)
		await expectGroupBetweenSpacesAnd(menu, "Create a space")
		const rows = invitationsIn(menu)
		await expect(rows[1]).toHaveAccessibleName(SECOND_INVITED.name)
		await expect(
			within(rows[1]).getByRole("menuitem", { name: "Accept" }),
		).toHaveFocus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(
			within(rows[1]).getByRole("menuitem", { name: "Decline" }),
		).toHaveFocus()

		const openedAt = menu.getBoundingClientRect()
		await userEvent.keyboard("{Escape}")
		await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		const trigger = within(canvasElement).getByRole("button", {
			name: /^Change space/,
		})
		const anchoring = fn()
		trigger.addEventListener("contextmenu", anchoring)
		const pressed = await openSwitcher(canvasElement)
		trigger.removeEventListener("contextmenu", anchoring)
		await expect(anchoring).toHaveBeenCalledOnce()
		const pressedAt = pressed.getBoundingClientRect()
		await expect(pressedAt.left).toBe(openedAt.left)
		await expect(pressedAt.top).toBe(openedAt.top)

		const reopened = invitationsIn(pressed)
		await expect(
			within(reopened[1]).getByRole("menuitem", { name: "Accept" }),
		).toHaveFocus()
		await userEvent.keyboard("{ArrowUp}")
		await expect(
			within(reopened[0]).getByRole("menuitem", { name: "Decline" }),
		).toHaveFocus()
	},
})

export const M4Accepting = meta.story({
	globals: DARK,
	name: "M4 Accepting",
	args: { ...PERSONAL_OPEN, invitations: [{ ...INVITED, state: "accepting" }] },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M4: the invitation is being accepted. Check the primary reads Joining… at 70% opacity, Decline drops to 50%, both stay focusable but inert, the row is marked busy and the new label is spoken through its status region, and the trigger dot stays on.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectInvitationDot(
			within(canvasElement).getByRole("button", { name: /1 invitation$/ }),
		)
		const menu = await openSwitcher(canvasElement)
		const row = invitationNamed(menu, INVITED.name)
		await expect(row).toHaveAttribute("aria-busy", "true")
		const joining = within(row).getByRole("menuitem", { name: "Joining…" })
		const decline = within(row).getByRole("menuitem", { name: "Decline" })
		await expect(within(joining).getByRole("status")).toHaveTextContent(
			"Joining…",
		)
		for (const [button, opacity] of [
			[joining, "0.7"],
			[decline, "0.5"],
		] as const) {
			await expect(button).toHaveAttribute("aria-disabled", "true")
			await expect(button).not.toHaveAttribute("disabled")
			await expect(getComputedStyle(button).opacity).toBe(opacity)
			await userEvent.click(button)
		}
		await expect(args.onAcceptInvitation).not.toHaveBeenCalled()
		await expect(args.onDeclineInvitation).not.toHaveBeenCalled()
	},
})

export const M5Joined = meta.story({
	globals: DARK,
	name: "M5 Joined",
	args: {
		spaces: JOINED_SPACES,
		selectedSpaceId: "studio",
		hostBySpaceId: { studio: "up" },
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M5, artboard 3.7 of the Mockup page: the invitation is accepted and Studio is open. At rest the menu is closed and the trigger shows Studio, its 12px avatar online with the presence dot scaled down from 14px, and no invitation dot. Check that, then that the menu lists Studio under Personal with the online dot on its row's avatar and no Invitations group, and that Escape leaves the menu closed again.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: "Change space, Studio open, Online",
		})
		await expect(invitationDotOn(trigger)).toBeUndefined()
		await expect(avatarOn(trigger).dataset.state).toBe("online")
		await expect(
			presenceDotOn(trigger).getBoundingClientRect().width,
		).toBeCloseTo(TRIGGER_DOT, 2)
		const menu = await openSwitcher(canvasElement)
		await expectRowAvatar(rowNamed(menu, "Studio"), "up")
		await expect(slotsIn(menu, "space-invitations")).toHaveLength(0)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const M6Unreachable = meta.story({
	globals: DARK,
	name: "M6 Unreachable",
	args: {
		spaces: JOINED_SPACES,
		selectedSpaceId: PERSONAL.id,
		hostBySpaceId: { studio: "down" },
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M6: the joined Space's host stops answering, so its row's avatar turns to the greys of a Space not connected, its name still shown in full and no state pill beside it.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const menu = await openSwitcher(canvasElement)
		await expectRowAvatar(rowNamed(menu, "Studio"), "down")
	},
})

export const M9FailedServers = meta.story({
	globals: DARK,
	name: "M9 Failed, servers",
	args: {
		...PERSONAL_OPEN,
		invitations: [{ ...INVITED, state: "failed", failure: "servers" }],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M9: accepting failed because Kiroshi's servers did not answer. Check the destructive cause line with its 14px alert sits above Try again and Decline, that it describes both the row and Try again, whose status region speaks the switch from Joining…, and that Try again reports a retry while the menu stays open.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectInvitationDot(
			within(canvasElement).getByRole("button", { name: /1 invitation$/ }),
		)
		const menu = await openSwitcher(canvasElement)
		await expectFailedRow(
			invitationNamed(menu, INVITED.name),
			"Couldn’t accept. Kiroshi’s servers didn’t answer.",
			args.onRetryInvitation,
			userEvent.click,
		)
	},
})

export const M10FailedOffline = meta.story({
	globals: DARK,
	name: "M10 Failed, offline",
	args: {
		...PERSONAL_OPEN,
		invitations: [{ ...INVITED, state: "failed", failure: "offline" }],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M10: accepting failed because this computer is offline. Same row as M9 with the offline cause.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectInvitationDot(
			within(canvasElement).getByRole("button", { name: /1 invitation$/ }),
		)
		const menu = await openSwitcher(canvasElement)
		await expectFailedRow(
			invitationNamed(menu, INVITED.name),
			"Couldn’t accept, this computer is offline. Try again once you’re connected.",
			args.onRetryInvitation,
			userEvent.click,
		)
	},
})

export const M11Withdrawn = meta.story({
	globals: DARK,
	name: "M11 Withdrawn",
	args: { ...PERSONAL_OPEN, invitations: [{ ...INVITED, state: "withdrawn" }] },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M11: the host withdrew the invitation. Check the ring drops to the muted foreground, the name mutes, the cause line names the host, and no button is offered, while the trigger dot stays on. The row is an inert menu item the arrow keys land on, read as the Space name with the cause as its description, and highlighted like any other row.`,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectInvitationDot(
			within(canvasElement).getByRole("button", { name: /1 invitation$/ }),
		)
		const menu = await openSwitcher(canvasElement)
		const row = within(menu).getByRole("menuitem", { name: INVITED.name })
		const cause = `${INVITED.hostEmail} withdrew this invitation. Ask them to invite you again.`
		await expect(causeOf(row)).toHaveTextContent(cause)
		await expect(row).toHaveAccessibleDescription(cause)
		await expect(row).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(row).opacity).toBe("1")
		await expect(row.querySelectorAll("button, [role=menuitem]")).toHaveLength(
			0,
		)

		await focusByArrows(row, userEvent.keyboard)
		await expect(row).toHaveAccessibleName(INVITED.name)
		await expect(row).toHaveAccessibleDescription(cause)
		await userEvent.keyboard("{Enter}")
		await expect(screen.getByRole("menu")).toBeVisible()
		await expect(args.onAcceptInvitation).not.toHaveBeenCalled()
		await expect(args.onDeclineInvitation).not.toHaveBeenCalled()
		await expect(args.onRetryInvitation).not.toHaveBeenCalled()
		const name = within(row).getByText(INVITED.name)
		await expect(getComputedStyle(name).color).toBe(
			getComputedStyle(hostLineOf(row)).color,
		)
		await expect(avatarOn(row).dataset.colour).toBeUndefined()

		await expect(args.onOpenChange).toHaveBeenCalledTimes(1)
		await expect(args.onOpenChange).toHaveBeenLastCalledWith(true)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await expect(args.onOpenChange).toHaveBeenCalledTimes(2)
		await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
	},
})

export const InvitationHostOffline = meta.story({
	globals: DARK,
	name: "3.3 Waiting for host",
	args: {
		...PERSONAL_OPEN,
		invitations: [{ ...INVITED, state: "hostOffline" }],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Artboard 3.3 of the Mockup page: the inviting host's computer is offline, so the invitation waits inside its own row. Check the ring and the name mute, the expiry line goes, a 7px grey dot sits in a 14x16 slot before the offline note, which describes the row and Accept, Accept is inert at 50%, and Decline stays active.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const menu = await openSwitcher(canvasElement)
		const row = invitationNamed(menu, INVITED.name)
		const note = slotsIn(row, "space-invitation-note")[0]
		const message = "Noa’s computer is offline. You can accept once it’s back."
		await expect(note).toHaveTextContent(message)
		await expect(row).toHaveAccessibleDescription(message)
		await expect(expiryLineOf(row)).toBeNull()

		const slot = note.firstElementChild as HTMLElement
		await expect(slot).toHaveAttribute("aria-hidden", "true")
		const slotBox = slot.getBoundingClientRect()
		await expect([slotBox.width, slotBox.height]).toEqual([14, 16])
		const dot = slot.firstElementChild as HTMLElement
		await expect(dot.getBoundingClientRect().width).toBe(7)
		await expect(getComputedStyle(dot).backgroundColor).toBe(
			probedStyleOf("bg-presence-offline", "backgroundColor", menu),
		)

		await expect(avatarOn(row).dataset.colour).toBeUndefined()
		await expect(
			getComputedStyle(within(row).getByText(INVITED.name)).color,
		).toBe(getComputedStyle(hostLineOf(row)).color)

		const accept = within(row).getByRole("menuitem", { name: "Accept" })
		await expect(accept).toHaveAttribute("aria-disabled", "true")
		await expect(accept).toHaveAccessibleDescription(message)
		await expect(getComputedStyle(accept).opacity).toBe("0.5")
		await userEvent.click(accept)
		await expect(args.onAcceptInvitation).not.toHaveBeenCalled()

		const decline = within(row).getByRole("menuitem", { name: "Decline" })
		await expect(decline).not.toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(decline).opacity).toBe("1")
		await userEvent.click(decline)
		await expect(args.onDeclineInvitation).toHaveBeenCalledWith(INVITED.id)
	},
})

export const InvitationExpired = meta.story({
	globals: DARK,
	name: "Invitation expired",
	args: {
		...PERSONAL_OPEN,
		invitations: [{ ...INVITED, state: "expired", expiresAt: EXPIRES_AT }],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Artboard 3.6 of the Mockup page. The invitation expired before it was accepted. Like the withdrawn row: the ring and name mute, the cause line says when it expired and whom to ask, and no button is offered; the row is an inert menu item described by the cause.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const menu = await openSwitcher(canvasElement)
		const row = within(menu).getByRole("menuitem", { name: INVITED.name })
		const cause =
			"This invitation expired on October 25. Ask noa@example.com to invite you again."
		await expect(causeOf(row)).toHaveTextContent(cause)
		await expect(row).toHaveAccessibleDescription(cause)
		await expect(row).toHaveAttribute("aria-disabled", "true")
		await expect(row.querySelectorAll("button, [role=menuitem]")).toHaveLength(
			0,
		)
		await expect(expiryLineOf(row)).toBeNull()
		await expect(avatarOn(row).dataset.colour).toBeUndefined()
	},
})

export const InvitationLongContent = meta.story({
	globals: DARK,
	args: {
		invitations: [
			{
				...INVITED,
				name: "Everything the research studio has not filed anywhere else yet",
				hostEmail:
					"lea.marchand-de-villeneuve.research-coordination@example.com",
				state: "failed",
				failure: "offline",
			},
		],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"An invitation whose Space name is a sentence and whose host writes from one unbreakable address, neither of which the reader chose. Check both wrap inside the 280px menu, the address breaking mid-word, with nothing clipped or overflowing.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const menu = await openSwitcher(canvasElement)
		await expect(menu.getBoundingClientRect().width).toBe(280)
		await expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth)
		const row = invitationsIn(menu)[0]
		const edge = menu.getBoundingClientRect().right
		for (const line of [
			within(row).getByText(/^Everything/),
			hostLineOf(row),
			causeOf(row),
		]) {
			await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth)
			await expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(edge)
		}
		await expect(
			hostLineOf(row).getBoundingClientRect().height,
		).toBeGreaterThan(16)
	},
})

export const InvitationOverBotBadge = meta.story({
	globals: DARK,
	tags: ["test-only"],
	args: {
		badgesBySpaceId: BADGES,
		invitations: [{ ...INVITED, state: "waiting" }],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The trigger shows one dot: while an invitation is listed, the invitation dot takes the trigger and the strongest bot badge from another Space steps aside; the badges stay on their rows in the menu.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: /1 invitation$/,
		})
		await expectInvitationDot(trigger)
		await expect(badgeOn(trigger)).toBeUndefined()
		const menu = await openSwitcher(canvasElement)
		await expect(avatarOn(rowNamed(menu, "Veille")).dataset.attention).toBe("")
	},
})

const ITERATION_FIVE =
	"Measured against the Paper page `Iteration 5` of `Kiroshi, Invitations`, dark only."

const NOTES: Space[] = [
	{ id: "notes", name: "Notes", colour: BLOT_HUES.green, avatarSeed: "notes" },
]

const STUDIO_INVITATION: SpaceInvitation = {
	id: "studio",
	name: "Studio",
	colour: BLOT_HUES.orange,
	hostEmail: "steve@example.com",
	state: "waiting",
}

export const InvitationWithoutJoinEntry = meta.story({
	globals: DARK,
	name: "Invitation without Join a space",
	args: {
		spaces: NOTES,
		selectedSpaceId: "notes",
		invitations: [STUDIO_INVITATION],
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story: `${ITERATION_FIVE} 5.5: a reader with one space and one waiting invitation, now that joining goes through the invitation alone. Check the rows read Notes with its \`⌘1\` and its check, a rule, the Invitations label over Studio invited by its host with Accept and Decline, a rule, then \`Create a space\` and nothing after it, and that no \`Join a space\` is offered anywhere. Pick \`M2InvitationWaiting\` for the same invitation beside several spaces.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", {
			name: "Change space, Notes open, 1 invitation",
		})
		await expectInvitationDot(trigger)

		const menu = await openSwitcher(canvasElement)
		await expect(
			within(menu).queryByRole("menuitem", { name: "Join a space" }),
		).toBeNull()

		const notes = rowNamed(menu, "Notes")
		await expect(notes).toHaveAttribute("aria-checked", "true")
		await expect(shortcutOf(notes)).toHaveTextContent("⌘1")

		const spaces = notes.closest<HTMLElement>("[role=group]")
		const group = slotsIn(menu, "space-invitations")[0]
		await expect(group.previousElementSibling?.previousElementSibling).toBe(
			spaces,
		)
		await expect(group.previousElementSibling).toHaveAttribute(
			"role",
			"separator",
		)
		await expect(within(group).getByText("Invitations")).toBeVisible()
		const row = invitationNamed(menu, "Studio")
		await expect(hostLineOf(row)).toHaveTextContent(
			"Invited by steve@example.com",
		)
		await expect(
			within(row).getByRole("menuitem", { name: "Accept" }),
		).toBeVisible()
		await expect(
			within(row).getByRole("menuitem", { name: "Decline" }),
		).toBeVisible()

		const rule = group.nextElementSibling
		await expect(rule).toHaveAttribute("role", "separator")
		await expect(rule?.nextElementSibling).toHaveAccessibleName(
			"Create a space",
		)
		await expect(rule?.nextElementSibling).toBe(menu.lastElementChild)
	},
})
