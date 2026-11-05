import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import type { BoardStickyColour } from "@workspace/ui/foundations/board-palette"
import { cn } from "@workspace/ui/lib/utils"

const AUTHOR_AVATAR_SIZE = 18

const STICKY_FILL: Record<BoardStickyColour, string> = {
	yellow: "bg-board-sticky-yellow",
	green: "bg-board-sticky-green",
	pink: "bg-board-sticky-pink",
	blue: "bg-board-sticky-blue",
	orange: "bg-board-sticky-orange",
}

type BoardStickyAuthor =
	| { kind: "agent"; name: string; hue?: number | null; image?: string }
	| { kind: "person"; name: string; image?: string }

type BoardStickyProps = {
	colour: BoardStickyColour
	text: string
	author: BoardStickyAuthor
}

type AuthorAvatarProps = { author: BoardStickyAuthor }

const AuthorAvatar = ({ author }: AuthorAvatarProps) =>
	author.kind === "agent" ? (
		<BotIdentityAvatar
			hue={author.hue}
			image={author.image}
			name={author.name}
			size={AUTHOR_AVATAR_SIZE}
		/>
	) : (
		<InitialsAvatar
			image={author.image}
			name={author.name}
			size={AUTHOR_AVATAR_SIZE}
		/>
	)

const BoardSticky = ({ colour, text, author }: BoardStickyProps) => (
	<div
		className={cn(
			"flex size-40 flex-col justify-between rounded-[4px] p-4 text-board-sticky-foreground shadow-board-sticky",
			STICKY_FILL[colour],
		)}
		data-colour={colour}
		data-slot="board-sticky"
	>
		<p
			className="line-clamp-5 wrap-break-word text-reading leading-5"
			data-slot="board-sticky-text"
		>
			{text}
		</p>
		<div
			className="flex shrink-0 items-center gap-1.5"
			data-slot="board-sticky-author"
		>
			<AuthorAvatar author={author} />
			<span className="min-w-0 truncate font-semibold text-board-sticky-author-foreground text-xs">
				{author.name}
			</span>
		</div>
	</div>
)

export { BoardSticky, type BoardStickyAuthor, type BoardStickyProps }
