import {
	Children,
	type ComponentPropsWithoutRef,
	cloneElement,
	createContext,
	isValidElement,
	type ReactNode,
	useContext,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export type MarkdownTaskCheckboxProps = ComponentPropsWithoutRef<"input"> &
	ExtraProps

export type MarkdownListItemProps = ComponentPropsWithoutRef<"li"> & ExtraProps

type MarkdownTaskToggle = (box: HTMLInputElement) => void

export const MarkdownTaskToggleContext =
	createContext<MarkdownTaskToggle | null>(null)

const TODO_BOX_CLASS =
	"peer size-4 appearance-none rounded-[5px] border-[1.5px] border-foreground/30 bg-card outline-offset-2 checked:border-primary checked:bg-primary"

export const MarkdownTaskCheckbox = ({
	node,
	checked = false,
	...props
}: MarkdownTaskCheckboxProps) => {
	const { t } = useTranslation("chat")
	const toggle = useContext(MarkdownTaskToggleContext)
	const [isTickedHere, setTickedHere] = useState(checked)
	const isTicked = toggle ? checked : isTickedHere

	return (
		<label
			className="relative me-2.5 mt-[calc((1lh-1rem)/2)] inline-grid size-4 align-top before:absolute before:-inset-1"
			data-slot="markdown-task-checkbox"
		>
			<input
				{...props}
				aria-label={isTicked ? t("task.done") : t("task.todo")}
				checked={isTicked}
				className={TODO_BOX_CLASS}
				disabled={false}
				onChange={(event) =>
					toggle
						? toggle(event.currentTarget)
						: setTickedHere(event.currentTarget.checked)
				}
			/>
			<Icons.Check
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
			/>
		</label>
	)
}

const TEXT_AFTER_BOX = 1

const isNestedList = (child: ReactNode) =>
	isValidElement(child) && (child.type === "ul" || child.type === "ol")

const isParagraph = (child: ReactNode) =>
	isValidElement(child) && child.type === "p"

const trimTextAfterBox = (nodes: ReactNode[]) =>
	nodes.map((child, index) =>
		index === TEXT_AFTER_BOX && typeof child === "string"
			? child.trimStart()
			: child,
	)

export const MarkdownListItem = ({
	node,
	children,
	...props
}: MarkdownListItemProps) => {
	if (!props.className?.includes("task-list-item"))
		return <li {...props}>{children}</li>

	const items = Children.toArray(children)
	const boxParagraphAt = items.findIndex(isParagraph)
	if (boxParagraphAt !== -1)
		return (
			<li {...props}>
				{items.map((child, index) =>
					index === boxParagraphAt &&
					isValidElement<{ children?: ReactNode }>(child)
						? cloneElement(
								child,
								undefined,
								trimTextAfterBox(Children.toArray(child.props.children)),
							)
						: child,
				)}
			</li>
		)

	const nestedAt = items.findIndex(isNestedList)
	const labelEnd = nestedAt === -1 ? items.length : nestedAt
	const label = trimTextAfterBox(items.slice(0, labelEnd))

	return (
		<li {...props}>
			<span data-slot="markdown-task-label">{label}</span>
			{items.slice(labelEnd)}
		</li>
	)
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
