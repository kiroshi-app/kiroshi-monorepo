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

const filesNaming = (root: string, kept: RegExp, identifiers: string[]) =>
	readdirSync(root, { recursive: true, encoding: "utf8" })
		.filter((path) => kept.test(path))
		.filter((path) => {
			const text = readFileSync(join(root, path), "utf8")
			return identifiers.some((identifier) => text.includes(identifier))
		})

describe("the replay mode in a build", () => {
	it("is imported by no source the build bundles", () => {
		const importers = filesNaming(SOURCES, SOURCE_FILE, [REPLAY_FOLDER]).filter(
			(path) => !path.startsWith(REPLAY_FOLDER),
		)

		expect(importers).toEqual([])
		expect(
			readFileSync(join(APP, "index.html"), "utf8").includes(REPLAY_FOLDER),
		).toBe(false)
	})

	it.skipIf(!existsSync(BUNDLE_ENTRY))(
		"leaves no replay identifier in the built bundle",
		() => {
			const naming = filesNaming(
				BUNDLE,
				BUNDLE_TEXT_FILE,
				REPLAY_IDENTIFIERS,
			).filter((path) => !path.startsWith(TSC_EMIT_FOLDER))

			expect(naming).toEqual([])
		},
	)
})
