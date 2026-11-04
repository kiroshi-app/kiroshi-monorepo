import { type ComponentPropsWithoutRef, createContext, useContext } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

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
