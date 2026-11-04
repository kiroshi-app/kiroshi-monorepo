import { type ComponentPropsWithoutRef, createContext, useContext } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export type MarkdownTaskCheckboxProps = ComponentPropsWithoutRef<"input"> &
	ExtraProps

type MarkdownTaskToggle = (box: HTMLInputElement) => void

export const MarkdownTaskToggleContext =
	createContext<MarkdownTaskToggle | null>(null)

export const MarkdownTaskCheckbox = ({
	node,
	...props
}: MarkdownTaskCheckboxProps) => {
	const { t } = useTranslation("chat")
	const toggle = useContext(MarkdownTaskToggleContext)
	const label = props.checked ? t("task.done") : t("task.todo")

	if (toggle)
		return (
			<input
				{...props}
				aria-label={label}
				disabled={false}
				onChange={(event) => toggle(event.currentTarget)}
			/>
		)

	return <input {...props} aria-label={label} readOnly />
}

const TASK_BOX_CLASS =
	"me-[0.5em] inline-grid size-[1em] place-items-center rounded-[0.2em] border border-muted-foreground align-[-0.1em]"

const TASK_BOX_CHECKED_CLASS =
	"border-primary bg-primary text-primary-foreground"

export const MarkdownStaticTaskBox = ({
	checked,
}: MarkdownTaskCheckboxProps) => {
	const { t } = useTranslation("chat")

	return (
		<span
			aria-label={checked ? t("task.done") : t("task.todo")}
			className={cn(TASK_BOX_CLASS, checked && TASK_BOX_CHECKED_CLASS)}
			data-checked={checked ? "" : undefined}
			data-slot="markdown-task-box"
			role="img"
		>
			{checked ? <Icons.Check className="size-[0.75em]" /> : null}
		</span>
	)
}
