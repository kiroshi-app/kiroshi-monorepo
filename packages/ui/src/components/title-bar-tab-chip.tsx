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
	isNotAllowed?: boolean
}

const TITLE_BAR_TAB_CHIP_DRAG_SIZE = { width: 256, height: 28 } as const

const TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH = 200

const CHIP =
	"pointer-events-none flex w-fit select-none items-center gap-1.5 rounded-md bg-title-bar-menu text-foreground data-[state=not-allowed]:opacity-75 data-[state=not-allowed]:grayscale"

const CHIP_PLACEMENT: Record<TitleBarTabChipPlacement, string> = {
	alone: "ps-1.75 pe-1 shadow-tab-chip ring-1 ring-title-bar-menu-border",
	strip: "ps-2 pe-1.25 drop-shadow-md",
}

const ICON = "grid shrink-0 place-items-center [&>svg]:size-3.75"

const ICON_PLACEMENT: Record<TitleBarTabChipPlacement, string> = {
	alone: "size-3.75",
	strip: "size-4",
}

const TITLE = "min-w-0 truncate font-medium text-compact leading-4"

const CLOSE =
	"ms-auto grid size-4.5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3"

const TitleBarTabChip = ({
	title,
	icon,
	placement = "alone",
	isNotAllowed = false,
	className,
	style,
	...props
}: TitleBarTabChipProps) => (
	<span
		className={cn(CHIP, CHIP_PLACEMENT[placement], className)}
		data-placement={placement}
		data-slot="title-bar-tab-chip"
		data-state={isNotAllowed ? "not-allowed" : "allowed"}
		style={{ height: TITLE_BAR_TAB_CHIP_DRAG_SIZE.height, ...style }}
		{...props}
	>
		<span aria-hidden="true" className={cn(ICON, ICON_PLACEMENT[placement])}>
			{icon}
		</span>
		<span
			className={TITLE}
			data-slot="title-bar-tab-chip-title"
			style={{ maxWidth: TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH }}
		>
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
	TITLE_BAR_TAB_CHIP_DRAG_SIZE,
	TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH,
	TitleBarTabChip,
	type TitleBarTabChipPlacement,
	type TitleBarTabChipProps,
}
