import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@workspace/ui/lib/utils"

const ProgressRoot = ProgressPrimitive.Root

const RING_BOX = 36
const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

type ProgressRingProps = Omit<ProgressPrimitive.Root.Props, "value"> & {
	value: number
}

const ProgressRing = ({
	children,
	className,
	value,
	...props
}: ProgressRingProps) => (
	<ProgressRoot
		className={cn(
			"relative inline-flex items-center justify-center",
			className,
		)}
		data-slot="progress-ring"
		value={value}
		{...props}
	>
		<svg
			aria-hidden="true"
			className="-rotate-90 absolute inset-0 size-full"
			viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
		>
			<circle
				className="fill-none stroke-border"
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeWidth="2"
			/>
			<circle
				className="fill-none stroke-primary-strong transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeDasharray={RING_CIRCUMFERENCE}
				strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
				strokeLinecap="round"
				strokeWidth="2"
			/>
		</svg>
		{children}
	</ProgressRoot>
)

export { ProgressRing }
