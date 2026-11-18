import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	findHoverTooltip,
	holderOf,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { MissionProperties } from "@workspace/ui/components/mission-properties"
import {
	LONG_MISSION_STATUS,
	LONG_MISSION_TICKET_TITLE,
	MISSION_NOW,
	MISSION_OPENED_AT,
	MISSION_PULL_REQUEST,
	MISSION_STATUS,
	MISSION_TICKET,
} from "@workspace/ui/components/missions.fixtures"

const ROW_HEIGHT = 24

const ROW_GAP = 4

const LABEL_WIDTH = 84

const CELL_GAP = 8

const boxOf = (element: Element) => element.getBoundingClientRect()

const rowsIn = (root: Element) =>
	Array.from(root.querySelectorAll<HTMLElement>("[data-property]"))

const propertiesIn = (root: Element) =>
	rowsIn(root).map((row) => row.dataset.property)

const rowOf = (root: Element, property: string) => {
	const row = root.querySelector<HTMLElement>(`[data-property="${property}"]`)
	if (!row) throw new Error(`Nothing here draws the ${property} row`)
	return row
}

const cellsOf = (row: HTMLElement) => {
	const [label, value] = Array.from(row.children) as HTMLElement[]
	return { label, value }
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionProperties",
	component: MissionProperties,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What a mission answers and where its branch stands, as one block of labelled rows: the ticket, the last status its agent wrote, the pull request with the commits ahead and how long the mission has been open. It sits at the top of whatever scrolls the mission thread and leaves with it, closed by a rule. A row with nothing to say is left out and the others close ranks; `onOpenCodingSession` puts an icon button after the ticket title, and left out it draws no button.",
			},
		},
	},
	args: {
		ticket: MISSION_TICKET,
		openedAt: MISSION_OPENED_AT,
		now: MISSION_NOW,
		status: MISSION_STATUS,
		commitsAhead: 3,
		pullRequest: MISSION_PULL_REQUEST,
	},
	render: (args) => (
		<div className="w-160 max-w-full">
			<MissionProperties {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission with a ticket, a status and an open pull request, in the 640px thread column. Check the three rows 24px tall and 4px apart, an 84px label column in the muted foreground at 12/20, the value 8px after it in the soft foreground at 13/20, 16px then a rule under the block, and no button in the Ticket row. Pick `WithTicketAction` for the row carrying its icon button.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = slotIn(canvasElement, "mission-properties")
		const style = getComputedStyle(block)
		const rows = rowsIn(block)

		await expect(propertiesIn(block)).toEqual([
			"ticket",
			"activity",
			"pull-request",
		])
		await expect([
			style.rowGap,
			style.paddingBottom,
			style.borderBottomWidth,
		]).toEqual([`${ROW_GAP}px`, "16px", "1px"])
		await expect(style.borderBottomColor).toBe(
			tokenStyleIn(block, "border border-foreground/8", "borderTopColor"),
		)
		await expect(rows.map((row) => boxOf(row).top - boxOf(block).top)).toEqual([
			0,
			ROW_HEIGHT + ROW_GAP,
			2 * (ROW_HEIGHT + ROW_GAP),
		])

		for (const row of rows) {
			const { label, value } = cellsOf(row)
			const labelStyle = getComputedStyle(label)
			const valueStyle = getComputedStyle(value)

			await expect(boxOf(row).height).toBe(ROW_HEIGHT)
			await expect(boxOf(label).width).toBe(LABEL_WIDTH)
			await expect(boxOf(value).left - boxOf(label).right).toBe(CELL_GAP)
			await expect([labelStyle.fontSize, labelStyle.lineHeight]).toEqual([
				"12px",
				"20px",
			])
			await expect(labelStyle.color).toBe(
				tokenStyleIn(label, "text-muted-foreground", "color"),
			)
			await expect(valueStyle.color).toBe(
				tokenStyleIn(value, "text-soft-foreground", "color"),
			)
		}
		await expect(rows.map((row) => cellsOf(row).label.textContent)).toEqual([
			"Ticket",
			"Activity",
			"Pull request",
		])

		const line = slotIn(block, "mission-ticket-line")
		const identifier = line.firstElementChild as HTMLElement
		const lineStyle = getComputedStyle(line)
		await expect([lineStyle.fontSize, lineStyle.lineHeight]).toEqual([
			"13px",
			"20px",
		])
		await expect(lineStyle.color).toBe(
			tokenStyleIn(line, "text-soft-foreground", "color"),
		)
		await expect(identifier).toHaveTextContent(MISSION_TICKET.externalId)
		await expect([
			getComputedStyle(identifier).fontWeight,
			getComputedStyle(identifier).fontVariantNumeric,
		]).toEqual(["500", "tabular-nums"])
		await expect(
			rowOf(block, "ticket").querySelectorAll("button"),
		).toHaveLength(0)
		await expect(slotsIn(block, "mission-ticket-actions")).toHaveLength(0)

		const status = slotIn(block, "mission-status")
		const time = slotIn(status, "mission-status-time")
		await expect(status).toHaveTextContent(`${MISSION_STATUS.text}4 min`)
		await expect(getComputedStyle(time, "::before").content).toBe('"·"')
		await expect(getComputedStyle(time).fontVariantNumeric).toBe("tabular-nums")

		const pullRequest = slotIn(block, "mission-pull-request")
		const mark = pullRequest.previousElementSibling as SVGElement
		await expect([boxOf(mark).width, boxOf(mark).height]).toEqual([14, 14])
		await expect(getComputedStyle(mark).color).toBe(
			tokenStyleIn(block, "text-soft-foreground", "color"),
		)
		await expect(boxOf(pullRequest).left - boxOf(mark).right).toBe(CELL_GAP)
		await expect(pullRequest).toHaveTextContent(
			/^#4823 commits aheadopened .+ ago$/,
		)
		await expect(getComputedStyle(pullRequest).fontVariantNumeric).toBe(
			"tabular-nums",
		)
		for (const part of Array.from(pullRequest.children).slice(1)) {
			await expect(getComputedStyle(part, "::before").content).toBe('"·"')
		}
	},
})

export const WithoutStatus = meta.story({
	args: { status: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A mission whose agent wrote no status. Check that the Activity row is left out rather than drawn empty and that the Pull request row closes up 4px under the Ticket row. Pick `Default` for the three rows.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = slotIn(canvasElement, "mission-properties")

		await expect(propertiesIn(block)).toEqual(["ticket", "pull-request"])
		await expect(slotsIn(block, "mission-status")).toHaveLength(0)
		await expect(
			boxOf(rowOf(block, "pull-request")).top - boxOf(block).top,
		).toBe(ROW_HEIGHT + ROW_GAP)
	},
})

export const WithoutPullRequest = meta.story({
	args: { pullRequest: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A mission on a branch with commits ahead and no pull request yet. Check that the Pull request row is left out whole, commits and opening time included, and that the Ticket and Activity rows keep their place. Pick `ZeroValue` for a pull request with no commit ahead.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = slotIn(canvasElement, "mission-properties")

		await expect(propertiesIn(block)).toEqual(["ticket", "activity"])
		await expect(slotsIn(block, "mission-commits-ahead")).toHaveLength(0)
		await expect(
			block.querySelectorAll("a[data-slot='mission-link']"),
		).toHaveLength(0)
	},
})

export const WithoutTicket = meta.story({
	args: {
		ticket: { externalId: "", title: "", platform: "linear", url: "" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A mission opened with no ticket behind it, the stored ticket passed through with its fields empty. Check that the Ticket row is left out and that the Activity row takes the top of the block. Pick `Empty` for a mission with nothing to list at all.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = slotIn(canvasElement, "mission-properties")

		await expect(propertiesIn(block)).toEqual(["activity", "pull-request"])
		await expect(slotsIn(block, "mission-ticket-line")).toHaveLength(0)
		await expect(boxOf(rowOf(block, "activity")).top).toBe(boxOf(block).top)
	},
})

export const Empty = meta.story({
	args: {
		ticket: { externalId: "", title: "", platform: "linear", url: "" },
		status: undefined,
		pullRequest: undefined,
		commitsAhead: 0,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A mission with no ticket, no status and no pull request. Check that the block draws nothing at all, so no rule is left hanging above the first message.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-properties")).toHaveLength(0)
		await expect(canvasElement.querySelectorAll("dl")).toHaveLength(0)
	},
})

export const ZeroValue = meta.story({
	args: { commitsAhead: 0 },
	parameters: {
		docs: {
			description: {
				story:
					"A pull request whose branch has no commit ahead. Check that the row reads the number then the opening time, with no `0 commits ahead` between them. Pick `Default` for a branch that is ahead.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const pullRequest = slotIn(canvasElement, "mission-pull-request")

		await expect(slotsIn(pullRequest, "mission-commits-ahead")).toHaveLength(0)
		await expect(pullRequest).toHaveTextContent(/^#482opened .+ ago$/)
	},
})

export const TicketLink = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The Ticket row on a ticket that carries a url. Check that the identifier and the title are one link opening in a new tab, and that tabbing to it draws a visible ring. Pick `WithTicketAction` for the button that follows it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const link = canvas.getByRole("link", {
			name: new RegExp(MISSION_TICKET.externalId),
		})

		await expect(
			rowOf(canvasElement, "ticket").querySelectorAll("a"),
		).toHaveLength(1)
		await expect(link).toHaveTextContent(MISSION_TICKET.title)
		await expect(link).toHaveAttribute("href", MISSION_TICKET.url)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(boxOf(link).height).toBe(ROW_HEIGHT)

		await userEvent.tab()

		await expect(link).toHaveFocus()
		await expect(getComputedStyle(link).boxShadow).not.toBe("none")
	},
})

export const WithTicketAction = meta.story({
	args: { onOpenCodingSession: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The Ticket row carrying its icon button, in the 640px thread column. Check that Open the coding session is a 24px round button with a 14px icon in the muted foreground, that tabbing to it draws a visible ring, that a click reaches its callback, and that it follows the title 8px after it rather than sitting at the far end. Pick `LongContent` for the button pinned to the end of a narrow column. The app passes no callback today.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const row = rowOf(canvasElement, "ticket")
		const actions = slotIn(row, "mission-ticket-actions")
		const button = canvas.getByRole("button", {
			name: "Open the coding session",
		})
		const icon = button.querySelector("svg") as SVGElement
		const style = getComputedStyle(button)

		await expect(Array.from(row.querySelectorAll("button"))).toEqual([button])
		await expect([boxOf(button).width, boxOf(button).height]).toEqual([24, 24])
		await expect(style.borderTopLeftRadius).toBe(
			tokenStyleIn(button, "rounded-button", "borderTopLeftRadius"),
		)
		await expect([boxOf(icon).width, boxOf(icon).height]).toEqual([14, 14])
		await expect(style.color).toBe(
			tokenStyleIn(button, "text-muted-foreground", "color"),
		)
		await expect(style.transitionProperty).toBe("none")
		await expect(boxOf(row).height).toBe(ROW_HEIGHT)
		await expect(
			boxOf(actions).left - boxOf(slotIn(row, "mission-ticket-line")).right,
		).toBe(CELL_GAP)

		await userEvent.tab()
		await userEvent.tab()
		await expect(button).toHaveFocus()
		await expect(getComputedStyle(button).boxShadow).not.toBe("none")

		await userEvent.click(button)
		await expect(args.onOpenCodingSession).toHaveBeenCalledOnce()
	},
})

export const LongContent = meta.story({
	args: {
		ticket: { ...MISSION_TICKET, title: LONG_MISSION_TICKET_TITLE },
		status: LONG_MISSION_STATUS,
		onOpenCodingSession: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A ticket title and a status written as sentences, in a column squeezed to 320 pixels. Check that the title wraps onto further lines with its row aligned to the top and its first line level with the button, that the button is pinned to the end of the row, that the status keeps one line and hands its whole text to a tooltip, and that nothing scrolls sideways. Read it at 200 percent zoom too. Pick `Default` for the column wide enough to keep every row on one line.",
			},
		},
	},
	render: (args) => (
		<div className="w-80" data-holds="column">
			<MissionProperties {...args} />
		</div>
	),
	play: async ({ canvasElement, userEvent }) => {
		const column = holderOf(canvasElement, "column")
		const block = slotIn(column, "mission-properties")
		const row = rowOf(block, "ticket")
		const { label, value } = cellsOf(row)
		const line = slotIn(row, "mission-ticket-line")
		const title = line.lastElementChild as HTMLElement
		const actions = slotIn(row, "mission-ticket-actions")

		await expect(block.scrollWidth).toBeLessThanOrEqual(block.clientWidth)
		await expect(boxOf(title).height).toBeGreaterThan(20)
		await expect(getComputedStyle(row).alignItems).toBe("flex-start")
		await expect([
			boxOf(label).top,
			boxOf(line).top,
			boxOf(actions).top,
		]).toEqual([boxOf(row).top, boxOf(row).top, boxOf(row).top])
		await expect(boxOf(actions).right).toBe(boxOf(value).right)
		await expect(boxOf(value).right).toBe(boxOf(block).right)

		const status = slotIn(block, "mission-status")
		const text = status.firstElementChild as HTMLElement
		await expect(boxOf(rowOf(block, "activity")).height).toBe(ROW_HEIGHT)
		await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
		await expect(
			boxOf(slotIn(status, "mission-status-time")).right,
		).toBeLessThanOrEqual(boxOf(block).right)

		await userEvent.hover(text)
		await expect(await findHoverTooltip()).toHaveTextContent(
			LONG_MISSION_STATUS.text,
		)
	},
})
