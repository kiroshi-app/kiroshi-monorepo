import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type SettingsGroupProps = {
	label: string
	grid: string
	children: ReactNode
	className?: string
}

const SettingsGroup = ({
	label,
	grid,
	children,
	className,
}: SettingsGroupProps) => (
	<fieldset className={cn("min-w-0 border-0 p-0", className)}>
		<legend className="mb-2 font-medium text-muted-foreground text-xs in-data-companion-page:text-foreground">
			{label}
		</legend>
		<div className={cn("grid", grid)}>{children}</div>
	</fieldset>
)

export { SettingsGroup }
