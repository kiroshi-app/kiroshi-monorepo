"use client"

import { useEffect, useState } from "react"

import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"

type SkeletonPhase = "delay" | "skeleton" | "fade" | "content"

type Stage = "delay" | "shown" | "held" | "fade" | "content"

type SkeletonTiming = {
	delayMs?: number
	holdMs?: number
	fadeMs?: number
}

type Settling = {
	stage: Stage
	isPending: boolean
	prefersReducedMotion: boolean
}

const PHASE_OF: Record<Stage, SkeletonPhase> = {
	delay: "delay",
	shown: "skeleton",
	held: "skeleton",
	fade: "fade",
	content: "content",
}

const settle = ({
	stage,
	isPending,
	prefersReducedMotion,
}: Settling): Stage => {
	if (isPending)
		return stage === "content" || stage === "fade" ? "delay" : stage
	if (stage === "delay") return "content"
	if (stage === "held") return prefersReducedMotion ? "content" : "fade"
	if (stage === "fade" && prefersReducedMotion) return "content"
	return stage
}

export const useSkeletonTiming = (
	isPending: boolean,
	{ delayMs = 300, holdMs = 500, fadeMs = 150 }: SkeletonTiming = {},
) => {
	const prefersReducedMotion = usePrefersReducedMotion()
	const [stage, setStage] = useState<Stage>(isPending ? "delay" : "content")

	const settled = settle({ stage, isPending, prefersReducedMotion })
	if (settled !== stage) setStage(settled)

	useEffect(() => {
		const timed: Partial<Record<Stage, [Stage, number]>> = {
			delay: ["shown", delayMs],
			shown: ["held", holdMs],
			fade: ["content", fadeMs],
		}
		const next = timed[stage]
		if (!next) return
		const [following, afterMs] = next
		const timer = setTimeout(() => setStage(following), afterMs)
		return () => clearTimeout(timer)
	}, [stage, delayMs, holdMs, fadeMs])

	return PHASE_OF[settled]
}

export type { SkeletonPhase, SkeletonTiming }
