"use client"

import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BRAND_NAME } from "@workspace/ui/components/app-icon-mark"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const LAUNCH_AGENT_LIMIT = 12
const COLOUR_TURNS = 12

type LaunchAgent = { id: string; name: string; hue?: number | null }

type LaunchLoaderProps = {
	agents?: LaunchAgent[]
	isLeaving?: boolean
	isStill?: boolean
}

type LaunchVariables = Record<`--launch-${string}`, string | number>

type ColourTurn = {
	index: number
	count: number
	beat: number
	lead: number
}

type LaunchPoint = { x: number; y: number }

const BRAND_AGENT: LaunchAgent = { id: "brand", name: BRAND_NAME }

const launchVariables = (variables: LaunchVariables) =>
	variables as CSSProperties

const launchCast = (agents: LaunchAgent[], fewestCells: number) => {
	const known = agents.slice(0, LAUNCH_AGENT_LIMIT)
	const inkCells = Array.from(
		{ length: Math.max(fewestCells - known.length, 0) },
		(_, index): LaunchAgent => ({
			id: `ink-cell-${index}`,
			name: `${BRAND_NAME} ${index}`,
		}),
	)
	return [...known, ...inkCells]
}

const centroidOf = (points: LaunchPoint[]): LaunchPoint => ({
	x: points.reduce((sum, { x }) => sum + x, 0) / points.length,
	y: points.reduce((sum, { y }) => sum + y, 0) / points.length,
})

const colourTurnVariables = ({ index, count, beat, lead }: ColourTurn) =>
	launchVariables({
		"--launch-lit-period": `${COLOUR_TURNS * beat}ms`,
		"--launch-lit-delay": `${Math.round(lead + Math.round((index * COLOUR_TURNS) / count) * beat)}ms`,
	})

const useLaunchStillness = (isHeldStill: boolean) => {
	const prefersReducedMotion = usePrefersReducedMotion()
	return isHeldStill || prefersReducedMotion
}

type LaunchLoaderWindowProps = {
	direction: string
	side: number
	isLeaving: boolean
	isStill: boolean
	exit?: string
	className?: string
	children: ReactNode
}

const LaunchLoaderWindow = ({
	direction,
	side,
	isLeaving,
	isStill,
	exit,
	className,
	children,
}: LaunchLoaderWindowProps) => {
	const { t } = useTranslation("common")
	const status = t("boot.status")

	return (
		<FullWindowLayout
			className="group/launch"
			data-direction={direction}
			data-phase={isLeaving ? "leaving" : "running"}
			data-slot="launch-loader"
			data-still={isStill ? "" : undefined}
		>
			<FullWindowContent
				className={cn(
					isStill &&
						"transition-opacity duration-150 group-data-[phase=leaving]/launch:opacity-0",
				)}
			>
				<div
					aria-hidden
					className={cn(
						"pointer-events-none relative",
						!isStill && exit,
						className,
					)}
					data-slot="launch-loader-stage"
					style={{ width: side, height: side }}
				>
					{children}
				</div>
				{isStill ? (
					<p className="mt-6 text-muted-foreground text-sm" role="status">
						{status}
					</p>
				) : (
					<span className="sr-only" role="status">
						{status}
					</span>
				)}
			</FullWindowContent>
		</FullWindowLayout>
	)
}

type LaunchHexagonProps = {
	agent: LaunchAgent
	size: number
	isStill: boolean
	colourTurn?: ColourTurn
}

const LaunchHexagon = ({
	agent,
	size,
	isStill,
	colourTurn,
}: LaunchHexagonProps) => {
	const state = isStill ? "idle" : "thinking"
	const hue = agent.hue ?? undefined
	const takesItsColour =
		!isStill && colourTurn !== undefined && hue !== undefined

	return (
		<span
			className="relative flex"
			data-slot="launch-loader-hexagon"
			style={takesItsColour ? colourTurnVariables(colourTurn) : undefined}
		>
			<span className={cn("flex", takesItsColour && "animate-launch-unlit")}>
				<DitheredFieldAvatar
					hasGround={false}
					ink="foreground"
					name={agent.name}
					size={size}
					state={state}
				/>
			</span>
			{takesItsColour ? (
				<span
					className="absolute inset-0 flex animate-launch-lit"
					data-slot="launch-loader-colour"
				>
					<DitheredFieldAvatar
						hasGround={false}
						hue={hue}
						name={agent.name}
						size={size}
						state={state}
					/>
				</span>
			) : null}
		</span>
	)
}

export {
	BRAND_AGENT,
	centroidOf,
	type LaunchAgent,
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchCast,
	launchVariables,
	useLaunchStillness,
}
