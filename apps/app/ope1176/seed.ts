import { existsSync } from "node:fs"
import { basename, resolve } from "node:path"

const DEV_PROFILE = "com.kiroshi.app.dev"
const MARKER = ".ope1176-seeded"
const DATABASE = "conversations.sqlite3"

const fail = (reason: string): never => {
	console.error(`[ope1176] seed refused: ${reason}. Nothing was written.`)
	process.exit(1)
}

const target = process.argv[2]
if (!target) fail("give the dev data directory as the only argument")
const profile = resolve(target as string)
if (basename(profile) !== DEV_PROFILE)
	fail(`${profile} is not a ${DEV_PROFILE} data directory`)
if (
	existsSync(`${profile}/${DATABASE}`) &&
	!existsSync(`${profile}/${MARKER}`)
) {
	fail(`${profile} already holds data this seed did not write`)
}

const tauri = resolve(import.meta.dir, "../src-tauri")
const seeded = Bun.spawnSync(
	[
		"cargo",
		"test",
		"--lib",
		"--features",
		"fake-claude",
		"ope1176_seed_dev_profile",
		"--",
		"--ignored",
		"--exact",
		"joined_spaces::tests::ope1176_seed_dev_profile",
		"--nocapture",
	],
	{
		cwd: tauri,
		env: { ...process.env, OPE1176_SEED_PROFILE: profile },
		stdout: "inherit",
		stderr: "inherit",
	},
)
process.exit(seeded.exitCode ?? 1)
