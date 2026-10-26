import { expect, fn, type within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { resolvedRootColor } from "@workspace/storybook/story-utils"
import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	type ApplicationsOwner,
	ApplicationsPanel,
} from "@workspace/ui/components/plugin-settings/applications-panel"

const NEEDS_AUTHORIZATION_DOT = "bg-state-needs-authorization"

const CONNECTED_DOT = "bg-success"

const E3_DARK_NEEDS_AUTHORIZATION = "rgb(232, 176, 74)"

const E3_DARK_CONNECTED = "rgb(95, 191, 133)"

const expectDot = async (
	dot: HTMLElement,
	dotClass: string,
	backgroundColor: string,
) => {
	await expect(dot).toHaveClass(dotClass)
	await expect(getComputedStyle(dot).backgroundColor).toBe(backgroundColor)
}

const dotBeside = (canvas: ReturnType<typeof within>, state: string) => {
	const dot = canvas.getByText(state).previousElementSibling
	if (!(dot instanceof HTMLElement))
		throw new Error(`No dot beside the ${state} state.`)
	return dot
}

const SEARCH_ROW_HEIGHT = 36

const SEARCH_ROW_GAP = 8

const FLOORED_TEXT_SIZE = "32px"

const [LINEAR, GITHUB] = MARKED_APPLICATIONS
const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const COMPANION = {
	kind: "companion",
	name: "Repository archivist",
} satisfies ApplicationsOwner

const SPACE = {
	kind: "space",
	name: "Release desk",
} satisfies ApplicationsOwner

const PROFILE = { kind: "profile" } satisfies ApplicationsOwner

const NEEDS_AUTHORIZATION = {
	...GITHUB,
	connection: "needsAuthorization",
} satisfies BotMcpServerItem

const CONNECTING = {
	...LINEAR,
	connection: "connecting",
} satisfies BotMcpServerItem

const CONNECTED = {
	...LINEAR,
	connection: "connected",
} satisfies BotMcpServerItem

const FAILED = { ...LOCAL, connection: "failed" } satisfies BotMcpServerItem

const FAILED_FOR_A_REASON = {
	...FAILED,
	reason: { kind: "browserRefused" },
} satisfies BotMcpServerItem

const UNBROKEN_DETAIL = `0x${"a3f19b7c".repeat(40)}`

const FAILED_FOR_AN_UNKNOWN_REASON = {
	...FAILED,
	reason: { kind: "unknown", detail: UNBROKEN_DETAIL },
} satisfies BotMcpServerItem

const LONG_DISPLAY_NAME = {
	...LINEAR,
	name: "linear-enterprise",
	displayName: "Linear Enterprise workspace for the platform reliability guild",
} satisfies BotMcpServerItem

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationsPanel",
	component: ApplicationsPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The applications one owner connects to, shared by the companion, the space and the profile dialogs. The owner decides the sentence above the list, the empty title and description, and the footnote that closes the list for a space and for the profile; everything else is the same panel. A row reads as a mark, the name over its state, an action lane that only holds Connect or Retry, then a chevron. Taking a row reports the application; the panel keeps nothing.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[28rem] w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	args: {
		owner: COMPANION,
		servers: MARKED_APPLICATIONS,
		query: "",
		onQueryChange: fn(),
		onOpen: fn(),
		onAdd: fn(),
		onPaste: fn(),
		onConnect: fn(),
	},
})

export const Companion = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A companion with applications of its own. Check that the intro names the companion, that no footnote closes the list, and that no row prints an address.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByText(
				"What Repository archivist connects to for tools it doesn’t have on its own.",
			),
		).toBeVisible()
		await expect(
			canvasElement.querySelector('[data-slot="applications-footnote"]'),
		).toBeNull()
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
		await expect(canvas.queryByText(/mcp\.linear\.app/)).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Open Linear" }))

		await expect(args.onOpen).toHaveBeenCalledWith(LINEAR)
	},
})

export const Space = meta.story({
	args: { owner: SPACE },
	parameters: {
		docs: {
			description: {
				story:
					"The applications a space shares with every companion in it. Check that the intro names the space without counting its companions and that the footnote says a companion can still add its own.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("What every companion in Release desk connects to."),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Each companion here can add applications of its own, and you can add some for every space.",
			),
		).toBeVisible()
	},
})

export const Profile = meta.story({
	args: { owner: PROFILE },
	parameters: {
		docs: {
			description: {
				story:
					"The applications the person connects to in every space. Check the intro and the footnote that says they reach every companion.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("What you connect to, in every space."),
		).toBeVisible()
		await expect(
			canvas.getByText("These reach every companion you have, in every space."),
		).toBeVisible()
	},
})

export const EmptyCompanion = meta.story({
	args: { servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A companion with no application of its own. Check the search row above it, the three faded marks, the companion title and description, and the one way in the empty body offers: Add an application.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("No applications of its own")).toBeVisible()
		await expect(
			canvas.getByRole("textbox", { name: "Search applications" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Add an application" }),
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a configuration" }),
		)

		await expect(args.onAdd).toHaveBeenCalledTimes(1)
		await expect(args.onPaste).toHaveBeenCalledTimes(1)
	},
})

export const SearchRow = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The row above the body, drawn in the empty state as in the filled one. Check the search field taking the width, the 36 by 36 plus button eight after it, named after the flow it opens, and that pressing it asks for a configuration to paste.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByRole("textbox", { name: "Search applications" })
		const shell = field.closest("label") as HTMLElement
		const plus = canvas.getByRole("button", { name: "Paste a configuration" })

		await expect(Math.round(shell.getBoundingClientRect().height)).toBe(
			SEARCH_ROW_HEIGHT,
		)
		await expect(Math.round(plus.getBoundingClientRect().width)).toBe(
			SEARCH_ROW_HEIGHT,
		)
		await expect(Math.round(plus.getBoundingClientRect().height)).toBe(
			SEARCH_ROW_HEIGHT,
		)
		await expect(
			Math.round(
				plus.getBoundingClientRect().left - shell.getBoundingClientRect().right,
			),
		).toBe(SEARCH_ROW_GAP)
		await expect(plus).toHaveClass(
			"focus-visible:border-ring",
			"focus-visible:ring-3",
			"focus-visible:ring-ring/30",
		)

		await userEvent.click(plus)

		await expect(args.onPaste).toHaveBeenCalledTimes(1)
	},
})

export const SearchRowAtLargestTextSize = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same row under a text-size floor the browser applies to the input alone. Check that the field grows past the row height while the plus button keeps its 36 by 36 box, the gap unchanged and the button centred against the taller field.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByRole("textbox", { name: "Search applications" })
		const plus = canvas.getByRole("button", { name: "Paste a configuration" })

		field.style.fontSize = FLOORED_TEXT_SIZE

		const shell = (
			field.closest("label") as HTMLElement
		).getBoundingClientRect()
		const button = plus.getBoundingClientRect()

		await expect(shell.height).toBeGreaterThan(SEARCH_ROW_HEIGHT)
		await expect(Math.round(button.height)).toBe(SEARCH_ROW_HEIGHT)
		await expect(Math.round(button.left - shell.right)).toBe(SEARCH_ROW_GAP)
		await expect(Math.round(button.top - shell.top)).toBe(
			Math.round(shell.bottom - button.bottom),
		)
	},
})

export const SearchTextIsGiven = meta.story({
	args: { query: "linear" },
	parameters: {
		docs: {
			description: {
				story:
					"The panel holds no search text of its own. Check that the field shows what its owner passes and that typing reports back rather than changing the field alone.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByRole("textbox", { name: "Search applications" })

		await expect(field).toHaveValue("linear")

		await userEvent.type(field, "!")

		await expect(args.onQueryChange).toHaveBeenLastCalledWith("linear!")
		await expect(field).toHaveValue("linear")
	},
})

export const EmptySpace = meta.story({
	args: { owner: SPACE, servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A space that shares nothing yet. Check that the title names the space and that no footnote closes an empty list.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Nothing shared in Release desk yet"),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Add one here and every companion in this space gets its tools.",
			),
		).toBeVisible()
	},
})

export const EmptyProfile = meta.story({
	args: { owner: PROFILE, servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A person with no application of their own. Check the profile description, which says what belongs here rather than in a project.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("No applications of your own")).toBeVisible()
	},
})

export const NeedsAuthorization = meta.story({
	args: { servers: [NEEDS_AUTHORIZATION] },
	parameters: {
		docs: {
			description: {
				story:
					"An application that answered that nobody has authorized it yet. Check the amber dot beside its label, and that Connect is a target of its own: the keyboard reaches the row first, then Connect, each with its ring.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Needs authorization")).toBeVisible()
		await expectDot(
			dotBeside(canvas, "Needs authorization"),
			NEEDS_AUTHORIZATION_DOT,
			resolvedRootColor("--warning"),
		)

		await userEvent.tab()
		await expect(
			canvas.getByRole("textbox", { name: "Search applications" }),
		).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Paste a configuration" }),
		).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Add an application" }),
		).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Open GitHub" }),
		).toHaveFocus()
		await userEvent.tab()
		const connect = canvas.getByRole("button", { name: "Connect GitHub" })
		await expect(connect).toHaveFocus()

		await userEvent.click(connect)

		await expect(args.onConnect).toHaveBeenCalledWith(NEEDS_AUTHORIZATION)
		await expect(args.onOpen).not.toHaveBeenCalled()
	},
})

export const NeedsAuthorizationDark = meta.story({
	globals: { theme: "dark" },
	args: NeedsAuthorization.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The dark theme, for an application nobody has authorized yet. Check that its dot is amber and holds against the dark surface.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectDot(
			dotBeside(canvas, "Needs authorization"),
			NEEDS_AUTHORIZATION_DOT,
			E3_DARK_NEEDS_AUTHORIZATION,
		)
	},
})

export const Connecting = meta.story({
	args: { servers: [CONNECTING] },
	parameters: {
		docs: {
			description: {
				story:
					"An application while its sign-in is open in the browser. Check that the dot breathes, holds still under reduced motion, and that the lane stays empty at its width with no spinner in the row.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connecting…")).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Connect Linear" }),
		).not.toBeInTheDocument()
	},
})

export const Connected = meta.story({
	args: { servers: [CONNECTED] },
	parameters: {
		docs: {
			description: {
				story:
					"An authorized application at rest. Check that it says Connected beside the success dot and offers nothing in the lane.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connected")).toBeVisible()
		await expectDot(
			dotBeside(canvas, "Connected"),
			CONNECTED_DOT,
			resolvedRootColor("--success"),
		)
		await expect(
			canvas.queryByRole("button", { name: /Connect Linear|Retry Linear/ }),
		).not.toBeInTheDocument()
	},
})

export const ConnectedDark = meta.story({
	globals: { theme: "dark" },
	args: Connected.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The dark theme, for an authorized application at rest. Check that its dot is the success green and holds against the dark surface.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectDot(
			dotBeside(canvas, "Connected"),
			CONNECTED_DOT,
			E3_DARK_CONNECTED,
		)
	},
})

export const Failed = meta.story({
	args: { servers: [FAILED] },
	parameters: {
		docs: {
			description: {
				story:
					"An application whose last attempt was refused. Check the destructive dot, the muted label, and Retry on the outline button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Retry atlas" }))

		await expect(args.onConnect).toHaveBeenCalledWith(FAILED)
	},
})

export const FailedWithReason = meta.story({
	args: { servers: [FAILED_FOR_A_REASON] },
	parameters: {
		docs: {
			description: {
				story:
					"The same refused attempt, with the step that failed named under the state label. Check that the sentence sits in the muted foreground, that the red stays on the dot alone, and that Retry keeps its place in the lane.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()
		await expect(
			canvas.getByText(
				"Your browser wouldn’t open. Try again, or open the sign-in link yourself.",
			),
		).toBeVisible()
	},
})

export const FailedWithLongReason = meta.story({
	args: { servers: [FAILED_FOR_AN_UNKNOWN_REASON] },
	decorators: [
		(Story) => (
			<div className="w-80" data-testid="narrow-frame">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"An unknown failure whose detail is one unbroken 320 character token, in a 320px column. Check that the row keeps its column, that the token breaks rather than widening anything, and that the sentence stops at two lines.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [row] = canvas.getAllByRole("listitem")
		const frame = canvas.getByTestId("narrow-frame")
		const reason = canvas.getByText(new RegExp(UNBROKEN_DETAIL.slice(0, 24)))

		await expect(row.getBoundingClientRect().width).toBeLessThanOrEqual(
			frame.getBoundingClientRect().width,
		)
		await expect(reason.scrollHeight).toBeGreaterThan(reason.clientHeight)
	},
})

export const Unanswered = meta.story({
	args: { servers: [CONNECTED, REMOTE] },
	parameters: {
		docs: {
			description: {
				story:
					"An application no session has answered for yet, beside one that has. Check that the second row keeps its height with an empty second line, and that both chevrons stay aligned.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [answered, silent] = canvas.getAllByRole("listitem")

		await expect(silent.getBoundingClientRect().height).toBe(
			answered.getBoundingClientRect().height,
		)
		await expect(
			canvas.getByRole("button", { name: "Open ledger" }),
		).toBeVisible()
	},
})

export const WithoutDisplayName = meta.story({
	args: { servers: [LINEAR, LOCAL] },
	parameters: {
		docs: {
			description: {
				story:
					"An application with a display name beside one known only by its slug. Check that the slug is set in the mono face and fills its mark slot with the server glyph on the muted surface.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("atlas")).toHaveClass("font-mono")
		await expect(canvas.getByText("Linear")).not.toHaveClass("font-mono")
	},
})

export const LongContent = meta.story({
	args: {
		servers: [LONG_DISPLAY_NAME, LONG_MCP_SERVER, ...MARKED_APPLICATIONS],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Names wider than their column, in both faces. Check that each row holds one line and cuts the name with an ellipsis, with the lane and chevron in place.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [long, short] = canvas.getAllByRole("listitem")

		await expect(long.getBoundingClientRect().height).toBe(
			short.getBoundingClientRect().height,
		)
	},
})

export const Unreadable = meta.story({
	args: { servers: [], haveFailedToLoad: true },
	parameters: {
		docs: {
			description: {
				story:
					"The read of this owner's applications was refused. The panel says so instead of showing the empty state.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Couldn’t load applications. Reopen settings to retry."),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Add an application" }),
		).not.toBeInTheDocument()
	},
})
