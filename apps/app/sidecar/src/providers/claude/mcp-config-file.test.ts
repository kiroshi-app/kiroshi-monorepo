import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import {
	mcpConfigFileFor,
	readPathsOf,
	writeMcpConfigFile,
} from "./mcp-config-file"

const servers = {
	clock: { command: "run", env: { TOKEN: "sk-live-secret-value" } },
}

const ownerOnly = (path: string): number => statSync(path).mode & 0o777

const isPosix = process.platform !== "win32"

const inheritedTmpdir = process.env.TMPDIR
let root = ""

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "kiroshi-mcp-file-test-"))
	process.env.TMPDIR = root
})

afterEach(() => {
	if (inheritedTmpdir === undefined) {
		delete process.env.TMPDIR
	} else {
		process.env.TMPDIR = inheritedTmpdir
	}
	rmSync(root, { recursive: true, force: true })
})

describe("writeMcpConfigFile", () => {
	it("writes the servers under mcpServers, in a fresh directory of the temp directory", () => {
		const file = writeMcpConfigFile(servers)

		expect(dirname(dirname(file.path))).toBe(root)
		expect(JSON.parse(readFileSync(file.path, "utf8"))).toEqual({
			mcpServers: servers,
		})
		file.remove()
	})

	it.skipIf(!isPosix)(
		"lets the owner alone read the file and its directory",
		() => {
			const file = writeMcpConfigFile(servers)

			expect(ownerOnly(file.path)).toBe(0o600)
			expect(ownerOnly(dirname(file.path))).toBe(0o700)
			file.remove()
		},
	)

	it("names the symlink-resolved form of the path beside the written one", () => {
		const file = writeMcpConfigFile(servers)

		expect(file.resolvedPath).toBe(realpathSync(file.path))
		expect(readPathsOf(file)).toEqual([
			...new Set([file.path, realpathSync(file.path)]),
		])
		file.remove()
	})

	it("removes its directory, and a second removal does not throw", () => {
		const file = writeMcpConfigFile(servers)

		file.remove()

		expect(existsSync(dirname(file.path))).toBe(false)
		expect(() => file.remove()).not.toThrow()
	})

	it("throws the error of a temp directory it cannot write in", () => {
		process.env.TMPDIR = join(root, "missing")

		expect(() => writeMcpConfigFile(servers)).toThrow(/ENOENT/)
	})
})

describe("mcpConfigFileFor", () => {
	it("writes no file for a session with no resolved server", () => {
		expect(mcpConfigFileFor({})).toBeUndefined()
		expect(readdirSync(root)).toEqual([])
	})

	it("denies no path when there is no file", () => {
		expect(readPathsOf(undefined)).toEqual([])
	})
})
