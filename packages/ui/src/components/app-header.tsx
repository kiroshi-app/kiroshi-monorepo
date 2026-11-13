import type { ComponentProps, ReactNode } from "react"

import { HeaderIsland } from "@workspace/ui/components/header-island"
import { cn } from "@workspace/ui/lib/utils"

type AppHeaderForm =
	| {
			isFloating?: false
			insetWindowControls?: boolean
			windowControls?: ReactNode
	  }
	| {
			isFloating: true
			insetWindowControls?: never
			windowControls?: never
	  }

type AppHeaderProps = Omit<ComponentProps<"header">, "children"> &
	AppHeaderForm & {
		leading?: ReactNode
		trailing?: ReactNode
	}

function AppHeader({
	leading,
	trailing,
	isFloating = false,
	insetWindowControls = false,
	windowControls,
	className,
	...props
}: AppHeaderProps) {
	if (isFloating)
		return (
			<header
				data-slot="app-header"
				className={cn(
					"@container flex w-full min-w-0 items-start gap-2",
					className,
				)}
				{...props}
			>
				{leading ? (
					<HeaderIsland
						className="min-w-0 shrink font-medium text-sm"
						data-side="leading"
					>
						{leading}
					</HeaderIsland>
				) : null}
				{trailing ? (
					<HeaderIsland className="ms-auto" data-side="trailing">
						{trailing}
					</HeaderIsland>
				) : null}
			</header>
		)

	return (
		<header
			data-slot="app-header"
			className={cn(
				"flex h-12 shrink-0 items-center gap-3 border-border border-b pt-px",
				windowControls ? "pr-0" : "pr-2.5",
				insetWindowControls ? "pl-22" : "pl-1.5",
				className,
			)}
			{...props}
		>
			{leading ? (
				<div className="flex min-w-0 items-center gap-2 font-medium text-sm">
					{leading}
				</div>
			) : null}
			{trailing ? (
				<div className="ml-auto flex shrink-0 items-center gap-2">
					{trailing}
				</div>
			) : null}
			{windowControls ? (
				<div
					className={cn(
						"-mt-px flex shrink-0 self-stretch",
						trailing ? null : "ml-auto",
					)}
					data-slot="app-header-window-controls"
				>
					{windowControls}
				</div>
			) : null}
		</header>
	)
}

export { AppHeader }
