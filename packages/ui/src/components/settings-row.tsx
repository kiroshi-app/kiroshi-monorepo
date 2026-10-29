import { type ReactNode, useId } from "react"

import type { Icon } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const ROW_TITLE_CLASS = "font-medium text-foreground text-xs leading-5"

type SettingsRowsProps = {
	children: ReactNode
	className?: string
}

const SettingsRows = ({ children, className }: SettingsRowsProps) => (
	<div
		className={cn(
			"flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-muted/40",
			className,
		)}
		data-slot="settings-rows"
	>
		{children}
	</div>
)

type SettingsRowProps = {
	title: ReactNode
	detail?: ReactNode
	titleId?: string
	detailId?: string
	children?: ReactNode
}

const SettingsRow = ({
	title,
	detail,
	titleId,
	detailId,
	children,
}: SettingsRowProps) => (
	<div className="flex items-center gap-4 p-3" data-slot="settings-row">
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<p className={cn(ROW_TITLE_CLASS, "wrap-break-word")} id={titleId}>
				{title}
			</p>
			{detail ? (
				<div
					className="wrap-break-word text-muted-foreground text-xs"
					id={detailId}
				>
					{detail}
				</div>
			) : null}
		</div>
		{children}
	</div>
)

type SettingsLinkRowProps = {
	label: string
	detail?: string
	icon: Icon
	onClick: () => void
	"aria-label"?: string
}

const SettingsLinkRow = ({
	label,
	detail,
	icon: TrailingIcon,
	onClick,
	"aria-label": accessibleName,
}: SettingsLinkRowProps) => {
	const id = useId()
	const labelId = `${id}-label`
	const detailId = `${id}-detail`

	return (
		<button
			aria-describedby={detail ? detailId : undefined}
			aria-label={accessibleName}
			aria-labelledby={detail && !accessibleName ? labelId : undefined}
			className={cn(
				ROW_TITLE_CLASS,
				"flex w-full cursor-pointer items-center gap-4 p-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
			)}
			data-slot="settings-link-row"
			onClick={onClick}
			type="button"
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="wrap-break-word" id={labelId}>
					{label}
				</span>
				{detail ? (
					<span
						className="wrap-break-word font-normal text-muted-foreground text-xs"
						id={detailId}
					>
						{detail}
					</span>
				) : null}
			</span>
			<TrailingIcon
				aria-hidden="true"
				className="pointer-events-none size-4 shrink-0 text-muted-foreground"
			/>
		</button>
	)
}

export {
	SettingsLinkRow,
	type SettingsLinkRowProps,
	SettingsRow,
	type SettingsRowProps,
	SettingsRows,
}
