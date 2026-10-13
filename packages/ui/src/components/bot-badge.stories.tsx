import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	Row,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	BOT_BADGES,
	BOT_MISSION_STATES,
	BotBadgeDot,
	BotMissionStrip,
	type BotMissionTicket,
	BotTitleBadge,
} from "@workspace/ui/components/bot-badge"

const HOST_SIZES = [24, 40, 96]

const AVATAR_HOST = "relative block rounded-full bg-muted"

const SWITCHER_HOST =
	"group flex h-7 items-center gap-1 rounded-2xl bg-sidebar px-2 text-sm"

const RAIL_HOST =
	"group relative flex size-7 items-center justify-center rounded-2xl bg-sidebar"

const ROW_HOST = "relative flex h-9 w-40 flex-col justify-center text-sm"

const TITLE_HOST = "flex w-40 items-center gap-1.5 text-sm"

const BOT_TITLES = ["Ops", "Release manager for the platform", ""]

const CARD_HOST =
	"relative block size-10 rounded-full bg-card [--badge-ring:var(--color-card)]"

const TICKET: BotMissionTicket = {
	platform: "linear",
	externalId: "OPE-120",
	title: "Reinstall the simple primitives from the registry",
}

const LONG_TICKET: BotMissionTicket = {
	platform: "linear",
	externalId: "OPE-121",
	title:
		"Reinstall the simple primitives verbatim from the shadcn CLI and relocate every behaviour the deleted files carried",
}

const dotsIn = (root: HTMLElement) => slotsIn(root, "bot-badge-dot")

const trailingOf = (strip: HTMLElement) => strip.lastElementChild as HTMLElement

const boxOf = (element: HTMLElement) => element.getBoundingClientRect()

const centerOf = (element: HTMLElement) =>
	boxOf(element).top + boxOf(element).height / 2

const meta = preview.meta({
	title: "Branding/BotBadge",
	component: BotBadgeDot,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Every mark a companion wears, built on the registry `Badge`. `BotBadgeDot` binds a tint - attention, done, failed - to a placement and owns the mark's size, its ring and where it lands, so no call site writes badge geometry of its own. `BotMissionStrip` names the ticket a bot is on, and `BotTitleBadge` the pill a bot title is drawn in.",
			},
		},
	},
})

export const BotBadges = meta.story({
	tags: ["test-only"],
	render: () => (
		<Row>
			{BOT_BADGES.map((badge) => (
				<span
					className={AVATAR_HOST}
					key={badge}
					style={{ width: 40, height: 40 }}
				>
					<BotBadgeDot badge={badge} placement="avatar" />
				</span>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three things a companion badge can mean, on their own tokens: attention wears the warning tone and breathes because it is the only one waiting on the reader, done is green and failed is red and both hold still. The primary blue never marks attention: blue is the app's accent, not a request. Check the three colours hold in light and dark, that the attention dot reads `--warning` in both, and that only attention pulses, and only while motion is allowed. Pick `Placements` for where the mark lands.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dots = dotsIn(canvasElement)

		await expect(dots.map((dot) => dot.dataset.badge)).toEqual([...BOT_BADGES])
		await expect(
			dots.map((dot) => dot.classList.contains("motion-safe:animate-pulse")),
		).toEqual([true, false, false])
		await expect(getComputedStyle(dots[0]).backgroundColor).toBe(
			tokenStyleIn(dots[0], "bg-warning", "backgroundColor"),
		)
		await expect(dots.map((dot) => dot.getAttribute("aria-hidden"))).toEqual([
			"true",
			"true",
			"true",
		])
	},
})

export const Placements = meta.story({
	tags: ["test-only"],
	render: () => (
		<Row>
			{HOST_SIZES.map((size) => (
				<span
					className={AVATAR_HOST}
					key={size}
					style={{ width: size, height: size }}
				>
					<BotBadgeDot badge="failed" placement="avatar" />
				</span>
			))}
			<span className={SWITCHER_HOST} data-collapsible="">
				<span>Perso</span>
				<BotBadgeDot badge="attention" placement="switcher" />
			</span>
			<span className={RAIL_HOST} data-collapsible="icon">
				<span className="size-2.5 rounded-full bg-sidebar-foreground/30" />
				<BotBadgeDot badge="attention" placement="switcher" />
			</span>
			<span className={ROW_HOST}>
				<span className="h-5 leading-5">Atlas</span>
				<span className="h-4 text-xs leading-4">Pulled the papers</span>
				<BotBadgeDot badge="done" placement="row" />
			</span>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three placements the component owns, each on the host it was drawn for. `avatar` pins the mark to the bottom corner and scales it with the avatar, capped at 16px, so it lands the same on a 24px reply as on a 96px preview — the roster keeps it for the collapsed rail, where the avatar is the whole row. `switcher` sits in the flow, on the name's line and level with the letters, and only jumps to the button's top corner once the sidebar collapses to its rail and there is no line left to sit on. `row` leaves the flow at the trailing edge of an open roster row, under the timestamp and level with the preview line, so the mark reads on the column the eye already scans instead of hiding on a 40px avatar. Check both corner forms keep the ring that lifts them off the surface, and that the inline one and the row one do not — they sit on the panel itself, with nothing behind them to punch through.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [small, medium, large, inline, rail, row] = dotsIn(canvasElement)

		await expect(boxOf(small).width).toBeCloseTo(24 * 0.34, 0)
		await expect(boxOf(medium).width).toBeCloseTo(40 * 0.34, 0)
		await expect(boxOf(large).width).toBeCloseTo(16, 0)

		const line = inline.previousElementSibling as HTMLElement
		await expect(boxOf(inline).width).toBeCloseTo(8, 0)
		await expect(centerOf(inline)).toBeCloseTo(centerOf(line), 0)

		const railHost = rail.parentElement as HTMLElement
		await expect(boxOf(rail).right).toBeLessThan(boxOf(railHost).right)
		await expect(boxOf(rail).top).toBeLessThan(
			boxOf(railHost).top + boxOf(railHost).height / 2,
		)

		const rowHost = row.parentElement as HTMLElement
		const preview = row.previousElementSibling as HTMLElement
		await expect(boxOf(row).right).toBeCloseTo(boxOf(rowHost).right, 0)
		await expect(centerOf(row)).toBeCloseTo(centerOf(preview), 0)
	},
})

export const OnAnotherSurface = meta.story({
	render: () => (
		<Row>
			<span className={CARD_HOST}>
				<BotBadgeDot badge="done" placement="avatar" />
			</span>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same mark on a card rather than in the sidebar. The ring is a hole punched in whatever is behind the dot, so the surface names its own colour with `--badge-ring` and the badge takes it; left unset, it falls back to the sidebar it is drawn on most. Reach for this whenever a badge lands outside the sidebar — a dialog header, a card, a popover — and check the ring disappears into the surface instead of drawing a pale sidebar halo on it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [dot] = dotsIn(canvasElement)
		const surface = dot.parentElement as HTMLElement

		await expect(getComputedStyle(dot).boxShadow).toContain(
			getComputedStyle(surface).backgroundColor,
		)
	},
})

export const BotTitles = meta.story({
	tags: ["test-only"],
	render: () => (
		<Row>
			{BOT_TITLES.map((title) => (
				<span className={TITLE_HOST} key={title || "untitled"}>
					<span className="truncate font-medium">Atlas</span>
					<BotTitleBadge title={title} />
				</span>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The one pill a companion title is drawn in, worn by the roster row and by the message header alike. It has no maximum width, of its own or from a caller: it takes the room the line leaves after the name, gives way before the name does, cuts with an ellipsis only when that room runs out, and disappears node and all when a bot carries no title, so a name without one keeps the line it always had. Each host here is 160px wide. Check the three cases read as one component, and that the pill stays legible on both themes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const badges = slotsIn(canvasElement, "bot-title-badge")

		const [short, cut] = badges

		await expect(badges).toHaveLength(2)
		await expect(short.scrollWidth).toBe(short.clientWidth)
		await expect(cut.scrollWidth).toBeGreaterThan(cut.clientWidth)
		await expect(boxOf(short).width).toBeLessThan(boxOf(cut).width)
	},
})

export const MissionStates = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="flex w-80 flex-col items-stretch gap-2">
			{BOT_MISSION_STATES.map((state) => (
				<BotMissionStrip key={state} state={state} ticket={TICKET} />
			))}
			<BotMissionStrip isLive state="working" ticket={TICKET} />
		</div>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The four states a mission is read in, each on the same ticket, and the working state twice: quiet on the fourth strip, live on the fifth. The dot closes the strip at its trailing edge and is drawn only when the mission asks for a reader or runs right now, so a mission nobody is waiting on shows none. The tint is never the only carrier: every strip names its state in a screen-reader-only span whether or not a dot is drawn, so the five rows stay distinguishable without colour. Check the quiet strip still holds the width of the dot at its end, so the title lane is the same on all five.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const strips = slotsIn(canvasElement, "bot-mission-strip")

		await expect(strips.map((strip) => strip.dataset.state)).toEqual([
			...BOT_MISSION_STATES,
			"working",
		])
		await expect(strips.map((strip) => trailingOf(strip).dataset.slot)).toEqual(
			[
				"bot-mission-dot",
				"bot-mission-dot",
				"bot-mission-dot",
				"bot-mission-dot-placeholder",
				"bot-mission-dot",
			],
		)
		await expect(strips[3]).toHaveTextContent("working")
		const waitingDot = trailingOf(strips[0])
		await expect(getComputedStyle(waitingDot).backgroundColor).toBe(
			tokenStyleIn(waitingDot, "bg-warning", "backgroundColor"),
		)
		await expect(strips.map((strip) => boxOf(trailingOf(strip)).width)).toEqual(
			strips.map(() => 6),
		)
	},
})

export const MissionLongContent = meta.story({
	render: () => (
		<div className="w-64">
			<BotMissionStrip isLive state="working" ticket={LONG_TICKET} />
		</div>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A ticket title longer than the rail it sits in, the shape a real objective takes, on a mission that is running right now. Check the title truncates while the mark and the id keep their full width and the live dot keeps its place at the trailing edge - those three are what identifies the mission and says it is running, the title is what can be cut.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [title] = slotsIn(canvasElement, "bot-mission-ticket-title")

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
	},
})
