"use client"

import { Select } from "@base-ui/react/select"
import { type Ref, useId } from "react"

import { Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsSelectOption = {
	label: string
	value: string
}

type SettingsSelectProps = {
	label: string
	value: string
	onValueChange: (value: string) => void
	options: SettingsSelectOption[]
	placeholder?: string
	hint?: string
	error?: string
	isDisabled?: boolean
	ref?: Ref<HTMLButtonElement>
}

const SettingsSelect = ({
	label,
	value,
	onValueChange,
	options,
	placeholder,
	hint,
	error,
	isDisabled = false,
	ref,
}: SettingsSelectProps) => {
	const id = useId()
	const hintId = hint ? `${id}-hint` : undefined
	const errorId = error ? `${id}-error` : undefined
	const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

	return (
		<div className="flex shrink-0 flex-col gap-1.5 in-data-companion-page:gap-2">
			<Select.Root
				disabled={isDisabled}
				items={options}
				onValueChange={(next: string | null) => onValueChange(next ?? "")}
				value={value}
			>
				<Select.Label className={FIELD_LABEL_CLASS}>{label}</Select.Label>
				<Select.Trigger
					aria-describedby={describedBy}
					aria-invalid={error ? true : undefined}
					className={cn(
						FIELD_CONTROL_CLASS,
						error
							? FIELD_CONTROL_INVALID_CLASS
							: "hover:border-muted-foreground",
						"flex items-center justify-between gap-2 pr-2.5 text-left disabled:pointer-events-none disabled:opacity-50 in-data-companion-page:pr-3",
					)}
					ref={ref}
				>
					<Select.Value
						className="min-w-0 truncate data-placeholder:text-muted-foreground"
						placeholder={placeholder}
					/>
					<Select.Icon className="shrink-0 text-muted-foreground">
						<Icons.Expand className="size-4 in-data-companion-page:size-3.5" />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Positioner
						alignItemWithTrigger={false}
						className="z-50 outline-none"
						sideOffset={6}
					>
						<Select.Popup
							className={cn(
								POPUP_CLASS,
								"max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-xl p-1 transition-[scale,opacity,filter] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:blur-[4px] motion-reduce:transition-none",
							)}
						>
							<Select.List aria-label={label}>
								{options.map((option) => (
									<Select.Item
										className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted"
										key={option.value}
										value={option.value}
									>
										<Select.ItemIndicator className="col-start-1">
											<Icons.Check className="size-3.5" />
										</Select.ItemIndicator>
										<Select.ItemText className="col-start-2 truncate">
											{option.label}
										</Select.ItemText>
									</Select.Item>
								))}
							</Select.List>
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
			{hint ? (
				<p
					className="text-muted-foreground text-xs in-data-companion-page:text-compact/4.5"
					id={hintId}
				>
					{hint}
				</p>
			) : null}
			{error ? (
				<p className="text-destructive text-xs" id={errorId} role="alert">
					{error}
				</p>
			) : null}
		</div>
	)
}

export { SettingsSelect, type SettingsSelectProps }
