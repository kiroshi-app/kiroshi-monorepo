import { type ReactNode, useId } from "react"

const INSIDE_STROKE_WIDTH = 2

const ART = "pointer-events-none absolute inset-0 size-full"

type OutlinedHexagonProps = {
	side: number
	path: string
	fill: string
	children?: ReactNode
}

const OutlinedHexagon = ({
	side,
	path,
	fill,
	children,
}: OutlinedHexagonProps) => {
	const edgeClipId = useId()
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
