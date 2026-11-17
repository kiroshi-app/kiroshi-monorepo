"use client"

import {
	type CSSProperties,
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	AnswerCard,
	type AnswerCardFill,
	AnswerCardHeader,
} from "@workspace/ui/components/markdown/answer-card"
import { AnswerFence } from "@workspace/ui/components/markdown/code"
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

type LiveHtmlPlacement = {
	rect: LiveHtmlRect
	clip: LiveHtmlRect
}

type LiveHtmlSlotProps = {
	status: LiveHtmlStatus
	html: string
	height?: number
	onPlacementChange: (placement: LiveHtmlPlacement | null) => void
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

const placementOf = (
	element: Element,
	clippingAncestors: Element[],
): LiveHtmlPlacement => {
	const { x, y, width, height } = element.getBoundingClientRect()
	return {
		rect: { x, y, width, height },
		clip: visibleRectOf(element, clippingAncestors),
	}
}

const isSameRect = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isSamePlacement = (
	a: LiveHtmlPlacement | null,
	b: LiveHtmlPlacement | null,
) =>
	a === b ||
	(a !== null &&
		b !== null &&
		isSameRect(a.rect, b.rect) &&
		isSameRect(a.clip, b.clip))

const LiveHtmlSlot = ({
	status,
	html,
	height = DEFAULT_HEIGHT,
	onPlacementChange,
	enlarged,
	defaultEnlarged = false,
	onEnlargedChange,
	enlargedContainer,
}: LiveHtmlSlotProps) => {
	const { t } = useTranslation("chat")
	const [uncontrolledEnlarged, setUncontrolledEnlarged] =
		useState(defaultEnlarged)
	const [reserved, setReserved] = useState<HTMLDivElement | null>(null)
	const [inPlaceBox, setInPlaceBox] = useState<CSSProperties>()
	const lastReported = useRef<LiveHtmlPlacement | null>(null)
	const pendingFocus = useRef<FocusTarget | null>(null)
	const isUnavailable = status === "unavailable"
	const isEnlarged = !isUnavailable && (enlarged ?? uncontrolledEnlarged)

	const report = useEffectEvent((placement: LiveHtmlPlacement | null) => {
		if (isSamePlacement(lastReported.current, placement)) return
		lastReported.current = placement
		onPlacementChange(placement)
	})

	const changeEnlarged = (next: boolean) => {
		pendingFocus.current = next ? "shrink" : "enlarge"
		setUncontrolledEnlarged(next)
		onEnlargedChange?.(next)
	}

	const shrinkOnEscape = useEffectEvent((event: KeyboardEvent) => {
		if (event.key === "Escape" && !event.defaultPrevented) changeEnlarged(false)
	})

	useEffect(() => {
		if (!reserved) {
			report(null)
			return
		}
		const ancestors = ancestorsOf(reserved)
		const clippingAncestors = ancestors.filter(isClipping)
		const update = () => report(placementOf(reserved, clippingAncestors))
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

	const measureInPlace = useCallback((frame: HTMLDivElement) => {
		const record = () => {
			const { marginTop, marginBottom } = getComputedStyle(frame)
			setInPlaceBox({ height: frame.offsetHeight, marginTop, marginBottom })
		}
		record()
		const resizes = new ResizeObserver(record)
		resizes.observe(frame)
		return () => resizes.disconnect()
	}, [])

	const focusWhenPending =
		(target: FocusTarget) => (button: HTMLButtonElement | null) => {
			if (!button || pendingFocus.current !== target) return
			pendingFocus.current = null
			button.focus()
		}

	if (isUnavailable) return <AnswerFence code={html} language="html" />

	const isLoading = status === "loading"
	const enlargedFill: AnswerCardFill = enlargedContainer
		? "container"
		: "viewport"

	const frame = (
		<AnswerCard
			slot="live-html-slot"
			ref={isEnlarged ? undefined : measureInPlace}
			fill={isEnlarged ? enlargedFill : undefined}
			data-status={status}
			role="group"
			aria-label={t("liveHtml.label")}
			aria-busy={isLoading}
		>
			<AnswerCardHeader label={t("liveHtml.label")}>
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
			</AnswerCardHeader>
			<div className={cn("flex p-2", isEnlarged && "min-h-0 flex-1")}>
				<div
					ref={setReserved}
					data-slot="live-html-slot-view"
					className="flex-1"
					style={isEnlarged ? undefined : { height }}
				>
					{isLoading ? (
						<Skeleton aria-hidden className="size-full rounded-md" />
					) : null}
				</div>
			</div>
		</AnswerCard>
	)

	if (!isEnlarged) return frame

	return (
		<>
			<div
				aria-hidden
				data-slot="live-html-slot-placeholder"
				style={inPlaceBox}
			/>
			{createPortal(frame, enlargedContainer ?? document.body)}
		</>
	)
}

export type {
	LiveHtmlPlacement,
	LiveHtmlRect,
	LiveHtmlSlotProps,
	LiveHtmlStatus,
}
export { LiveHtmlSlot }
