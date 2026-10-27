"use client"

import { type ReactNode, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { companionHue } from "@workspace/ui/components/companion-avatar"
import {
	type FieldAvatarProps,
	type FieldState,
	stillTime,
} from "@workspace/ui/components/companion-field"
import { COMPANION_SILHOUETTE } from "@workspace/ui/components/companion-picture"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"

type Paint = (time: number) => void

type FieldFrameProps = Required<Omit<FieldAvatarProps, "hue">> & {
	hue?: number
	surface?: string
	children: ReactNode
}

type FieldClock = { state: FieldState; paint: Paint }

const painters = new Set<Paint>()
let frame = 0

const tick = (now: number) => {
	for (const paint of painters) paint(now)
	frame = painters.size > 0 ? requestAnimationFrame(tick) : 0
}

const subscribe = (paint: Paint) => {
	painters.add(paint)
	if (frame === 0) frame = requestAnimationFrame(tick)
	return () => {
		painters.delete(paint)
		if (painters.size > 0) return
		cancelAnimationFrame(frame)
		frame = 0
	}
}

const FieldFrame = ({
	name,
	hue,
	state,
	size,
	surface,
	children,
}: FieldFrameProps) => {
	const { t } = useTranslation("common")

	return (
		<span
			aria-label={name.trim() || t("companion.unnamed")}
			className="relative inline-flex shrink-0 overflow-hidden text-(--bot-avatar-ink)"
			data-hue={hue}
			data-slot="companion-field"
			data-state={state}
			role="img"
			style={{
				...(hue === undefined ? undefined : hueStyle(companionHue(name, hue))),
				width: size,
				height: size,
				...(surface && COMPANION_SILHOUETTE),
				backgroundColor: surface,
			}}
		>
			{children}
		</span>
	)
}

const useFieldClock = ({ state, paint }: FieldClock) => {
	const prefersReducedMotion = usePrefersReducedMotion()
	const isAnimated = state !== "idle" && !prefersReducedMotion
	const latestPaint = useRef(paint)
	latestPaint.current = paint

	useEffect(() => {
		if (isAnimated) return subscribe((time) => latestPaint.current(time))
	}, [isAnimated])

	useEffect(() => {
		if (!isAnimated) latestPaint.current(stillTime(state))
	})
}

export { FieldFrame, useFieldClock }
