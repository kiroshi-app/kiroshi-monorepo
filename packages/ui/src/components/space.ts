type Space = {
	id: string
	name: string
	colour?: number | null
	avatarSeed: string
}

const spaceAtRank = (spaces: Space[], rank: number) => spaces[rank - 1]

export { type Space, spaceAtRank }
