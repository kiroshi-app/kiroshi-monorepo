"use client"

import {
	createContext,
	type ReactNode,
	type RefObject,
	type TransitionEvent,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { HOVER_INTENT_DELAY_MS } from "@workspace/ui/components/tooltip-hint"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

const PEEK_CLOSE_DELAY_MS = 150

const OPEN_POPUP_MARK = "data-popup-open"

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

type SidebarDockLayout = "docked" | "collapsed"

type SidebarDock = {
	layout: SidebarDockLayout
	isSliding: boolean
}

type SidebarDockShell = SidebarDock & {
	shellRef: RefObject<HTMLDivElement | null>
}

const DOCKED_SIDEBAR = '[data-slot="navigation-sidebar"]'

const layoutFor = (isDocked: boolean): SidebarDockLayout =>
	isDocked ? "docked" : "collapsed"

type SidebarPeekState = {
	dock: SidebarDock
	isCollapsed: boolean
	isOpen: boolean
	hover: SidebarPeekHover
	holdFor: (isHolding: boolean) => void
	close: () => void
}

const SidebarPeekContext = createContext<SidebarPeekState | null>(null)

type SidebarPeekProviderProps = {
	isDocked: boolean
	isResizing: boolean
	children: (shell: SidebarDockShell) => ReactNode
}

const SidebarPeekProvider = ({
	isDocked,
	isResizing,
	children,
}: SidebarPeekProviderProps) => {
	const [isOpen, setIsOpen] = useState(false)
	const [layout, setLayout] = useState(() => layoutFor(isDocked))
	const [isSliding, setIsSliding] = useState(false)
	const shellRef = useRef<HTMLDivElement>(null)
	const pending = useRef<number | undefined>(undefined)
	const isHovered = useRef(false)
	const isHeld = useRef(false)

	const settledLayout = layoutFor(isDocked)

	if (!isSliding && layout !== settledLayout) {
		if (isResizing || isOpen) setLayout(settledLayout)
		else setIsSliding(true)
	}
	if (isDocked && isOpen) setIsOpen(false)

	useEffect(() => () => window.clearTimeout(pending.current), [])

	useLayoutEffect(() => {
		if (!isSliding) return
		let isCurrent = true
		const settle = () => {
			if (!isCurrent) return
			setLayout(settledLayout)
			setIsSliding(false)
		}
		const slides =
			shellRef.current?.querySelector(DOCKED_SIDEBAR)?.getAnimations?.() ?? []
		if (slides.length === 0) settle()
		else Promise.allSettled(slides.map((slide) => slide.finished)).then(settle)
		return () => {
			isCurrent = false
		}
	}, [isSliding, settledLayout])

	const peek = useMemo<SidebarPeekState>(() => {
		const settleAfter = (next: boolean, delay: number) => {
			window.clearTimeout(pending.current)
			pending.current = window.setTimeout(() => setIsOpen(next), delay)
		}
		return {
			dock: { layout, isSliding },
			isCollapsed: !isDocked,
			isOpen,
			hover: {
				onPointerEnter: () => {
					isHovered.current = true
					settleAfter(true, HOVER_INTENT_DELAY_MS)
				},
				onPointerLeave: () => {
					isHovered.current = false
					if (!isHeld.current) settleAfter(false, PEEK_CLOSE_DELAY_MS)
				},
			},
			holdFor: (isHolding) => {
				if (isHeld.current === isHolding) return
				isHeld.current = isHolding
				if (isHolding) window.clearTimeout(pending.current)
				else if (!isHovered.current) settleAfter(false, PEEK_CLOSE_DELAY_MS)
			},
			close: () => {
				if (isHeld.current) return
				window.clearTimeout(pending.current)
				setIsOpen(false)
			},
		}
	}, [isDocked, isOpen, layout, isSliding])

	return (
		<SidebarPeekContext.Provider value={peek}>
			{children({ layout, isSliding, shellRef })}
		</SidebarPeekContext.Provider>
	)
}

const useSidebarDock = (): SidebarDock => {
	const peek = useContext(SidebarPeekContext)
	const { open } = useSidebar()

	return peek?.dock ?? { layout: layoutFor(open), isSliding: false }
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
	const holdFor = peek?.holdFor
	const panelRef = useRef<HTMLDivElement>(null)
	const [isMounted, setIsMounted] = useState(false)

	if (isOpen && !isMounted) setIsMounted(true)

	useEffect(() => {
		if (!isOpen || !close) return
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") close()
		}
		document.addEventListener("keydown", closeOnEscape, true)
		return () => document.removeEventListener("keydown", closeOnEscape, true)
	}, [isOpen, close])

	useEffect(() => {
		const panel = panelRef.current
		if (!isOpen || !panel || !holdFor) return
		const ownedPopups = new MutationObserver(() =>
			holdFor(panel.querySelector(`[${OPEN_POPUP_MARK}]`) !== null),
		)
		ownedPopups.observe(panel, {
			attributeFilter: [OPEN_POPUP_MARK],
			childList: true,
			subtree: true,
		})
		return () => {
			ownedPopups.disconnect()
			holdFor(false)
		}
	}, [isOpen, holdFor])

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
					ref={panelRef}
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
	useSidebarDock,
	useSidebarPeekTrigger,
}
