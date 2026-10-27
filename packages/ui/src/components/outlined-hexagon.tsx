import { type ReactNode, useId } from "react"

import {
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	GLAZE_THEMES,
	isCompactAt,
	LIP_OPACITY,
	THEME_LAYER,
} from "@workspace/ui/components/glaze-border"
import {
	hexagonOfWidth,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

const ART = "pointer-events-none absolute inset-0 size-full"

type OutlinedHexagonProps = {
	side: number
	fill: string
	children?: ReactNode
}

const OutlinedHexagon = ({ side, fill, children }: OutlinedHexagonProps) => {
	const id = useId()
	const ids = { shape: `${id}-shape`, lip: `${id}-lip` }
	const path = roundedHexagonPath(hexagonOfWidth(side))
	const isCompact = isCompactAt(side)
	const edge = isCompact ? COMPACT_EDGE : GLAZE_EDGE
	const edgeWidth = edgeWidthOf(side)
	return (
		<svg
			aria-hidden="true"
			className={ART}
			data-recipe={isCompact ? "compact" : "glaze"}
			data-slot="outlined-hexagon"
			viewBox={`0 0 ${side} ${side}`}
		>
			<defs>
				<clipPath id={ids.shape}>
					<path d={path} />
				</clipPath>
				{isCompact ? null : (
					<mask id={ids.lip}>
						<path d={path} fill="#ffffff" />
						<path
							d={path}
							fill="#000000"
							transform={`translate(0 ${edgeWidth})`}
						/>
					</mask>
				)}
			</defs>
			<g clipPath={`url(#${ids.shape})`}>
				<path d={path} data-slot="outlined-hexagon-face" style={{ fill }} />
				{GLAZE_THEMES.map((theme) => (
					<g className={THEME_LAYER[theme]} data-theme={theme} key={theme}>
						<path
							d={path}
							data-slot="outlined-hexagon-edge"
							fill="none"
							stroke={edge[theme].colour}
							strokeOpacity={edge[theme].opacity}
							strokeWidth={2 * edgeWidth}
						/>
						{isCompact ? null : (
							<rect
								data-slot="outlined-hexagon-lip"
								fill="#ffffff"
								fillOpacity={LIP_OPACITY[theme]}
								height={side}
								mask={`url(#${ids.lip})`}
								width={side}
							/>
						)}
					</g>
				))}
			</g>
			{children}
		</svg>
	)
}

export { OutlinedHexagon }
