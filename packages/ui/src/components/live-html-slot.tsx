"use client"

import { useEffect, useEffectEvent, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { AnswerFence } from "@workspace/ui/components/markdown/code"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type LiveHtmlStatus = "live" | "loading" | "unavailable"

type LiveHtmlRect = {
	x: number
	y: number
	width: number
	height: number
}

type LiveHtmlSlotProps = {
	status: LiveHtmlStatus
	html: string
	height?: number
	onRectChange: (rect: LiveHtmlRect | null) => void
	enlarged?: boolean
	defaultEnlarged?: boolean
	onEnlargedChange?: (enlarged: boolean) => void
	enlargedContainer?: HTMLElement | null
}

type Edges = {
	left: number
	top: number
	right: number
	bottom: number
}

type FocusTarget = "enlarge" | "shrink"

const DEFAULT_HEIGHT = 320

const FRAME_CLASS =
	"flex flex-col overflow-hidden rounded-2xl ring-1 ring-border"

const IN_PLACE_FRAME_CLASS = `${MARKDOWN_ESCAPED_BLOCK_CLASS} my-4`

const ENLARGED_FRAME_CLASS = "absolute inset-0 z-10 bg-background"

const HEADER_CLASS =
	"flex items-center justify-between gap-2 border-answer-card-divider border-b p-2"

const LABEL_CLASS = "min-w-0 truncate text-muted-foreground text-xs"

const isClipping = (element: Element) => {
	const { overflowX, overflowY } = getComputedStyle(element)
	return overflowX !== "visible" || overflowY !== "visible"
}

const ancestorsOf = (element: Element) => {
	const ancestors: Element[] = []
	for (
		let parent = element.parentElement;
		parent && parent !== document.documentElement;
		parent = parent.parentElement
	) {
		ancestors.push(parent)
	}
	return ancestors
}

const paddingBoxOf = (element: Element): Edges => {
	const box = element.getBoundingClientRect()
	const left = box.left + element.clientLeft
	const top = box.top + element.clientTop
	return {
		left,
		top,
		right: left + element.clientWidth,
		bottom: top + element.clientHeight,
	}
}

const intersect = (a: Edges, b: Edges): Edges => ({
	left: Math.max(a.left, b.left),
	top: Math.max(a.top, b.top),
	right: Math.min(a.right, b.right),
	bottom: Math.min(a.bottom, b.bottom),
})

const visibleRectOf = (
	element: Element,
	clippingAncestors: Element[],
): LiveHtmlRect => {
	const { left, top, right, bottom } = clippingAncestors.reduce<Edges>(
		(edges, ancestor) => intersect(edges, paddingBoxOf(ancestor)),
		element.getBoundingClientRect(),
	)
	const width = right - left
	const height = bottom - top
	return width > 0 && height > 0
		? { x: left, y: top, width, height }
		: { x: left, y: top, width: 0, height: 0 }
}

const isSameRect = (a: LiveHtmlRect | null, b: LiveHtmlRect | null) =>
	a === b ||
	(a !== null &&
		b !== null &&
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height)

const LiveHtmlSlot = ({
	status,
	html,
	height = DEFAULT_HEIGHT,
	onRectChange,
	enlarged,
	defaultEnlarged = false,
	onEnlargedChange,
	enlargedContainer,
}: LiveHtmlSlotProps) => {
	const { t } = useTranslation("chat")
	const labelId = useId()
	const [uncontrolledEnlarged, setUncontrolledEnlarged] =
		useState(defaultEnlarged)
	const [reserved, setReserved] = useState<HTMLDivElement | null>(null)
	const lastReported = useRef<LiveHtmlRect | null>(null)
	const pendingFocus = useRef<FocusTarget | null>(null)
	const isUnavailable = status === "unavailable"
	const isEnlarged = !isUnavailable && (enlarged ?? uncontrolledEnlarged)

	const report = useEffectEvent((rect: LiveHtmlRect | null) => {
		if (isSameRect(lastReported.current, rect)) return
		lastReported.current = rect
		onRectChange(rect)
	})

	const changeEnlarged = (next: boolean) => {
		pendingFocus.current = next ? "shrink" : "enlarge"
		setUncontrolledEnlarged(next)
		onEnlargedChange?.(next)
	}

	const shrinkOnEscape = useEffectEvent((event: KeyboardEvent) => {
		if (event.key === "Escape") changeEnlarged(false)
	})

	useEffect(() => {
		if (!reserved) {
			report(null)
			return
		}
		const ancestors = ancestorsOf(reserved)
		const clippingAncestors = ancestors.filter(isClipping)
		const update = () => report(visibleRectOf(reserved, clippingAncestors))
		const resizes = new ResizeObserver(update)
		for (const element of [reserved, ...ancestors]) resizes.observe(element)
		document.addEventListener("scroll", update, {
			capture: true,
			passive: true,
		})
		window.addEventListener("resize", update)
		update()
		return () => {
			resizes.disconnect()
			document.removeEventListener("scroll", update, { capture: true })
			window.removeEventListener("resize", update)
		}
	}, [reserved])

	useEffect(() => () => report(null), [])

	useEffect(() => {
		if (!isEnlarged) return
		document.addEventListener("keydown", shrinkOnEscape)
		return () => document.removeEventListener("keydown", shrinkOnEscape)
	}, [isEnlarged])

	const focusWhenPending =
		(target: FocusTarget) => (button: HTMLButtonElement | null) => {
			if (!button || pendingFocus.current !== target) return
			pendingFocus.current = null
			button.focus()
		}

	if (isUnavailable) return <AnswerFence code={html} language="html" />

	const isLoading = status === "loading"

	const frame = (
		<div
			data-slot="live-html-slot"
			data-status={status}
			data-enlarged={isEnlarged}
			role="group"
			aria-labelledby={labelId}
			aria-busy={isLoading}
			className={cn(
				FRAME_CLASS,
				isEnlarged ? ENLARGED_FRAME_CLASS : IN_PLACE_FRAME_CLASS,
			)}
		>
			<div data-slot="live-html-slot-header" className={HEADER_CLASS}>
				<span id={labelId} className={LABEL_CLASS}>
					{t("liveHtml.label")}
				</span>
				<Button
					ref={focusWhenPending(isEnlarged ? "shrink" : "enlarge")}
					variant="ghost"
					size="xs"
					className="transition-none"
					aria-label={t(
						isEnlarged ? "liveHtml.shrinkName" : "liveHtml.enlargeName",
					)}
					onClick={() => changeEnlarged(!isEnlarged)}
				>
					{isEnlarged ? (
						<Icons.FullscreenExit className="size-3.5" />
					) : (
						<Icons.Fullscreen className="size-3.5" />
					)}
					{t(isEnlarged ? "liveHtml.shrink" : "liveHtml.enlarge")}
				</Button>
			</div>
			<div className={cn("flex p-2", isEnlarged && "min-h-0 flex-1")}>
				<div
					ref={setReserved}
					data-slot="live-html-slot-view"
					className="flex-1"
					style={isEnlarged ? undefined : { height }}
				>
					{isLoading ? (
						<Skeleton aria-hidden className="size-full rounded-lg" />
					) : null}
				</div>
			</div>
		</div>
	)

	return isEnlarged
		? createPortal(frame, enlargedContainer ?? document.body)
		: frame
}

export type { LiveHtmlRect, LiveHtmlSlotProps, LiveHtmlStatus }
export { LiveHtmlSlot }
