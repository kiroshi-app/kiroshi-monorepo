import { type ReactNode, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
	tokenStyleIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { THEME_CLASS_NAMES } from "@workspace/storybook/themed-docs-container"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	ThreadWorkLine,
	type ThreadWorkLineAgent,
} from "@workspace/ui/components/thread-work-line"

const THEMES = 2

const LINE_HEIGHT = 20

const stopAtlas = fn()

const retrySable = fn()

const PICO = { id: "bot-pico", name: "Pico", blot: BLOT_HUES.green }
const ATLAS = { id: "bot-atlas", name: "Atlas", blot: BLOT_HUES.blue }
const JUNIPER = {
	id: "bot-juniper",
	name: "Juniper",
	blot: BLOT_HUES.purple,
	image: UPLOADED_AVATAR_IMAGE,
}
const SABLE = { id: "bot-sable", name: "Sable", blot: BLOT_HUES.red }
const ORION = { id: "bot-orion", name: "Orion", blot: BLOT_HUES.orange }
const LYRA = { id: "bot-lyra", name: "Lyra", blot: BLOT_HUES.cyan }
const VEGA = { id: "bot-vega", name: "Vega", blot: BLOT_HUES.pink }
const NOVA = { id: "bot-nova", name: "Nova", blot: BLOT_HUES.yellow }

const NOTION_UPDATE = "mcp__Notion__update_page"

const EIGHT_AGENTS: ThreadWorkLineAgent[] = [
	{ ...PICO, state: "writing", elapsedSeconds: 41 },
	{
		...ATLAS,
		state: "tool",
		label: NOTION_UPDATE,
		elapsedSeconds: 33,
		onStop: stopAtlas,
	},
	{ ...JUNIPER, state: "writing", elapsedSeconds: 28 },
	{ ...SABLE, state: "thinking", elapsedSeconds: 9 },
	{ ...ORION, state: "writing", elapsedSeconds: 22 },
	{ ...LYRA, state: "tool", label: "Bash · bun test", elapsedSeconds: 17 },
	{ ...VEGA, state: "thinking", elapsedSeconds: 4 },
	{ ...NOVA, state: "upNext" },
]

const COLUMN = "w-[640px]"

const NARROW_COLUMN = "w-[400px]"

type ColumnProps = { width?: string; children: ReactNode }

const Column = ({ width = COLUMN, children }: ColumnProps) => (
	<div className="flex w-max flex-col gap-px bg-border">
		{Object.entries(THEME_CLASS_NAMES).map(([theme, className]) => (
			<div key={theme} className={`${className} bg-card p-6 text-foreground`}>
				<div className={width}>{children}</div>
			</div>
		))}
	</div>
)

type LineProps = {
	agents: ThreadWorkLineAgent[]
	isInitiallyOpen?: boolean
	width?: string
}

const onOpenChange = fn()

const Line = ({ agents, isInitiallyOpen = false, width }: LineProps) => {
	const [isOpen, setIsOpen] = useState(isInitiallyOpen)

	return (
		<Column width={width}>
			<ThreadWorkLine
				agents={agents}
				isOpen={isOpen}
				onOpenChange={(next) => {
					onOpenChange(next)
					setIsOpen(next)
				}}
			/>
		</Column>
	)
}

const expectTextInBothThemes = async (
	canvasElement: HTMLElement,
	texts: string[],
) => {
	const canvas = within(canvasElement)
	for (const text of texts) {
		const found = canvas.getAllByText(text)
		await expect(found).toHaveLength(THEMES)
		for (const node of found) await expect(node).toBeVisible()
	}
}

const expectInstantColours = async (control: HTMLElement) => {
	const { transitionProperty, transitionDuration } = getComputedStyle(control)
	await expect(
		transitionProperty === "none" || transitionDuration === "0s",
	).toBe(true)
}

const LINE_MIDDLE = LINE_HEIGHT / 2

const EDGE_INSET = 2

const HOVER_FILL_INSET = 6

const togglesIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getAllByRole("button", { name: "Each agent’s work" })

const lineOf = (toggle: HTMLElement) => {
	const line = toggle.closest<HTMLElement>(
		'[data-slot="thread-work-line-line"]',
	)
	if (!line) throw new Error("The toggle sits in no line")
	return line
}

const expectChevronAtRightEnd = async (canvasElement: HTMLElement) => {
	for (const toggle of togglesIn(canvasElement)) {
		await expect(toggle).toBeVisible()
		await expect(toggle.getBoundingClientRect().right).toBe(
			lineOf(toggle).getBoundingClientRect().right,
		)
	}
}

type LineSpot = "left" | "middle" | "right"

const xOf = (spot: LineSpot, width: number) => {
	switch (spot) {
		case "left":
			return EDGE_INSET
		case "middle":
			return width / 2
		default:
			return width - EDGE_INSET
	}
}

const clickLineAt = async (toggle: HTMLElement, spot: LineSpot) => {
	const line = lineOf(toggle)
	const x = xOf(spot, line.getBoundingClientRect().width)
	const pointer = await realPointer()
	await pointer.click(line, { position: { x, y: LINE_MIDDLE } })
}

const isDropped = (breakdown: HTMLElement) => {
	const tail = breakdown.parentElement
	if (!tail) throw new Error("The breakdown sits in no tail")
	return (
		breakdown.getBoundingClientRect().top - tail.getBoundingClientRect().top >=
		tail.getBoundingClientRect().height
	)
}

const expectOneLine = async (canvasElement: HTMLElement) => {
	for (const line of slotsIn(canvasElement, "thread-work-line-line")) {
		const bounds = line.getBoundingClientRect()
		await expect(bounds.height).toBe(LINE_HEIGHT)
		for (const item of Array.from(line.children))
			await expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(
				bounds.right,
			)
	}
}

const expectBreakdownShown = async (canvasElement: HTMLElement) => {
	const breakdowns = slotsIn(canvasElement, "thread-work-line-breakdown")
	await expect(breakdowns).toHaveLength(THEMES)
	for (const breakdown of breakdowns)
		await expect(isDropped(breakdown)).toBe(false)
}

const meta = preview.meta({
	title: "Conversation/Message/ThreadWorkLine",
	component: ThreadWorkLine,
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				component:
					"The thread's work line, artboards Final 7 to 17 of the Paper file Kiroshi, Chat rethought, one story per artboard and named after it. One agent draws the ActivityIndicator line; two or more draw the agent pile, a headline, the breakdown by state, the clock of the longest run and the chevron at the right end; the whole line is the button that opens one row per agent. Light and dark render one above the other, each column at its own width.",
			},
		},
	},
})

export const Final7 = meta.story({
	render: () => (
		<Line agents={[{ ...PICO, state: "thinking", elapsedSeconds: 4 }]} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 7: one agent thinking. Check the 20 avatar, the name in the agent colour, the shimmering state and the clock; no toggle, there is nothing to open. Under reduced motion, which the test browser emulates, the state text stays still.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, ["Pico", "is thinking…", "4s"])
		await expect(
			slotsIn(canvasElement, "thread-work-line-toggle"),
		).toHaveLength(0)
		await expect(within(canvasElement).queryAllByRole("button")).toHaveLength(0)
		for (const line of slotsIn(canvasElement, "thread-work-line-line")) {
			await expect(getComputedStyle(line).cursor).not.toBe("pointer")
		}
		for (const shimmer of slotsIn(canvasElement, "text-shimmer"))
			await expect(getComputedStyle(shimmer).animationName).toBe("none")
	},
})

export const Final8 = meta.story({
	render: () => (
		<Line
			agents={[
				{ ...PICO, state: "tool", label: NOTION_UPDATE, elapsedSeconds: 12 },
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 8: one agent using a tool. The tool reads as its server and name after a separator, never the raw mcp identifier.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"Pico",
			"Notion · update_page",
			"12s",
		])
	},
})

export const Final9 = meta.story({
	render: () => (
		<Line agents={[{ ...PICO, state: "writing", elapsedSeconds: 18 }]} />
	),
	parameters: {
		docs: {
			description: {
				story: "Artboard Final 9: one agent writing its answer.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, ["Pico", "is writing…", "18s"])
	},
})

export const Final10 = meta.story({
	render: () => (
		<Line
			agents={[
				{
					...PICO,
					state: "tool",
					label: NOTION_UPDATE,
					elapsedSeconds: 12,
				},
				{ ...ATLAS, state: "thinking", elapsedSeconds: 7 },
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 10: two agents. Both names in their colours, the breakdown, the clock of the longest run and the closed chevron at the right end. The whole line is one keyboard reachable button that names itself and says it is collapsed: a click anywhere on it opens the detail, a second click closes it. Hover tints one surface around the line, 6 past its content on every side, with no colour transition; the chevron keeps its resting fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"Pico",
			"and",
			"Atlas",
			"are working…",
			"· 1 using a tool · 1 thinking",
			"12s",
		])
		await expect(slotsIn(canvasElement, "conversation-bot-pile")).toHaveLength(
			THEMES,
		)
		await expectBreakdownShown(canvasElement)
		await expectChevronAtRightEnd(canvasElement)
		const toggles = togglesIn(canvasElement)
		const [toggle] = toggles
		const line = lineOf(toggle)
		const tail = slotIn(line, "thread-work-line-tail")
		const [lineClock] = within(tail).getAllByText("12s")
		await expect(tail.getBoundingClientRect().right).toBe(
			lineClock.getBoundingClientRect().right,
		)
		await expect(lineClock.getBoundingClientRect().right).toBeLessThan(
			toggle.getBoundingClientRect().left - 8,
		)
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
		await expectInstantColours(toggle)
		await expectInstantColours(line)
		await expect(toggle.getBoundingClientRect().width).toBe(LINE_HEIGHT)
		onOpenChange.mockClear()
		await userEvent.tab()
		await expect(toggle).toHaveFocus()
		const ring = getComputedStyle(toggle, "::after")
		await expect(ring.boxShadow).not.toBe("none")
		await expect(Number.parseFloat(ring.width)).toBe(
			line.getBoundingClientRect().width,
		)
		await userEvent.keyboard("{Enter}")
		await expect(onOpenChange).toHaveBeenLastCalledWith(true)
		await expect(toggle).toHaveAttribute("aria-expanded", "true")
		await userEvent.keyboard(" ")
		await expect(onOpenChange).toHaveBeenLastCalledWith(false)
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
		if (isInBrowserRunner()) {
			toggle.blur()
			const pointer = await realPointer()
			const restingChevron = getComputedStyle(toggle).backgroundColor
			const restingLine = getComputedStyle(line).backgroundColor
			const restingBounds = line.getBoundingClientRect().toJSON()
			await pointer.hover(line, { position: { x: EDGE_INSET, y: LINE_MIDDLE } })
			await expect(getComputedStyle(toggle, "::after").cursor).toBe("pointer")
			const fill = getComputedStyle(line, "::before")
			await expect(fill.backgroundColor).toBe(
				tokenStyleIn(line, "bg-muted/50", "backgroundColor"),
			)
			for (const side of [fill.top, fill.right, fill.bottom, fill.left])
				await expect(side).toBe(`-${HOVER_FILL_INSET}px`)
			await expect(fill.transitionDuration).toBe("0s")
			await expect(fill.zIndex).toBe("-1")
			await expect(getComputedStyle(line).backgroundColor).toBe(restingLine)
			await expect(getComputedStyle(toggle).backgroundColor).toBe(
				restingChevron,
			)
			await expect(line.getBoundingClientRect().toJSON()).toEqual(restingBounds)
			await expectInstantColours(toggle)
			for (const each of toggles) {
				await clickLineAt(each, "right")
				await expect(each).toHaveAttribute("aria-expanded", "true")
				const detail = document.getElementById(
					each.getAttribute("aria-controls") ?? "",
				)
				await expect(detail).toBeInstanceOf(HTMLUListElement)
				await clickLineAt(each, "left")
				await expect(each).toHaveAttribute("aria-expanded", "false")
				await expect(each).toHaveFocus()
				await expect(getComputedStyle(each, "::after").boxShadow).toBe("none")
				await expect(getComputedStyle(each).outlineStyle).toBe("none")
			}
			await clickLineAt(toggle, "middle")
			await expect(toggle).toHaveAttribute("aria-expanded", "true")
			await clickLineAt(toggle, "middle")
			await expect(toggle).toHaveAttribute("aria-expanded", "false")
			await pointer.unhover(line)
		}
	},
})

export const Final11 = meta.story({
	render: () => <Line agents={EIGHT_AGENTS} />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 11: eight agents. The pile draws two hexagons and a +6 counter, the count reads in the foreground, the breakdown runs writing, using a tool, thinking, up next.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"8 agents",
			"are working…",
			"· 3 writing · 2 using a tool · 2 thinking · 1 up next",
			"41s",
		])
		await expectBreakdownShown(canvasElement)
		for (const pile of slotsIn(canvasElement, "conversation-bot-pile")) {
			await expect(pile).toHaveAccessibleName("+6")
			await expect(pile.getBoundingClientRect().width).toBe(34)
		}
	},
})

export const Final12 = meta.story({
	render: () => (
		<Line
			agents={[
				{ ...PICO, state: "upNext" },
				{ ...ATLAS, state: "tool", label: NOTION_UPDATE, elapsedSeconds: 11 },
				{ ...ORION, state: "writing", elapsedSeconds: 18 },
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 12: three agents in mixed states. The breakdown keeps its order whatever order the agents arrive in.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"3 agents",
			"are working…",
			"· 1 writing · 1 using a tool · 1 up next",
			"18s",
		])
		await expectBreakdownShown(canvasElement)
	},
})

export const Final13 = meta.story({
	render: () => (
		<Line
			agents={[
				...EIGHT_AGENTS.filter(({ id }) => id !== JUNIPER.id).map((agent) =>
					agent.id === PICO.id ? { ...agent, elapsedSeconds: 52 } : agent,
				),
				{ ...JUNIPER, state: "waiting" },
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 13: one agent waits for you. It leads the pile and the line, the state reads in the waiting colour, the others fold into one count. No approval card here, the line only.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"Juniper",
			"is waiting for you…",
			"· 7 others working",
			"52s",
		])
		for (const pile of slotsIn(canvasElement, "conversation-bot-pile")) {
			const [leader] = slotsIn(pile, "conversation-bot-pile-bot")
			await waitFor(() => expect(leader.querySelector("img")).not.toBeNull())
		}
	},
})

export const Final14 = meta.story({
	render: () => (
		<Line
			agents={[
				{ ...SABLE, state: "failed", onRetry: retrySable },
				...EIGHT_AGENTS.filter(({ id }) => id !== SABLE.id).map((agent) =>
					agent.id === PICO.id ? { ...agent, elapsedSeconds: 47 } : agent,
				),
			]}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 14: one agent failed. The failure segment leads with Retry and a divider, then the line of the agents still at work, which drops its breakdown to stay on one line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"Sable",
			"This response failed",
			"Retry",
			"7 agents",
			"are working…",
			"47s",
		])
		await expectOneLine(canvasElement)
		const [retry] = within(canvasElement).getAllByRole("button", {
			name: "Retry Sable",
		})
		await expect(retry.getBoundingClientRect().height).toBe(22)
		await expectInstantColours(retry)
		const [toggle] = togglesIn(canvasElement)
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
		retry.focus()
		await expect(retry).toHaveFocus()
		retrySable.mockClear()
		onOpenChange.mockClear()
		if (isInBrowserRunner()) await (await realPointer()).click(retry)
		else await userEvent.click(retry)
		await expect(retrySable).toHaveBeenCalledOnce()
		await expect(onOpenChange).not.toHaveBeenCalled()
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
	},
})

export const Final15 = meta.story({
	render: () => (
		<Line
			agents={EIGHT_AGENTS.filter(({ id }) => id !== SABLE.id).map((agent) =>
				agent.id === PICO.id ? { ...agent, elapsedSeconds: 44 } : agent,
			)}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 15: one agent is done and leaves the line, the others go on. The count and the breakdown follow.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"7 agents",
			"are working…",
			"· 3 writing · 2 using a tool · 1 thinking · 1 up next",
			"44s",
		])
		await expectBreakdownShown(canvasElement)
	},
})

export const Final16 = meta.story({
	render: () => <Line agents={EIGHT_AGENTS} width={NARROW_COLUMN} />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 16: a narrow window. The breakdown drops first, the pile, headline and clock stay on one line, never wrapped, the chevron at the right end.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTextInBothThemes(canvasElement, [
			"8 agents",
			"are working…",
			"41s",
		])
		await expectOneLine(canvasElement)
		for (const breakdown of slotsIn(
			canvasElement,
			"thread-work-line-breakdown",
		))
			await expect(isDropped(breakdown)).toBe(true)
		await expectChevronAtRightEnd(canvasElement)
	},
})

export const Final17 = meta.story({
	render: () => <Line agents={EIGHT_AGENTS} isInitiallyOpen />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Final 17: the detail open. The line sits on top with its clock pushed to the end, then one row per agent, longest run first and up next last with its avatar at 0.7 opacity and no clock. Hover a tool row: Stop takes the avatar's place and the row says Stop Atlas.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const [toggle] = togglesIn(canvasElement)
		await expect(toggle).toHaveAttribute("aria-expanded", "true")
		await expect(getComputedStyle(toggle).backgroundColor).toBe(
			tokenStyleIn(toggle, "bg-foreground/8", "backgroundColor"),
		)
		await expectChevronAtRightEnd(canvasElement)
		const [lineClock] = within(
			slotIn(canvasElement, "thread-work-line-tail"),
		).getAllByText("41s")
		await expect(
			toggle.getBoundingClientRect().left -
				lineClock.getBoundingClientRect().right,
		).toBe(8)
		const [detail] = canvas.getAllByRole("list")
		const rows = within(detail).getAllByRole("listitem")
		await expect(rows).toHaveLength(EIGHT_AGENTS.length)
		await expect(within(rows[0]).getByText("Pico")).toBeVisible()
		await expect(within(rows[0]).getByText("41s")).toBeVisible()
		const upNext = rows[rows.length - 1]
		await expect(within(upNext).getByText("Nova")).toBeVisible()
		await expect(within(upNext).getByText("is up next…")).toBeVisible()
		const upNextLine = slotIn(upNext, "bot-working")
		const upNextAvatar = upNextLine.firstElementChild
		if (!upNextAvatar) throw new Error("The up next row draws no avatar")
		await expect(getComputedStyle(upNextAvatar).opacity).toBe("0.7")
		await expect(
			upNextLine.querySelector('[data-slot="bot-working-elapsed"]'),
		).toBeNull()

		const atlas = slotIn(rows[1], "bot-working")
		await expect(within(atlas).getByText("Notion · update_page")).toBeVisible()
		if (isInBrowserRunner()) {
			const pointer = await realPointer()
			await pointer.hover(atlas)
			await waitFor(() =>
				expect(within(atlas).getByText("Stop Atlas")).toBeVisible(),
			)
			stopAtlas.mockClear()
			await pointer.click(
				within(atlas).getByRole("button", { name: "Stop Atlas" }),
			)
			await expect(stopAtlas).toHaveBeenCalledOnce()
			await pointer.unhover(atlas)
		}
	},
})
