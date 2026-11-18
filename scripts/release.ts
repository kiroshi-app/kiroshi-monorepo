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
const VERSION_PARTS = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/
const STABLE_MINOR = /^(\d+)\.(\d+)\.0$/
const BUMP_TYPES = ["patch", "minor", "major"] as const

type BumpType = (typeof BUMP_TYPES)[number]

export type MainBump =
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

const readMainVersion = async () =>
	readVersion(
		await $`git show ${`origin/main:${TAURI_CONF}`}`.quiet().text(),
		`origin/main:${TAURI_CONF}`,
	)

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

const versionRank = (version: string) => {
	const match = version.match(VERSION_PARTS)
	if (!match)
		throw new Error(`${version} is not an X.Y.Z or X.Y.Z-beta.N version`)
	const [, major, minor, patch, beta] = match
	return [
		Number(major),
		Number(minor),
		Number(patch),
		beta === undefined ? Number.POSITIVE_INFINITY : Number(beta),
	]
}

export const compareVersions = (left: string, right: string) => {
	const leftRank = versionRank(left)
	const rightRank = versionRank(right)
	const index = leftRank.findIndex((part, at) => part !== rightRank[at])
	return index === -1 ? 0 : Math.sign(leftRank[index] - rightRank[index])
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
	if (compareVersions(mainVersion, version) >= 0)
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

const writeVersion = async (root: string, next: string) => {
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

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error)

const runStep = async (step: string, action: () => Promise<unknown>) => {
	try {
		await action()
	} catch (error) {
		throw new Error(`Main bump failed at "${step}": ${messageOf(error)}`, {
			cause: error,
		})
	}
}

type OpenMainBump = Extract<MainBump, { kind: "open" }>

const openMainBump = async (
	bump: OpenMainBump,
	tag: string,
	repository: string,
) => {
	const worktree = mkdtempSync(join(tmpdir(), "kiroshi-main-bump-"))
	await runStep(
		`create ${bump.branch} from origin/main`,
		() => $`git worktree add --quiet -b ${bump.branch} ${worktree} origin/main`,
	)
	try {
		await runStep(`write ${bump.version}`, async () => {
			const files = await writeVersion(worktree, bump.version)
			await $`git -C ${worktree} add ${files}`
		})
		await runStep(
			"commit",
			() => $`git -C ${worktree} commit --quiet -m ${bump.title}`,
		)
		await runStep(
			`push ${bump.branch}`,
			() => $`git -C ${worktree} push --quiet -u origin ${bump.branch}`,
		)
	} finally {
		await runStep(
			`remove the worktree ${worktree}`,
			() => $`git worktree remove --force ${worktree}`,
		)
	}
	await runStep(
		"open the pull request into main",
		() =>
			$`gh pr create --repo ${repository} --base main --head ${bump.branch} --title ${bump.title} --body ${`Moves main to ${bump.version} after the stable ${tag}, so a build of main is offered every later beta and stable.`}`,
	)
}

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
	if (mainVersion && !dryRun) await $`git fetch --quiet origin main`
	const mainBump = mainVersion
		? planMainBump(mainVersion, await readMainVersion())
		: undefined
	if (mainBump) console.log(describeMainBump(mainBump))

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
	try {
		await openMainBump(mainBump, tag, repository)
	} catch (error) {
		console.error(`${messageOf(error)}\n${tag} stays pushed.`)
		process.exit(1)
	}
	console.log(`Opened the pull request moving main to ${mainBump.version}.`)
}

if (import.meta.main) await run()
