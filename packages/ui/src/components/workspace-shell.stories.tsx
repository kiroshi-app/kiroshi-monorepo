import { type ReactNode, useState } from "react"
import { expect, fireEvent, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionHueOf,
	emulateMotion,
	FRAME_POLL,
	isInBrowserRunner,
	slotIn,
	slotsIn,
	tokenLengthOf,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AppSidebar,
	type AppSidebarBot,
} from "@workspace/ui/components/app-sidebar"
import {
	DESK_ROOM,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { hueTone } from "@workspace/ui/components/hue-palette"
import { hueDistance } from "@workspace/ui/components/hue-recipe"
import { Icons } from "@workspace/ui/components/icons"
import { Markdown } from "@workspace/ui/components/markdown"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"
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
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import {
	SHELL_TITLE_BAR_HEIGHT,
	WorkspaceShell,
	WorkspaceShellRoot,
} from "@workspace/ui/components/workspace-shell"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: BLOT_HUES.blue,
}

const ROSTER: AppSidebarBot[] = [
	{
		id: "atlas",
		name: "Atlas",
		title: "Research",
		blot: BLOT_HUES.blue,
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

const THREAD_READING_WIDTH = 680

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
	await expect(
		Math.abs(cardEdges.right - edges.right - (edges.left - cardEdges.left)),
	).toBeLessThanOrEqual(1)
	await expect(cardEdges.right - edges.right).toBeGreaterThanOrEqual(
		COMPOSER_INSET_IN_CARD,
	)
}

const meta = preview.meta({
	title: "Layout/WorkspaceShell",
	component: WorkspaceShell,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The application shell: the sidebar surface is the window itself, reaching every edge with no seam, and the main column floats on it as a rounded card detached on all four sides. It is a thin composition over the sidebar foundation — the shell keeps the sidebar expanded at one fixed width unless its caller collapses it through `open` and `onOpenChange`, with no trigger and no resize edge of its own, and hands the room that is left to the card. Whatever fills that card keeps its own scroll boundary, so a `ThreadLayout` still scrolls its transcript alone while the surface around it stays put. `spaceTint` hands the hue of the space in view to the bubbles, the accent and the New line inside the shell, while the surface itself stays neutral.",
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
			<AppSidebar bots={ROSTER} insetWindowControls selectedBotId="atlas" />
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
					"The nominal workspace: an expanded sidebar holding the session list, and a live conversation in the main column. Check that the transcript scrolls in the whole room the panel leaves it, its column centred there with 680 of reading width, and starts where the panel ends rather than running under it, that only the transcript scrolls — the sidebar, the bar above it and the composer stay put — and that Tab reaches the sidebar before the transcript. The app assembles it at `apps/app/src/App.tsx:928`.",
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
		const room = viewport.getBoundingClientRect()
		const columnBox = column.getBoundingClientRect()
		const { paddingLeft, paddingRight } = getComputedStyle(column)
		const readingLeft = columnBox.left + Number.parseFloat(paddingLeft)
		const readingRight = columnBox.right - Number.parseFloat(paddingRight)
		await expect(Math.round(readingRight - readingLeft)).toBe(
			THREAD_READING_WIDTH,
		)
		await expect(Math.round(readingLeft - room.left)).toBe(
			Math.round(room.right - readingRight),
		)
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
		tokenPaintOf(
			surface,
			scheme === "dark" ? "--hue-dark-accent" : `--hue-${scheme}-bubble`,
		),
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
	spaceTint: BLOT_HUES.blue,
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

export const FreeHue = meta.story({
	args: { ...SPACE_TINTED_ARGS, spaceTint: 210 },
	parameters: {
		docs: {
			description: {
				story:
					"The shell with a space at a hue outside the eight presets, 210. Check that the accent and the bubble follow 210 rather than the nearest preset while the shell itself stays neutral. Pick `SpaceTinted` for a preset hue.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expectNeutralShellInSpace(canvas, 210)
		const surface = shellSurface(canvas)
		await expect(tokenPaintOf(surface, "--primary")).toBe(
			paintFor(hueTone(210, schemeOf(surface), "accent").hex),
		)
	},
})

const FOUR_COMPANIONS: AppSidebarBot[] = [
	{ id: "atlas", name: "Atlas", blot: BLOT_HUES.blue, lastMessage: ANSWER },
	{ id: "lyra", name: "Lyra", blot: BLOT_HUES.pink, lastMessage: ANSWER },
	{ id: "nova", name: "Nova", blot: BLOT_HUES.green, lastMessage: ANSWER },
	{ id: "vega", name: "Vega", blot: BLOT_HUES.yellow, lastMessage: ANSWER },
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
		FOUR_COMPANIONS.map(({ blot }) => blot ?? undefined),
	)
	await expect(new Set(inks).size).toBe(FOUR_COMPANIONS.length)
	for (const [index, hue] of hues.entries())
		for (const other of hues.slice(index + 1))
			await expect(hueDistance(hue ?? 0, other ?? 0)).toBeGreaterThanOrEqual(
				DISTINCT_HUE_GAP,
			)
}

const fourCompanionsStory = (hue: number, description: string) => ({
	args: { sidebar: FOUR_COMPANIONS_SIDEBAR, spaceTint: hue },
	globals: { theme: "dark" },
	parameters: { docs: { description: { story: description } } },
	play: async ({ canvas }: { canvas: ReturnType<typeof within> }) => {
		await expectNeutralShellInSpace(canvas, hue)
		await expectCompanionsToldApart(
			canvas.getByRole("complementary", { name: SIDEBAR_LABEL }),
		)
	},
})

export const FourCompanionsInWarmSpaceDark = meta.story(
	fourCompanionsStory(
		BLOT_HUES.orange,
		"Four companions in a warm space, hue 63, in the dark theme, the roster carrying no title so only the avatar tells them apart. Check that blue, pink, green and yellow each read as their own hue at a glance on the black shell, that none of them drifts towards the orange of the space accent, and that the shell itself stays neutral. Pick `FourCompanionsInColdSpaceDark` for the cold counterpart.",
	),
)

export const FourCompanionsInColdSpaceDark = meta.story(
	fourCompanionsStory(
		BLOT_HUES.blue,
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

const grabHandle = (handle: HTMLElement, by: number) => {
	const grip = handle.getBoundingClientRect()
	const from = {
		clientX: grip.left + grip.width / 2,
		clientY: grip.top + grip.height / 2,
	}
	return { from, to: { clientX: from.clientX + by, clientY: from.clientY } }
}

const dragHandleBy = async ({ by, handle, pointer }: DragParams) => {
	const { from, to } = grabHandle(handle, by)
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

const expectNothingInTheLeftColumn = async (
	canvas: ReturnType<typeof within>,
	canvasElement: HTMLElement,
) => {
	await expect(slotsIn(canvasElement, "navigation-sidebar")).toHaveLength(0)
	await expect(slotsIn(canvasElement, "expanded-sidebar")).toHaveLength(0)
	await expect(canvas.getByRole("main").getBoundingClientRect().left).toBe(
		shellInset(),
	)
}

type NavigationShellProps = {
	hasInsetControls?: boolean
	isInitiallyOpen?: boolean
	tabs?: TitleBarTab[]
	onWidthChange?: (width: number) => void
	children?: ReactNode
}

const NavigationShell = ({
	hasInsetControls = true,
	isInitiallyOpen = true,
	tabs = [],
	onWidthChange,
	children,
}: NavigationShellProps) => {
	const [isOpen, setIsOpen] = useState(isInitiallyOpen)

	return (
		<WorkspaceShellRoot
			onOpenChange={setIsOpen}
			onWidthChange={onWidthChange}
			open={isOpen}
		>
			<AppTitleBar
				insetWindowControls={hasInsetControls}
				onOpenSearch={fn()}
				onToggleSidebar={() => setIsOpen(!isOpen)}
				tabs={tabs}
			/>
			<NavigationSidebar
				conversations={null}
				destination="newConversation"
				missionCount={1}
				pinned={
					<SidebarMenu>
						<ConversationRosterRow
							conversation={DESK_ROOM}
							isPinned
							isSelected={false}
							lift={STILL_LIFT}
							sections={[SIDEBAR_SECTION]}
						/>
					</SidebarMenu>
				}
				selectedSpaceId="kiroshi"
				spaces={[
					{
						id: "kiroshi",
						name: "Kiroshi",
						colour: BLOT_HUES.blue,
						avatarSeed: "kiroshi",
					},
				]}
				update={{ status: "available", onDownload: fn() }}
				user={{ name: "Ada Martin" }}
			/>
			<ContentCard>{children}</ContentCard>
		</WorkspaceShellRoot>
	)
}

export const SwitchesBetweenExpandedAndCollapsed = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	render: () => <NavigationShell />,
	parameters: {
		docs: {
			description: {
				story:
					"The caller holds the open state. Check the title bar toggle takes the expanded sidebar away and leaves nothing in the left column, the card starting on the shell inset, and the sidebar shortcut brings the expanded sidebar back through `onOpenChange`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(slotIn(canvasElement, "expanded-sidebar")).toBeVisible()
		await userEvent.click(
			canvas.getByRole("button", { name: "Toggle sidebar" }),
		)
		await waitFor(
			() => expect(slotsIn(canvasElement, "expanded-sidebar")).toHaveLength(0),
			FRAME_POLL,
		)
		await expectNothingInTheLeftColumn(canvas, canvasElement)
		await userEvent.keyboard("{Control>}b{/Control}")
		await expect(slotIn(canvasElement, "expanded-sidebar")).toBeVisible()
	},
})

const NOTES_TAB: TitleBarTab = {
	id: "notes",
	title: "Notes",
	icon: <Icons.Library />,
}

const PINNED_NOTES_TAB: TitleBarTab = { ...NOTES_TAB, isPinned: true }

type ShellCanvas = ReturnType<typeof within>

const navigationSidebarIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "navigation-sidebar")

const leftOf = (element: Element) => element.getBoundingClientRect().left

const firstTabIn = (canvas: ShellCanvas) => canvas.getAllByRole("tab")[0]

const FIRST_TAB_AFTER_THE_HISTORY_COLLAPSED = 209

const expectFirstTabOnThePanelEdge = async (
	canvas: ShellCanvas,
	edge: number,
) => {
	await expect(leftOf(firstTabIn(canvas))).toBe(edge)
	await expect(leftOf(canvas.getByRole("main"))).toBe(edge)
}

const firstTabStory = (shell: NavigationShellProps, edge: number) => ({
	render: () => <NavigationShell {...shell} />,
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)
		await expect(
			navigationSidebarIn(canvasElement).getAnimations(),
		).toHaveLength(0)
		await expectFirstTabOnThePanelEdge(canvas, edge)
	},
})

export const FirstTabOnThePanelEdge = meta.story(
	firstTabStory({ tabs: [NOTES_TAB] }, SIDEBAR_DEFAULT_WIDTH),
)

export const FirstPinnedTabOnThePanelEdge = meta.story(
	firstTabStory({ tabs: [PINNED_NOTES_TAB] }, SIDEBAR_DEFAULT_WIDTH),
)

export const FirstTabOnThePanelEdgeWithoutInsetControls = meta.story(
	firstTabStory(
		{ hasInsetControls: false, tabs: [NOTES_TAB] },
		SIDEBAR_DEFAULT_WIDTH,
	),
)

export const FirstTabAfterTheHistoryCollapsed = meta.story({
	render: () => <NavigationShell isInitiallyOpen={false} tabs={[NOTES_TAB]} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(leftOf(firstTabIn(canvas))).toBe(
			FIRST_TAB_AFTER_THE_HISTORY_COLLAPSED,
		)
		await expectNothingInTheLeftColumn(canvas, canvasElement)
	},
})

const LONG_CONVERSATION_EXCHANGES = 150

const centreOf = (element: HTMLElement) => {
	const { left, width } = element.getBoundingClientRect()
	return left + width / 2
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const LONG_CONVERSATION_QUESTION =
	"Where does a turn go between the sidecar and the screen?"

const LONG_CONVERSATION_ANSWER = [
	"The design system lives in `packages/ui`: every component, token and story sits there, and the app only composes them. The Tauri shell in `apps/app` owns the commands, the drivers and the state machines that feed those components.",
	"- A turn streams through the sidecar.\n- It lands in the transcript controller.\n- It reaches the screen as rows the transcript renders one by one.",
	"```ts\nconst rows = toTranscriptRows(conversation.turns)\n```",
].join("\n\n")

const LONG_CONVERSATION_ROWS: TranscriptItem[] = Array.from(
	{ length: LONG_CONVERSATION_EXCHANGES },
	(_, exchange): TranscriptItem[] => [
		{
			key: `question-${exchange}`,
			render: () => <UserTurn>{LONG_CONVERSATION_QUESTION}</UserTurn>,
		},
		{
			key: `answer-${exchange}`,
			render: () => (
				<AssistantTurn copyText={LONG_CONVERSATION_ANSWER} identity={BOT}>
					<Markdown>{LONG_CONVERSATION_ANSWER}</Markdown>
				</AssistantTurn>
			),
		},
	],
).flat()

const LONG_CONVERSATION_TABS: TitleBarTab[] = [
	"Notes",
	"Roadmap",
	"Retro",
	"Handover",
	"Brief",
	"Budget",
].map((title) => ({
	id: title.toLowerCase(),
	title,
	icon: <Icons.Library />,
}))

type LongConversationShellProps = {
	onWidthChange?: (width: number) => void
}

const LongConversationShell = ({
	onWidthChange,
}: LongConversationShellProps) => (
	<NavigationShell onWidthChange={onWidthChange} tabs={LONG_CONVERSATION_TABS}>
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			rows={LONG_CONVERSATION_ROWS}
		>
			{null}
		</ThreadLayout>
	</NavigationShell>
)

export const LongContent = meta.story({
	args: { onWidthChange: fn() },
	render: ({ onWidthChange }) => (
		<LongConversationShell onWidthChange={onWidthChange} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The shell with a conversation of 150 exchanges open behind the sidebar, the case `bun run --filter @workspace/ui profile:sidebar-drag` drags the handle across. Check that every exchange is in the transcript, that the window itself never scrolls, and that while the handle is held the transcript keeps the width it had and stays centred in the card, taking the card's width again on release. Pick `Resized` for the drag on a short conversation.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const page = document.scrollingElement as HTMLElement
		await expect(page.scrollHeight).toBe(page.clientHeight)
		await expect(
			slotsIn(canvasElement, "message-bubble-content").length,
		).toBeGreaterThanOrEqual(LONG_CONVERSATION_ROWS.length)

		const card = canvas.getByRole("main")
		const sidebar = navigationSidebarIn(canvasElement)
		const transcript = slotIn(canvasElement, "message-scroller")
		const handle = handleIn(canvas)
		const { from, to } = grabHandle(handle, WIDER_BY)
		await expect(
			getComputedStyle(card).getPropertyValue("--sidebar-width"),
		).toBe("")
		await nextFrame()
		const heldWidth = widthOf(transcript)

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", target: handle, coords: from },
			{ coords: to },
		])
		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH + WIDER_BY)
		await expect(widthOf(transcript)).toBe(heldWidth)
		await expect(
			Math.abs(centreOf(transcript) - centreOf(card)),
		).toBeLessThanOrEqual(1)
		await expect(args.onWidthChange).not.toHaveBeenCalled()

		await userEvent.pointer([{ keys: "[/MouseLeft]", coords: to }])
		await expectWidth(transcript, heldWidth - WIDER_BY)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(1)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			SIDEBAR_DEFAULT_WIDTH + WIDER_BY,
		)
	},
})

type ScreenPoint = { clientX: number; clientY: number }

type RealMouseStep = ScreenPoint & {
	type: "mousePressed" | "mouseMoved" | "mouseReleased"
}

const realMouse = async ({ type, clientX, clientY }: RealMouseStep) => {
	const { cdp } = await import("vitest/browser")
	const frame = window.frameElement?.getBoundingClientRect()
	await cdp().send("Input.dispatchMouseEvent", {
		type,
		x: clientX + (frame?.left ?? 0),
		y: clientY + (frame?.top ?? 0),
		button: "left",
		buttons: type === "mouseReleased" ? 0 : 1,
		clickCount: 1,
	})
}

const middleOf = (element: HTMLElement): ScreenPoint => {
	const { left, top, width, height } = element.getBoundingClientRect()
	return { clientX: left + width / 2, clientY: top + height / 2 }
}

const selectedText = () => document.getSelection()?.toString() ?? ""

export const HandleHeld = meta.story({
	render: () => <LongConversationShell />,
	parameters: {
		docs: {
			description: {
				story:
					"The sidebar handle held while the pointer runs over the title bar, the panel and the conversation. Check that the column resize cursor shows over the whole window, that no text in the transcript gets selected as the pointer crosses it, and that the cursor and text selection come back on release. Pick `LongContent` for what the transcript does while the handle is held.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const shell = shellSurface(canvas)
		const card = canvas.getByRole("main")
		const overlay = slotIn(canvasElement, "sidebar-resize-overlay")
		const handle = handleIn(canvas)
		const { from, to } = grabHandle(handle, WIDER_BY)
		const restingCursor = getComputedStyle(shell).cursor
		const restingSelection = getComputedStyle(shell).userSelect
		await expect(overlay).not.toBeVisible()

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", target: handle, coords: from },
			{ coords: to },
		])
		await waitFor(() => expect(overlay).toBeVisible(), FRAME_POLL)
		await expect(getComputedStyle(overlay).cursor).toBe("col-resize")
		for (const covered of [
			slotIn(canvasElement, "app-title-bar"),
			navigationSidebarIn(canvasElement),
			card,
		]) {
			const { clientX, clientY } = middleOf(covered)
			await expect(document.elementFromPoint(clientX, clientY)).toBe(overlay)
		}
		await expect(getComputedStyle(shell).cursor).toBe(restingCursor)
		await expect(getComputedStyle(shell).userSelect).toBe(restingSelection)
		await expect(shell.className).not.toContain("cursor-col-resize")
		await expect(shell).not.toHaveAttribute("data-resizing")

		await userEvent.pointer([{ keys: "[/MouseLeft]", coords: to }])
		await waitFor(() => expect(overlay).not.toBeVisible(), FRAME_POLL)
		const overCard = middleOf(card)
		await expect(
			document.elementFromPoint(overCard.clientX, overCard.clientY),
		).not.toBe(overlay)

		if (!isInBrowserRunner()) return
		const grip = middleOf(handle)
		const acrossTranscript = middleOf(slotIn(canvasElement, "message-scroller"))
		const furtherAcross = {
			clientX: acrossTranscript.clientX + 120,
			clientY: acrossTranscript.clientY + 120,
		}
		await realMouse({ type: "mousePressed", ...grip })
		await realMouse({ type: "mouseMoved", ...acrossTranscript })
		await realMouse({ type: "mouseMoved", ...furtherAcross })
		await waitFor(() => expect(overlay).toBeVisible(), FRAME_POLL)
		await expect(selectedText()).toBe("")
		await realMouse({ type: "mouseReleased", ...furtherAcross })
		await waitFor(() => expect(overlay).not.toBeVisible(), FRAME_POLL)
		await expect(selectedText()).toBe("")
		await expect(handle).toHaveFocus()
	},
})

export const DragResizesWithoutAnimation = meta.story({
	render: () => <NavigationShell tabs={[NOTES_TAB]} />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			const sidebar = navigationSidebarIn(canvasElement)
			const handle = handleIn(canvas)
			const { from, to } = grabHandle(handle, WIDER_BY)

			await userEvent.pointer([
				{ keys: "[MouseLeft>]", target: handle, coords: from },
				{ coords: to },
			])
			await expect(sidebar.getAnimations()).toHaveLength(0)
			await expectFirstTabOnThePanelEdge(
				canvas,
				SIDEBAR_DEFAULT_WIDTH + WIDER_BY,
			)
			await userEvent.pointer([{ keys: "[/MouseLeft]", coords: to }])
			await expectFirstTabOnThePanelEdge(
				canvas,
				SIDEBAR_DEFAULT_WIDTH + WIDER_BY,
			)
		})
	},
})

export const ToggleDuringDragSwapsAtOnce = meta.story({
	render: () => <NavigationShell />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const toggleWhileDragging = async () => {
			const handle = handleIn(canvas)
			const { from, to } = grabHandle(handle, WIDER_BY)
			await userEvent.pointer([
				{ keys: "[MouseLeft>]", target: handle, coords: from },
				{ coords: to },
			])
			await userEvent.keyboard("{Control>}b{/Control}")
			await expectNothingInTheLeftColumn(canvas, canvasElement)
			await userEvent.pointer([{ keys: "[/MouseLeft]", coords: to }])
		}
		await (isInBrowserRunner()
			? withMotionAllowed(toggleWhileDragging)
			: toggleWhileDragging())
	},
})

const SLIDE_MS = 150

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"

const transitionsIn = (canvasElement: HTMLElement) =>
	canvasElement
		.getAnimations({ subtree: true })
		.filter((animation) => animation instanceof CSSTransition)

const holdAt = (slides: CSSTransition[], time: number) => {
	for (const slide of slides) {
		slide.pause()
		slide.currentTime = time
	}
}

const heldSlideIn = async (canvasElement: HTMLElement) => {
	const slides = await waitFor(() => {
		const running = transitionsIn(canvasElement)
		expect(running.length).toBeGreaterThan(0)
		return running
	}, FRAME_POLL)
	holdAt(slides, 0)
	return slides
}

const expectTranslateOnly = async (slides: CSSTransition[]) => {
	await expect([
		...new Set(slides.map((slide) => slide.transitionProperty)),
	]).toEqual(["translate"])
	for (const slide of slides) {
		const { duration, easing } = slide.effect?.getTiming() ?? {}
		await expect(easing).toBe(EASE_OUT)
		await expect(duration).toBeLessThanOrEqual(SLIDE_MS)
	}
}

const expectFullLength = async (slides: CSSTransition[]) => {
	for (const slide of slides) {
		await expect(slide.effect?.getTiming().duration).toBe(SLIDE_MS)
	}
}

const expectSlidingParts = async (
	canvas: ShellCanvas,
	canvasElement: HTMLElement,
	slides: CSSTransition[],
) => {
	const sliding = slides.map((slide) =>
		slide.effect instanceof KeyframeEffect ? slide.effect.target : null,
	)
	await expect(sliding).toContain(navigationSidebarIn(canvasElement))
	await expect(sliding).toContain(canvas.getByRole("main"))
	await expect(sliding).toContain(canvas.getByRole("tablist").parentElement)
}

const widthOfCard = (canvas: ShellCanvas) =>
	canvas.getByRole("main").getBoundingClientRect().width

const expectDocked = async (
	canvas: ShellCanvas,
	canvasElement: HTMLElement,
) => {
	const sidebar = navigationSidebarIn(canvasElement)
	await expect(leftOf(sidebar)).toBe(0)
	await expect(sidebar).not.toHaveAttribute("inert")
	await expectFirstTabOnThePanelEdge(canvas, SIDEBAR_DEFAULT_WIDTH)
}

const expectOffTheLeftEdge = async (
	canvas: ShellCanvas,
	canvasElement: HTMLElement,
) => {
	const sidebar = navigationSidebarIn(canvasElement)
	await expect(sidebar.getBoundingClientRect().right).toBe(0)
	await expect(leftOf(canvas.getByRole("main"))).toBe(shellInset())
	await expect(leftOf(firstTabIn(canvas))).toBe(
		FIRST_TAB_AFTER_THE_HISTORY_COLLAPSED,
	)
}

const finishAndSettle = async (
	canvasElement: HTMLElement,
	slides: CSSTransition[],
) => {
	for (const slide of slides) slide.finish()
	await waitFor(
		() =>
			expect(canvasElement.firstElementChild).toHaveAttribute(
				"data-sidebar-sliding",
				"false",
			),
		FRAME_POLL,
	)
	await expect(transitionsIn(canvasElement)).toHaveLength(0)
}

export const CollapseSlidesOut = meta.story({
	render: () => <NavigationShell tabs={[NOTES_TAB]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Motion allowed. Check nothing is armed at rest, a click on the toggle starts a 150ms translate on the ease-out token on the sidebar, the card and the tabs and on nothing else, the three leave from their docked spots, the card holds one width from the first frame to the last, the sidebar is inert while it leaves and unmounted once gone, and nothing moves when the slide settles.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await expect(transitionsIn(canvasElement)).toHaveLength(0)
			await expect(
				getComputedStyle(navigationSidebarIn(canvasElement)).transitionDuration,
			).toBe("0s")

			await fireEvent.click(
				canvas.getByRole("button", { name: "Toggle sidebar" }),
			)
			const slides = await heldSlideIn(canvasElement)
			await expectTranslateOnly(slides)
			await expectFullLength(slides)
			await expectSlidingParts(canvas, canvasElement, slides)
			await expect(navigationSidebarIn(canvasElement)).toHaveAttribute("inert")
			await expect(leftOf(navigationSidebarIn(canvasElement))).toBe(0)
			await expectFirstTabOnThePanelEdge(canvas, SIDEBAR_DEFAULT_WIDTH)
			const widthAtTheStart = widthOfCard(canvas)

			holdAt(slides, SLIDE_MS)
			await expectOffTheLeftEdge(canvas, canvasElement)
			await expect(widthOfCard(canvas)).toBe(widthAtTheStart)

			await finishAndSettle(canvasElement, slides)
			await expectNothingInTheLeftColumn(canvas, canvasElement)
			await expect(leftOf(firstTabIn(canvas))).toBe(
				FIRST_TAB_AFTER_THE_HISTORY_COLLAPSED,
			)
			await expect(widthOfCard(canvas)).toBe(widthAtTheStart)
		})
	},
})

export const ReopenSlidesIn = meta.story({
	render: () => <NavigationShell isInitiallyOpen={false} tabs={[NOTES_TAB]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Motion allowed. Check the sidebar shortcut starts a 150ms translate on the ease-out token on the sidebar, the card and the tabs and on nothing else, the sidebar enters from past the left edge while the card and the tabs leave from their collapsed spots, the card holds its width for the whole slide and takes the docked one when it settles, with its left edge and the first tab already on the panel edge.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await expect(transitionsIn(canvasElement)).toHaveLength(0)
			const widthCollapsed = widthOfCard(canvas)

			await fireEvent.keyDown(canvasElement, { key: "b", ctrlKey: true })
			const slides = await heldSlideIn(canvasElement)
			await expectTranslateOnly(slides)
			await expectFullLength(slides)
			await expectSlidingParts(canvas, canvasElement, slides)
			await expect(slotsIn(canvasElement, "sidebar-peek-edge")).toHaveLength(0)
			await expectOffTheLeftEdge(canvas, canvasElement)
			await expect(widthOfCard(canvas)).toBe(widthCollapsed)

			holdAt(slides, SLIDE_MS)
			await expectDocked(canvas, canvasElement)
			await expect(widthOfCard(canvas)).toBe(widthCollapsed)

			await finishAndSettle(canvasElement, slides)
			await expectDocked(canvas, canvasElement)
			await expect(widthOfCard(canvas)).toBe(
				widthCollapsed - SIDEBAR_DEFAULT_WIDTH + shellInset(),
			)
		})
	},
})

export const ToggleDuringSlideTurnsBack = meta.story({
	render: () => <NavigationShell tabs={[NOTES_TAB]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Motion allowed. Check a second toggle half-way through the collapse slide sends the sidebar, the card and the tabs back from where they stand, by translate only and in no more than 150ms, and that the shell settles docked with no peek panel and nothing left sliding.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			const toggle = canvas.getByRole("button", { name: "Toggle sidebar" })
			const widthDocked = widthOfCard(canvas)

			await fireEvent.click(toggle)
			holdAt(await heldSlideIn(canvasElement), SLIDE_MS / 2)
			const halfWay = {
				sidebar: leftOf(navigationSidebarIn(canvasElement)),
				card: leftOf(canvas.getByRole("main")),
				tab: leftOf(firstTabIn(canvas)),
			}
			await expect(halfWay.sidebar).toBeLessThan(0)
			await expect(halfWay.sidebar).toBeGreaterThan(-SIDEBAR_DEFAULT_WIDTH)

			await fireEvent.click(toggle)
			const back = await heldSlideIn(canvasElement)
			await expectTranslateOnly(back)
			await expect({
				sidebar: leftOf(navigationSidebarIn(canvasElement)),
				card: leftOf(canvas.getByRole("main")),
				tab: leftOf(firstTabIn(canvas)),
			}).toEqual(halfWay)

			await finishAndSettle(canvasElement, back)
			await expectDocked(canvas, canvasElement)
			await expect(widthOfCard(canvas)).toBe(widthDocked)
			await expect(slotsIn(canvasElement, "sidebar-peek")).toHaveLength(0)
			await expect(slotsIn(canvasElement, "sidebar-peek-edge")).toHaveLength(0)
		})
	},
})

export const ReducedMotionSwapsAtOnce = meta.story({
	render: () => <NavigationShell tabs={[NOTES_TAB]} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reduce motion on. Check the toggle takes the sidebar away and brings it back in the same frame, with no transition anywhere in the shell.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		await emulateMotion("reduce")
		const toggle = canvas.getByRole("button", { name: "Toggle sidebar" })

		await fireEvent.click(toggle)
		await expect(transitionsIn(canvasElement)).toHaveLength(0)
		await expectNothingInTheLeftColumn(canvas, canvasElement)
		await expect(leftOf(firstTabIn(canvas))).toBe(
			FIRST_TAB_AFTER_THE_HISTORY_COLLAPSED,
		)

		await fireEvent.click(toggle)
		await expect(transitionsIn(canvasElement)).toHaveLength(0)
		await expect(slotIn(canvasElement, "expanded-sidebar")).toBeVisible()
		await expectDocked(canvas, canvasElement)
	},
})

const FADED_PROPERTIES = [
	"all",
	"color",
	"background-color",
	"border-color",
	"outline-color",
	"opacity",
]

const expectNoColourFadeOn = async (controls: HTMLElement[]) => {
	for (const control of controls) {
		const { transitionDuration, transitionProperty } = getComputedStyle(control)
		const isInstant = transitionDuration
			.split(", ")
			.every((duration) => Number.parseFloat(duration) === 0)
		const faded = transitionProperty
			.split(", ")
			.filter((property) => FADED_PROPERTIES.includes(property))
		await expect(isInstant ? [] : faded).toEqual([])
	}
}

export const ControlsFadeNoColour = meta.story({
	render: () => <NavigationShell />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const toggle = canvas.getByRole("button", { name: "Toggle sidebar" })
		await expectNoColourFadeOn([
			toggle,
			slotIn(canvasElement, "space-switcher"),
			canvas.getByRole("button", { name: "Search" }),
			slotIn(canvasElement, "expanded-sidebar-footer"),
			canvas.getByRole("button", { name: "New" }),
		])
		await userEvent.click(toggle)
		await waitFor(
			() => expect(slotsIn(canvasElement, "expanded-sidebar")).toHaveLength(0),
			FRAME_POLL,
		)
		await expectNoColourFadeOn([toggle])
	},
})
