const CI_EVENTS = ["pull_request", "push", "tag"] as const

type CiEvent = (typeof CI_EVENTS)[number]

type FilteredJobs = {
	vitest: boolean
	website: boolean
	ios: boolean
	core: boolean
	installer: boolean
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

const SHARED_ROOT_DIRECTORIES = [".github/"]

const IOS_ROOT_FILES = [".swift-format", ".xcode-version"]

const FILES_THE_CORE_READS = [".claude/settings.json"]

const EVERY_JOB: FilteredJobs = {
	vitest: true,
	website: true,
	ios: true,
	core: true,
	installer: true,
}

const NO_JOB: FilteredJobs = {
	vitest: false,
	website: false,
	ios: false,
	core: false,
	installer: false,
}

const isUnder = (path: string, directories: string[]) =>
	directories.some((directory) => path.startsWith(directory))

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const isShared = (path: string) =>
	SHARED_ROOT_FILES.includes(path) || isUnder(path, SHARED_ROOT_DIRECTORIES)

const touchesVitest = (path: string) =>
	isUnder(path, ["packages/", "scripts/", "baselines/", "apps/app/"])

const touchesWebsite = (path: string) =>
	isUnder(path, ["apps/website/", "packages/ui/", "packages/shared/"])

const touchesCore = (path: string) =>
	isUnder(path, [
		"crates/",
		"apps/rune-preview/",
		"apps/app/",
		"packages/shared/",
		"packages/ui/src/components/markdown/",
		"docs/chat/",
	]) ||
	FILES_THE_CORE_READS.includes(path) ||
	["Cargo.toml", "Cargo.lock"].includes(fileName(path))

const touchesInstaller = (path: string) => path.startsWith("apps/rune-preview/")

const touchesIos = (path: string) =>
	path.startsWith("apps/ios/") || IOS_ROOT_FILES.includes(path)

export const touchedJobs = (paths: string[]): FilteredJobs => {
	if (paths.some(isShared)) return EVERY_JOB
	return {
		vitest: paths.some(touchesVitest),
		website: paths.some(touchesWebsite),
		ios: paths.some(touchesIos),
		core: paths.some(touchesCore),
		installer: paths.some(touchesInstaller),
	}
}

export const decideJobs = ({ event, paths }: ChangeSet): FilteredJobs => {
	if (event === "tag") return { ...EVERY_JOB, ios: false, installer: false }
	const touched = touchedJobs(paths)
	if (event === "pull_request")
		return {
			...NO_JOB,
			vitest: touched.vitest,
			core: touched.core,
			installer: touched.installer,
		}
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

const everyJobBecause = (reason: string) => {
	console.error(`ci-changes  ${reason}: every job runs`)
	return EVERY_JOB
}

const jobsOfPush = (greenBase: string | undefined) => {
	if (!greenBase)
		return everyJobBecause("no CI push run on main concluded success")
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
	return decideJobs({ event: "push", paths: changedPaths(greenBase) })
}

const jobsOf = (event: CiEvent, base: string | undefined) => {
	if (event === "tag") return decideJobs({ event, paths: [] })
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
