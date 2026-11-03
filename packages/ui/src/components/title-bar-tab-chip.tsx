import type { ComponentProps, ReactNode } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type TitleBarTabChipPlacement = "alone" | "strip"

type TitleBarTabChipProps = Pick<
	ComponentProps<"span">,
	"aria-hidden" | "className" | "style"
> & {
	title: string
	icon: ReactNode
	placement?: TitleBarTabChipPlacement
}

const CHIP =
	"pointer-events-none flex h-7 w-fit select-none items-center gap-1.5 rounded-md bg-title-bar-menu text-foreground"

const CHIP_PLACEMENT: Record<TitleBarTabChipPlacement, string> = {
	alone: "ps-1.75 pe-1 shadow-tab-chip ring-1 ring-title-bar-menu-border",
	strip: "ps-2 pe-1.25 drop-shadow-md",
}

const ICON = "grid shrink-0 place-items-center [&>svg]:size-3.75"

const ICON_PLACEMENT: Record<TitleBarTabChipPlacement, string> = {
	alone: "size-3.75",
	strip: "size-4",
}

const TITLE = "min-w-0 max-w-50 truncate font-medium text-compact leading-4"

const CLOSE =
	"ms-auto grid size-4.5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3"

const TitleBarTabChip = ({
	title,
	icon,
	placement = "alone",
	className,
	...props
}: TitleBarTabChipProps) => (
	<span
		className={cn(CHIP, CHIP_PLACEMENT[placement], className)}
		data-placement={placement}
		data-slot="title-bar-tab-chip"
		{...props}
	>
		<span aria-hidden="true" className={cn(ICON, ICON_PLACEMENT[placement])}>
			{icon}
		</span>
		<span className={TITLE} data-slot="title-bar-tab-chip-title">
			{title}
		</span>
		<span
			aria-hidden="true"
			className={CLOSE}
			data-slot="title-bar-tab-chip-close"
		>
			<Icons.Close />
		</span>
	</span>
)

export {
	TitleBarTabChip,
	type TitleBarTabChipPlacement,
	type TitleBarTabChipProps,
}
