import type { ReactNode } from "react"
import { expect, fn, waitFor, type within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionHueOf,
	FRAME_POLL,
	slotIn,
	slotsIn,
	tokenLengthOf,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AppSidebar,
	type AppSidebarBot,
} from "@workspace/ui/components/app-sidebar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { hueDistance } from "@workspace/ui/components/hue-recipe"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import type { ReplyQuote } from "@workspace/ui/components/prompt-reply"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_WIDTH_STEP,
} from "@workspace/ui/components/sidebar-resize"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import {
	SHELL_TITLE_BAR_HEIGHT,
	WorkspaceShell,
} from "@workspace/ui/components/workspace-shell"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: "blue",
}

const ROSTER: AppSidebarBot[] = [
	{
		id: "atlas",
		name: "Atlas",
		title: "Research",
		blot: "blue",
		lastMessage: ANSWER,
	},
]

const SIDEBAR = <AppSidebar bots={ROSTER} selectedBotId="atlas" />

const chat = (leading?: ReactNode, reply?: ReplyQuote) => (
	<ThreadLayout
		reply={reply}
		header={
			<AppHeader
				leading={
					leading ?? (
						<HeaderIdentityButton
							connection="ready"
							name="Skippy"
							onOpenSettings={fn()}
							seed={BOT.id}
							version="2.1.233"
						/>
					)
				}
				trailing={<PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />}
			/>
		}
		composer={<PromptInput onSubmit={fn()} />}
	>
		<UserTurn>How is this workspace laid out?</UserTurn>
		<AssistantTurn copyText={ANSWER} identity={BOT}>
			{ANSWER}
		</AssistantTurn>
	</ThreadLayout>
)

const CHAT = chat()

const CHAT_WITH_REPLY = chat(undefined, {
	author: "Skippy",
	excerpt: ANSWER,
	from: "assistant",
	onJump: fn(),
	onDismiss: fn(),
})

const OVERFLOWING_CHILD = <div className="h-[300svh] w-full bg-muted" />

const shellSurface = (canvas: ReturnType<typeof within>) =>
	canvas.getByRole("main").parentElement as HTMLElement

const SIDEBAR_LABEL = "Conversations"

const stateOf = (sidebar: HTMLElement) =>
	sidebar.closest<HTMLElement>("[data-slot=sidebar]")?.dataset.state

const paintOf = (element: HTMLElement) =>
	getComputedStyle(element).backgroundColor

const paintFor = (value: string) => {
	const swatch = document.createElement("div")
	swatch.style.backgroundColor = value
	document.body.append(swatch)
	const painted = paintOf(swatch)
	swatch.remove()
	return painted
}

const shellInset = () => Number.parseFloat(tokenLengthOf("--shell-inset"))

const expectCardDetached = async (card: HTMLElement, leadingEdge: number) => {
	const edges = card.getBoundingClientRect()
	await expect(edges.left - leadingEdge).toBe(0)
	await expect(window.innerWidth - edges.right).toBe(shellInset())
	await expect(edges.top).toBe(SHELL_TITLE_BAR_HEIGHT)
	await expect(window.innerHeight - edges.bottom).toBe(shellInset())
}

const YOU_AVATAR_INSET = 17

const COMPOSER_INSET_IN_CARD = 9

const expectCardAndComposerOnShellInset = async (root: HTMLElement) => {
	const avatar = slotIn(root, "app-rail-avatar").getBoundingClientRect()
	const card = root.querySelector<HTMLElement>("[data-content-card]")
	if (!card) throw new Error("No content card rendered")
	const cardEdges = card.getBoundingClientRect()
	const quotes = root.querySelectorAll<HTMLElement>(
		'[data-slot="chat-layout"] [data-slot="message-quote"]',
	)
	const composer = quotes[quotes.length - 1]
	if (!composer) throw new Error("No composer rendered")
	const edges = composer.getBoundingClientRect()
	const avatarInset = window.innerHeight - avatar.bottom

	await expect(avatarInset).toBe(YOU_AVATAR_INSET)
	await expect(avatar.left).toBe(YOU_AVATAR_INSET)
	await expect(window.innerHeight - cardEdges.bottom).toBe(shellInset())
	await expect(window.innerWidth - cardEdges.right).toBe(shellInset())
	await expect(cardEdges.bottom - edges.bottom).toBe(COMPOSER_INSET_IN_CARD)
	await expect(cardEdges.right - edges.right).toBe(COMPOSER_INSET_IN_CARD)
}

const meta = preview.meta({
	title: "Layout/WorkspaceShell",
	component: WorkspaceShell,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The application shell: the sidebar surface is the window itself, reaching every edge with no seam, and the main column floats on it as a rounded card detached on all four sides. It is a thin composition over the sidebar foundation — the shell pins the sidebar expanded at one fixed width, with no collapse, no trigger and no resize edge, and hands the room that is left to the card. Whatever fills that card keeps its own scroll boundary, so a `ThreadLayout` still scrolls its transcript alone while the surface around it stays put. `spaceTint` hands the hue of the space in view to the bubbles, the accent and the New line inside the shell, while the surface itself stays neutral.",
			},
		},
	},
	args: {
		children: CHAT,
	},
})

export const ConversationOpenDark = meta.story({
	args: {
		sidebar: (
			<AppSidebar
				bots={ROSTER}
				insetWindowControls
				railDots={{ conversations: "done", missions: "attention" }}
				selectedBotId="atlas"
			/>
		),
	},
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The V1e shell with a conversation open: rail, Conversations panel and the conversation sharing one shell card. Check the transcript and the composer sit on the card surface, so the panel and the conversation read as one card with a single divider between them rather than two surfaces.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = canvas.getByRole("main")
		const layout = canvasElement.querySelector<HTMLElement>(
			'[data-slot="chat-layout"]',
		)
		if (!layout) throw new Error("No thread layout rendered")
		await expect(getComputedStyle(layout).backgroundColor).toBe(
			getComputedStyle(card).backgroundColor,
		)
		await expect(
			canvas
				.getByRole("complementary", { name: SIDEBAR_LABEL })
				.getBoundingClientRect().bottom,
		).toBe(card.getBoundingClientRect().bottom)
		await expectCardAndComposerOnShellInset(canvasElement)
	},
})

export const ComposerWithReplyOnShellInset = meta.story({
	tags: ["test-only"],
	args: {
		sidebar: SIDEBAR,
		children: CHAT_WITH_REPLY,
	},
	play: async ({ canvasElement }) => {
		await expectCardAndComposerOnShellInset(canvasElement)
	},
})

export const Default = meta.story({
	args: {
		sidebar: SIDEBAR,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The nominal workspace: an expanded sidebar holding the session list, and a live conversation in the main column. Check that the transcript takes the whole room the panel leaves it and starts where the panel ends rather than running under it, that only the transcript scrolls — the sidebar, the bar above it and the composer stay put — and that Tab reaches the sidebar before the transcript. The app assembles it at `apps/app/src/App.tsx:928`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const sidebar = canvas.getByRole("complementary", { name: SIDEBAR_LABEL })
		await expect(sidebar).toBeVisible()
		await expect(canvas.getByRole("main")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toBeVisible()

		const surface = shellSurface(canvas)
		await expect(surface).not.toHaveAttribute("data-hue")
		await expect(paintOf(surface)).toBe(paintFor("var(--background)"))
		await expectCardDetached(
			canvas.getByRole("main"),
			sidebar.getBoundingClientRect().right,
		)

		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const column = canvas.getByRole("log")
		await expect(viewport.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			sidebar.getBoundingClientRect().right,
		)
		await expect(column.clientWidth).toBe(viewport.clientWidth)
		await expect(viewport.clientHeight).toBeLessThan(window.innerHeight)
		await expect(viewport).toHaveClass("scrollbar-overlay")
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
	},
})

export const SkipsToTheConversation = meta.story({
	args: {
		sidebar: SIDEBAR,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The skip link the shell puts ahead of everything else. Check that the first Tab lands on it before any sidebar control, that it shows while focused, and that Enter moves focus into the main region holding the conversation.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const link = canvas.getByRole("link", { name: "Skip to the conversation" })

		await userEvent.tab()
		await expect(link).toHaveFocus()
		await expect(link).toBeVisible()

		await userEvent.keyboard("{Enter}")
		await expect(canvas.getByRole("main")).toHaveFocus()
	},
})

const shellPaintWithoutSpaceColour = () => {
	const swatch = document.createElement("div")
	swatch.className = "surface-shell"
	document.body.append(swatch)
	const painted = paintOf(swatch)
	swatch.remove()
	return painted
}

const expectNeutralShellInSpace = async (
	canvas: ReturnType<typeof within>,
	hue: number,
) => {
	const surface = shellSurface(canvas)
	const scheme = schemeOf(surface)

	await expect(surface).toHaveAttribute("data-hue", String(hue))
	await expect(paintOf(surface)).toBe(shellPaintWithoutSpaceColour())
	await expect(paintOf(canvas.getByRole("main"))).toBe(paintFor("var(--card)"))
	await expect(tokenPaintOf(surface, "--primary")).toBe(
		tokenPaintOf(surface, `--hue-${scheme}-accent`),
	)
	await expect(tokenPaintOf(surface, "--user-bubble")).toBe(
		tokenPaintOf(surface, `--hue-${scheme}-bubble`),
	)
}

const tokenPaintOf = (host: HTMLElement, token: string) => {
	const swatch = document.createElement("div")
	swatch.style.backgroundColor = `var(${token})`
	host.append(swatch)
	const painted = paintOf(swatch)
	swatch.remove()
	return painted
}

const SPACE_TINTED_ARGS = {
	sidebar: SIDEBAR,
	spaceTint: "blue",
} as const

export const SpaceTinted = meta.story({
	args: SPACE_TINTED_ARGS,
	parameters: {
		docs: {
			description: {
				story:
					"The same shell with a space in view. The window background stays neutral whatever the space colour: the hue reaches the reader's bubbles, the accent (dots, badges, focus ring, Send) and the New line, never the title bar area, the rail, the gutters, the card or the Conversations panel. Check that the background reads exactly as a space with no colour and that the accent and the bubble follow the space hue. Pick `SpaceTintedDark` for the dark theme, `Default` for a space with no colour. The app assembles it at `apps/app/src/App.tsx:928`.",
			},
		},
	},
	play: async ({ canvas }) => expectNeutralShellInSpace(canvas, BLOT_HUES.blue),
})

export const SpaceTintedDark = meta.story({
	args: SPACE_TINTED_ARGS,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The coloured shell in the dark theme: the window background stays black and the card #121213 whatever the space colour. Check that nothing of the shell reads as the space colour while the accent and the bubble do. Pick `SpaceTinted` for the light theme. The app assembles it at `apps/app/src/App.tsx:928`.",
			},
		},
	},
	play: async ({ canvas }) => expectNeutralShellInSpace(canvas, BLOT_HUES.blue),
})

const FOUR_COMPANIONS: AppSidebarBot[] = [
	{ id: "atlas", name: "Atlas", blot: "blue", lastMessage: ANSWER },
	{ id: "lyra", name: "Lyra", blot: "pink", lastMessage: ANSWER },
	{ id: "nova", name: "Nova", blot: "green", lastMessage: ANSWER },
	{ id: "vega", name: "Vega", blot: "yellow", lastMessage: ANSWER },
]

const FOUR_COMPANIONS_SIDEBAR = (
	<AppSidebar bots={FOUR_COMPANIONS} selectedBotId="atlas" />
)

const DISTINCT_HUE_GAP = 30

const expectCompanionsToldApart = async (sidebar: HTMLElement) => {
	const fields = slotsIn(sidebar, "companion-field")
	const hues = fields.map(companionHueOf)
	const inks = fields.map(
		(field) => getComputedStyle(field.querySelector("canvas") ?? field).color,
	)

	await expect(hues).toEqual(
		FOUR_COMPANIONS.map(({ blot }) => (blot ? BLOT_HUES[blot] : undefined)),
	)
	await expect(new Set(inks).size).toBe(FOUR_COMPANIONS.length)
	for (const [index, hue] of hues.entries())
		for (const other of hues.slice(index + 1))
			await expect(hueDistance(hue ?? 0, other ?? 0)).toBeGreaterThanOrEqual(
				DISTINCT_HUE_GAP,
			)
}

const fourCompanionsStory = (blot: "orange" | "blue", description: string) => ({
	args: { sidebar: FOUR_COMPANIONS_SIDEBAR, spaceTint: blot },
	globals: { theme: "dark" },
	parameters: { docs: { description: { story: description } } },
	play: async ({ canvas }: { canvas: ReturnType<typeof within> }) => {
		await expectNeutralShellInSpace(canvas, BLOT_HUES[blot])
		await expectCompanionsToldApart(
			canvas.getByRole("complementary", { name: SIDEBAR_LABEL }),
		)
	},
})

export const FourCompanionsInWarmSpaceDark = meta.story(
	fourCompanionsStory(
		"orange",
		"Four companions in a warm space, hue 63, in the dark theme, the roster carrying no title so only the avatar tells them apart. Check that blue, pink, green and yellow each read as their own hue at a glance on the black shell, that none of them drifts towards the orange of the space accent, and that the shell itself stays neutral. Pick `FourCompanionsInColdSpaceDark` for the cold counterpart.",
	),
)

export const FourCompanionsInColdSpaceDark = meta.story(
	fourCompanionsStory(
		"blue",
		"Four companions in a cold space, hue 257, in the dark theme, the roster carrying no title so only the avatar tells them apart. Check that Atlas, whose blue matches the space, still reads apart from the three others, that pink, green and yellow keep their hue, and that the shell itself stays neutral. Pick `FourCompanionsInWarmSpaceDark` for the warm counterpart.",
	),
)

export const NotALandmark = meta.story({
	tags: ["test-only"],
	args: {
		sidebar: SIDEBAR,
		isLandmark: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same shell mounted inside a page that already carries its own `main`, a demonstration of the app on a marketing page for instance, where a second main landmark would leave the document with two. Check that the card renders exactly as it does by default, floating with the same gutter and holding the same conversation, and that nothing in the shell answers to the main role. Pick `Default` for the shell that owns the landmark.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = canvasElement.querySelector(
			"[data-content-card]",
		) as HTMLElement

		await expect(canvas.queryByRole("main")).toBeNull()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toBeVisible()
		await expectCardDetached(
			card,
			canvas
				.getByRole("complementary", { name: SIDEBAR_LABEL })
				.getBoundingClientRect().right,
		)
	},
})

export const Empty = meta.story({
	tags: ["test-only"],
	args: {
		children: null,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Both slots empty: no sidebar, no main content. Check that the card still floats on the shell surface with the same gutter on all four edges, with no leftover rail or seam on the leading edge where the sidebar would sit — an omitted sidebar must cost nothing rather than collapse the row. Pick `Default` for the populated shell.",
			},
		},
	},
	play: async ({ canvas }) => {
		const main = canvas.getByRole("main")
		await expect(main).toBeVisible()
		await expect(canvas.queryByRole("complementary")).toBeNull()
		await expectCardDetached(main, 0)
	},
})

const WIDER_BY = 60

const handleIn = (canvas: ReturnType<typeof within>) =>
	canvas.getByRole("separator", { name: "Resize sidebar" })

const widthOf = (element: HTMLElement) =>
	Math.round(element.getBoundingClientRect().width)

const expectWidth = async (sidebar: HTMLElement, expected: number) => {
	await waitFor(async () => {
		await expect(widthOf(sidebar)).toBe(expected)
	}, FRAME_POLL)
}

interface PointerStep {
	coords?: { clientX: number; clientY: number }
	keys?: string
	target?: HTMLElement
}

interface DragParams {
	by: number
	handle: HTMLElement
	pointer: (steps: PointerStep[]) => Promise<void>
}

const dragHandleBy = async ({ by, handle, pointer }: DragParams) => {
	const grip = handle.getBoundingClientRect()
	const from = {
		clientX: grip.left + grip.width / 2,
		clientY: grip.top + grip.height / 2,
	}
	const to = { clientX: from.clientX + by, clientY: from.clientY }
	await pointer([
		{ keys: "[MouseLeft>]", target: handle, coords: from },
		{ coords: to },
		{ keys: "[/MouseLeft]", coords: to },
	])
}

export const Resized = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a reader drags the sidebar's inline-end edge to give it more room. Check that the panel tracks the pointer live, that the width is reported once on release as a whole number of pixels, and that a pointer run far past the edge stops the panel at 416px. Pick `ResizeByKeyboard` for the same width moved without a pointer, `NotResizable` for a host that fixes it. The app allows the drag at `apps/app/src/App.tsx`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: SIDEBAR_LABEL })
		const widened = SIDEBAR_DEFAULT_WIDTH + WIDER_BY

		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH)
		await dragHandleBy({ by: WIDER_BY, handle, pointer: userEvent.pointer })

		await expectWidth(sidebar, widened)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(1)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(widened)
		await expect(handle).toHaveAttribute("aria-valuenow", String(widened))

		await dragHandleBy({
			by: window.innerWidth,
			handle,
			pointer: userEvent.pointer,
		})
		await expectWidth(sidebar, SIDEBAR_MAX_WIDTH)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(SIDEBAR_MAX_WIDTH)
	},
})

export const ResizeByKeyboard = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the reader never touches a pointer: the edge takes focus and the arrow keys move the width one 16px step at a time. Check that the handle shows its focus line, that ArrowRight widens and ArrowLeft narrows, that each press reports the new width, and that Cmd+B or Ctrl+B leaves the panel open at the width it holds. Pick `Resized` for the drag. The app allows the resize at `apps/app/src/App.tsx`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: SIDEBAR_LABEL })
		const widened = SIDEBAR_DEFAULT_WIDTH + SIDEBAR_WIDTH_STEP

		handle.focus()
		await expect(handle).toHaveFocus()

		await userEvent.keyboard("{ArrowRight}")
		await expectWidth(sidebar, widened)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(widened)

		await userEvent.keyboard("{ArrowLeft}")
		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			SIDEBAR_DEFAULT_WIDTH,
		)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(2)

		await userEvent.keyboard("{Meta>}b{/Meta}")
		await userEvent.keyboard("{Control>}b{/Control}")
		await expect(stateOf(sidebar)).toBe("expanded")
		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH)
	},
})

export const NotResizable = meta.story({
	args: {
		sidebar: SIDEBAR,
		width: SIDEBAR_DEFAULT_WIDTH + WIDER_BY,
		isResizable: false,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host runs somewhere the reader may not change the width: every desktop platform but macOS. Check that the inline-end edge carries no handle, that nothing along it takes focus or turns the cursor into a resize arrow, and that the panel still sits at the width the host stored rather than falling back to the default. Pick `Resized` for the same shell where dragging is allowed. The app decides it at `apps/app/src/App.tsx`.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const sidebar = canvas.getByRole("complementary", { name: SIDEBAR_LABEL })

		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH + WIDER_BY)
		await expect(
			canvas.queryByRole("separator", { name: /resize/i }),
		).toBeNull()
		await expect(args.onWidthChange).not.toHaveBeenCalled()
	},
})

export const TallContent = meta.story({
	tags: ["test-only"],
	args: {
		sidebar: SIDEBAR,
		children: OVERFLOWING_CHILD,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shell handed a child three times taller than the window. Check that the window itself never scrolls — the document stays exactly as tall as the viewport, and no band of background appears under the shell — and that the overflow is clipped inside the main column rather than pushing the sidebar up with it. Whatever a screen puts in that column keeps its own scroll boundary; the shell never lends it the page. Pick `Default` for a conversation that fits.",
			},
		},
	},
	play: async ({ canvas }) => {
		const page = document.scrollingElement as HTMLElement
		await expect(page.scrollHeight).toBe(page.clientHeight)

		const main = canvas.getByRole("main")
		await expect(main.getBoundingClientRect().height).toBeLessThanOrEqual(
			window.innerHeight,
		)

		const sidebar = canvas.getByRole("complementary", { name: SIDEBAR_LABEL })
		await expect(sidebar.getBoundingClientRect().top).toBe(
			SHELL_TITLE_BAR_HEIGHT,
		)
	},
})

const boxedHost = (height: string) => (Story: () => ReactNode) => (
	<div className="p-6">
		<div className={`${height} rounded-2xl ring-1 ring-border`} data-boxed-host>
			<Story />
		</div>
	</div>
)

const hostEdges = (canvasElement: HTMLElement) =>
	(
		canvasElement.querySelector("[data-boxed-host]") as HTMLElement
	).getBoundingClientRect()

const expectSidebarFillingHost = async (
	canvas: ReturnType<typeof within>,
	canvasElement: HTMLElement,
) => {
	const host = hostEdges(canvasElement)
	const sidebar = canvas
		.getByRole("complementary", { name: SIDEBAR_LABEL })
		.getBoundingClientRect()

	await expect(sidebar.top).toBe(host.top + SHELL_TITLE_BAR_HEIGHT)
	await expect(sidebar.bottom).toBe(host.bottom - shellInset())
	await expect(sidebar.bottom).toBe(
		canvas.getByRole("main").getBoundingClientRect().bottom,
	)
}

export const BoxedHost = meta.story({
	tags: ["test-only"],
	args: {
		sidebar: SIDEBAR,
	},
	decorators: [boxedHost("h-[420px]")],
	parameters: {
		docs: {
			description: {
				story:
					"The same shell mounted in a host shorter than the window — a product page showing the app in a frame rather than a window that owns the screen. Check that the sidebar, the card and the composer all land inside that frame, that the sidebar holds both its edges on the frame rather than running to the bottom of the window behind it. Pick `TallHost` for a frame taller than the window, `Default` for a host that constrains no height at all.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const host = hostEdges(canvasElement)
		const composer = canvas.getByRole("textbox", { name: "Message" })

		await expect(host.bottom).toBeLessThan(window.innerHeight)
		await expectSidebarFillingHost(canvas, canvasElement)
		await expect(canvas.getByRole("main").getBoundingClientRect().bottom).toBe(
			host.bottom - shellInset(),
		)
		await expect(composer.getBoundingClientRect().bottom).toBeLessThan(
			host.bottom,
		)
	},
})

export const TallHost = meta.story({
	tags: ["test-only"],
	args: {
		sidebar: SIDEBAR,
	},
	decorators: [boxedHost("h-[1400px]")],
	parameters: {
		docs: {
			description: {
				story:
					"The same frame, this time taller than the window it is read in — the marketing page on a laptop, where the app window keeps its designed height and the page scrolls to it. Check that the shell grows to the whole frame instead of stopping at the window edge, leaving a band of page showing underneath, and that the sidebar holds both edges of the frame. Pick `BoxedHost` for a frame the window can hold whole.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const host = hostEdges(canvasElement)

		await expect(host.height).toBeGreaterThan(window.innerHeight)
		await expectSidebarFillingHost(canvas, canvasElement)
		await expect(canvas.getByRole("main").getBoundingClientRect().bottom).toBe(
			host.bottom - shellInset(),
		)
	},
})
