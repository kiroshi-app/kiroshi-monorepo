"use client"

import { type ComponentProps, useEffect } from "react"

import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

const TOGGLE_SHORTCUT_KEY = "b"

const EDITABLE_FIELDS = "input, textarea, select"

const isToggleShortcut = (event: KeyboardEvent) =>
	event.key === TOGGLE_SHORTCUT_KEY && (event.metaKey || event.ctrlKey)

const isEditable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches(EDITABLE_FIELDS))

const ShellSidebarProvider = (
	props: ComponentProps<typeof SidebarProvider>,
) => {
	"use no memo"

	useEffect(() => {
		const keepShortcutFromSidebar = (event: KeyboardEvent) => {
			if (!isToggleShortcut(event)) return
			if (isEditable(event.target)) {
				event.stopPropagation()
				return
			}
			if (event.repeat) {
				event.preventDefault()
				event.stopPropagation()
			}
		}
		document.addEventListener("keydown", keepShortcutFromSidebar)
		return () =>
			document.removeEventListener("keydown", keepShortcutFromSidebar)
	}, [])

	return <SidebarProvider {...props} />
}

export { isToggleShortcut, ShellSidebarProvider }
