import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { deniesRead, type FloorScope, securityFloor } from "./security-floor"

const APP_DATA = "/app-data/kiroshi"

const BOT_PATH = join(APP_DATA, "bots/plugins/b1")
const SYSTEM_PATH = join(APP_DATA, "bots/plugins/system")
const USER_PATH = join(APP_DATA, "bots/plugins/person")
const SPACE_PATH = join(APP_DATA, "spaces/s1")

const PLUGIN_PATHS = [BOT_PATH, SYSTEM_PATH, USER_PATH, SPACE_PATH]
const WRITABLE_PATHS = [BOT_PATH, USER_PATH, SPACE_PATH]

const WINDOWS_HOME = "C:\\Users\\alice"
const WINDOWS_APP_DATA = "C:\\data\\kiroshi"

const home = (path: string): string => join(homedir(), path)

const windowsHome = (path: string): string => join(WINDOWS_HOME, path)

const floor = (pluginPaths: string[] = [], writablePaths: string[] = []) =>
	securityFloor({
		appDataDir: APP_DATA,
		home: homedir(),
		platform: "darwin",
		pluginPaths,
		writablePaths,
	})

const floorIn = (appDataDir: string, conversationId: string) =>
	securityFloor({
		appDataDir,
		conversationId,
		home: homedir(),
		platform: "darwin",
		pluginPaths: [],
		writablePaths: [],
	})

const denyOf = (pluginPaths: string[] = []): string[] =>
	floor(pluginPaths).permissions?.deny ?? []

const windowsFloor = (scope: Partial<FloorScope> = {}) =>
	securityFloor({
		home: WINDOWS_HOME,
		platform: "win32",
		pluginPaths: [],
		writablePaths: [],
		...scope,
	})

const onWindows = (scope: Partial<FloorScope> = {}): string[] =>
	windowsFloor(scope).permissions?.deny ?? []

const filesystemOf = (
	pluginPaths: string[] = [],
	writablePaths: string[] = [],
) => floor(pluginPaths, writablePaths).sandbox?.filesystem

const writableOf = (
	pluginPaths: string[] = [],
	writablePaths: string[] = [],
): string[] | undefined =>
	floor(pluginPaths, writablePaths).permissions?.additionalDirectories

describe("securityFloor", () => {
	it("denies reads of the host's credential paths, expanded from home", () => {
		const deny = denyOf()

		for (const path of [
			".ssh",
			".aws",
			".gnupg",
			".config/gh",
			".kube",
			"Library/Keychains",
		]) {
			expect(deny).toContain(`Read(/${home(path)}/**)`)
		}
		for (const path of [
			".netrc",
			".npmrc",
			".docker/config.json",
			".claude.json",
			".claude/.credentials.json",
		]) {
			expect(deny).toContain(`Read(/${home(path)})`)
		}
		expect(deny).toContain("Read(//**/.env)")
		expect(deny).toContain("Read(//**/.env.*)")
		expect(deny.some((rule) => rule.includes("~"))).toBe(false)
	})

	it("denies the asynchronous agent tools outright", () => {
		const deny = denyOf()

		expect(deny).toContain("Agent")
		expect(deny).toContain("Task")
	})

	it("denies writes to the host's shell and agent paths", () => {
		const deny = denyOf()

		for (const path of [".claude", "Library/LaunchAgents"]) {
			expect(deny).toContain(`Edit(/${home(path)}/**)`)
		}
		for (const path of [".zshrc", ".bashrc", ".zprofile", ".zshenv"]) {
			expect(deny).toContain(`Edit(/${home(path)})`)
		}
	})

	it("denies reads of what the host keeps in its own data directory", () => {
		const deny = denyOf()
		const denyRead = filesystemOf()?.denyRead

		for (const file of [
			"conversations.sqlite3",
			"conversations.sqlite3-wal",
			"conversations.sqlite3-shm",
			"host/token",
			"missions/*/hook/agent-hook.json",
		]) {
			expect(deny).toContain(`Read(/${join(APP_DATA, file)})`)
			expect(denyRead).toContain(join(APP_DATA, file))
		}
	})

	it("refuses the host API token and every mission hook key, not the hook script", () => {
		const scope: FloorScope = {
			appDataDir: APP_DATA,
			home: homedir(),
			platform: "darwin",
			pluginPaths: [],
			writablePaths: [],
		}

		expect(deniesRead(scope, join(APP_DATA, "host/token"))).toBe(true)
		expect(
			deniesRead(scope, join(APP_DATA, "missions/m-1/hook/agent-hook.json")),
		).toBe(true)
		expect(
			deniesRead(
				scope,
				join(APP_DATA, "missions/m-1/hook/kiroshi-agent-hook.sh"),
			),
		).toBe(false)
	})

	it("denies reads of what the reader dropped into any conversation", () => {
		expect(denyOf()).toContain(`Read(/${join(APP_DATA, "attachments")}/**)`)
		expect(filesystemOf()?.denyRead).toContain(join(APP_DATA, "attachments"))
	})

	it("reads back what the reader dropped into the conversation it answers in", () => {
		const mine = join(APP_DATA, "attachments/c1")
		const settings = floorIn(APP_DATA, "c1")

		expect(settings.permissions?.deny).not.toContain(`Read(/${mine}/**)`)
		expect(settings.sandbox?.filesystem?.allowRead).toContain(mine)
		expect(settings.sandbox?.filesystem?.denyRead).toContain(
			join(APP_DATA, "attachments"),
		)
	})

	it("keeps a session out of the bundles of every other bot and space", () => {
		const denyRead = filesystemOf()?.denyRead

		expect(denyRead).toContain(join(APP_DATA, "bots"))
		expect(denyRead).toContain(join(APP_DATA, "spaces"))
	})

	describe("over a host directory laid down on disk", () => {
		let appDataDir: string

		const laidDown = (...paths: string[]) => {
			for (const path of paths) {
				mkdirSync(join(appDataDir, path), { recursive: true })
			}
		}

		const denyOver = (pluginPaths: string[]): string[] =>
			securityFloor({
				appDataDir,
				home: homedir(),
				platform: "darwin",
				pluginPaths,
				writablePaths: pluginPaths,
			}).permissions?.deny ?? []

		beforeEach(() => {
			appDataDir = mkdtempSync(join(tmpdir(), "security-floor-"))
		})

		afterEach(() => {
			rmSync(appDataDir, { recursive: true, force: true })
		})

		it("denies the Read tool on every bundle the session does not run on", () => {
			laidDown("bots/plugins/b1", "bots/plugins/b2", "spaces/s1", "spaces/s2")
			const mine = join(appDataDir, "bots/plugins/b1")
			const mySpace = join(appDataDir, "spaces/s1")

			const deny = denyOver([mine, mySpace])

			expect(deny).toContain(`Read(/${join(appDataDir, "bots/plugins/b2")}/**)`)
			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s2")}/**)`)
			expect(deny).not.toContain(`Read(/${mine}/**)`)
			expect(deny).not.toContain(`Read(/${mySpace}/**)`)
		})

		it("leaves every ancestor of a plugin path out of the deny rules", () => {
			laidDown("bots/plugins/b1", "spaces/s1")
			const skill = join(appDataDir, "bots/plugins/b1/skills/baking")

			const deny = denyOver([skill])

			for (const ancestor of ["bots", "bots/plugins", "bots/plugins/b1"]) {
				expect(deny).not.toContain(`Read(/${join(appDataDir, ancestor)}/**)`)
			}
			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s1")}/**)`)
		})

		it("denies the Read tool on the attachments of every other conversation", () => {
			laidDown("attachments/c1", "attachments/c2")

			const deny = floorIn(appDataDir, "c1").permissions?.deny ?? []

			expect(deny).toContain(`Read(/${join(appDataDir, "attachments/c2")}/**)`)
			expect(deny).not.toContain(
				`Read(/${join(appDataDir, "attachments/c1")}/**)`,
			)
			expect(deny).not.toContain(`Read(/${join(appDataDir, "attachments")}/**)`)
		})

		it("denies what it could enumerate when the other directory is absent", () => {
			laidDown("spaces/s1", "spaces/s2")

			const deny = denyOver([join(appDataDir, "spaces/s1")])

			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s2")}/**)`)
			expect(deny.some((rule) => rule.includes(join(appDataDir, "bots")))).toBe(
				false,
			)
		})
	})

	it("reads back the plugin paths the session was opened on", () => {
		expect(filesystemOf(PLUGIN_PATHS)?.allowRead).toEqual(PLUGIN_PATHS)
		expect(filesystemOf()?.allowRead).toBeUndefined()
	})

	it("writes back only into the bundles the bot owns", () => {
		const writable = writableOf(PLUGIN_PATHS, WRITABLE_PATHS)
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(writable).toEqual(WRITABLE_PATHS)
		expect(writable).not.toContain(SYSTEM_PATH)
		expect(filesystem?.allowRead).toContain(SYSTEM_PATH)
	})

	it("leaves the write allowance off the key the policy tier drops", () => {
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(filesystem).not.toHaveProperty("allowWrite")
	})

	it("holds the standing denials while the bundles stay writable", () => {
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(filesystem?.denyWrite).toContain(home(".claude"))
		expect(filesystem?.denyRead).toContain(join(APP_DATA, "bots"))
		expect(filesystem?.denyRead).toContain(join(APP_DATA, "spaces"))
	})

	it("leaves the write allowance out when the session owns no bundle", () => {
		expect(writableOf(PLUGIN_PATHS)).toBeUndefined()
		expect(writableOf()).toBeUndefined()
	})

	it("sandboxes every spawned command of a darwin session, with no domain gate", () => {
		expect(floor().sandbox).toEqual({
			enabled: true,
			allowUnsandboxedCommands: false,
			autoAllowBashIfSandboxed: false,
			failIfUnavailable: true,
			filesystem: {
				denyRead: [
					home(".ssh"),
					home(".aws"),
					home(".gnupg"),
					home(".config/gh"),
					home(".kube"),
					home("Library/Keychains"),
					home(".netrc"),
					home(".npmrc"),
					home(".docker/config.json"),
					home(".claude.json"),
					home(".claude/.credentials.json"),
					"/**/.env",
					"/**/.env.*",
					join(APP_DATA, "conversations.sqlite3"),
					join(APP_DATA, "conversations.sqlite3-wal"),
					join(APP_DATA, "conversations.sqlite3-shm"),
					join(APP_DATA, "host/token"),
					join(APP_DATA, "missions/*/hook/agent-hook.json"),
					join(APP_DATA, "bots"),
					join(APP_DATA, "spaces"),
					join(APP_DATA, "attachments"),
				],
				denyWrite: [
					home(".claude"),
					home("Library/LaunchAgents"),
					home(".zshrc"),
					home(".bashrc"),
					home(".zprofile"),
					home(".zshenv"),
				],
			},
		})
	})

	it("runs the commands of a Windows session unsandboxed under the same path denials", () => {
		expect(windowsFloor({ appDataDir: WINDOWS_APP_DATA }).sandbox).toEqual({
			enabled: true,
			allowUnsandboxedCommands: true,
			autoAllowBashIfSandboxed: false,
			failIfUnavailable: false,
			filesystem: {
				denyRead: [
					windowsHome(".ssh"),
					windowsHome(".aws"),
					windowsHome(".gnupg"),
					windowsHome(".config/gh"),
					windowsHome(".kube"),
					windowsHome("Library/Keychains"),
					windowsHome(".netrc"),
					windowsHome(".npmrc"),
					windowsHome(".docker/config.json"),
					windowsHome(".claude.json"),
					windowsHome(".claude/.credentials.json"),
					"/**/.env",
					"/**/.env.*",
					join(WINDOWS_APP_DATA, "conversations.sqlite3"),
					join(WINDOWS_APP_DATA, "conversations.sqlite3-wal"),
					join(WINDOWS_APP_DATA, "conversations.sqlite3-shm"),
					join(WINDOWS_APP_DATA, "host/token"),
					join(WINDOWS_APP_DATA, "missions/*/hook/agent-hook.json"),
					join(WINDOWS_APP_DATA, "bots"),
					join(WINDOWS_APP_DATA, "spaces"),
					join(WINDOWS_APP_DATA, "attachments"),
				],
				denyWrite: [
					windowsHome(".claude"),
					windowsHome("Library/LaunchAgents"),
					windowsHome(".zshrc"),
					windowsHome(".bashrc"),
					windowsHome(".zprofile"),
					windowsHome(".zshenv"),
				],
			},
		})
	})

	it("keeps every deny rule on a Windows session that runs commands unsandboxed", () => {
		expect(onWindows({ appDataDir: WINDOWS_APP_DATA })).toEqual([
			"Agent",
			"Task",
			"Read(//c/Users/alice/.ssh/**)",
			"Read(//c/Users/alice/.aws/**)",
			"Read(//c/Users/alice/.gnupg/**)",
			"Read(//c/Users/alice/.config/gh/**)",
			"Read(//c/Users/alice/.kube/**)",
			"Read(//c/Users/alice/Library/Keychains/**)",
			"Read(//c/Users/alice/.netrc)",
			"Read(//c/Users/alice/.npmrc)",
			"Read(//c/Users/alice/.docker/config.json)",
			"Read(//c/Users/alice/.claude.json)",
			"Read(//c/Users/alice/.claude/.credentials.json)",
			"Read(//**/.env)",
			"Read(//**/.env.*)",
			"Read(//c/data/kiroshi/conversations.sqlite3)",
			"Read(//c/data/kiroshi/conversations.sqlite3-wal)",
			"Read(//c/data/kiroshi/conversations.sqlite3-shm)",
			"Read(//c/data/kiroshi/host/token)",
			"Read(//c/data/kiroshi/missions/*/hook/agent-hook.json)",
			"Read(//c/data/kiroshi/attachments/**)",
			"Edit(//c/Users/alice/.claude/**)",
			"Edit(//c/Users/alice/Library/LaunchAgents/**)",
			"Edit(//c/Users/alice/.zshrc)",
			"Edit(//c/Users/alice/.bashrc)",
			"Edit(//c/Users/alice/.zprofile)",
			"Edit(//c/Users/alice/.zshenv)",
		])
	})

	it("emits the deny list of a darwin session in full", () => {
		expect(denyOf()).toEqual([
			"Agent",
			"Task",
			`Read(/${home(".ssh")}/**)`,
			`Read(/${home(".aws")}/**)`,
			`Read(/${home(".gnupg")}/**)`,
			`Read(/${home(".config/gh")}/**)`,
			`Read(/${home(".kube")}/**)`,
			`Read(/${home("Library/Keychains")}/**)`,
			`Read(/${home(".netrc")})`,
			`Read(/${home(".npmrc")})`,
			`Read(/${home(".docker/config.json")})`,
			`Read(/${home(".claude.json")})`,
			`Read(/${home(".claude/.credentials.json")})`,
			"Read(//**/.env)",
			"Read(//**/.env.*)",
			`Read(/${join(APP_DATA, "conversations.sqlite3")})`,
			`Read(/${join(APP_DATA, "conversations.sqlite3-wal")})`,
			`Read(/${join(APP_DATA, "conversations.sqlite3-shm")})`,
			`Read(/${join(APP_DATA, "host/token")})`,
			`Read(/${join(APP_DATA, "missions/*/hook/agent-hook.json")})`,
			`Read(/${join(APP_DATA, "attachments")}/**)`,
			`Edit(/${home(".claude")}/**)`,
			`Edit(/${home("Library/LaunchAgents")}/**)`,
			`Edit(/${home(".zshrc")})`,
			`Edit(/${home(".bashrc")})`,
			`Edit(/${home(".zprofile")})`,
			`Edit(/${home(".zshenv")})`,
		])
	})

	it("anchors a rule on the drive letter of a Windows home directory", () => {
		const deny = onWindows()

		expect(deny).toContain("Read(//c/Users/alice/.ssh/**)")
		expect(deny).toContain("Read(//c/Users/alice/.claude/.credentials.json)")
		expect(deny).toContain("Read(//**/.env)")
		expect(deny).toContain("Edit(//c/Users/alice/.zshrc)")
	})

	it("anchors the data directory rules of a Windows session", () => {
		const deny = onWindows({ appDataDir: WINDOWS_APP_DATA })

		expect(deny).toContain("Read(//c/data/kiroshi/conversations.sqlite3)")
		expect(deny).toContain("Read(//c/data/kiroshi/attachments/**)")
	})

	it("reads a Windows home directory written with forward slashes the same", () => {
		expect(onWindows({ home: "C:/Users/alice" })).toEqual(onWindows())
	})

	describe("over a Windows data directory laid down under the process directory", () => {
		let previousDirectory: string
		let root: string

		beforeEach(() => {
			previousDirectory = process.cwd()
			root = mkdtempSync(join(tmpdir(), "security-floor-windows-"))
			process.chdir(root)
			for (const bundle of ["bots/plugins/b1", "bots/plugins/b2"]) {
				mkdirSync(join(WINDOWS_APP_DATA, bundle), { recursive: true })
			}
		})

		afterEach(() => {
			process.chdir(previousDirectory)
			rmSync(root, { recursive: true, force: true })
		})

		it("anchors the rule of a bundle the Windows session does not own", () => {
			const deny = onWindows({
				appDataDir: WINDOWS_APP_DATA,
				pluginPaths: [join(WINDOWS_APP_DATA, "bots/plugins/b1")],
			})

			expect(deny).toContain("Read(//c/data/kiroshi/bots/plugins/b2/**)")
			expect(deny).not.toContain("Read(//c/data/kiroshi/bots/plugins/b1/**)")
		})
	})

	it("holds the rest of the floor when no data directory is named", () => {
		const bare = securityFloor({
			home: homedir(),
			platform: "darwin",
			pluginPaths: [],
			writablePaths: [],
		})

		expect(bare.permissions?.deny).toContain(`Read(/${home(".ssh")}/**)`)
		expect(bare.sandbox?.filesystem?.denyRead).toContain(home(".ssh"))
		expect(
			bare.sandbox?.filesystem?.denyRead?.some((path) =>
				path.startsWith(APP_DATA),
			),
		).toBe(false)
	})
})
