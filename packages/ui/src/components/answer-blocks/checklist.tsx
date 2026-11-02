import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ChecklistItem = {
	id: string
	label: string
	isChecked: boolean
	assignee?: string
}

type ChecklistProps = {
	title: string
	items: readonly ChecklistItem[]
	onToggle?: (id: string, isChecked: boolean) => void
	onCopy?: () => void
	className?: string
}

type ChecklistRowProps = {
	item: ChecklistItem
	onToggle?: (id: string, isChecked: boolean) => void
}

const ChecklistRow = ({ item, onToggle }: ChecklistRowProps) => {
	const { t } = useTranslation("chat")
	const content = (
		<>
			<span
				aria-hidden="true"
				className={cn(
					"grid size-5 shrink-0 place-items-center rounded-full",
					item.isChecked
						? "bg-primary-strong text-primary-foreground"
						: "border-[1.5px] border-foreground/25",
				)}
			>
				{item.isChecked ? <Icons.Check className="size-3" /> : null}
			</span>
			<span
				className={cn(
					"min-w-0 flex-1 text-reading wrap-anywhere",
					item.isChecked && "text-muted-foreground line-through decoration-1",
				)}
			>
				{item.label}
			</span>
			{item.assignee ? (
				<span className="w-16 shrink-0 truncate text-end text-compact leading-4.5 text-muted-foreground">
					{item.assignee}
				</span>
			) : null}
		</>
	)
	const rowClass = "flex min-h-10 w-full items-center gap-3 text-start"

	if (!onToggle) {
		return (
			<div data-slot="checklist-item" className={rowClass}>
				<span className="sr-only">
					{t(item.isChecked ? "task.done" : "task.todo")}
				</span>
				{content}
			</div>
		)
	}

	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={item.isChecked}
			data-slot="checklist-item"
			className={cn(rowClass, "outline-offset-2")}
			onClick={() => onToggle(item.id, !item.isChecked)}
		>
			{content}
		</button>
	)
}

const Checklist = ({
	title,
	items,
	onToggle,
	onCopy,
	className,
}: ChecklistProps) => {
	const { t } = useTranslation("chat")
	const done = items.filter((item) => item.isChecked).length
	const isAllDone = items.length > 0 && done === items.length

	return (
		<div
			data-slot="checklist"
			className={cn(
				"flex w-full min-w-0 flex-col gap-2.5 rounded-xl border border-shell-divider bg-card-raised p-4",
				className,
			)}
		>
			<div className="flex items-baseline justify-between gap-3">
				<p className="min-w-0 text-reading font-semibold wrap-anywhere">
					{title}
				</p>
				<p
					data-slot="checklist-counter"
					className={cn(
						"shrink-0 text-compact leading-4.5 font-medium tabular-nums",
						isAllDone ? "text-success" : "text-muted-foreground",
					)}
				>
					{done}/{items.length}
				</p>
			</div>
			<div
				aria-hidden="true"
				className="h-1 overflow-hidden rounded-full bg-shell-divider"
			>
				<div
					data-slot="checklist-progress"
					className={cn(
						"h-full rounded-full",
						isAllDone ? "bg-success" : "bg-primary-strong",
					)}
					style={{
						width: `${items.length === 0 ? 0 : (done / items.length) * 100}%`,
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<ul className="flex flex-col">
					{items.map((item) => (
						<li key={item.id}>
							<ChecklistRow item={item} onToggle={onToggle} />
						</li>
					))}
				</ul>
				{onCopy ? (
					<button
						type="button"
						className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground/8 p-2.5 text-sm font-semibold outline-offset-2 hover:bg-foreground/12 active:bg-foreground/16"
						onClick={onCopy}
					>
						<Icons.Copy aria-hidden="true" className="size-3.75 shrink-0" />
						{t("answerBlock.checklist.copy")}
					</button>
				) : null}
			</div>
		</div>
	)
}

export { Checklist, type ChecklistItem, type ChecklistProps }
