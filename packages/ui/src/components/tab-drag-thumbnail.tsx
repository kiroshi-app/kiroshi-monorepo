import type { ReactNode } from "react"

type TabDragThumbnailMessage = {
	id: string
	author: "user" | "companion"
	text: string
}

type TabDragThumbnailProps = {
	title: string
	icon: ReactNode
	companionName: string
	messages: TabDragThumbnailMessage[]
	composerPlaceholder: string
	width: number
	height: number
	isNotAllowed?: boolean
}

const CARD =
	"flex flex-col overflow-hidden rounded-lg shadow-[0_0_0_1px_#00000012,0_2px_4px_#00000014,0_16px_40px_#00000033] dark:shadow-[0_0_0_1px_#ffffff1a,0_16px_40px_#000000b3] data-[state=not-allowed]:opacity-75 data-[state=not-allowed]:grayscale"

const HEADER =
	"flex h-8 shrink-0 items-center gap-1.5 border-shell-border border-b bg-background px-2.5 dark:bg-[#101011]"

const ICON =
	"grid size-4 shrink-0 place-items-center text-foreground [&>svg]:size-3.75"

const TITLE =
	"min-w-0 truncate font-medium text-compact text-foreground leading-4"

const COMPANION = "min-w-0 truncate text-muted-foreground text-xs leading-4"

const DOT =
	"shrink-0 text-muted-foreground text-xs leading-4 before:content-['·']"

const BODY =
	"flex min-h-0 flex-1 flex-col justify-end gap-2.25 bg-card px-5.5 pt-4 pb-4.5"

const USER_BUBBLE =
	"max-w-72.5 self-end wrap-break-word rounded-[11px] bg-user-bubble px-2.5 py-1.75 text-[10px] text-user-bubble-foreground leading-3.5"

const COMPANION_TEXT =
	"max-w-82.5 self-start wrap-break-word text-[10px] text-foreground leading-[15px]"

const COMPOSER =
	"flex h-7.5 shrink-0 items-center rounded-md px-2.5 ring-1 ring-input"

const PLACEHOLDER =
	"min-w-0 truncate text-[10px] text-muted-foreground leading-3.5"

const TabDragThumbnail = ({
	title,
	icon,
	companionName,
	messages,
	composerPlaceholder,
	width,
	height,
	isNotAllowed = false,
}: TabDragThumbnailProps) => (
	<div
		aria-hidden="true"
		className={CARD}
		data-slot="tab-drag-thumbnail"
		data-state={isNotAllowed ? "not-allowed" : "allowed"}
		style={{ width, height }}
	>
		<div className={HEADER} data-slot="tab-drag-thumbnail-header">
			<span className={ICON}>{icon}</span>
			<span className={TITLE}>{title}</span>
			<span className={DOT} />
			<span className={COMPANION}>{companionName}</span>
		</div>
		<div className={BODY} data-slot="tab-drag-thumbnail-body">
			{messages.map((message) => (
				<p
					className={message.author === "user" ? USER_BUBBLE : COMPANION_TEXT}
					data-slot="tab-drag-thumbnail-message"
					key={message.id}
				>
					{message.text}
				</p>
			))}
			<div className={COMPOSER} data-slot="tab-drag-thumbnail-composer">
				<span className={PLACEHOLDER}>{composerPlaceholder}</span>
			</div>
		</div>
	</div>
)

export {
	TabDragThumbnail,
	type TabDragThumbnailMessage,
	type TabDragThumbnailProps,
}
