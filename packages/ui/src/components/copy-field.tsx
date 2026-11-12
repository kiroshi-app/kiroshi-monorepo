"use client"

import { useId } from "react"

import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

type CopyFieldProps = {
	label: string
	value: string
	copyLabel: string
	copiedLabel: string
	describedBy?: string
	onCopy?: () => void
}

const CopyField = ({
	label,
	value,
	copyLabel,
	copiedLabel,
	describedBy,
	onCopy,
}: CopyFieldProps) => {
	const { copied, copy } = useCopyText(value)
	const id = useId()

	return (
		<div className="flex flex-col gap-1.5" data-slot="copy-field">
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			<div className="flex items-center gap-1.5">
				<input
					aria-describedby={describedBy}
					className={cn(
						FIELD_CONTROL_CLASS,
						FIELD_CONTROL_READONLY_CLASS,
						"min-w-0 flex-1 truncate",
					)}
					id={id}
					readOnly
					value={value}
				/>
				{value ? (
					<Button
						aria-label={copyLabel}
						className={cn(copied && "bg-muted dark:bg-muted/50")}
						onClick={() => {
							void copy().then(onCopy)
						}}
						size="icon-sm"
						variant="ghost"
					>
						<IconSwap
							icon={<Icons.Copy />}
							isSwapped={copied}
							swappedIcon={<Icons.Check />}
						/>
					</Button>
				) : null}
			</div>
			<span aria-live="polite" className="sr-only">
				{copied ? copiedLabel : ""}
			</span>
		</div>
	)
}

export { CopyField, type CopyFieldProps }
