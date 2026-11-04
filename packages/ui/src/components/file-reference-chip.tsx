import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { middleClickHandlers } from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

type FileReferenceChipState = "rest" | "writing" | "open"

type FileReferenceChipProps = {
	title: string
	state?: FileReferenceChipState
	onOpen: () => void
	onOpenInNewTab: () => void
}

const FileReferenceChip = ({
	title,
	state = "rest",
	onOpen,
	onOpenInNewTab,
}: FileReferenceChipProps) => {
	const { t } = useTranslation("chat")
	const isOpen = state === "open"
	const isWriting = state === "writing"

	return (
		<button
			aria-busy={isWriting || undefined}
			aria-pressed={isOpen}
			className={cn(
				"inline-flex h-6 max-w-full items-center gap-1.5 rounded-full ps-1 pe-2 align-middle text-compact leading-4 font-medium outline-offset-2",
				isOpen
					? "bg-primary text-primary-foreground"
					: "bg-foreground/6 text-foreground hover:bg-foreground/10",
			)}
			data-slot="file-reference-chip"
			data-state={state}
			onClick={onOpen}
			{...middleClickHandlers(onOpenInNewTab)}
			type="button"
		>
			<span
				aria-hidden="true"
				className={cn(
					"grid size-4 shrink-0 place-items-center rounded-full",
					isOpen
						? "bg-primary-foreground text-primary"
						: "bg-card text-foreground",
				)}
			>
				<Icons.File className="size-2.75" />
			</span>
			<span
				className={cn("min-w-0 truncate", isWriting ? "max-w-35" : "max-w-55")}
				data-slot="file-reference-chip-title"
			>
				{title}
			</span>
			{isWriting ? (
				<span className="shrink-0 font-normal text-muted-foreground">
					{t("fileReference.writing")}
				</span>
			) : null}
		</button>
	)
}

export { FileReferenceChip, type FileReferenceChipProps }
