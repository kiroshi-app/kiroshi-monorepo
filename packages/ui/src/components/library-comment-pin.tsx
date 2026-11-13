import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	type LibraryCommentAuthor,
	LibraryCommentAvatar,
} from "@workspace/ui/components/library-comment-author"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentPinState = "rest" | "selected" | "resolved"

type LibraryCommentPinSurface = "page" | "stage"

type LibraryCommentPinProps = Omit<ComponentProps<"button">, "children"> & {
	author: LibraryCommentAuthor
	state?: LibraryCommentPinState
	surface?: LibraryCommentPinSurface
	isDimmed?: boolean
}

const PIN =
	"grid size-8 shrink-0 place-items-center rounded-full rounded-bl-[0.25rem] outline-ring transition-none focus-visible:outline-2 focus-visible:outline-offset-2"

const GROUND: Record<LibraryCommentPinSurface, string> = {
	page: "bg-comment-pin shadow-comment-pin",
	stage: "bg-comment-pin-stage shadow-comment-pin-stage",
}

const SELECTED_GROUND: Record<LibraryCommentPinSurface, string> = {
	page: "bg-primary shadow-comment-pin-selected",
	stage: "bg-primary shadow-comment-pin-stage",
}

const LibraryCommentPin = ({
	author,
	state = "rest",
	surface = "page",
	isDimmed = false,
	className,
	...props
}: LibraryCommentPinProps) => {
	const { t } = useTranslation("common")
	const isResolved = state === "resolved"
	const isSelected = state === "selected"

	return (
		<button
			aria-expanded={isSelected}
			aria-label={t(
				isResolved
					? "library.comments.pin.resolved"
					: "library.comments.pin.open",
				{ name: author.name },
			)}
			className={cn(
				PIN,
				isSelected ? SELECTED_GROUND[surface] : GROUND[surface],
				isDimmed && "opacity-45",
				className,
			)}
			data-slot="library-comment-pin"
			data-state={state}
			type="button"
			{...props}
		>
			{isResolved ? (
				<span
					aria-hidden="true"
					className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
					data-slot="library-comment-pin-check"
				>
					<Icons.Check className="size-3.5" />
				</span>
			) : (
				<LibraryCommentAvatar author={author} />
			)}
		</button>
	)
}

export {
	LibraryCommentPin,
	type LibraryCommentPinProps,
	type LibraryCommentPinState,
	type LibraryCommentPinSurface,
}
