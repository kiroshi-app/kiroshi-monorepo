"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
	type PointerEventHandler,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react"

import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { useDismiss } from "@workspace/ui/lib/hooks/use-dismiss"
import { cn } from "@workspace/ui/lib/utils"

const TRAVEL_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

const PANEL_HIDDEN = { y: 6, scale: 0.98 } as const
const PANEL_VISIBLE = { y: 0, scale: 1 } as const
const PANEL_LEAVING = { ...PANEL_HIDDEN, pointerEvents: "none" } as const

const scrollActiveIntoView = (row: HTMLButtonElement | null) => {
	row?.scrollIntoView({ block: "nearest" })
}

type PromptMenuOptions = {
	open: boolean
	query: string
	count: number
	onChoose: (index: number) => void
	onDismiss: () => void
}

type PromptMenu = {
	rootRef: RefObject<HTMLDivElement | null>
	isOpen: boolean
	active: number
	activateOnPointerMove: (
		index: number,
	) => PointerEventHandler<HTMLButtonElement>
}

const usePromptMenu = ({
	open,
	query,
	count,
	onChoose,
	onDismiss,
}: PromptMenuOptions): PromptMenu => {
	const rootRef = useRef<HTMLDivElement>(null)
	const lastPointer = useRef({ x: -1, y: -1 })
	const [activeIndex, setActiveIndex] = useState(0)

	const isOpen = open && count > 0
	const [lastScope, setLastScope] = useState({ open, query })

	if (lastScope.open !== open || lastScope.query !== query) {
		setLastScope({ open, query })
		setActiveIndex(0)
	}

	const active = Math.min(activeIndex, Math.max(count - 1, 0))

	useEffect(() => {
		if (!isOpen) return

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing) return

			const step = TRAVEL_STEPS[event.key]
			const selects = event.key === "Enter" || event.key === "Tab"
			if (step === undefined && !selects) return

			event.preventDefault()
			event.stopPropagation()

			if (step === undefined) onChoose(active)
			else setActiveIndex((active + step + count) % count)
		}

		window.addEventListener("keydown", onKeyDown, true)
		return () => window.removeEventListener("keydown", onKeyDown, true)
	}, [isOpen, count, active, onChoose])

	useDismiss(isOpen, onDismiss, rootRef)

	return {
		rootRef,
		isOpen,
		active,
		activateOnPointerMove: (index) => (event) => {
			if (event.pointerType === "touch") return
			const { x, y } = lastPointer.current
			lastPointer.current = { x: event.clientX, y: event.clientY }
			if (event.clientX !== x || event.clientY !== y) setActiveIndex(index)
		},
	}
}

type PromptMenuSurfaceProps = {
	slot: string
	label: string
	isOpen: boolean
	rootRef: RefObject<HTMLDivElement | null>
	panelClassName: string
	rows: ReactNode
	footer?: ReactNode
	children: ReactNode
	className?: string
}

const PromptMenuSurface = ({
	slot,
	label,
	isOpen,
	rootRef,
	panelClassName,
	rows,
	footer,
	children,
	className,
}: PromptMenuSurfaceProps) => {
	const reduce = useReducedMotion() ?? false

	return (
		<div ref={rootRef} data-slot={slot} className={cn("relative", className)}>
			<AnimatePresence>
				{isOpen ? (
					<motion.div
						initial={PANEL_HIDDEN}
						animate={PANEL_VISIBLE}
						exit={PANEL_LEAVING}
						transition={reduce ? TRANSITION_NONE : SPRING_PANEL}
						onPointerDown={(event) => event.preventDefault()}
						style={{ transformOrigin: "bottom left" }}
						className={cn(POPUP_CLASS, panelClassName)}
					>
						<div
							role="listbox"
							aria-label={label}
							tabIndex={0}
							className="max-h-64 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{rows}
						</div>
						{footer}
					</motion.div>
				) : null}
			</AnimatePresence>

			{children}
		</div>
	)
}

type PromptMenuRowProps = {
	isActive: boolean
	onPointerMove: PointerEventHandler<HTMLButtonElement>
	onSelect: () => void
	className: string
	children: ReactNode
}

const PromptMenuRow = ({
	isActive,
	onPointerMove,
	onSelect,
	className,
	children,
}: PromptMenuRowProps) => (
	<button
		ref={isActive ? scrollActiveIntoView : undefined}
		type="button"
		role="option"
		aria-selected={isActive}
		tabIndex={-1}
		onPointerMove={onPointerMove}
		onClick={onSelect}
		className={cn(className, isActive && "bg-muted dark:bg-foreground/8")}
	>
		{children}
	</button>
)

export { PromptMenuRow, PromptMenuSurface, usePromptMenu }
