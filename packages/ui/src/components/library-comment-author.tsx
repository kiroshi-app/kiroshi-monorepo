import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { AvatarFrame } from "@workspace/ui/components/initials-avatar"
import type { RosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 24

const COMMENT_SEPARATOR = "·"

const COMMENT_RULE = "border-border dark:border-foreground/8"

type LibraryCommentAgent = RosterBot & { kind: "agent" }

type LibraryCommentPerson = {
	kind: "person"
	id: string
	name: string
	image?: string
}

type LibraryCommentAuthor = LibraryCommentAgent | LibraryCommentPerson

type LibraryCommentGoneTarget = "text" | "shape"

type LibraryCommentAnchor = string | { gone: LibraryCommentGoneTarget }

const GONE_ANCHOR_KEYS = {
	text: "library.comments.anchor.goneText",
	shape: "library.comments.anchor.goneShape",
} as const satisfies Record<LibraryCommentGoneTarget, string>

const useLibraryCommentAnchorLine = (anchor: LibraryCommentAnchor) => {
	const { t } = useTranslation("common")

	return typeof anchor === "string" ? anchor : t(GONE_ANCHOR_KEYS[anchor.gone])
}

type LibraryCommentAvatarProps = {
	author: LibraryCommentAuthor
	isWorking?: boolean
	className?: string
}

const LibraryCommentAvatar = ({
	author,
	isWorking = false,
	className,
}: LibraryCommentAvatarProps) => (
	<span
		aria-hidden="true"
		className={cn("flex shrink-0", className)}
		data-author-kind={author.kind}
		data-slot="library-comment-avatar"
	>
		{author.kind === "agent" ? (
			<BotIdentityAvatar
				hue={author.blot}
				image={author.image}
				kind="working"
				name={author.name}
				seed={author.id}
				size={AVATAR_SIZE}
				working={isWorking}
			/>
		) : (
			<AvatarFrame
				image={author.image}
				shape="round"
				size={AVATAR_SIZE}
				slot="library-comment-person"
			>
				<span className="grid size-full place-items-center bg-person-avatar font-semibold text-[11px]/3.5 text-foreground uppercase">
					{Array.from(author.name.trim())[0]}
				</span>
			</AvatarFrame>
		)}
	</span>
)

export {
	COMMENT_RULE,
	COMMENT_SEPARATOR,
	type LibraryCommentAgent,
	type LibraryCommentAnchor,
	type LibraryCommentAuthor,
	LibraryCommentAvatar,
	type LibraryCommentAvatarProps,
	type LibraryCommentGoneTarget,
	type LibraryCommentPerson,
	useLibraryCommentAnchorLine,
}
