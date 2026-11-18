import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

const ROOT = new URL("..", import.meta.url).pathname
const TAURI_CONF = "apps/app/src-tauri/tauri.conf.json"

const versionFiles = (root: string) => ({
	tauriConf: join(root, TAURI_CONF),
	appPkg: join(root, "apps/app/package.json"),
	cargoToml: join(root, "apps/app/src-tauri/Cargo.toml"),
	cargoLock: join(root, "apps/app/src-tauri/Cargo.lock"),
	systemPlugin: join(
		root,
		"apps/app/src-tauri/plugins/kiroshi/.claude-plugin/plugin.json",
	),
	bunLock: join(root, "bun.lock"),
})

const SEMVER = /^\d+\.\d+\.\d+(-beta\.\d+)?$/
const BETA_SUFFIX = /-beta\.\d+$/
const STABLE_MINOR = /^(\d+)\.(\d+)\.0$/
const BUMP_TYPES = ["patch", "minor", "major"] as const

type BumpType = (typeof BUMP_TYPES)[number]

type MainBump =
	| { kind: "open"; version: string; branch: string; title: string }
	| { kind: "skip"; reason: string }

const isBumpType = (value: string): value is BumpType =>
	(BUMP_TYPES as readonly string[]).includes(value)

const usage =
	"Usage: bun run release <patch|minor|major|X.Y.Z|X.Y.Z-beta.N> [--dry-run]"

const readVersion = (tauriConf: string, source: string) => {
	const match = tauriConf.match(/"version":\s*"([^"]+)"/)
	if (!match) throw new Error(`Could not read version from ${source}`)
	return match[1]
}

const readCurrentVersion = async () =>
	readVersion(
		await Bun.file(versionFiles(ROOT).tauriConf).text(),
		"tauri.conf.json",
	)

const failureOf = (error: unknown) => {
	if (error instanceof $.ShellError) {
		const stderr = error.stderr.toString().trim()
		return stderr || error.message
	}
	return error instanceof Error ? error.message : String(error)
}

const attempt = async <T>(step: string, action: () => Promise<T>) => {
	try {
		return await action()
	} catch (error) {
		throw new Error(`${step}: ${failureOf(error)}`, { cause: error })
	}
}

const readMainVersion = async () => {
	await attempt("git fetch origin main", () =>
		$`git fetch --quiet origin main`.quiet(),
	)
	const source = `origin/main:${TAURI_CONF}`
	const tauriConf = await attempt(`git show ${source}`, () =>
		$`git show ${source}`.text(),
	)
	return readVersion(tauriConf, source)
}

export const computeNext = (current: string, input: string) => {
	if (SEMVER.test(input)) return input
	if (!isBumpType(input))
		throw new Error(`Invalid argument "${input}".\n${usage}`)
	if (BETA_SUFFIX.test(current))
		throw new Error(
			`Current version ${current} is a beta, ${input} can't bump it: pass the explicit version, X.Y.Z or X.Y.Z-beta.N.`,
		)
	const [major, minor, patch] = current.split(".").map(Number)
	if (input === "major") return `${major + 1}.0.0`
	if (input === "minor") return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

export const nextMainVersion = (release: string) => {
	const match = release.match(STABLE_MINOR)
	if (!match) return undefined
	return `${match[1]}.${Number(match[2]) + 1}.0-beta.0`
}

export const planMainBump = (
	version: string,
	mainVersion: string,
): MainBump => {
	if (Bun.semver.order(mainVersion, version) >= 0)
		return {
			kind: "skip",
			reason: `origin/main already reads ${mainVersion}, at or above ${version}`,
		}
	return {
		kind: "open",
		version,
		branch: `chore/bump-main-${version}`,
		title: `chore(app): move main to ${version}`,
	}
}

export const describeMainBump = (bump: MainBump) =>
	bump.kind === "skip"
		? `Main bump skipped: ${bump.reason}.`
		: `Main bump: ${bump.branch} moves main to ${bump.version}, pull request "${bump.title}".`

const bumpJsonVersion = (text: string, next: string) =>
	text.replace(/("version":\s*)"[^"]+"/, `$1"${next}"`)

const bumpCargoToml = (text: string, next: string) =>
	text.replace(/^version = "[^"]+"/m, `version = "${next}"`)

const bumpCargoLock = (text: string, next: string) =>
	text.replace(/(name = "kiroshi-app"\nversion = ")[^"]+(")/, `$1${next}$2`)

const writeFile = async (path: string, transform: (text: string) => string) => {
	const text = await Bun.file(path).text()
	await Bun.write(path, transform(text))
}

export const writeVersion = async (root: string, next: string) => {
	const files = versionFiles(root)
	await writeFile(files.tauriConf, (text) => bumpJsonVersion(text, next))
	await writeFile(files.appPkg, (text) => bumpJsonVersion(text, next))
	await writeFile(files.cargoToml, (text) => bumpCargoToml(text, next))
	await writeFile(files.cargoLock, (text) => bumpCargoLock(text, next))
	await writeFile(files.systemPlugin, (text) => bumpJsonVersion(text, next))
	await $`bun install --lockfile-only`.cwd(root)
	return Object.values(files)
}

const readRepository = async () =>
	(await $`git remote get-url origin`.text())
		.trim()
		.replace(/\.git$/, "")
		.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "")

type OpenMainBump = Extract<MainBump, { kind: "open" }>

type MainBumpStep = {
	name: string
	command: string[]
	run: () => Promise<unknown>
}

type MainBumpFailure = {
	step: string
	cause: string
	remaining: string[]
}

const shellStep = (name: string, command: string[]): MainBumpStep => ({
	name,
	command,
	run: () => $`${command}`,
})

const mainBumpSteps = (
	bump: OpenMainBump,
	tag: string,
	repository: string,
	worktree: string,
): MainBumpStep[] => [
	shellStep(`create ${bump.branch} from origin/main`, [
		"git",
		"worktree",
		"add",
		"--quiet",
		"-b",
		bump.branch,
		worktree,
		"origin/main",
	]),
	{
		name: `write ${bump.version}`,
		command: [
			"bun",
			"-e",
			`import { writeVersion } from "./scripts/release.ts"; await writeVersion(${JSON.stringify(worktree)}, ${JSON.stringify(bump.version)})`,
		],
		run: () => writeVersion(worktree, bump.version),
	},
	shellStep("commit", [
		"git",
		"-C",
		worktree,
		"commit",
		"--quiet",
		"--all",
		"-m",
		bump.title,
	]),
	shellStep(`push ${bump.branch}`, [
		"git",
		"-C",
		worktree,
		"push",
		"--quiet",
		"-u",
		"origin",
		bump.branch,
	]),
	shellStep("open the pull request into main", [
		"gh",
		"pr",
		"create",
		"--repo",
		repository,
		"--base",
		"main",
		"--head",
		bump.branch,
		"--title",
		bump.title,
		"--body",
		`Moves main to ${bump.version} after the stable ${tag}, so a build of main is offered every later beta and stable.`,
	]),
	shellStep("remove the worktree", [
		"git",
		"worktree",
		"remove",
		"--force",
		worktree,
	]),
]

const shellLine = (command: string[]) =>
	command.map((arg) => $.escape(arg)).join(" ")

export const openMainBump = async (
	bump: OpenMainBump,
	tag: string,
	repository: string,
): Promise<MainBumpFailure | undefined> => {
	const worktree = mkdtempSync(join(tmpdir(), "kiroshi-main-bump-"))
	const steps = mainBumpSteps(bump, tag, repository, worktree)
	for (const [index, step] of steps.entries()) {
		try {
			await step.run()
		} catch (error) {
			return {
				step: step.name,
				cause: failureOf(error),
				remaining: steps.slice(index).map((left) => shellLine(left.command)),
			}
		}
	}
	return undefined
}

export const describeMainBumpFailure = (
	failure: MainBumpFailure,
	tag: string,
) =>
	[
		`Main bump failed at "${failure.step}": ${failure.cause}`,
		`${tag} stays pushed. Finish the bump by hand from the repository root:`,
		...failure.remaining.map((command) => `  ${command}`),
	].join("\n")

const run = async () => {
	const args = Bun.argv.slice(2)
	const dryRun = args.includes("--dry-run")
	const input = args.find((arg) => !arg.startsWith("--"))
	const hasUnknownFlag = args.some(
		(arg) => arg.startsWith("--") && arg !== "--dry-run",
	)

	if (!input || hasUnknownFlag) {
		console.error(usage)
		process.exit(1)
	}

	const current = await readCurrentVersion()
	const next = computeNext(current, input)
	const tag = `v${next}`

	console.log(`Release: ${current} -> ${next} (${tag})`)

	const mainVersion = nextMainVersion(next)
	let mainBump: MainBump | undefined
	if (mainVersion) {
		try {
			mainBump = planMainBump(mainVersion, await readMainVersion())
			console.log(describeMainBump(mainBump))
		} catch (error) {
			if (!dryRun) throw error
			console.log(`Main bump unknown: ${failureOf(error)}`)
		}
	}

	if (dryRun) {
		console.log("Dry run: nothing written, committed or pushed.")
		return
	}

	const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()
	if (branch === "main")
		throw new Error("Refusing to release from main. Run from a release branch.")

	const status = (await $`git status --porcelain`.text()).trim()
	if (status)
		throw new Error("Working tree is not clean. Commit or stash first.")

	const files = await writeVersion(ROOT, next)

	await $`git add ${files}`
	await $`git commit -m ${`chore(app): release ${tag}`}`
	await $`git tag -a ${tag} --cleanup=verbatim -m ${`Release ${tag}`}`
	await $`git push -u origin ${branch}`
	await $`git push origin ${tag}`

	const repository = await readRepository()
	console.log(`Pushed ${tag}. CI: https://github.com/${repository}/actions`)

	if (mainBump?.kind !== "open") return
	const failure = await openMainBump(mainBump, tag, repository)
	if (failure) {
		console.error(describeMainBumpFailure(failure, tag))
		process.exit(1)
	}
	console.log(`Opened the pull request moving main to ${mainBump.version}.`)
}

if (import.meta.main) await run()
