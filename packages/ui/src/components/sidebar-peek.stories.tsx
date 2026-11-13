import { useState } from "react"
import { expect, fireEvent, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectLaptopWindow,
	FRAME_POLL,
	isInBrowserRunner,
	LAPTOP_WINDOW,
	realPointer,
	resolvedRootColor,
	settled,
	slotIn,
	slotsIn,
	transitionsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import {
	PINNED_CONVERSATIONS,
	RECENT_CONVERSATIONS,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import { Icons } from "@workspace/ui/components/icons"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"
import {
	PEEK_CLOSE_DELAY_MS,
	SidebarPeek,
} from "@workspace/ui/components/sidebar-peek"
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

const ARTBOARD_SIDEBAR_WIDTH = 280

const ARTBOARD_PANEL = { left: 8, top: 40, width: 272, height: 752 }

const ARTBOARD_MAIN_COLLAPSED = { left: 8, top: 40, width: 1264, height: 752 }

const TOGGLE = 'button[aria-label="Toggle sidebar"]'

const DARK = { ...LAPTOP_WINDOW, theme: "dark", theme_layout: "single" }

const LIGHT = { ...LAPTOP_WINDOW, theme: "light", theme_layout: "single" }

const TABS: TitleBarTab[] = [
	{
		id: "roadmap",
		title: "Roadmap",
		icon: <Icons.Library />,
		isNeedingYou: true,
	},
	{ id: "notes", title: "Notes", icon: <Icons.Library /> },
]

const rowsOf = (conversations: AppSidebarConversation[], isPinned: boolean) => (
	<SidebarMenu>
		{conversations.map((conversation) => (
			<ConversationRosterRow
				conversation={conversation}
				isPinned={isPinned}
				isSelected={false}
				key={conversation.id}
				lift={STILL_LIFT}
				sections={[SIDEBAR_SECTION]}
			/>
		))}
	</SidebarMenu>
)

type PeekWindowProps = {
	isInitiallyDocked?: boolean
}

const PeekWindow = ({ isInitiallyDocked = false }: PeekWindowProps) => {
	const [isDocked, setIsDocked] = useState(isInitiallyDocked)

	return (
		<WorkspaceShellRoot
			onOpenChange={setIsDocked}
			open={isDocked}
			width={ARTBOARD_SIDEBAR_WIDTH}
		>
			<AppTitleBar
				activeTabId="roadmap"
				canGoBack
				insetWindowControls
				onGoBack={fn()}
				onGoForward={fn()}
				onOpenSearch={fn()}
				onToggleSidebar={() => setIsDocked(!isDocked)}
				tabs={TABS}
			/>
			<NavigationSidebar
				conversations={rowsOf(RECENT_CONVERSATIONS, false)}
				destination="newConversation"
				missionCount={3}
				pinned={rowsOf(PINNED_CONVERSATIONS, true)}
				selectedSpaceId="kiroshi"
				spaces={[
					{
						id: "kiroshi",
						name: "Kiroshi",
						colour: BLOT_HUES.blue,
						avatarSeed: "kiroshi",
					},
				]}
				user={{ name: "Ada Martin" }}
			/>
			<ContentCard />
		</WorkspaceShellRoot>
	)
}

const meta = preview.meta({
	title: "Navigation/SidebarPeek",
	component: SidebarPeek,
	globals: DARK,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The collapsed state of the navigation shell: nothing on the left, the content card on the whole window, and the expanded sidebar floating over it as a full-height panel while the pointer asks for it. The panel opens after a 120ms hover intent on the window's left edge or on the title bar collapse icon, stays while the pointer travels into it, and closes 150ms after the pointer leaves both, on Escape, or when the collapse icon docks the sidebar. Stories 1 to 4 are the artboards of the Paper file Kiroshi, Collapsed sidebar, page Final, drawn in a 1280 by 800 window with a 280px sidebar.",
			},
		},
	},
	args: { children: null },
	render: () => <PeekWindow />,
})

type Canvas = ReturnType<typeof within>

const boxOf = (element: Element) => {
	const { left, top, width, height } = element.getBoundingClientRect()
	return { left, top, width, height }
}

const peeksIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "sidebar-peek")

const edgeIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "sidebar-peek-edge")

const toggleIn = (canvas: Canvas) =>
	canvas.getByRole("button", { name: "Toggle sidebar" })

const openedPeekIn = async (canvasElement: HTMLElement) => {
	await waitFor(
		() => expect(peeksIn(canvasElement)).toHaveLength(1),
		FRAME_POLL,
	)
	return settled(slotIn(canvasElement, "sidebar-peek"))
}

const expectNoPeekIn = (canvasElement: HTMLElement) =>
	waitFor(() => expect(peeksIn(canvasElement)).toHaveLength(0), FRAME_POLL)

const pastTheGraceDelay = () =>
	new Promise((resolve) => setTimeout(resolve, PEEK_CLOSE_DELAY_MS * 2))

const expectNothingOnTheLeft = async (canvas: Canvas, root: HTMLElement) => {
	await expect(slotsIn(root, "navigation-sidebar")).toHaveLength(0)
	await expect(slotsIn(root, "expanded-sidebar")).toHaveLength(0)
	await expect(peeksIn(root)).toHaveLength(0)
	await expect(boxOf(canvas.getByRole("main"))).toEqual(ARTBOARD_MAIN_COLLAPSED)
}

const expectArtboardPanel = async (canvas: Canvas, panel: HTMLElement) => {
	await expect(boxOf(panel)).toEqual(ARTBOARD_PANEL)
	const style = getComputedStyle(panel)
	await expect(style.padding).toBe("8px 4px 4px")
	await expect(style.borderRadius).toBe("12px")
	await expect(style.borderWidth).toBe("1px")
	await expect(style.borderColor).toBe(resolvedRootColor("--title-bar-divider"))
	await expect(style.backgroundColor).toBe(resolvedRootColor("--card-raised"))
	await expect(style.boxShadow).not.toBe("none")
	const sidebar = slotIn(panel, "expanded-sidebar")
	await expect(getComputedStyle(sidebar).padding).toBe("0px")
	await expect(getComputedStyle(sidebar).rowGap).toBe("12px")
	await expect(boxOf(sidebar).width).toBe(ARTBOARD_PANEL.width - 10)
	await expect(boxOf(canvas.getByRole("main"))).toEqual(ARTBOARD_MAIN_COLLAPSED)
}

const enteringFrom = (panel: HTMLElement) => {
	const entering = panel.getAnimations()
	for (const transition of entering) {
		transition.pause()
		transition.currentTime = 0
	}
	const { opacity, translate } = getComputedStyle(panel)
	for (const transition of entering) transition.finish()
	return {
		animated: entering
			.map((transition) => (transition as CSSTransition).transitionProperty)
			.sort(),
		opacity,
		x: Number.parseFloat(translate),
	}
}

const expectPeekKeptWhileInside = async (panel: HTMLElement) => {
	await pastTheGraceDelay()
	await expect(panel).toBeVisible()
	await expect(panel).toHaveAttribute("data-open", "true")
}

const expectHoveredCollapseIcon = async (toggle: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const pointer = await realPointer()
	try {
		await pointer.hover(toggle)
		const hovered = getComputedStyle(toggle)
		await expect(hovered.backgroundColor).toBe(
			resolvedRootColor("--title-bar-chip"),
		)
		await expect(hovered.color).toBe(resolvedRootColor("--muted-foreground"))
		await withMotionAllowed(async () => {
			await expect(getComputedStyle(toggle).transitionDuration).toBe("0s")
		})
	} finally {
		await pointer.unhover(toggle)
	}
}

export const CollapsedRest = meta.story({
	name: "1 Collapsed rest",
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1. Check the left column draws nothing, no rail and no Needs you or working mark, that the card spans 1264px with 8px on each side, and that the first tab starts 12px after the last bar button. The play then proves the rest state is live: the left edge opens the panel and leaving it brings the window back to this drawing.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectLaptopWindow()
		await expectNothingOnTheLeft(canvas, canvasElement)
		const lane = slotIn(canvasElement, "title-bar-history")
		const lastBarButton = within(lane).getAllByRole("button").at(-1)
		const [firstTab] = canvas.getAllByRole("tab")
		await expect(
			boxOf(firstTab as HTMLElement).left -
				(lastBarButton as HTMLElement).getBoundingClientRect().right,
		).toBe(12)

		await userEvent.hover(edgeIn(canvasElement))
		await openedPeekIn(canvasElement)
		await userEvent.unhover(edgeIn(canvasElement))
		await expectNoPeekIn(canvasElement)
		await expectNothingOnTheLeft(canvas, canvasElement)
	},
})

export const PeekFromTheLeftEdge = meta.story({
	name: "2 Peek from the left edge",
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2. Check the pointer on the window's left edge opens the panel at 8px from the left, from the title bar to the bottom inset, 272px wide, over a card that neither moves nor resizes, the collapse icon at rest, and that moving from the edge into the panel keeps it open past the grace delay.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectLaptopWindow()
		await userEvent.hover(edgeIn(canvasElement))
		const panel = await openedPeekIn(canvasElement)
		await expectArtboardPanel(canvas, panel)

		await userEvent.hover(slotIn(panel, "expanded-sidebar-footer"))
		await expectPeekKeptWhileInside(panel)
	},
})

export const PeekFromTheCollapseIcon = meta.story({
	name: "3 Peek from the collapse icon",
	parameters: {
		pseudo: { hover: TOGGLE },
		docs: {
			description: {
				story:
					"Artboard 3. Check the pointer resting on the collapse icon opens the same panel at the same place and size, that the icon wears its hovered background with a muted glyph and no colour transition, and that moving from the icon into the panel, then back, keeps it open.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectLaptopWindow()
		const toggle = toggleIn(canvas)
		await userEvent.hover(toggle)
		const panel = await openedPeekIn(canvasElement)
		await expectArtboardPanel(canvas, panel)

		await expect(boxOf(toggle)).toMatchObject({ width: 28, height: 28 })
		await expect(getComputedStyle(toggle).borderRadius).toBe("6px")

		await userEvent.hover(slotIn(panel, "space-switcher"))
		await expectPeekKeptWhileInside(panel)
		await userEvent.hover(toggle)
		await expectPeekKeptWhileInside(panel)
		await expectHoveredCollapseIcon(toggle)
	},
})

export const Docked = meta.story({
	name: "4 Docked",
	render: () => <PeekWindow isInitiallyDocked />,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4. Check the docked sidebar is the one the shell drew before: 280px wide here, the first tab and the card starting on its edge, the card 8px from the right and the bottom, and that resting on the collapse icon opens no panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectLaptopWindow()
		const sidebar = slotIn(canvasElement, "navigation-sidebar")
		await expect(boxOf(sidebar)).toMatchObject({
			left: 0,
			top: 40,
			width: ARTBOARD_SIDEBAR_WIDTH,
		})
		await expect(slotIn(sidebar, "expanded-sidebar")).toBeVisible()
		const [firstTab] = canvas.getAllByRole("tab")
		await expect(boxOf(firstTab as HTMLElement).left).toBe(
			ARTBOARD_SIDEBAR_WIDTH,
		)
		const main = canvas.getByRole("main").getBoundingClientRect()
		await expect([main.left, main.top, main.right, main.bottom]).toEqual([
			ARTBOARD_SIDEBAR_WIDTH,
			40,
			1272,
			792,
		])

		await userEvent.hover(toggleIn(canvas))
		await pastTheGraceDelay()
		await expect(peeksIn(canvasElement)).toHaveLength(0)
		await expect(slotsIn(canvasElement, "sidebar-peek-edge")).toHaveLength(0)
	},
})

export const PeekFromTheLeftEdgeLight = meta.story({
	globals: LIGHT,
	parameters: {
		docs: {
			description: {
				story:
					"The panel in the light theme, which no artboard draws. Check the surface, the hairline and the shadow read as one raised sheet over the card.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.hover(edgeIn(canvasElement))
		await expectArtboardPanel(canvas, await openedPeekIn(canvasElement))
	},
})

export const LeavingBeforeTheHoverIntentOpensNothing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check a pointer that only crosses the left edge or the collapse icon, gone before the 120ms hover intent, opens no panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		for (const trigger of [edgeIn(canvasElement), toggleIn(canvas)]) {
			await userEvent.hover(trigger)
			await userEvent.unhover(trigger)
			await pastTheGraceDelay()
			await expect(peeksIn(canvasElement)).toHaveLength(0)
		}
	},
})

export const ClosesAfterTheGraceDelay = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the panel is still open the moment the pointer leaves it, and gone once the 150ms grace delay has passed with the pointer on neither the panel nor a trigger.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.hover(edgeIn(canvasElement))
		const panel = await openedPeekIn(canvasElement)
		await userEvent.hover(slotIn(panel, "expanded-sidebar-footer"))
		await userEvent.hover(canvas.getByRole("main"))
		await expect(panel).toHaveAttribute("data-open", "true")
		await expectNoPeekIn(canvasElement)
	},
})

export const EscapeCloses = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check Escape closes the open panel at once, the pointer still inside it, and leaves the sidebar collapsed.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.hover(edgeIn(canvasElement))
		const panel = await openedPeekIn(canvasElement)
		await userEvent.hover(slotIn(panel, "expanded-sidebar-footer"))
		await userEvent.keyboard("{Escape}")
		await expectNoPeekIn(canvasElement)
		await expectNothingOnTheLeft(canvas, canvasElement)
	},
})

const openSpacesMenu = () =>
	within(document.body).queryByRole("menu", { name: "Spaces" })

export const PopupOpenedFromThePeekKeepsItOpen = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Check the Space switcher menu opened from inside the panel keeps the panel open with the pointer over the menu, then outside the panel past the grace delay, that a first Escape closes the menu and leaves the panel open, and that a second Escape closes the panel.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.hover(edgeIn(canvasElement))
		const panel = await openedPeekIn(canvasElement)
		await userEvent.click(slotIn(panel, "space-switcher"))
		const menu = await within(document.body).findByRole("menu", {
			name: "Spaces",
		})

		await userEvent.hover(menu)
		await userEvent.hover(slotIn(canvasElement, "sidebar-inset"))
		await expectPeekKeptWhileInside(panel)
		await expect(openSpacesMenu()).toBe(menu)

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(openSpacesMenu()).toBeNull(), FRAME_POLL)
		await expect(panel).toHaveAttribute("data-open", "true")

		await userEvent.keyboard("{Escape}")
		await expectNoPeekIn(canvasElement)
	},
})

export const ClickOnTheCollapseIconDocks = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check a click on the collapse icon, the panel open under it, docks the sidebar through the shell's own toggle and removes the panel, and that collapsing again with the pointer still on the icon opens no panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const toggle = toggleIn(canvas)
		await userEvent.hover(toggle)
		await openedPeekIn(canvasElement)
		await userEvent.click(toggle)
		await expect(peeksIn(canvasElement)).toHaveLength(0)
		await expect(
			slotIn(slotIn(canvasElement, "navigation-sidebar"), "expanded-sidebar"),
		).toBeVisible()

		await userEvent.click(toggle)
		await pastTheGraceDelay()
		await expectNothingOnTheLeft(canvas, canvasElement)
	},
})

export const DockingFromThePeekHandsOverAtOnce = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Motion allowed. Check a click on the collapse icon, the panel open under it, swaps the panel for the docked sidebar in one frame: no panel left, the sidebar in place with nothing sliding, and the card on its edge.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			const toggle = toggleIn(canvas)
			await userEvent.hover(toggle)
			await waitFor(
				() => expect(peeksIn(canvasElement)).toHaveLength(1),
				FRAME_POLL,
			)

			await fireEvent.click(toggle)
			await expect(peeksIn(canvasElement)).toHaveLength(0)
			await expect(transitionsIn(canvasElement)).toHaveLength(0)
			await expect(
				boxOf(slotIn(canvasElement, "navigation-sidebar")).left,
			).toBe(0)
			await expect(boxOf(canvas.getByRole("main")).left).toBe(
				ARTBOARD_SIDEBAR_WIDTH,
			)
		})
	},
})

export const SlidesAndFades = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the panel enters from 8px to the left at no opacity, animating its translate and its opacity and nothing else, leaves the same way before it unmounts, and that under reduced motion both run in a hundredth of a millisecond so the unmount still follows.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await userEvent.hover(edgeIn(canvasElement))
			await waitFor(
				() => expect(peeksIn(canvasElement)).toHaveLength(1),
				FRAME_POLL,
			)
			const panel = slotIn(canvasElement, "sidebar-peek")
			const { transitionProperty, transitionDuration } = getComputedStyle(panel)
			await expect(transitionProperty).toBe("opacity, translate")
			await expect(transitionDuration).toBe("0.15s")
			await expect(enteringFrom(panel)).toEqual({
				animated: ["opacity", "translate"],
				opacity: "0",
				x: -8,
			})

			await userEvent.hover(canvas.getByRole("main"))
			await waitFor(
				() => expect(panel).toHaveAttribute("data-open", "false"),
				FRAME_POLL,
			)
			await expect(panel).toHaveAttribute("inert")
			await expectNoPeekIn(canvasElement)
		})

		await userEvent.hover(edgeIn(canvasElement))
		const still = await openedPeekIn(canvasElement)
		await expect(
			Number.parseFloat(getComputedStyle(still).transitionDuration),
		).toBeLessThan(0.001)
	},
})
