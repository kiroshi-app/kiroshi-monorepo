import type { PropsWithChildren } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SUBMENU_PORTAL_GUARD,
	expectLaptopWindow,
	expectSkeletonFilledTo,
	FRAME_POLL,
	isInBrowserRunner,
	LAPTOP_WINDOW,
	mergeA11y,
	probedStyleOf,
	shown,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	AgentsPage,
	type AgentsPageAgent,
} from "@workspace/ui/components/agents-page"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import type { Space } from "@workspace/ui/components/space"
import { cn } from "@workspace/ui/lib/utils"

const KIROSHI: Space = {
	id: "kiroshi",
	name: "Kiroshi",
	colour: BLOT_HUES.blue,
	avatarSeed: "kiroshi",
}

const PERSO: Space = {
	id: "perso",
	name: "Perso",
	colour: BLOT_HUES.green,
	avatarSeed: "perso",
}

const HAPPY: AgentsPageAgent = {
	id: "happy",
	name: "Happy",
	blot: BLOT_HUES.orange,
	title: "Project lead",
	instructions:
		"You frame the work, cut it into tickets and hand each one to the agent whose craft it is.",
	skillsCount: 9,
	applicationsCount: 3,
	permissionMode: "auto",
	memberships: [KIROSHI.id, PERSO.id],
}

const SIX_AGENTS: AgentsPageAgent[] = [
	HAPPY,
	{
		id: "ichi",
		name: "Ichi",
		blot: BLOT_HUES.purple,
		title: "Frontend",
		instructions:
			"You build the screens of the desktop app from a validated artboard.",
		skillsCount: 6,
		applicationsCount: 2,
		permissionMode: "acceptEdits",
		memberships: [KIROSHI.id],
	},
	{
		id: "ni",
		name: "Ni",
		blot: BLOT_HUES.blue,
		title: "Systems",
		instructions:
			"You own everything that runs under the window: the host, the sidecar and the relay.",
		skillsCount: 7,
		applicationsCount: 2,
		permissionMode: "acceptEdits",
		memberships: [KIROSHI.id],
	},
	{
		id: "san",
		name: "San",
		blot: BLOT_HUES.green,
		title: "Design system",
		instructions:
			"You keep the component library honest, one story per component.",
		skillsCount: 5,
		applicationsCount: 1,
		permissionMode: "default",
		memberships: [KIROSHI.id, PERSO.id],
	},
	{
		id: "rei",
		name: "Rei",
		blot: BLOT_HUES.pink,
		title: "Product design",
		instructions:
			"You draw screens from what the product really does, state by state.",
		skillsCount: 10,
		applicationsCount: 1,
		permissionMode: "plan",
		memberships: [KIROSHI.id],
	},
	{
		id: "yon",
		name: "Yon",
		blot: BLOT_HUES.yellow,
		title: "iOS",
		instructions: "You build the iPhone app with system components first.",
		skillsCount: 4,
		applicationsCount: 0,
		permissionMode: "dontAsk",
		memberships: [KIROSHI.id],
	},
]

const LONG_NAMED_AGENT: AgentsPageAgent = {
	...HAPPY,
	name: "Happy the long-winded lead of every project in this space",
	title: "Project lead for the whole release train",
}

const CARD_HEIGHT = 171

const COLUMN_GAP = 16

const BODY_PADDING = 24

const CAPTION_LINE = 18

const LOADED_FIRST_CARD_TOP = BODY_PADDING + CAPTION_LINE + COLUMN_GAP

const MENU_WIDTH = 208

const SEPARATOR = "separator"

const HAPPY_MENU = [
	"Happy · Project lead",
	SEPARATOR,
	"Open settings",
	"Open in a new tab",
	SEPARATOR,
	"Duplicate",
	"Spaces",
	SEPARATOR,
	"Delete",
]

type PageFrameProps = PropsWithChildren<{
	className?: string
}>

const PageFrame = ({ className = "w-248", children }: PageFrameProps) => (
	<div className={cn("mx-auto flex h-svh max-w-full bg-background", className)}>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

const boxOf = (element: Element) => element.getBoundingClientRect()

const cardsIn = (root: HTMLElement) => slotsIn(root, "companion-card")

const footerOf = (card: HTMLElement) =>
	Array.from(
		slotIn(card, "companion-card-mode").parentElement?.children ?? [],
		(part) => part.textContent,
	)

const columnsOf = (cards: HTMLElement[]) =>
	new Set(cards.map((card) => Math.round(boxOf(card).left))).size

const thirdOf = (body: HTMLElement) =>
	(body.clientWidth - 2 * BODY_PADDING - 2 * COLUMN_GAP) / 3

const scrollsSideways = (element: HTMLElement) =>
	element.scrollWidth > element.clientWidth

const actionsOf = (root: HTMLElement, name: string) =>
	within(root).getByRole("button", { name: `Actions for ${name}` })

const openedMenu = async (name: string) =>
	shown(await screen.findByRole("menu", { name: `Actions for ${name}` }))

const rowsOf = (menu: HTMLElement) =>
	Array.from(slotIn(menu, "context-menu-group").children, (row) =>
		row.getAttribute("role") === SEPARATOR ? SEPARATOR : row.textContent,
	)

const menuIsGone = () =>
	waitFor(() => expect(screen.queryByRole("menu")).toBeNull(), FRAME_POLL)

const changesColourAtOnce = (control: Element) => {
	const { transitionProperty, transitionDuration } = getComputedStyle(control)
	return transitionProperty === "none" || transitionDuration === "0s"
}

const expectAppHeaderBar = async (canvasElement: HTMLElement) => {
	const page = slotIn(canvasElement, "agents-page")
	const bar = slotIn(page, "app-header")
	await expect(Array.from(page.querySelectorAll("header"))).toEqual([bar])
	await expect(bar).toHaveAttribute("data-tauri-drag-region", "deep")
	await expect(
		within(page.parentElement as HTMLElement).getByRole("region", {
			name: "Agents",
		}),
	).toBe(page)
	await expect(
		within(slotIn(bar, "app-header-leading")).getByRole("heading", {
			name: "Agents",
			level: 1,
		}),
	).toBeVisible()
	await expect(
		within(bar).getByRole("button", { name: "Create an agent" }),
	).toBeVisible()
}

const meta = preview.meta({
	title: "Navigation/AgentsPage",
	component: AgentsPage,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The main-area Agents page of a space, artboards A1 to A4. A header carries the title, how many agents the space holds and Create an agent; under it a caption names the space, then one card per agent, three to a row. A card picks its agent anywhere but on its actions button, which opens Open settings, Open in a new tab, Duplicate, Spaces and Delete. Every story draws the page inside the main card, 992 wide as the artboards do, `Narrow` aside.",
			},
		},
	},
	args: {
		agents: SIX_AGENTS,
		spaceName: KIROSHI.name,
		spaces: [KIROSHI, PERSO],
		openSpaceId: KIROSHI.id,
		onSelect: fn(),
		onCreate: fn(),
		onRetry: fn(),
		onOpenInNewTab: fn(),
		onDuplicate: fn(),
		onAddToSpace: fn(),
		onRemoveFromSpace: fn(),
		onDelete: fn(),
	},
	render: (args) => (
		<PageFrame>
			<AgentsPage {...args} />
		</PageFrame>
	),
})

export const Default = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A1: a space holding six agents, Happy, Ichi, Ni, San, Rei and Yon. Check the header reads Agents, 6 and Create an agent, the caption names the space, the cards sit three to a row at the same width and height, the first footer reads 9 skills · 3 applications and Decide alone, the last 4 skills · no applications and Never ask, and that a card picks its agent right up to the edges of its actions button, a control of its own beside the card, which does not. Pick `SingleAgent` for a row that is not full, `Narrow` for fewer columns.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectLaptopWindow()
		await expectAppHeaderBar(canvasElement)
		await expect(
			slotIn(slotIn(canvasElement, "app-header-leading"), "agents-page-count"),
		).toHaveTextContent(/^6$/)
		await expect(
			canvas.getByText(
				"Every agent in Kiroshi. Pick one to change how it works.",
			),
		).toBeVisible()

		const body = slotIn(canvasElement, "agents-page-body")
		const cards = cardsIn(canvasElement)
		await expect(cards).toHaveLength(6)
		await expect(columnsOf(cards)).toBe(3)
		for (const card of cards) {
			await expect(boxOf(card).width).toBeCloseTo(thirdOf(body), 0)
			await expect(boxOf(card).height).toBe(CARD_HEIGHT)
		}
		await expect(boxOf(cards[0]).top - boxOf(body).top).toBe(
			LOADED_FIRST_CARD_TOP,
		)
		await expect(scrollsSideways(body)).toBe(false)

		await expect(
			cards.map((card) => slotIn(card, "companion-card-name").textContent),
		).toEqual(SIX_AGENTS.map(({ name }) => name))
		await expect(footerOf(cards[0])).toEqual([
			"9 skills · 3 applications",
			"Decide alone",
		])
		await expect(footerOf(cards[5])).toEqual([
			"4 skills · no applications",
			"Never ask",
		])

		for (const [rank, { name }] of SIX_AGENTS.entries()) {
			const actions = actionsOf(canvasElement, name)
			const { left, top, bottom, width } = boxOf(actions)
			await expect(cards[rank].contains(actions)).toBe(false)
			await expect(actions.querySelector("button")).toBeNull()
			for (const y of [top - 2, bottom + 2])
				await expect(
					cards[rank].contains(document.elementFromPoint(left + width / 2, y)),
				).toBe(true)
		}

		await userEvent.click(cards[0])
		await expect(args.onSelect).toHaveBeenLastCalledWith("happy")
		await userEvent.click(slotIn(cards[1], "companion-card-excerpt"))
		await expect(args.onSelect).toHaveBeenLastCalledWith("ichi")
		await expect(args.onSelect).toHaveBeenCalledTimes(2)

		const create = canvas.getByRole("button", { name: "Create an agent" })
		await userEvent.click(create)
		await expect(args.onCreate).toHaveBeenCalledOnce()
		create.blur()
	},
})

export const Light = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"`Default` in the light theme, which no artboard draws: the page follows the same tokens. Check the cards, the header line and the actions buttons still read against the light card.",
			},
		},
	},
	play: Default.input.play,
})

export const Empty = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: { agents: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A2: a space that holds no agent yet. Check the header drops its count and keeps Create an agent, that the empty state sits in the middle of the body both ways, and that its own Create an agent reports the same request as the header's. Pick `Loading` while the first read has not answered.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectAppHeaderBar(canvasElement)
		await expect(
			canvasElement.querySelector('[data-slot="agents-page-count"]'),
		).toBeNull()
		await expect(
			canvas.getByRole("heading", {
				name: "No agents in this space yet.",
				level: 2,
			}),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Create one to give it a name, instructions and skills.",
			),
		).toBeVisible()
		await expect(cardsIn(canvasElement)).toHaveLength(0)

		const empty = boxOf(slotIn(canvasElement, "agents-page-empty"))
		const body = boxOf(
			slotIn(canvasElement, "agents-page-empty").parentElement as Element,
		)
		await expect(empty.top + empty.height / 2).toBeCloseTo(
			body.top + body.height / 2,
			0,
		)
		await expect(empty.left + empty.width / 2).toBeCloseTo(
			body.left + body.width / 2,
			0,
		)

		const creates = canvas.getAllByRole("button", { name: "Create an agent" })
		await expect(creates).toHaveLength(2)
		for (const create of creates) {
			await userEvent.click(create)
			create.blur()
		}
		await expect(args.onCreate).toHaveBeenCalledTimes(2)
	},
})

export const Loading = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: { agents: [], status: "loading" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A3: the first read has not answered yet. Check the header drops its count, a bar stands in for the caption, and skeleton cards in the box of a real card run three to a row down to the bottom edge of the body, cut there. No card can be focused and no empty state claims the space holds no agent.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAppHeaderBar(canvasElement)
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(
			boxOf(slotIn(canvasElement, "agents-page-skeleton")).bottom,
		).toBeCloseTo(boxOf(slotIn(canvasElement, "agents-page")).bottom, 0)
		await expect(
			canvasElement.querySelector('[data-slot="agents-page-count"]'),
		).toBeNull()
		await expect(
			canvas.queryByRole("heading", { name: "No agents in this space yet." }),
		).toBeNull()

		const cards = slotsIn(canvasElement, "agents-page-skeleton-card")
		await expect(columnsOf(cards)).toBe(3)
		await expect(
			boxOf(cards[0]).top - boxOf(slotIn(canvasElement, "list-skeleton")).top,
		).toBe(LOADED_FIRST_CARD_TOP)
		for (const card of cards) await expect(boxOf(card).height).toBe(CARD_HEIGHT)

		await expect(cardsIn(canvasElement)).toHaveLength(0)
		await expect(
			canvas.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["Create an agent"])
		await expect(
			slotIn(canvasElement, "agents-page-skeleton").querySelector(
				"button, a, [tabindex]",
			),
		).toBeNull()
	},
})

export const Failed = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: { status: "failed" },
	parameters: {
		docs: {
			description: {
				story:
					"The first read failed, the state the Missions page draws the same way and no artboard draws. Check the header keeps its title and Create an agent and drops its count, that one notice under it says what failed, that no skeleton, empty state, caption or card shows though the story holds six agents, and that Retry calls `onRetry` once.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectAppHeaderBar(canvasElement)
		const alert = within(
			slotIn(canvasElement, "agents-page-failure"),
		).getByRole("alert")
		await expect(alert).toHaveTextContent("Couldn’t load agents")
		await expect(alert).toHaveTextContent(
			"The agents are still there; only the list didn’t load.",
		)

		for (const slot of [
			"agents-page-skeleton",
			"agents-page-empty",
			"agents-page-count",
			"agents-page-body",
		]) {
			await expect(
				canvasElement.querySelector(`[data-slot="${slot}"]`),
			).toBeNull()
		}
		await expect(cardsIn(canvasElement)).toHaveLength(0)
		await expect(
			canvas.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["Create an agent", "Retry"])

		const retry = canvas.getByRole("button", { name: "Retry" })
		await userEvent.click(retry)
		await expect(args.onRetry).toHaveBeenCalledOnce()
		retry.blur()
	},
})

export const FailedLight = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "light" },
	args: Failed.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"`Failed` in the light theme. Check the notice, its icon and Retry still read against the light card.",
			},
		},
	},
	play: Failed.input.play,
})

export const FailedWithoutRetry = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: { status: "failed", onRetry: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"`Failed` for a caller that passes no `onRetry`. Check the notice still says what failed and offers no Retry, so Create an agent is the only button on the page.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			"Couldn’t load agents",
		)
		await expect(
			canvas.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["Create an agent"])
	},
})

export const ActionsMenuOpen = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		a11y: mergeA11y(A11Y_FLOATING_FOCUS_GUARDS, A11Y_SUBMENU_PORTAL_GUARD),
		docs: {
			description: {
				story:
					"Artboard A4: the actions menu of Happy, left open. Check Enter on the actions button opens the menu with its rows in the drawn order, that Escape hands focus back to that button, that Duplicate reports Happy without picking the card, and that the menu opened by pointer is 208 wide, hangs under the button with their end edges aligned, while the button keeps its pressed fill.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const actions = actionsOf(canvasElement, "Happy")
		await expect(actions).toHaveAttribute("aria-haspopup", "menu")

		actions.focus()
		await userEvent.keyboard("{Enter}")
		await expect(rowsOf(await openedMenu("Happy"))).toEqual(HAPPY_MENU)
		await userEvent.keyboard("{Escape}")
		await menuIsGone()
		await waitFor(() => expect(actions).toHaveFocus(), FRAME_POLL)

		await userEvent.click(actions)
		await userEvent.click(
			within(await openedMenu("Happy")).getByRole("menuitem", {
				name: "Duplicate",
			}),
		)
		await expect(args.onDuplicate).toHaveBeenCalledOnce()
		await expect(args.onDuplicate).toHaveBeenCalledWith("happy")
		await expect(args.onSelect).not.toHaveBeenCalled()
		await menuIsGone()
		await waitFor(() => expect(actions).toHaveFocus(), FRAME_POLL)

		await userEvent.click(actions)
		const menu = await openedMenu("Happy")
		await expect(actions).toHaveAttribute("aria-expanded", "true")
		await expect(getComputedStyle(actions).backgroundColor).toBe(
			probedStyleOf("bg-muted", "backgroundColor", canvasElement),
		)
		await expect(
			getComputedStyle(within(menu).getByRole("menuitem", { name: "Delete" }))
				.color,
		).toBe(probedStyleOf("text-destructive", "color", menu))
		await waitFor(async () => {
			await expect(boxOf(menu).width).toBe(MENU_WIDTH)
			await expect(boxOf(menu).right).toBeCloseTo(boxOf(actions).right, 0)
			await expect(boxOf(menu).top).toBeGreaterThanOrEqual(
				boxOf(actions).bottom,
			)
		}, FRAME_POLL)
		await expect(args.onSelect).not.toHaveBeenCalled()
	},
})

export const KeyboardFocus = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The page walked by the keyboard, focus left on the actions button of Happy. Check Tab lands on Create an agent, then the first card, then its actions button, each wearing a focus ring, that Enter on the card picks its agent, and that none of the three changes colour through a transition.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Create an agent" })
		const [card] = cardsIn(canvasElement)
		const actions = actionsOf(canvasElement, "Happy")

		await userEvent.tab()
		await expect(create).toHaveFocus()
		await expect(getComputedStyle(create).boxShadow).not.toBe("none")

		await userEvent.tab()
		await expect(card).toHaveFocus()
		await expect(getComputedStyle(card).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledOnce()
		await expect(args.onSelect).toHaveBeenCalledWith("happy")

		await userEvent.tab()
		await expect(actions).toHaveFocus()
		await expect(getComputedStyle(actions).boxShadow).not.toBe("none")

		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			for (const control of [create, card, actions])
				await expect(changesColourAtOnce(control)).toBe(true)
		})
	},
})

export const LongNameAndTitle = meta.story({
	args: { agents: [LONG_NAMED_AGENT, ...SIX_AGENTS.slice(1)] },
	parameters: {
		docs: {
			description: {
				story:
					"A name and a title longer than their card. Check both stay on one line, cut with an ellipsis before the actions button, which keeps its full size inside the card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [card] = cardsIn(canvasElement)
		const name = slotIn(card, "companion-card-name")
		const title = slotIn(card, "bot-title-badge")
		const actions = boxOf(actionsOf(canvasElement, LONG_NAMED_AGENT.name))

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(boxOf(card).height).toBe(CARD_HEIGHT)
		await expect(boxOf(title).right).toBeLessThanOrEqual(actions.left)
		await expect([actions.width, actions.height]).toEqual([28, 28])
		await expect(actions.right).toBeLessThan(boxOf(card).right)
		await expect(actions.top).toBeGreaterThan(boxOf(card).top)
	},
})

export const SingleAgent = meta.story({
	args: { agents: [HAPPY] },
	parameters: {
		docs: {
			description: {
				story:
					"A space holding one agent. Check the count reads 1 and the lone card keeps the width of one column of three instead of stretching across the row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const cards = cardsIn(canvasElement)
		await expect(cards).toHaveLength(1)
		await expect(slotIn(canvasElement, "agents-page-count")).toHaveTextContent(
			/^1$/,
		)
		await expect(boxOf(cards[0]).width).toBeCloseTo(
			thirdOf(slotIn(canvasElement, "agents-page-body")),
			0,
		)
	},
})

export const Narrow = meta.story({
	render: (args) => (
		<PageFrame className="w-80">
			<AgentsPage {...args} />
		</PageFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The page in a 320px container. Check the cards fall to one column, the header keeps its title, count and Create an agent on one line, every actions button stays inside its card, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const page = slotIn(canvasElement, "agents-page")
		const body = slotIn(canvasElement, "agents-page-body")
		const cards = cardsIn(canvasElement)

		await expect(boxOf(page).width).toBeLessThanOrEqual(320)
		await expect(columnsOf(cards)).toBe(1)
		await expect(scrollsSideways(page)).toBe(false)
		await expect(scrollsSideways(body)).toBe(false)
		await expect(
			boxOf(canvas.getByRole("button", { name: "Create an agent" })).right,
		).toBeLessThanOrEqual(boxOf(page).right)
		for (const [rank, { name }] of SIX_AGENTS.entries())
			await expect(
				boxOf(actionsOf(canvasElement, name)).right,
			).toBeLessThanOrEqual(boxOf(cards[rank]).right)
	},
})
