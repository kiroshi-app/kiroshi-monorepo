"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	AnswerCard,
	AnswerCardHeader,
} from "@workspace/ui/components/markdown/answer-card"
import { AnswerFence } from "@workspace/ui/components/markdown/code"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type LiveHtmlStatus = "live" | "loading" | "unavailable"

type LiveHtmlRect = {
	x: number
	y: number
	width: number
	height: number
}

type LiveHtmlRadius = {
	topLeft: number
	topRight: number
	bottomRight: number
	bottomLeft: number
}

type LiveHtmlPlacement = {
	rect: LiveHtmlRect
	clip: LiveHtmlRect
	radius?: LiveHtmlRadius
}

type LiveHtmlSlotProps = {
	status: LiveHtmlStatus
	html: string
	height?: number
	onPlacementChange: (placement: LiveHtmlPlacement | null) => void
}

type Edges = {
	left: number
	top: number
	right: number
	bottom: number
}

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

const radiusOf = (element: Element, card: Element): LiveHtmlRadius => {
	const view = element.getBoundingClientRect()
	const inside = paddingBoxOf(card)
	const reachesTop = view.top <= inside.top
	const reachesBottom = view.bottom >= inside.bottom
	const reachesLeft = view.left <= inside.left
	const reachesRight = view.right >= inside.right
	const style = getComputedStyle(card)
	const cornerOf = (isReached: boolean, radius: string) =>
		isReached ? Number.parseFloat(radius) : 0
	return {
		topLeft: cornerOf(reachesTop && reachesLeft, style.borderTopLeftRadius),
		topRight: cornerOf(reachesTop && reachesRight, style.borderTopRightRadius),
		bottomRight: cornerOf(
			reachesBottom && reachesRight,
			style.borderBottomRightRadius,
		),
		bottomLeft: cornerOf(
			reachesBottom && reachesLeft,
			style.borderBottomLeftRadius,
		),
	}
}

const placementOf = (
	element: Element,
	card: Element,
	clippingAncestors: Element[],
): LiveHtmlPlacement => {
	const { x, y, width, height } = element.getBoundingClientRect()
	return {
		rect: { x, y, width, height },
		clip: visibleRectOf(element, clippingAncestors),
		radius: radiusOf(element, card),
	}
}

const isSameRect = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isSameRadius = (a?: LiveHtmlRadius, b?: LiveHtmlRadius) =>
	a?.topLeft === b?.topLeft &&
	a?.topRight === b?.topRight &&
	a?.bottomRight === b?.bottomRight &&
	a?.bottomLeft === b?.bottomLeft

const isSamePlacement = (
	a: LiveHtmlPlacement | null,
	b: LiveHtmlPlacement | null,
) =>
	a === b ||
	(a !== null &&
		b !== null &&
		isSameRect(a.rect, b.rect) &&
		isSameRect(a.clip, b.clip) &&
		isSameRadius(a.radius, b.radius))

const LiveHtmlSlot = ({
	status,
	html,
	height,
	onPlacementChange,
}: LiveHtmlSlotProps) => {
	const { t } = useTranslation("chat")
	const [card, setCard] = useState<HTMLDivElement | null>(null)
	const [reserved, setReserved] = useState<HTMLDivElement | null>(null)
	const lastReported = useRef<LiveHtmlPlacement | null>(null)

	const report = useEffectEvent((placement: LiveHtmlPlacement | null) => {
		if (isSamePlacement(lastReported.current, placement)) return
		lastReported.current = placement
		onPlacementChange(placement)
	})

	useEffect(() => {
		if (!card || !reserved) {
			report(null)
			return
		}
		const ancestors = ancestorsOf(reserved)
		const clippingAncestors = ancestors.filter(isClipping)
		const update = () => report(placementOf(reserved, card, clippingAncestors))
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
	}, [card, reserved])

	useEffect(() => () => report(null), [])

	if (status === "unavailable")
		return <AnswerFence code={html} language="html" />

	const isLoading = status === "loading"

	return (
		<AnswerCard
			ref={setCard}
			slot="live-html-slot"
			data-status={status}
			role="group"
			aria-label={t("liveHtml.label")}
			aria-busy={isLoading}
		>
			<AnswerCardHeader label={t("liveHtml.label")} />
			<div
				ref={setReserved}
				data-slot="live-html-slot-view"
				className={cn(height === undefined && "h-80")}
				style={{ height }}
			>
				{isLoading ? (
					<Skeleton aria-hidden className="size-full rounded-none" />
				) : null}
			</div>
		</AnswerCard>
	)
}

export type {
	LiveHtmlPlacement,
	LiveHtmlRadius,
	LiveHtmlRect,
	LiveHtmlSlotProps,
	LiveHtmlStatus,
}
export { LiveHtmlSlot }
