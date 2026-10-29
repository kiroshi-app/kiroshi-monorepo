"use client"

import { type SVGProps, useId } from "react"

import {
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	GLAZE_THEMES,
	LIP_OPACITY,
	THEME_LAYER,
} from "@workspace/ui/components/glaze-border"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import {
	COMPACT_RADII,
	CROSS_GLYPH,
	dashArray,
	dotCentre,
	GLYPH_GRID,
	type Glyph,
	HATCH_INK,
	hatchPath,
	isCompact,
	LAPTOP_GLYPH,
	LOCAL_BADGE_FILL,
	markMetricsOf,
	OFFLINE_BADGE_FILL,
	type SpaceAvatarSize,
	type SpaceAvatarTheme,
	STATE_METRICS,
	spaceArcs,
	spaceInitial,
	spaceInk,
	spacePalette,
	superellipsePath,
	superellipsePerimeter,
} from "@workspace/ui/components/space-avatar-recipe"
import { cn } from "@workspace/ui/lib/utils"

type SpaceAvatarState =
	| "local"
	| "shared"
	| "online"
	| "connecting"
	| "offline"
	| "invitation"
	| "joining"

const AVATAR = "pointer-events-none inline-block shrink-0"

const DRAWING = "block overflow-visible"

const INITIAL = "font-sans"

const FILL_FRAME = { width: "100%", height: "100%" }

const OFFLINE_OPACITY: Record<SpaceAvatarTheme, number> = {
	light: 0.8,
	dark: 1,
}

const STATE_OF_HOST: Record<SpaceHost, SpaceAvatarState> = {
	shared: "shared",
	up: "online",
	connecting: "connecting",
	down: "offline",
}

const spaceAvatarStateOf = (host?: SpaceHost): SpaceAvatarState =>
	host ? STATE_OF_HOST[host] : "local"

const isFilled = (state: SpaceAvatarState) =>
	state === "local" ||
	state === "shared" ||
	state === "online" ||
	state === "offline"

const hasDot = (state: SpaceAvatarState) =>
	state === "shared" || state === "online"

const hasBadge = (state: SpaceAvatarState) =>
	state === "local" || state === "offline" || hasDot(state)

type SpaceAvatarProps = {
	spaceId: string
	name: string
	colour?: number | null
	size: SpaceAvatarSize
	state?: SpaceAvatarState
	hasAttention?: boolean
	className?: string
}

const SpaceAvatar = ({
	spaceId,
	name,
	colour,
	size,
	state = "local",
	hasAttention = false,
	className,
}: SpaceAvatarProps) => {
	const id = useId()
	const ids = {
		shape: `${id}-shape`,
		cutOut: `${id}-cut-out`,
		sheen: `${id}-sheen`,
		highlight: `${id}-highlight`,
		lip: `${id}-lip`,
	}
	const isCompactRecipe = isCompact(size)
	const isGlazed = !isCompactRecipe && (state === "local" || hasDot(state))
	const centre = size / 2
	const shape = superellipsePath(centre, centre)
	const { anchor, radii: seededRadii } = spaceArcs(spaceId)
	const radii = isCompactRecipe ? COMPACT_RADII : seededRadii
	const metrics = STATE_METRICS[size]
	const mark = markMetricsOf(size)
	const badge = hasBadge(state) ? mark.badge : undefined
	const badgeCentre = dotCentre(size, mark.badge.diameter)
	const badgeRadius = mark.badge.diameter / 2
	const initial = isFilled(state) ? spaceInitial(name) : ""
	const edgeWidth = edgeWidthOf(size)
	const arcCentre = { cx: anchor.x * size, cy: anchor.y * size }
	const outlineHalf = centre - metrics.invitationStroke / 2
	const fullFrame = { x: -size, y: -size, width: 3 * size, height: 3 * size }

	const lines = (colour: string) =>
		radii.map((radius) => (
			<circle
				{...arcCentre}
				fill="none"
				key={radius}
				r={radius * size}
				stroke={colour}
				strokeWidth={metrics.lineStroke}
			/>
		))

	const outline = (colour: string) => (
		<path
			d={superellipsePath(centre, outlineHalf)}
			data-slot="space-avatar-outline"
			fill="none"
			stroke={colour}
			strokeDasharray={dashArray(
				superellipsePerimeter(centre, outlineHalf),
				metrics.invitationStroke,
			)}
			strokeLinecap="round"
			strokeWidth={metrics.invitationStroke}
		/>
	)

	const glaze = (theme: SpaceAvatarTheme) => (
		<>
			<rect fill={`url(#${ids.sheen})`} height={size} width={size} />
			<rect fill={`url(#${ids.highlight})`} height={size} width={size} />
			<path
				d={shape}
				fill="none"
				stroke={GLAZE_EDGE[theme].colour}
				strokeOpacity={GLAZE_EDGE[theme].opacity}
				strokeWidth={2 * edgeWidth}
			/>
			<rect
				fill="#ffffff"
				fillOpacity={LIP_OPACITY[theme]}
				height={size}
				mask={`url(#${ids.lip})`}
				width={size}
			/>
		</>
	)

	const hatch = (theme: SpaceAvatarTheme) => (
		<path
			d={hatchPath(size, mark.hatch.spacing)}
			data-slot="space-avatar-hatch"
			fill="none"
			stroke={HATCH_INK[theme].colour}
			strokeOpacity={HATCH_INK[theme].opacity}
			strokeWidth={mark.hatch.stroke}
		/>
	)

	const glyph = (path: string, { scale, stroke }: Glyph) => {
		const origin = badgeCentre - (GLYPH_GRID / 2) * scale
		return (
			<path
				d={path}
				fill="none"
				stroke="#ffffff"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={stroke}
				transform={`translate(${origin} ${origin}) scale(${scale})`}
			/>
		)
	}

	const disc = (props: SVGProps<SVGCircleElement>) => (
		<circle cx={badgeCentre} cy={badgeCentre} r={badgeRadius} {...props} />
	)

	const filled = (theme: SpaceAvatarTheme, tones: string[]) => (
		<>
			<g
				clipPath={`url(#${ids.shape})`}
				opacity={state === "offline" ? OFFLINE_OPACITY[theme] : undefined}
			>
				<rect fill={tones[0]} height={size} width={size} />
				{radii
					.map((radius, index) => (
						<circle
							{...arcCentre}
							fill={tones[tones.length - 1 - index]}
							key={radius}
							r={radius * size}
						/>
					))
					.reverse()}
				{state === "offline" ? hatch(theme) : null}
				{isGlazed ? glaze(theme) : null}
				{isCompactRecipe ? (
					<path
						d={shape}
						fill="none"
						stroke={COMPACT_EDGE[theme].colour}
						strokeOpacity={COMPACT_EDGE[theme].opacity}
						strokeWidth={2 * edgeWidth}
					/>
				) : null}
			</g>
			{initial ? (
				<text
					className={INITIAL}
					data-slot="space-avatar-initial"
					dominantBaseline="central"
					fill={spaceInk(theme, state === "offline" ? null : colour)}
					fontSize={mark.initial.fontSize}
					fontWeight={mark.initial.weight}
					letterSpacing="-0.02em"
					textAnchor="middle"
					x={centre}
					y={centre}
				>
					{initial}
				</text>
			) : null}
		</>
	)

	const drawing = (theme: SpaceAvatarTheme) => {
		const palette = spacePalette(theme, state === "offline" ? null : colour)
		const tones = isCompactRecipe ? palette.compact : palette.full
		const lineColour = palette.compact[2] ?? ""
		if (isFilled(state)) return filled(theme, tones)
		if (state === "connecting")
			return (
				<g clipPath={`url(#${ids.shape})`}>
					<rect fill={tones[0]} height={size} width={size} />
					{lines(lineColour)}
				</g>
			)
		return (
			<>
				{outline(lineColour)}
				{state === "joining" ? (
					<g clipPath={`url(#${ids.shape})`}>{lines(lineColour)}</g>
				) : null}
			</>
		)
	}

	return (
		<span
			aria-hidden="true"
			className={cn(AVATAR, className)}
			data-attention={hasAttention ? "" : undefined}
			data-colour={colour ?? undefined}
			data-recipe={isCompactRecipe ? "compact" : "glaze"}
			data-size={size}
			data-slot="space-avatar"
			data-state={state}
			style={{ width: size, height: size }}
		>
			<svg
				aria-hidden="true"
				className={DRAWING}
				height={size}
				style={FILL_FRAME}
				viewBox={`0 0 ${size} ${size}`}
				width={size}
			>
				<defs>
					<clipPath id={ids.shape}>
						<path d={shape} />
					</clipPath>
					{badge ? (
						<mask id={ids.cutOut} maskUnits="userSpaceOnUse" {...fullFrame}>
							<rect {...fullFrame} fill="#ffffff" />
							<circle
								cx={badgeCentre}
								cy={badgeCentre}
								fill="#000000"
								r={badge.diameter / 2 + badge.cutOut}
							/>
						</mask>
					) : null}
					{isGlazed ? (
						<>
							<linearGradient id={ids.sheen} x1="0" x2="0" y1="0" y2="1">
								<stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
								<stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
								<stop offset="0.55" stopColor="#000000" stopOpacity="0" />
								<stop offset="1" stopColor="#000000" stopOpacity="0.08" />
							</linearGradient>
							<radialGradient cx="0.3" cy="0.18" id={ids.highlight} r="0.6">
								<stop offset="0" stopColor="#ffffff" stopOpacity="0.25" />
								<stop offset="1" stopColor="#ffffff" stopOpacity="0" />
							</radialGradient>
							<mask id={ids.lip} maskUnits="userSpaceOnUse" {...fullFrame}>
								<path d={shape} fill="#ffffff" />
								<path
									d={shape}
									fill="#000000"
									transform={`translate(0 ${edgeWidth})`}
								/>
							</mask>
						</>
					) : null}
				</defs>
				<g mask={badge ? `url(#${ids.cutOut})` : undefined}>
					{GLAZE_THEMES.map((theme) => (
						<g className={THEME_LAYER[theme]} data-theme={theme} key={theme}>
							{drawing(theme)}
						</g>
					))}
					{hasAttention ? (
						<path
							className="stroke-warning"
							d={superellipsePath(
								centre,
								centre + metrics.attention.gap + metrics.attention.width / 2,
							)}
							data-slot="space-avatar-attention"
							fill="none"
							strokeWidth={metrics.attention.width}
						/>
					) : null}
				</g>
				{hasDot(state) ? (
					<circle
						className="fill-presence-online"
						cx={badgeCentre}
						cy={badgeCentre}
						data-slot="space-avatar-dot"
						r={badgeRadius}
					/>
				) : null}
				{state === "local" ? (
					<g data-slot="space-avatar-local">
						{disc({ fill: LOCAL_BADGE_FILL })}
						{glyph(LAPTOP_GLYPH, mark.laptop)}
					</g>
				) : null}
				{state === "offline" ? (
					<g data-slot="space-avatar-offline">
						{GLAZE_THEMES.map((theme) => (
							<g className={THEME_LAYER[theme]} key={theme}>
								{disc({ fill: OFFLINE_BADGE_FILL[theme] })}
							</g>
						))}
						{mark.cross ? glyph(CROSS_GLYPH, mark.cross) : null}
					</g>
				) : null}
			</svg>
		</span>
	)
}

export {
	SpaceAvatar,
	type SpaceAvatarProps,
	type SpaceAvatarState,
	spaceAvatarStateOf,
}
