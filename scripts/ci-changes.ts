type CiEvent = "pull_request" | "merge_group" | "push" | "tag"

const CI_EVENTS: CiEvent[] = ["pull_request", "merge_group", "push", "tag"]

type FilteredJobs = {
	rust: boolean
	vitest: boolean
	website: boolean
	storybook: boolean
	ios: boolean
}

type SelectedJobs = FilteredJobs & { lint: boolean; "rust-check": boolean }

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

const EVERY_JOB: FilteredJobs = {
	rust: true,
	vitest: true,
	website: true,
	storybook: true,
	ios: true,
}

const NO_JOB: SelectedJobs = {
	lint: false,
	"rust-check": false,
	rust: false,
	vitest: false,
	website: false,
	storybook: false,
	ios: false,
}

const isUnder = (path: string, directories: string[]) =>
	directories.some((directory) => path.startsWith(directory))

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const isShared = (path: string) =>
	SHARED_ROOT_FILES.includes(path) || isUnder(path, SHARED_ROOT_DIRECTORIES)

const touchesRust = (path: string) =>
	isUnder(path, [
		"apps/app/src-tauri/",
		"apps/app/sidecar/",
		"packages/shared/",
	]) || ["Cargo.toml", "Cargo.lock"].includes(fileName(path))

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

const isDiffed = (event: CiEvent) =>
	event === "pull_request" || event === "merge_group"

export const decideJobs = ({ event, paths }: ChangeSet): SelectedJobs => {
	if (event === "push") return { ...NO_JOB, ios: true }
	if (event === "tag")
		return {
			...NO_JOB,
			lint: true,
			rust: true,
			vitest: true,
			website: true,
			storybook: true,
		}
	const touched = touchedJobs(paths)
	if (event === "pull_request")
		return { ...NO_JOB, lint: true, vitest: touched.vitest }
	return { ...touched, lint: true, "rust-check": touched.rust, ios: false }
}

const readEvent = (name: string | undefined): CiEvent => {
	const event = CI_EVENTS.find((candidate) => candidate === name)
	if (event) return event
	throw new Error(`unsupported event "${name}"`)
}

const changedPaths = (base: string | undefined) => {
	if (!base)
		throw new Error("BASE is required on a pull_request or a merge_group")
	const diff = Bun.spawnSync(["git", "diff", "--name-only", base, "HEAD"])
	if (!diff.success)
		throw new Error(`git diff against ${base} failed: ${diff.stderr}`)
	return diff.stdout.toString().split("\n").filter(Boolean)
}

const main = ([eventName, base]: string[]) => {
	const event = readEvent(eventName)
	const paths = isDiffed(event) ? changedPaths(base) : []
	for (const [job, runs] of Object.entries(decideJobs({ event, paths })))
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
