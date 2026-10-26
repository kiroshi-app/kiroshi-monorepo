"use client"

import { Switch } from "@workspace/ui/components/ui/switch"
import { cn } from "@workspace/ui/lib/utils"

const STILL_UNDER_REDUCED_MOTION =
	"motion-reduce:[&_[data-slot=switch-thumb]]:transition-none"

type ToggleSwitchProps = {
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	id?: string
	"aria-describedby"?: string
	"aria-label"?: string
	"aria-labelledby"?: string
	disabled?: boolean
	className?: string
}

const ToggleSwitch = ({
	checked,
	onCheckedChange,
	id,
	disabled,
	className,
	...labelling
}: ToggleSwitchProps) => (
	<Switch
		{...labelling}
		checked={checked}
		className={cn(STILL_UNDER_REDUCED_MOTION, className)}
		disabled={disabled}
		id={id}
		onCheckedChange={onCheckedChange}
	/>
)

export { ToggleSwitch, type ToggleSwitchProps }
