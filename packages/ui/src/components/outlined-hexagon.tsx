import { type ReactNode, useId } from "react"

import {
	hexagonOfWidth,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

const INSIDE_STROKE_WIDTH = 2

const ART = "pointer-events-none absolute inset-0 size-full"

type OutlinedHexagonProps = {
	side: number
	fill: string
	children?: ReactNode
}

const OutlinedHexagon = ({ side, fill, children }: OutlinedHexagonProps) => {
	const edgeClipId = useId()
	const path = roundedHexagonPath(hexagonOfWidth(side))
	return (
		<svg
			aria-hidden="true"
			className={ART}
			data-slot="outlined-hexagon"
			viewBox={`0 0 ${side} ${side}`}
		>
			<path
				clipPath={`url(#${edgeClipId})`}
				d={path}
				data-slot="outlined-hexagon-face"
				strokeWidth={INSIDE_STROKE_WIDTH}
				style={{ fill, stroke: "var(--image-outline)" }}
			/>
			<clipPath id={edgeClipId}>
				<path d={path} />
			</clipPath>
			{children}
		</svg>
	)
}

export { OutlinedHexagon }
