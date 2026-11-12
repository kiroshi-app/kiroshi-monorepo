"use client"

import { type ComponentProps, useEffect, useRef } from "react"

import {
	isToggleShortcut,
	ShellSidebarProvider,
} from "@workspace/ui/components/shell-sidebar-provider"

type NestedSidebarProviderProps = ComponentProps<
	typeof ShellSidebarProvider
> & {
	open: boolean
	onOpenChange: (isOpen: boolean) => void
}

const NestedSidebarProvider = ({
	onOpenChange,
	...props
}: NestedSidebarProviderProps) => {
	const isShortcutDown = useRef(false)

	useEffect(() => {
		const mark = (event: KeyboardEvent) => {
			isShortcutDown.current = isToggleShortcut(event)
		}
		const clear = () => {
			isShortcutDown.current = false
		}
		window.addEventListener("keydown", mark, true)
		window.addEventListener("keyup", clear, true)
		return () => {
			window.removeEventListener("keydown", mark, true)
			window.removeEventListener("keyup", clear, true)
		}
	}, [])

	return (
		<ShellSidebarProvider
			{...props}
			onOpenChange={(isOpen) => {
				if (isShortcutDown.current) return
				onOpenChange(isOpen)
			}}
		/>
	)
}

export { NestedSidebarProvider }
