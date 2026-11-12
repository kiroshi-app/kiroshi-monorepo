import { useState } from "react"

import { Button } from "@workspace/ui/components/ui/button"

const EASINGS = [
	{ className: "ease-linear", value: "linear" },
	{ className: "ease-out", value: "cubic-bezier(0.23, 1, 0.32, 1)" },
	{ className: "ease-in-out", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
]

const ANIMATIONS = [
	{ label: "zoom-in", className: "animate-in zoom-in-95" },
	{ label: "spin-in", className: "animate-in spin-in" },
	{ label: "slide-in-from-top", className: "animate-in slide-in-from-top-8" },
	{
		label: "slide-in-from-bottom",
		className: "animate-in slide-in-from-bottom-8",
	},
	{ label: "slide-in-from-left", className: "animate-in slide-in-from-left-8" },
	{
		label: "slide-in-from-right",
		className: "animate-in slide-in-from-right-8",
	},
]

export const EasingScale = () => {
	const [isShifted, setIsShifted] = useState(false)

	return (
		<div className="flex flex-col gap-3">
			<Button
				size="sm"
				variant="outline"
				onClick={() => setIsShifted((shifted) => !shifted)}
			>
				Play easings
			</Button>
			{EASINGS.map(({ className, value }) => (
				<div
					key={className}
					className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
				>
					<code className="font-mono text-foreground text-xs">{className}</code>
					<code className="font-mono text-muted-foreground text-xs">
						{value}
					</code>
					<span
						aria-hidden="true"
						className="block w-64 rounded-full bg-secondary p-0"
					>
						<span
							className={`block size-6 rounded-full bg-accent transition-transform duration-700 motion-reduce:transition-none ${className} ${
								isShifted ? "translate-x-58" : "translate-x-0"
							}`}
						/>
					</span>
				</div>
			))}
		</div>
	)
}

export const AnimationScale = () => {
	const [replayCount, setReplayCount] = useState(0)

	return (
		<div className="flex flex-col gap-3">
			<Button
				size="sm"
				variant="outline"
				onClick={() => setReplayCount((count) => count + 1)}
			>
				Replay animations
			</Button>
			<div
				key={replayCount}
				className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
			>
				{ANIMATIONS.map(({ label, className }) => (
					<div key={label} className="flex flex-col gap-2">
						<span
							aria-hidden="true"
							className={`h-16 rounded-lg border border-border bg-accent/40 duration-700 motion-reduce:animate-none ${className}`}
						/>
						<code className="font-mono text-muted-foreground text-xs">
							{label}
						</code>
					</div>
				))}
			</div>
		</div>
	)
}
