import { type ChangeEvent, useId } from "react"

import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsFieldKind =
	| "text"
	| "email"
	| "url"
	| "search"
	| "password"
	| "number"

type SettingsFieldHeight = "tall" | "medium"

const BOX_HEIGHT: Record<SettingsFieldHeight, string> = {
	tall: "h-55",
	medium: "h-33",
}

type ControlTraits = {
	inputMode?: "text" | "email" | "url" | "search" | "decimal"
	isLiteral?: boolean
	autoComplete?: "email" | "off"
}

const CONTROL_TRAITS: Record<SettingsFieldKind, ControlTraits> = {
	text: {},
	email: { inputMode: "email", isLiteral: true, autoComplete: "email" },
	url: { inputMode: "url", isLiteral: true },
	search: { inputMode: "search" },
	password: { isLiteral: true, autoComplete: "off" },
	number: { inputMode: "decimal" },
}

type SettingsFieldProps = {
	label: string
	value: string
	onValueChange?: (value: string) => void
	placeholder?: string
	hint?: string
	error?: string
	rows?: number
	fill?: boolean
	height?: SettingsFieldHeight
	readOnly?: boolean
	kind?: SettingsFieldKind
}

const SettingsField = ({
	label,
	value,
	onValueChange,
	placeholder,
	hint,
	error,
	rows,
	fill = false,
	height,
	readOnly = false,
	kind = "text",
}: SettingsFieldProps) => {
	const id = useId()
	const traits = CONTROL_TRAITS[kind]
	const hintId = hint ? `${id}-hint` : undefined
	const errorId = error ? `${id}-error` : undefined
	const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
	const emit = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onValueChange?.(event.target.value)

	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 in-data-companion-page:gap-2",
				fill && "min-h-0 flex-1",
			)}
		>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			{rows || fill || height ? (
				<textarea
					aria-describedby={describedBy}
					aria-invalid={error ? true : undefined}
					className={cn(
						FIELD_CONTROL_CLASS,
						error && FIELD_CONTROL_INVALID_CLASS,
						readOnly && FIELD_CONTROL_READONLY_CLASS,
						"resize-none",
						fill && "min-h-0 flex-1",
						height && [BOX_HEIGHT[height], "p-3 leading-5.5"],
					)}
					id={id}
					onChange={emit}
					placeholder={placeholder}
					readOnly={readOnly}
					rows={rows}
					value={value}
				/>
			) : (
				<input
					aria-describedby={describedBy}
					aria-invalid={error ? true : undefined}
					autoComplete={traits.autoComplete}
					className={cn(
						FIELD_CONTROL_CLASS,
						error && FIELD_CONTROL_INVALID_CLASS,
						readOnly && FIELD_CONTROL_READONLY_CLASS,
					)}
					id={id}
					inputMode={traits.inputMode}
					onChange={emit}
					placeholder={placeholder}
					readOnly={readOnly}
					spellCheck={traits.isLiteral ? false : undefined}
					step={kind === "number" ? "any" : undefined}
					type={kind}
					value={value}
				/>
			)}
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

export { SettingsField, type SettingsFieldProps }
