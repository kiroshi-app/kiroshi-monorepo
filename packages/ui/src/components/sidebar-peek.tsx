"use client"

import {
	createContext,
	type ReactNode,
	type TransitionEvent,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { HOVER_INTENT_DELAY_MS } from "@workspace/ui/components/tooltip-hint"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

const PEEK_CLOSE_DELAY_MS = 150

const EDGE = "w-(--shell-inset) shrink-0 self-stretch"

const FLOATS_OVER_THE_CARD =
	"absolute start-(--shell-inset) top-10 bottom-(--shell-inset) z-40 w-[calc(var(--sidebar-width)-var(--shell-inset))]"

const SURFACE =
	"flex min-h-0 overflow-clip rounded-control border border-title-bar-divider bg-card-raised px-1 pt-2 pb-1 shadow-sidebar-peek"

const SIDEBAR_FILLS_THE_PANEL =
	"*:data-[slot=expanded-sidebar]:w-full *:data-[slot=expanded-sidebar]:gap-3 *:data-[slot=expanded-sidebar]:p-0"

const SLIDES_AND_FADES =
	"transition-[opacity,translate] duration-150 ease-out starting:-translate-x-2 starting:opacity-0 data-[open=false]:pointer-events-none data-[open=false]:-translate-x-2 data-[open=false]:opacity-0 motion-reduce:duration-[0.01ms]"

const PANEL = cn(
	FLOATS_OVER_THE_CARD,
	SURFACE,
	SIDEBAR_FILLS_THE_PANEL,
	SLIDES_AND_FADES,
)

type SidebarPeekHover = {
	onPointerEnter: () => void
	onPointerLeave: () => void
}

type SidebarPeekState = {
	isCollapsed: boolean
	isOpen: boolean
	hover: SidebarPeekHover
	close: () => void
}

const SidebarPeekContext = createContext<SidebarPeekState | null>(null)

type SidebarPeekProviderProps = {
	children: ReactNode
}

const SidebarPeekProvider = ({ children }: SidebarPeekProviderProps) => {
	const { open: isDocked } = useSidebar()
	const [isOpen, setIsOpen] = useState(false)
	const pending = useRef<number | undefined>(undefined)

	if (isDocked && isOpen) setIsOpen(false)

	useEffect(() => () => window.clearTimeout(pending.current), [])

	const peek = useMemo<SidebarPeekState>(() => {
		const settleAfter = (next: boolean, delay: number) => {
			window.clearTimeout(pending.current)
			pending.current = window.setTimeout(() => setIsOpen(next), delay)
		}
		return {
			isCollapsed: !isDocked,
			isOpen: isOpen && !isDocked,
			hover: {
				onPointerEnter: () => settleAfter(true, HOVER_INTENT_DELAY_MS),
				onPointerLeave: () => settleAfter(false, PEEK_CLOSE_DELAY_MS),
			},
			close: () => {
				window.clearTimeout(pending.current)
				setIsOpen(false)
			},
		}
	}, [isDocked, isOpen])

	return (
		<SidebarPeekContext.Provider value={peek}>
			{children}
		</SidebarPeekContext.Provider>
	)
}

const useSidebarPeekTrigger = (): SidebarPeekHover | undefined => {
	const peek = useContext(SidebarPeekContext)

	return peek?.isCollapsed ? peek.hover : undefined
}

type SidebarPeekProps = {
	children: ReactNode
}

const SidebarPeek = ({ children }: SidebarPeekProps) => {
	const peek = useContext(SidebarPeekContext)
	const isOpen = peek?.isOpen ?? false
	const close = peek?.close
	const [isMounted, setIsMounted] = useState(false)

	if (isOpen && !isMounted) setIsMounted(true)

	useEffect(() => {
		if (!isOpen || !close) return
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") close()
		}
		document.addEventListener("keydown", closeOnEscape)
		return () => document.removeEventListener("keydown", closeOnEscape)
	}, [isOpen, close])

	const unmountOnceGone = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && !isOpen) setIsMounted(false)
	}

	return (
		<>
			<div
				aria-hidden="true"
				className={EDGE}
				data-slot="sidebar-peek-edge"
				{...peek?.hover}
			/>
			{isMounted ? (
				<div
					className={PANEL}
					data-open={isOpen}
					data-slot="sidebar-peek"
					inert={!isOpen}
					onTransitionEnd={unmountOnceGone}
					{...peek?.hover}
				>
					{children}
				</div>
			) : null}
		</>
	)
}

export {
	PEEK_CLOSE_DELAY_MS,
	SidebarPeek,
	SidebarPeekProvider,
	useSidebarPeekTrigger,
}
