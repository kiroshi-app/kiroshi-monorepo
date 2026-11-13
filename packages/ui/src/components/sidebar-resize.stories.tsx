// Call sites: packages/ui/src/components/workspace-shell.tsx line 65 and
// packages/ui/src/components/routines-panel.tsx line 553 for the provider,
// packages/ui/src/components/app-sidebar.tsx line 2119 and
// packages/ui/src/components/routines-panel.tsx line 515 for the handle

import type { CSSProperties } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { FRAME_POLL } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { SidebarMenuRow } from "@workspace/ui/components/sidebar-menu-row"
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH_STEP,
	SidebarResizeHandle,
	SidebarResizeProvider,
} from "@workspace/ui/components/sidebar-resize"
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarInset,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const SESSIONS = ["Brief", "Handover", "Retro"]

const SURFACE = "p-4 text-muted-foreground text-sm"

const HANDLE_LABEL = "Resize sidebar"

const LAPTOP = { viewport: { value: "laptop" } }

const shellStyle = (width: number) =>
	({
		"--sidebar-width": `${width}px`,
		"--sidebar-width-icon": "var(--sidebar-rail)",
	}) as CSSProperties

type ShellProps = {
	side: "left" | "right"
	width?: number
	onWidthChange?: (width: number) => void
}

const Shell = ({ side, width, onWidthChange }: ShellProps) => (
	<SidebarResizeProvider
		defaultWidth={SIDEBAR_DEFAULT_WIDTH}
		onWidthChange={onWidthChange}
		width={width}
	>
		{(resize) => (
			<SidebarProvider style={shellStyle(resize.width)}>
				<Sidebar
					aria-label="Workspace"
					collapsible="icon"
					role="complementary"
					side={side}
				>
					<SidebarContent>
						<SidebarGroup>
							<SidebarGroupContent>
								<SidebarMenu>
									{SESSIONS.map((session) => (
										<SidebarMenuItem key={session}>
											<SidebarMenuRow
												icon={<Icons.Message aria-hidden="true" />}
												label={session}
											>
												{session}
											</SidebarMenuRow>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</SidebarContent>
					<SidebarResizeHandle side={side} />
				</Sidebar>
				<SidebarInset>
					<p className={SURFACE}>
						Whatever screen the shell hands the room to.
					</p>
				</SidebarInset>
			</SidebarProvider>
		)}
	</SidebarResizeProvider>
)

const meta = preview.meta({
	globals: LAPTOP,
	title: "Navigation/SidebarResize",
	component: SidebarResizeHandle,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"How wide the panel is, and who decides. The provider owns the width and clamps every answer between 224px and 416px, so no caller can ever hand the shell a width it cannot draw; the handle is the grip on the panel's edge, a `separator` carrying the width as its value. It is a pointer drag, an arrow key step of 16px, and a double press back to the default — three ways to the same number. The handle takes itself off screen wherever a width is not the reader's to set: the icon rail, a narrow window, a shell that declared itself fixed.",
			},
		},
	},
})

export const Clamped = meta.story({
	render: () => <Shell onWidthChange={fn()} side="right" />,
	parameters: {
		docs: {
			description: {
				story:
					"The reader asking for a panel narrower than the app can draw. Check that the width stops at 224px instead of following the pointer to zero, and that the value the handle announces is the clamped one rather than the one that was asked for — the bound belongs to the provider, so nothing downstream ever sees an impossible width.",
			},
		},
	},
	play: async ({ canvas }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", { name: "Workspace" })
		const { right, top } = handle.getBoundingClientRect()

		handle.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: right,
				clientY: top,
			}),
		)
		window.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: right + 400 }),
		)
		window.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, clientX: right + 400 }),
		)

		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(SIDEBAR_MIN_WIDTH),
			)
		}, FRAME_POLL)
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(SIDEBAR_MIN_WIDTH)
		}, FRAME_POLL)
	},
})

const FIRST_PULL = 40

const SECOND_PULL = 64

const reportWidth = fn()

export const DraggedThenReleased = meta.story({
	render: () => <Shell onWidthChange={reportWidth} side="left" />,
	parameters: {
		docs: {
			description: {
				story:
					"The reader pulling the grip wider in two moves, then letting go. Check that the panel and the value the handle announces follow each move while the pointer is still down, that nothing is reported during the pull, and that the release reports the final width exactly once. Pick `Clamped` for a pull past the bounds.",
			},
		},
	},
	play: async ({ canvas }) => {
		reportWidth.mockClear()
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", { name: "Workspace" })
		const { right, top } = handle.getBoundingClientRect()
		const pointerAt = (type: string, pulledBy: number) =>
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				clientX: right + pulledBy,
				clientY: top,
			})
		const expectFollowed = async (pulledBy: number) => {
			const followed = SIDEBAR_DEFAULT_WIDTH + pulledBy
			await waitFor(async () => {
				await expect(handle).toHaveAttribute("aria-valuenow", String(followed))
			}, FRAME_POLL)
			await waitFor(async () => {
				await expect(panel.getBoundingClientRect().width).toBe(followed)
			}, FRAME_POLL)
		}

		handle.dispatchEvent(pointerAt("pointerdown", 0))
		window.dispatchEvent(pointerAt("pointermove", FIRST_PULL))
		await expectFollowed(FIRST_PULL)
		window.dispatchEvent(pointerAt("pointermove", SECOND_PULL))
		await expectFollowed(SECOND_PULL)
		await expect(reportWidth).not.toHaveBeenCalled()

		window.dispatchEvent(pointerAt("pointerup", SECOND_PULL))
		await waitFor(async () => {
			await expect(reportWidth).toHaveBeenCalledTimes(1)
		}, FRAME_POLL)
		await expect(reportWidth).toHaveBeenCalledWith(
			SIDEBAR_DEFAULT_WIDTH + SECOND_PULL,
		)
		await expectFollowed(SECOND_PULL)
	},
})

const WIDTH_STORED_UNDER_THE_OLD_MINIMUM = 192

export const RestoredBelowTheMinimum = meta.story({
	tags: ["test-only"],
	render: () => (
		<Shell side="left" width={WIDTH_STORED_UNDER_THE_OLD_MINIMUM} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A width stored before the minimum rose, handed back on launch. Check that the panel opens at 224px and the handle announces 224, not the stored value.",
			},
		},
	},
	play: async ({ canvas }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", { name: "Workspace" })

		await expect(handle).toHaveAttribute(
			"aria-valuenow",
			String(SIDEBAR_MIN_WIDTH),
		)
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBe(SIDEBAR_MIN_WIDTH)
		}, FRAME_POLL)
	},
})

export const RightSide = meta.story({
	render: () => <Shell onWidthChange={fn()} side="right" />,
	parameters: {
		docs: {
			description: {
				story:
					"The grip of a trailing panel, which is what the routines panel hangs on. Check that it is drawn on the panel's inline-start edge rather than its trailing one — the edge a trailing panel is resized from is the one facing the screen — and that the arrow keys are mirrored with it: `ArrowLeft` widens here, where it narrows on a leading panel. The routines panel hangs on the trailing edge under `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const handle = canvas.getByRole("separator", { name: HANDLE_LABEL })
		const panel = canvas.getByRole("complementary", { name: "Workspace" })

		await expect(handle.getBoundingClientRect().left).toBeLessThan(
			panel.getBoundingClientRect().left + 8,
		)

		handle.focus()
		await userEvent.keyboard("{ArrowLeft}")

		await waitFor(async () => {
			await expect(handle).toHaveAttribute(
				"aria-valuenow",
				String(SIDEBAR_DEFAULT_WIDTH + SIDEBAR_WIDTH_STEP),
			)
		}, FRAME_POLL)
	},
})
