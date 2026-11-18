import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
	REPLAY_ANSWER_EVENT,
	REPLAY_COMMAND_EVENT,
	REPLAY_HEADER,
	REPLAY_HTTP_PREFIX,
} from "./replay-protocol"

const APP = fileURLToPath(new URL("../../..", import.meta.url))
const SOURCES = join(APP, "src")
const BUNDLE = join(APP, "dist")
const BUNDLE_ENTRY = join(BUNDLE, "index.html")
const TSC_EMIT_FOLDER = "src/"
const REPLAY_FOLDER = "lib/replay"
const REPLAY_IDENTIFIERS = [
	REPLAY_HTTP_PREFIX,
	REPLAY_HEADER,
	REPLAY_COMMAND_EVENT,
	REPLAY_ANSWER_EVENT,
	REPLAY_FOLDER,
]
const BUNDLE_TEXT_FILE = /\.(js|css|html|map|json)$/
const SOURCE_FILE = /\.(ts|tsx|css|html)$/

type Scan = {
	root: string
	isScanned: (path: string) => boolean
	identifiers: string[]
}

const filesNaming = ({ root, isScanned, identifiers }: Scan) =>
	readdirSync(root, { recursive: true, encoding: "utf8" })
		.filter(isScanned)
		.filter((path) => {
			const text = readFileSync(join(root, path), "utf8")
			return identifiers.some((identifier) => text.includes(identifier))
		})

describe("the replay mode in a build", () => {
	it("is imported by no source the build bundles", () => {
		const importers = filesNaming({
			root: SOURCES,
			isScanned: (path) =>
				SOURCE_FILE.test(path) && !path.startsWith(REPLAY_FOLDER),
			identifiers: [REPLAY_FOLDER],
		})

		expect(importers).toEqual([])
		expect(
			readFileSync(join(APP, "index.html"), "utf8").includes(REPLAY_FOLDER),
		).toBe(false)
	})

	it.skipIf(!existsSync(BUNDLE_ENTRY))(
		"leaves no replay identifier in the built bundle",
		() => {
			const naming = filesNaming({
				root: BUNDLE,
				isScanned: (path) =>
					BUNDLE_TEXT_FILE.test(path) && !path.startsWith(TSC_EMIT_FOLDER),
				identifiers: REPLAY_IDENTIFIERS,
			})

			expect(naming).toEqual([])
		},
	)
})
