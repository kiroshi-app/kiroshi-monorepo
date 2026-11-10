import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { ShellSidebarProvider } from "@workspace/ui/components/shell-sidebar-provider"
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
