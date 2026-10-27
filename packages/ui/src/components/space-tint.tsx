import { hueStyle } from "@workspace/ui/components/hue-palette"
import { cn } from "@workspace/ui/lib/utils"

const TINTED = "border border-primary-strong bg-user-bubble"

const UNTINTED = "border border-border bg-muted"

type SpaceTintProps = {
	tint?: number | null
	className?: string
}

const SpaceTint = ({ tint, className }: SpaceTintProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"block size-4 shrink-0 rounded-full",
			tint == null ? UNTINTED : TINTED,
			className,
		)}
		data-hue={tint ?? undefined}
		data-slot="space-tint"
		style={tint == null ? undefined : hueStyle(tint)}
	/>
)

export { SpaceTint, type SpaceTintProps }
