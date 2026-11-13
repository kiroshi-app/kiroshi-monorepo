import {
	expect,
	fireEvent,
	fn,
	screen,
	userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	A11Y_FLOATING_FOCUS_GUARDS,
	A11Y_SUBMENU_PORTAL_GUARD,
	expectSkeletonFilledTo,
	FRAME_POLL,
	LAPTOP_WINDOW,
	mergeA11y,
	shown,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import { MissionMenu } from "@workspace/ui/components/mission-menu"
import {
	MISSION_NOW,
	NO_PAGE_MISSIONS,
	PAGE_LONG_TEXT_MISSIONS,
	PAGE_MISSIONS,
	PAGE_MISSIONS_SHOWN,
	PAGE_MISSIONS_WAITING_ON_AN_AGENT,
} from "@workspace/ui/components/missions.fixtures"
import {
	MISSIONS_PAGE_FRAMES,
	MissionsPage,
	type MissionsPageGroupKey,
	type MissionsPageRowWrap,
} from "@workspace/ui/components/missions-page"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

const DRAWN_GROUPS = [
	"Blocked on you",
	"Ready to merge",
	"Working",
	"Waiting on an agent",
	"Completed",
	"Blocked",
]

const DRAWN_FOLDED_GROUPS: MissionsPageGroupKey[] = ["completed", "blocked"]

const ROW_ANATOMY = [
	"missions-page-row-identifier",
	"missions-page-glyph",
	"missions-page-row-title",
	"missions-page-conversation-chip",
	"missions-page-pull-request-chip",
	"missions-page-agent-chip",
	"missions-page-row-time",
]

const groupIn = (root: Element, key: MissionsPageGroupKey) => {
	const group = root.querySelector<HTMLElement>(`[data-group="${key}"]`)
	if (!group) throw new Error(`No ${key} group is drawn`)
	return group
}

const headerOf = (root: Element, key: MissionsPageGroupKey) =>
	slotIn(groupIn(root, key), "missions-page-group-header")

const anatomyOf = (row: HTMLElement) =>
	Array.from(row.querySelectorAll<HTMLElement>("[data-slot]"))
		.map((part) => part.dataset.slot ?? "")
		.filter((slot) => ROW_ANATOMY.includes(slot))

const NARROW_PAGE_WIDTH = 480

const MIN_TITLE_REM = 6

const FULL_WIDTH_PARTS = [
	"missions-page-row-identifier",
	"missions-page-glyph",
	"missions-page-pull-request-chip",
	"missions-page-agent-chip",
	"missions-page-row-time",
]

const frameHeight = (root: Element, frame: string, tallestPart: string) => {
	const probe = document.createElement("div")
	probe.className = frame
	const part = document.createElement("span")
	part.className = tallestPart
	probe.append(part)
	root.append(probe)
	const { height } = probe.getBoundingClientRect()
	probe.remove()
	return height
}

const loadedRowHeight = (root: Element) =>
	frameHeight(root, MISSIONS_PAGE_FRAMES.row, MISSIONS_PAGE_FRAMES.chip)

const loadedGroupHeaderHeight = (root: Element) =>
	frameHeight(
		root,
		MISSIONS_PAGE_FRAMES.groupHeader,
		MISSIONS_PAGE_FRAMES.glyph,
	)

const drawsABorder = (element: Element) => {
	const style = getComputedStyle(element)
	return ["top", "right", "bottom", "left"].some(
		(side) =>
			Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0,
	)
}

const isClipped = (element: HTMLElement) =>
	element.scrollWidth > element.clientWidth

const WIRED_BY_NOBODY_YET =
	"The app does not mount the page yet: it opens and feeds it in a later ticket."

const meta = preview.meta({
	title: "Navigation/MissionsPage",
	component: MissionsPage,
	decorators: [
		(Story) => (
			<div className="h-svh bg-background p-2">
				<Story />
			</div>
		),
	],
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The main-area Missions page of a space, artboard 2 Expanded, Missions. Missions group by state, Blocked on you, Ready to merge, Working, Waiting on an agent, Completed, then Blocked; a group holding several agents splits under one heading per agent. A row reads identifier, state glyph, title, conversation, pull request when there is one, agent and the time since its last move. A group header folds its rows.",
			},
		},
	},
	args: {
		missions: PAGE_MISSIONS,
		now: MISSION_NOW,
		onOpen: fn(),
		onRetry: fn(),
		defaultFoldedGroups: DRAWN_FOLDED_GROUPS,
	},
})

export const Default = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `The artboard as drawn: Blocked on you, Ready to merge and Working open, Completed and Blocked folded. Check Working splits into Atlas, Juno and Pike while Blocked on you, one agent, does not, that each row reads identifier, glyph, title, conversation, pull request, agent and time, and that a row opens its mission by pointer or Enter. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const headers = slotsIn(canvasElement, "missions-page-group-header")
		await expect(headers.map((header) => header.textContent)).toEqual([
			"Blocked on you1",
			"Ready to merge1",
			"Working3",
			"Completed6",
			"Blocked1",
		])
		await expect(headerOf(canvasElement, "completed")).toHaveAttribute(
			"aria-expanded",
			"false",
		)
		await expect(headerOf(canvasElement, "blocked")).toHaveAttribute(
			"aria-expanded",
			"false",
		)
		await expect(headerOf(canvasElement, "working")).toHaveAttribute(
			"aria-expanded",
			"true",
		)

		const rows = slotsIn(canvasElement, "missions-page-row")
		await expect(rows).toHaveLength(PAGE_MISSIONS_SHOWN.length)
		await expect(
			slotsIn(groupIn(canvasElement, "working"), "missions-page-agent").map(
				(agent) => agent.textContent,
			),
		).toEqual(["Atlas1", "Juno1", "Pike1"])
		await expect(
			slotsIn(groupIn(canvasElement, "blockedOnYou"), "missions-page-agent"),
		).toHaveLength(0)

		const [firstRow] = rows
		if (!firstRow) throw new Error("No row is drawn")
		await expect(anatomyOf(firstRow)).toEqual(ROW_ANATOMY)
		const rowWithoutPullRequest = canvas.getByRole("button", {
			name: /OPE-2130/,
		})
		await expect(
			within(rowWithoutPullRequest).queryByText(/^#/),
		).not.toBeInTheDocument()

		const page = slotIn(canvasElement, "missions-page")
		for (const row of rows) {
			await expect(row.getBoundingClientRect().height).toBe(
				loadedRowHeight(page),
			)
		}
		for (const header of headers) {
			await expect(header.getBoundingClientRect().height).toBe(
				loadedGroupHeaderHeight(page),
			)
		}

		await userEvent.click(firstRow)
		await expect(args.onOpen).toHaveBeenLastCalledWith("mission-ope-2124")
		rowWithoutPullRequest.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenLastCalledWith("mission-ope-2130")

		for (const control of [firstRow, headers[0]]) {
			await expect(
				getComputedStyle(control as Element).transitionDuration,
			).toBe("0s")
		}
	},
})

export const Unfolded = meta.story({
	args: {
		missions: PAGE_MISSIONS_WAITING_ON_AN_AGENT,
		defaultFoldedGroups: [],
	},
	parameters: {
		docs: {
			description: {
				story: `Every group open, one mission waiting on an agent added so all six states show. Check each header and row carries its group's 14px mission state mark, that the groups keep the drawn order, that a header folds and unfolds its rows from the pointer, Enter and Space and says so through aria-expanded, and that keyboard focus draws a ring on headers and rows. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const headers = slotsIn(canvasElement, "missions-page-group-header")
		await expect(
			headers.map((header) => header.textContent?.replace(/\d+$/, "")),
		).toEqual(DRAWN_GROUPS)
		await expect(slotsIn(canvasElement, "missions-page-row")).toHaveLength(
			PAGE_MISSIONS_WAITING_ON_AN_AGENT.length,
		)
		await expect(
			headers.map(
				(header) => slotIn(header, "missions-page-glyph").dataset.state,
			),
		).toEqual([
			"waiting",
			"ready",
			"working",
			"waiting_agent",
			"done",
			"failed",
		])
		for (const mark of slotsIn(canvasElement, "mission-state-mark")) {
			await expect(mark.getBoundingClientRect().width).toBe(14)
		}

		const completed = groupIn(canvasElement, "completed")
		const header = headerOf(canvasElement, "completed")
		await userEvent.click(header)
		await expect(header).toHaveAttribute("aria-expanded", "false")
		await expect(slotsIn(completed, "missions-page-row")).toHaveLength(0)
		await userEvent.keyboard("{Enter}")
		await expect(header).toHaveAttribute("aria-expanded", "true")
		await expect(slotsIn(completed, "missions-page-row")).toHaveLength(6)
		await userEvent.keyboard(" ")
		await expect(header).toHaveAttribute("aria-expanded", "false")

		await userEvent.tab()
		const blockedHeader = headerOf(canvasElement, "blocked")
		await expect(blockedHeader).toHaveFocus()
		await expect(getComputedStyle(blockedHeader).outlineStyle).toBe("solid")
		await userEvent.tab()
		const blockedRow = slotIn(
			groupIn(canvasElement, "blocked"),
			"missions-page-row",
		)
		await expect(blockedRow).toHaveFocus()
		await expect(getComputedStyle(blockedRow).outlineStyle).toBe("solid")
	},
})

export const UnfoldedDark = meta.story({
	args: Unfolded.input.args,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `Unfolded in the dark theme. Check each group header and row carries the mission state mark of its group, the five shapes side by side, and Completed keeps its green check disc. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: Unfolded.input.play,
})

export const Empty = meta.story({
	args: { missions: NO_PAGE_MISSIONS },
	parameters: {
		docs: {
			description: {
				story: `A space where no agent has opened a mission yet. Check the page keeps its Missions header and draws the empty state of the Missions panel under it, with no group. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "Missions", level: 1 }),
		).toBeVisible()
		await expect(
			canvas.getByRole("heading", { name: "No missions yet" }),
		).toBeVisible()
		await expect(
			canvas.getByText("Missions your agents open in this space show up here."),
		).toBeVisible()
		await expect(
			slotsIn(canvasElement, "missions-page-group-header"),
		).toHaveLength(0)
	},
})

export const Loading = meta.story({
	args: { missions: NO_PAGE_MISSIONS, status: "loading" },
	parameters: {
		docs: {
			description: {
				story: `The first read has not answered yet. Check the skeleton draws group headers and rows in the page layout down to the bottom of the panel, and that no empty state claims the space holds no mission. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(
			slotIn(canvasElement, "missions-page-skeleton").getBoundingClientRect()
				.bottom,
		).toBeCloseTo(
			slotIn(canvasElement, "missions-page").getBoundingClientRect().bottom,
			0,
		)
		await expect(
			canvas.queryByRole("heading", { name: "No missions yet" }),
		).not.toBeInTheDocument()

		const page = slotIn(canvasElement, "missions-page")
		const rowHeight = loadedRowHeight(page)
		const headerHeight = loadedGroupHeaderHeight(page)
		for (const row of slotsIn(canvasElement, "missions-page-skeleton-row")) {
			await expect(row.getBoundingClientRect().height).toBe(rowHeight)
		}
		for (const header of slotsIn(
			canvasElement,
			"missions-page-skeleton-group-header",
		)) {
			await expect(header.getBoundingClientRect().height).toBe(headerHeight)
		}
	},
})

export const Failed = meta.story({
	args: { missions: NO_PAGE_MISSIONS, status: "failed" },
	parameters: {
		docs: {
			description: {
				story: `The read failed. Check the page says what failed under its header and that Retry calls \`onRetry\`. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			"Couldn’t load missions",
		)
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetry).toHaveBeenCalledOnce()
	},
})

export const LongText = meta.story({
	args: { missions: PAGE_LONG_TEXT_MISSIONS, defaultFoldedGroups: [] },
	parameters: {
		docs: {
			description: {
				story: `A title of several sentences, one unbreakable title, a long conversation title and a six-digit pull request. Check each title holds one line ending in an ellipsis while identifier, glyph and time lanes stay aligned across rows. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const titles = slotsIn(canvasElement, "missions-page-row-title")
		for (const title of titles.slice(0, 2)) {
			await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
			await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
			await expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
		}

		const lanes = (slot: string, edge: "left" | "right") =>
			new Set(
				slotsIn(canvasElement, slot).map(
					(part) => part.getBoundingClientRect()[edge],
				),
			).size
		await expect(lanes("missions-page-row-identifier", "left")).toBe(1)
		await expect(lanes("missions-page-row-identifier", "right")).toBe(1)
		await expect(lanes("missions-page-row-time", "right")).toBe(1)
		const rowGlyphs = slotsIn(canvasElement, "missions-page-row").map(
			(row) => slotIn(row, "missions-page-glyph").getBoundingClientRect().left,
		)
		await expect(new Set(rowGlyphs).size).toBe(1)
	},
})

export const Narrow = meta.story({
	globals: { theme: "dark" },
	decorators: [
		(Story) => (
			<div className="h-full" style={{ width: NARROW_PAGE_WIDTH }}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story: `Default on a page 480px wide. Check no row and no part of the groups scroller overflows sideways, that the conversation chip shrinks and truncates before a title drops under 6rem, and that identifier, glyph, pull request, agent and time keep their full width. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "missions-page").getBoundingClientRect().width,
		).toBe(NARROW_PAGE_WIDTH)
		await expect(isClipped(slotIn(canvasElement, "missions-page-groups"))).toBe(
			false,
		)

		const minTitleWidth =
			MIN_TITLE_REM *
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
		const rows = slotsIn(canvasElement, "missions-page-row")
		await expect(rows).toHaveLength(PAGE_MISSIONS_SHOWN.length)
		for (const row of rows) {
			await expect(isClipped(row)).toBe(false)
			await expect(
				slotIn(row, "missions-page-row-title").getBoundingClientRect().width,
			).toBeGreaterThanOrEqual(minTitleWidth)
			for (const slot of FULL_WIDTH_PARTS) {
				for (const part of slotsIn(row, slot)) {
					await expect(getComputedStyle(part).flexShrink).toBe("0")
					await expect(isClipped(part)).toBe(false)
					for (const label of part.querySelectorAll<HTMLElement>("span")) {
						await expect(isClipped(label)).toBe(false)
					}
				}
			}
		}

		const conversationLabels = slotsIn(
			canvasElement,
			"missions-page-conversation-chip",
		).map((chip) => chip.lastElementChild as HTMLElement)
		await expect(conversationLabels.some(isClipped)).toBe(true)
	},
})

export const InMainCard = meta.story({
	globals: { theme: "dark" },
	render: (args) => (
		<WorkspaceShellRoot className="h-full">
			<ContentCard>
				<MissionsPage {...args} />
			</ContentCard>
		</WorkspaceShellRoot>
	),
	parameters: {
		docs: {
			description: {
				story: `Default inside the main card of the shell, artboard 2 Expanded, Missions. Check that the card draws the only border and the only radius around the page, that the page paints no background of its own, and that the floating header draws no line across the card. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "missions-page")
		const card = page.closest("[data-content-card]")
		if (!card) throw new Error("The page sits in no main card")
		await expect(drawsABorder(card)).toBe(true)
		await expect(getComputedStyle(card).borderTopLeftRadius).not.toBe("0px")

		const pageStyle = getComputedStyle(page)
		await expect(drawsABorder(page)).toBe(false)
		await expect(pageStyle.borderTopLeftRadius).toBe("0px")
		await expect(pageStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)")

		const framesBetween: Element[] = []
		for (let frame = page.parentElement; frame && frame !== card; ) {
			framesBetween.push(frame)
			frame = frame.parentElement
		}
		await expect(framesBetween.filter(drawsABorder)).toEqual([])

		const header = page.querySelector("header")
		if (!header) throw new Error("The page draws no header")
		await expect(drawsABorder(header)).toBe(false)
	},
})

const MENU_LABEL = "Mission actions"

const MISSION_WITHOUT_A_MENU = "mission-ope-2109"

const MENU_ACTIONS = {
	onOpen: fn(),
	onOpenPullRequest: fn(),
	onCopy: fn(),
	onMessageAgent: fn(),
	onStopAgent: fn(),
	onAnswer: fn(),
	onClose: fn(),
	onReopen: fn(),
}

const wrapInMissionMenu: MissionsPageRowWrap = (row) => {
	const { mission } = row.props
	if (mission.id === MISSION_WITHOUT_A_MENU) return row

	return (
		<MissionMenu
			{...MENU_ACTIONS}
			hasBranch
			hasPullRequest={mission.pullRequest !== undefined}
			hasWorkspacePath
			state={mission.state}
		>
			{row}
		</MissionMenu>
	)
}

const WORKING_ROW_ENTRIES = [
	"Open mission",
	"Open PR",
	"Copy",
	"Message the coding session",
	"Stop the coding session",
	"Close",
]

const ROW_MENUS = [
	{ row: /^OPE-2118/, entries: WORKING_ROW_ENTRIES },
	{
		row: /^OPE-2124/,
		entries: [
			"Open mission",
			"Open PR",
			"Copy",
			"Answer the question",
			"Close",
		],
	},
	{
		row: /^OPE-2102/,
		entries: ["Open mission", "Copy", "Reopen"],
	},
]

const rightClick = (row: HTMLElement) =>
	fireEvent.contextMenu(row, { clientX: 40, clientY: 20 })

const openedMenuEntries = async () =>
	within(await shown(await screen.findByRole("menu", { name: MENU_LABEL })))
		.getAllByRole("menuitem")
		.map((item) => item.textContent)

const closeMenuWithEscape = async () => {
	await waitFor(
		() =>
			expect(screen.getByRole("menu").contains(document.activeElement)).toBe(
				true,
			),
		FRAME_POLL,
	)
	fireEvent.keyDown(document.activeElement ?? document.body, {
		key: "Escape",
	})
	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull(), FRAME_POLL)
}

export const MenuOnARow = meta.story({
	globals: { theme: "dark" },
	args: { defaultFoldedGroups: [], wrap: wrapInMissionMenu },
	parameters: {
		a11y: mergeA11y(
			A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
			A11Y_FLOATING_FOCUS_GUARDS,
			A11Y_SUBMENU_PORTAL_GUARD,
		),
		docs: {
			description: {
				story:
					"Every group open, each row wrapped in the mission menu the sidebar draws, left open on the working OPE-2118 row. Check that a right click on a working, a blocked-on-you and a done row opens the entries its state allows, that Escape hands focus back to the row it opened from, that a left click still opens the mission, and that the failed OPE-2109 row, given no menu, opens none and still opens its mission.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const rowWithoutMenu = canvas.getByRole("button", { name: /^OPE-2109/ })
		rightClick(rowWithoutMenu)
		await expect(screen.queryByRole("menu")).toBeNull()
		await userEvent.click(rowWithoutMenu)
		await expect(args.onOpen).toHaveBeenLastCalledWith(MISSION_WITHOUT_A_MENU)

		for (const { row: name, entries } of ROW_MENUS) {
			const row = canvas.getByRole("button", { name })
			rightClick(row)
			await expect(await openedMenuEntries()).toEqual(entries)
			await expect(row).toHaveAttribute("data-slot", "missions-page-row")
			await closeMenuWithEscape()
			await waitFor(() => expect(row).toHaveFocus(), FRAME_POLL)
			await expect(getComputedStyle(row).outlineStyle).toBe("solid")
		}

		const workingRow = canvas.getByRole("button", { name: /^OPE-2118/ })
		await userEvent.click(workingRow)
		await expect(args.onOpen).toHaveBeenLastCalledWith("mission-ope-2118")
		rightClick(workingRow)
		await expect(await openedMenuEntries()).toEqual(WORKING_ROW_ENTRIES)
	},
})

const MISSIONS_CONTENT_TOP = 56

const expectMissionsIsland = async (
	canvasElement: HTMLElement,
	surface: "bg-card" | "bg-card-raised",
) => {
	const page = slotIn(canvasElement, "missions-page")
	const frame = page.getBoundingClientRect()
	const bar = slotIn(page, "app-header")
	const islands = slotsIn(bar, "header-island")
	const [island] = islands
	const box = island.getBoundingClientRect()
	const title = within(island).getByRole("heading", {
		level: 1,
		name: "Missions",
	})
	const style = getComputedStyle(title)
	const groups = slotIn(page, "missions-page-groups")

	await expect(islands).toHaveLength(1)
	await expect(drawsABorder(bar)).toBe(false)
	await expect([
		box.left - frame.left,
		box.top - frame.top,
		box.height,
	]).toEqual([8, 8, 40])
	await expect(page).toHaveAttribute("aria-labelledby", title.id)
	await expect(within(island).queryAllByRole("button")).toHaveLength(0)
	await expect([style.fontSize, style.lineHeight, style.fontWeight]).toEqual([
		"14px",
		"16px",
		"500",
	])
	await expect(title.getBoundingClientRect().left - box.left).toBe(12)
	await expect(getComputedStyle(island).backgroundColor).toBe(
		tokenStyleIn(island, surface, "backgroundColor"),
	)
	await expect(
		slotsIn(groups, "missions-page-group-header")[0].getBoundingClientRect()
			.top -
			frame.top +
			groups.scrollTop,
	).toBe(MISSIONS_CONTENT_TOP)

	return { page, groups }
}

export const Missions4a = meta.story({
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story: `Artboard 4a, Missions with no mission selected. Check that no bar and no rule cross the top of the page: one island sits 8px from the top and the side and holds Missions alone, the level 1 heading that names the page, in 14px medium on a 16px line, with no control beside it and no trailing island. Check the first group starts 56px from the top. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { page } = await expectMissionsIsland(canvasElement, "bg-card")
		await expect(slotsIn(page, "screen-layout-fade")).toHaveLength(0)
	},
})

export const MissionsDark4b = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `Artboard 4b, Missions with no mission selected in the dark theme. Check that the title island wears the raised card surface and keeps the geometry of \`Missions4a\`. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectMissionsIsland(canvasElement, "bg-card-raised")
	},
})

export const MissionsScrolled4c = meta.story({
	args: { defaultFoldedGroups: [] },
	globals: LAPTOP_WINDOW,
	decorators: [
		(Story) => (
			<div className="h-100">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story: `Artboard 4c, Missions scrolled away from its start, every group open in a page 400px high. Check that the groups pass under the title island and that the top fade of the layout covers them as they leave. Pick \`Missions4a\` for the page at rest. ${WIRED_BY_NOBODY_YET}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { page, groups } = await expectMissionsIsland(
			canvasElement,
			"bg-card",
		)

		await expect(slotsIn(page, "screen-layout-fade")).toHaveLength(0)
		groups.scrollTo({ top: groups.scrollHeight })
		await waitFor(() => slotIn(page, "screen-layout-fade"))
		await expect(slotIn(page, "header-island")).toBeVisible()
	},
})
