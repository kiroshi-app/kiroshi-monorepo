import {
	BLOT_HUES,
	type BotAvatarBlot,
	hueOf,
} from "@workspace/ui/components/companion-colour"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { cn } from "@workspace/ui/lib/utils"

const TINTED = "border border-primary-strong bg-user-bubble"

const UNTINTED = "border border-border bg-muted"

type SpaceTintProps = {
	tint?: BotAvatarBlot | null
	className?: string
}

const SpaceTint = ({ tint, className }: SpaceTintProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"block size-4 shrink-0 rounded-full",
			tint ? TINTED : UNTINTED,
			className,
		)}
		data-hue={hueOf(tint)}
		data-slot="space-tint"
		data-tint={tint ?? undefined}
		style={tint ? hueStyle(BLOT_HUES[tint]) : undefined}
	/>
)

export { SpaceTint, type SpaceTintProps }
