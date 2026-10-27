import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"

type Space = {
	id: string
	name: string
	colour?: BotAvatarBlot | null
	avatarSeed: string
}

const spaceAtRank = (spaces: Space[], rank: number) => spaces[rank - 1]

export { type Space, spaceAtRank }
