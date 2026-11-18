const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/

type ReleaseTag = {
	name: string
	core: [number, number, number]
	beta: number | null
}

export type NotesRange = {
	prerelease: boolean
	range: string
}

const parseReleaseTag = (name: string): ReleaseTag | null => {
	const match = name.match(RELEASE_TAG)
	if (!match) return null
	const [, major, minor, patch, beta] = match
	return {
		name,
		core: [Number(major), Number(minor), Number(patch)],
		beta: beta === undefined ? null : Number(beta),
	}
}

const compareReleaseTags = (left: ReleaseTag, right: ReleaseTag) => {
	for (let index = 0; index < left.core.length; index++) {
		const difference = left.core[index] - right.core[index]
		if (difference !== 0) return difference
	}
	if (left.beta === right.beta) return 0
	if (left.beta === null) return 1
	if (right.beta === null) return -1
	return left.beta - right.beta
}

export const resolveNotesRange = (tag: string, tags: string[]): NotesRange => {
	const current = parseReleaseTag(tag)
	if (!current)
		throw new Error(
			`Tag ${tag} is neither a stable vX.Y.Z nor a beta vX.Y.Z-beta.N tag, nothing built`,
		)
	const isPrerelease = current.beta !== null
	const previous = tags
		.map(parseReleaseTag)
		.filter((candidate): candidate is ReleaseTag => candidate !== null)
		.filter((candidate) => isPrerelease || candidate.beta === null)
		.filter((candidate) => compareReleaseTags(candidate, current) < 0)
		.sort(compareReleaseTags)
		.at(-1)
	if (!previous)
		throw new Error(
			`No earlier ${isPrerelease ? "stable or beta" : "stable"} tag than ${tag} to start its release notes from`,
		)
	return { prerelease: isPrerelease, range: `${previous.name}..${tag}` }
}

const listReleaseTags = () => {
	const listing = Bun.spawnSync(["git", "tag", "--list", "v*"])
	if (listing.exitCode !== 0)
		throw new Error(
			`git tag --list failed: ${listing.stderr.toString().trim()}`,
		)
	return listing.stdout.toString().split("\n").filter(Boolean)
}

const run = () => {
	const tag = Bun.argv[2]
	if (!tag) throw new Error("Usage: bun scripts/release-notes-range.ts <tag>")
	const { prerelease, range } = resolveNotesRange(tag, listReleaseTags())
	console.error(`Release notes of ${tag} cover ${range}`)
	console.log(`prerelease=${prerelease}`)
	console.log(`range=${range}`)
}

if (import.meta.main) {
	try {
		run()
	} catch (failure) {
		console.error(`::error::${(failure as Error).message}`)
		process.exit(1)
	}
}
