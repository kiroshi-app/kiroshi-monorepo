import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cn } from "@workspace/ui/lib/utils"

const VENDORED_DIRECTORY = join(import.meta.dirname, "../components/ui")
const FOREIGN_CN_IMPORT = /from\s+["']cn["']/
const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
]

const vendoredFilesImportingForeignCn = () =>
	readdirSync(VENDORED_DIRECTORY).filter((file) =>
		FOREIGN_CN_IMPORT.test(
			readFileSync(join(VENDORED_DIRECTORY, file), "utf8"),
		),
	)

const manifestsDeclaringCn = () => {
	const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
		cwd: import.meta.dirname,
		encoding: "utf8",
	}).trim()
	const manifests = execFileSync("git", ["ls-files", "*package.json"], {
		cwd: root,
		encoding: "utf8",
	})
		.split("\n")
		.filter(Boolean)
	return manifests.filter((manifest) => {
		const fields = JSON.parse(readFileSync(join(root, manifest), "utf8"))
		return DEPENDENCY_FIELDS.some((field) => fields[field]?.cn !== undefined)
	})
}

describe("cn", () => {
	it("is the one from @workspace/ui/lib/utils in every vendored primitive", () => {
		expect(vendoredFilesImportingForeignCn()).toEqual([])
	})

	it("is a dependency of no package.json in the repository", () => {
		expect(manifestsDeclaringCn()).toEqual([])
	})

	it("lets the button radius replace the radius of a vendored primitive", () => {
		expect(cn("rounded-2xl px-2", "rounded-button")).toBe("px-2 rounded-button")
	})
})
