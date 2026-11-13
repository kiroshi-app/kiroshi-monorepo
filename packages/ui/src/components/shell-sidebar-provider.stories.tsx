import { StrictMode, useState } from "react"
import { expect, spyOn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { ShellSidebarProvider } from "@workspace/ui/components/shell-sidebar-provider"
import { Button } from "@workspace/ui/components/ui/button"
import { Input } from "@workspace/ui/components/ui/input"
import {
	Sidebar,
	SidebarContent,
	SidebarInset,
} from "@workspace/ui/components/ui/sidebar"

type Shortcut = { metaKey?: boolean; ctrlKey?: boolean; repeat?: boolean }

const COMMAND_B: Shortcut = { metaKey: true }

const CONTROL_B: Shortcut = { ctrlKey: true }

const press = (target: Element, shortcut: Shortcut) => {
	const event = new KeyboardEvent("keydown", {
		key: "b",
		bubbles: true,
		cancelable: true,
		...shortcut,
	})
	target.dispatchEvent(event)
	return event
}

const sidebarStateIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "sidebar").dataset.state

const settled = () => new Promise((resolve) => setTimeout(resolve, 50))

const expectSidebar = async (
	canvasElement: HTMLElement,
	state: "expanded" | "collapsed",
) => {
	await waitFor(() => expect(sidebarStateIn(canvasElement)).toBe(state))
}

const expectSidebarStill = async (
	canvasElement: HTMLElement,
	state: "expanded" | "collapsed",
) => {
	await settled()
	await expect(sidebarStateIn(canvasElement)).toBe(state)
}

const FIELDS = [
	{ name: "Name", role: "textbox" },
	{ name: "Notes", role: "textbox" },
	{ name: "Model", role: "combobox" },
	{ name: "Draft", role: "textbox" },
]

const SHELLS = ["Boot", "Workspace"] as const

type Shell = (typeof SHELLS)[number]

const TwoShells = () => {
	const [mounted, setMounted] = useState<Shell[]>([])
	const toggle = (shell: Shell) =>
		setMounted((shells) =>
			shells.includes(shell)
				? shells.filter((other) => other !== shell)
				: [...shells, shell],
		)

	return (
		<StrictMode>
			<div className="flex justify-center gap-3 p-4">
				{SHELLS.map((shell) => (
					<Button key={shell} onClick={() => toggle(shell)}>
						{mounted.includes(shell) ? `Unmount ${shell}` : `Mount ${shell}`}
					</Button>
				))}
			</div>
			{SHELLS.filter((shell) => mounted.includes(shell)).map((shell) => (
				<ShellSidebarProvider className="min-h-0" key={shell}>
					<Sidebar
						collapsible="icon"
						side={shell === "Boot" ? "left" : "right"}
					>
						<SidebarContent />
					</Sidebar>
					<SidebarInset className="p-4">
						<Input aria-label={shell} />
					</SidebarInset>
				</ShellSidebarProvider>
			))}
		</StrictMode>
	)
}

type ListenerRegistration = Parameters<typeof document.addEventListener>

const trackDocumentKeydownHandlers = () => {
	const live = new Set<ListenerRegistration[1]>()
	const add = document.addEventListener.bind(document)
	const remove = document.removeEventListener.bind(document)
	spyOn(document, "addEventListener").mockImplementation(
		(...registration: ListenerRegistration) => {
			if (registration[0] === "keydown") live.add(registration[1])
			add(...registration)
		},
	)
	spyOn(document, "removeEventListener").mockImplementation(
		(...registration: ListenerRegistration) => {
			if (registration[0] === "keydown") live.delete(registration[1])
			remove(...registration)
		},
	)
	return () => [...live]
}

const shellOf = (field: HTMLElement) => {
	const shell = field.closest<HTMLElement>('[data-slot="sidebar-wrapper"]')
	if (!shell) throw new Error("This field sits under no sidebar provider")
	return shell
}

const meta = preview.meta({
	title: "Navigation/ShellSidebarProvider",
	component: ShellSidebarProvider,
	tags: ["test-only"],
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The sidebar provider every shell surface uses in place of the bare shadcn one. Cmd+B or Ctrl+B toggles the sidebar once per press: a held key repeating leaves it where the first press set it, and a press inside an input, a textarea, a select or an editable text stays with that field, its default kept.",
			},
		},
	},
	render: () => (
		<ShellSidebarProvider className="h-svh">
			<Sidebar collapsible="icon">
				<SidebarContent />
			</Sidebar>
			<SidebarInset className="gap-3 p-4">
				<Input aria-label="Name" />
				<textarea aria-label="Notes" />
				<select aria-label="Model">
					<option>Opus</option>
				</select>
				<div aria-label="Draft" contentEditable role="textbox" />
			</SidebarInset>
		</ShellSidebarProvider>
	),
})

export const SinglePress = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Cmd+B, then Ctrl+B, pressed once each with focus on the page. Check that each press toggles the sidebar exactly once.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSidebar(canvasElement, "expanded")
		await expect(press(document.body, COMMAND_B).defaultPrevented).toBe(true)
		await expectSidebar(canvasElement, "collapsed")
		await expectSidebarStill(canvasElement, "collapsed")
		press(document.body, CONTROL_B)
		await expectSidebar(canvasElement, "expanded")
		await expectSidebarStill(canvasElement, "expanded")
	},
})

export const HeldShortcut = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Cmd+B held down, the keydown repeating. Check that the sidebar stays collapsed, the state the first press set, through every repeat.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		press(document.body, COMMAND_B)
		await expectSidebar(canvasElement, "collapsed")
		for (let repeat = 0; repeat < 5; repeat++) {
			press(document.body, { ...COMMAND_B, repeat: true })
			await expectSidebarStill(canvasElement, "collapsed")
		}
		press(document.body, COMMAND_B)
		await expectSidebar(canvasElement, "expanded")
	},
})

export const ShortcutInATextField = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Cmd+B pressed inside an input, a textarea, a select and an editable text. Check that the sidebar never moves and that each field receives the keydown with its default kept.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		for (const { name, role } of FIELDS) {
			const field = canvas.getByRole(role, { name })
			const received: Event[] = []
			const receive = (event: Event) => received.push(event)
			field.addEventListener("keydown", receive)
			field.focus()
			const event = press(field, COMMAND_B)
			field.removeEventListener("keydown", receive)
			await expect(received).toEqual([event])
			await expect(event.defaultPrevented).toBe(false)
			await expectSidebarStill(canvasElement, "expanded")
		}
		press(document.body, COMMAND_B)
		await expectSidebar(canvasElement, "collapsed")
	},
})

export const OneOfTwoProvidersUnmounted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Two providers mounted side by side under StrictMode, then one unmounted, each of the two in turn. Check that every mounted provider holds exactly one keydown handler on the document, that unmounting one removes its own handler and no other, and that the remaining sidebar still ignores Cmd+B inside its text field, default kept, and toggles exactly once on Cmd+B outside it.",
			},
		},
	},
	render: () => <TwoShells />,
	play: async ({ canvas, userEvent }) => {
		const liveKeydownHandlers = trackDocumentKeydownHandlers()
		const click = (name: string) =>
			userEvent.click(canvas.getByRole("button", { name }))

		for (const leaving of SHELLS) {
			const staying = SHELLS[leaving === "Boot" ? 1 : 0]
			await click("Mount Boot")
			await waitFor(() => expect(liveKeydownHandlers()).toHaveLength(1))
			await click("Mount Workspace")
			await waitFor(() => expect(liveKeydownHandlers()).toHaveLength(2))
			const stayingHandler = liveKeydownHandlers()[SHELLS.indexOf(staying)]

			await click(`Unmount ${leaving}`)
			await waitFor(() =>
				expect(liveKeydownHandlers()).toEqual([stayingHandler]),
			)

			const field = canvas.getByRole("textbox", { name: staying })
			const shell = shellOf(field)
			const received: Event[] = []
			const receive = (event: Event) => received.push(event)
			field.addEventListener("keydown", receive)
			field.focus()
			const event = press(field, COMMAND_B)
			field.removeEventListener("keydown", receive)
			await expect(received).toEqual([event])
			await expect(event.defaultPrevented).toBe(false)
			await expectSidebarStill(shell, "expanded")

			press(document.body, COMMAND_B)
			await expectSidebar(shell, "collapsed")
			await expectSidebarStill(shell, "collapsed")

			await click(`Unmount ${staying}`)
			await waitFor(() => expect(liveKeydownHandlers()).toEqual([]))
		}
	},
})
