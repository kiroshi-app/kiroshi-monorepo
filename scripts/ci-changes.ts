const CI_EVENTS = ["pull_request", "merge_group", "push"] as const

type CiEvent = (typeof CI_EVENTS)[number]

type FilteredJobs = {
	rust: boolean
	vitest: boolean
	website: boolean
	storybook: boolean
	ios: boolean
}

type ChangeSet = { event: CiEvent; paths: string[] }

const SHARED_ROOT_FILES = [
	"package.json",
	"bun.lock",
	"biome.json",
	"knip.json",
	"turbo.json",
	"tsconfig.json",
	"tsconfig.base.json",
	"scripts/ci-changes.ts",
]

const SHARED_ROOT_DIRECTORIES = ["patches/", ".github/"]

const IOS_ROOT_FILES = [".swift-format", ".xcode-version"]

export const PATHS_RUST_READS_OUTSIDE_SRC_TAURI = [
	".claude/settings.json",
	"apps/app/contracts",
	"apps/app/shared/filter-vocabulary.json",
	"apps/app/src/lib/bindings.ts",
	"apps/app/src/lib/conversations/transcript-contract.ts",
	"apps/app/src/lib/host/index.ts",
	"apps/app/src/lib/routines/routine-contract.ts",
	"docs/chat/rich-answer-blocks.md",
	"docs/relay/member-socket.schema.json",
	"packages/shared/board/board.schema.json",
	"packages/shared/board/fixtures",
	"packages/shared/conversation-icons.json",
	"packages/shared/permission-modes.json",
	"packages/ui/src/components/markdown",
]

const EVERY_JOB: FilteredJobs = {
	rust: true,
	vitest: true,
	website: true,
	storybook: true,
	ios: true,
}

const NO_JOB: FilteredJobs = {
	rust: false,
	vitest: false,
	website: false,
	storybook: false,
	ios: false,
}

const isUnder = (path: string, directories: string[]) =>
	directories.some((directory) => path.startsWith(directory))

const isAtOrUnder = (path: string, roots: string[]) =>
	roots.some((root) => path === root || path.startsWith(`${root}/`))

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const isShared = (path: string) =>
	SHARED_ROOT_FILES.includes(path) || isUnder(path, SHARED_ROOT_DIRECTORIES)

const touchesRust = (path: string) =>
	isUnder(path, [
		"apps/app/src-tauri/",
		"apps/app/sidecar/",
		"packages/shared/",
	]) ||
	isAtOrUnder(path, PATHS_RUST_READS_OUTSIDE_SRC_TAURI) ||
	["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"].includes(fileName(path))

const touchesVitest = (path: string) =>
	isUnder(path, ["packages/", "scripts/", "baselines/"]) ||
	(path.startsWith("apps/app/") && !path.startsWith("apps/app/src-tauri/"))

const touchesWebsite = (path: string) =>
	isUnder(path, ["apps/website/", "packages/ui/", "packages/shared/"])

const touchesStorybook = (path: string) =>
	isUnder(path, ["packages/ui/", "packages/shared/", "scripts/", "baselines/"])

const touchesIos = (path: string) =>
	path.startsWith("apps/ios/") || IOS_ROOT_FILES.includes(path)

export const touchedJobs = (paths: string[]): FilteredJobs => {
	if (paths.some(isShared)) return EVERY_JOB
	return {
		rust: paths.some(touchesRust),
		vitest: paths.some(touchesVitest),
		website: paths.some(touchesWebsite),
		storybook: paths.some(touchesStorybook),
		ios: paths.some(touchesIos),
	}
}

export const decideJobs = ({ event, paths }: ChangeSet): FilteredJobs => {
	if (event === "merge_group") return NO_JOB
	const touched = touchedJobs(paths)
	if (event === "pull_request")
		return { ...NO_JOB, vitest: touched.vitest, rust: touched.rust }
	return { ...touched, ios: true }
}

const readEvent = (name: string | undefined): CiEvent => {
	const event = CI_EVENTS.find((candidate) => candidate === name)
	if (event) return event
	throw new Error(`unsupported event "${name}"`)
}

const changedPaths = (base: string | undefined) => {
	if (!base) throw new Error("BASE is required on a pull_request")
	const diff = Bun.spawnSync(["git", "diff", "--name-only", base, "HEAD"])
	if (!diff.success)
		throw new Error(`git diff against ${base} failed: ${diff.stderr}`)
	return diff.stdout.toString().split("\n").filter(Boolean)
}

const LOCKFILE = "bun.lock"

const WORKSPACE_VERSION_LINE = /^"version": "[^"]+",?$/

const changedLinesOf = (base: string, path: string) => {
	const diff = Bun.spawnSync([
		"git",
		"diff",
		"--unified=0",
		base,
		"HEAD",
		"--",
		path,
	])
	if (!diff.success)
		throw new Error(
			`git diff of ${path} against ${base} failed: ${diff.stderr}`,
		)
	return diff.stdout
		.toString()
		.split("\n")
		.filter((line) => /^[-+]/.test(line) && !/^(---|\+\+\+) /.test(line))
		.map((line) => line.slice(1).trim())
}

const pathsChangedSince = (greenBase: string) => {
	const paths = changedPaths(greenBase)
	if (!paths.includes(LOCKFILE)) return paths
	const lockfileLines = changedLinesOf(greenBase, LOCKFILE)
	const isLockfileBumpingWorkspaceVersionsOnly =
		lockfileLines.length > 0 &&
		lockfileLines.every((line) => WORKSPACE_VERSION_LINE.test(line))
	if (!isLockfileBumpingWorkspaceVersionsOnly) return paths
	return paths.filter((path) => path !== LOCKFILE)
}

const everyJobBecause = (reason: string) => {
	console.error(`ci-changes  ${reason}: every job runs`)
	return EVERY_JOB
}

const jobsOfPush = (greenBase: string | undefined) => {
	if (!greenBase)
		return everyJobBecause(
			// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci-changes.ts runs outside turbo, its cache never reads this variable
			`no CI push run on ${process.env.GITHUB_REF_NAME} concluded success`,
		)
	const fetched = Bun.spawnSync([
		"git",
		"fetch",
		"--depth=1",
		"origin",
		greenBase,
	])
	if (!fetched.success)
		return everyJobBecause(
			`fetching the last green sha ${greenBase} failed (${fetched.stderr.toString().trim()})`,
		)
	return decideJobs({ event: "push", paths: pathsChangedSince(greenBase) })
}

const jobsOf = (event: CiEvent, base: string | undefined) => {
	if (event === "merge_group") return decideJobs({ event, paths: [] })
	if (event === "pull_request")
		return decideJobs({ event, paths: changedPaths(base) })
	return jobsOfPush(base)
}

const main = ([eventName, base]: string[]) => {
	for (const [job, runs] of Object.entries(jobsOf(readEvent(eventName), base)))
		console.log(`${job}=${runs}`)
}

if (import.meta.main) {
	try {
		main(process.argv.slice(2))
	} catch (failure) {
		console.error(`ci-changes  ${(failure as Error).message}`)
		process.exit(1)
	}
}
