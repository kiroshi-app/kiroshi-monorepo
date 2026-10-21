import { readdirSync } from "node:fs"
import { join, matchesGlob, sep } from "node:path"

import type { Settings } from "@anthropic-ai/claude-agent-sdk"

const READ_DIRECTORIES = [
	".ssh",
	".aws",
	".gnupg",
	".config/gh",
	".kube",
	"Library/Keychains",
]

const READ_FILES = [
	".netrc",
	".npmrc",
	".docker/config.json",
	".claude.json",
	".claude/.credentials.json",
]

const WRITE_DIRECTORIES = [".claude", "Library/LaunchAgents"]

const WRITE_FILES = [".zshrc", ".bashrc", ".zprofile", ".zshenv"]

const ENVIRONMENT_FILES = ["/**/.env", "/**/.env.*"]

const HOST_API_TOKEN = "host/token"

const MISSION_HOOK_KEYS = "missions/*/hook/agent-hook.json"

const APP_DATA_FILES = [
	"conversations.sqlite3",
	"conversations.sqlite3-wal",
	"conversations.sqlite3-shm",
	HOST_API_TOKEN,
	MISSION_HOOK_KEYS,
]

const ATTACHMENTS_DIRECTORY = "attachments"

const DENIED_TREES = ["bots", "spaces", ATTACHMENTS_DIRECTORY]

const BUNDLE_ROOTS = ["bots/plugins", "spaces"]

const DENIED_TOOLS = ["Agent", "Task"]

const SANDBOX = {
	enabled: true,
	autoAllowBashIfSandboxed: false,
} as const

export const failsWithoutSandbox = (platform: NodeJS.Platform): boolean =>
	platform !== "win32"

export const allowsUnsandboxedCommands = (platform: NodeJS.Platform): boolean =>
	!failsWithoutSandbox(platform)

type Denial = {
	directories: string[]
	files: string[]
}

const under = (root: string | undefined, paths: string[]): string[] =>
	root ? paths.map((path) => join(root, path)) : []

const posixPath = (path: string): string =>
	path
		.replace(/^([a-zA-Z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)
		.replaceAll("\\", "/")

const denyPath = (platform: NodeJS.Platform, path: string): string =>
	platform === "win32" ? posixPath(path) : path

export const rulesFor = (
	tool: string,
	{ directories, files }: Denial,
	platform: NodeJS.Platform,
): string[] => [
	...directories.map((path) => `${tool}(/${denyPath(platform, path)}/**)`),
	...files.map((path) => `${tool}(/${denyPath(platform, path)})`),
]

const pathsOf = ({ directories, files }: Denial): string[] => [
	...directories,
	...files,
]

const deniedReads = (
	home: string,
	appDataDir: string | undefined,
	mcpConfigPaths: string[],
): Denial => ({
	directories: under(home, READ_DIRECTORIES),
	files: [
		...under(home, READ_FILES),
		...ENVIRONMENT_FILES,
		...under(appDataDir, APP_DATA_FILES),
		...mcpConfigPaths,
	],
})

const entriesOf = (directory: string): string[] => {
	try {
		return readdirSync(directory).map((entry) => join(directory, entry))
	} catch {
		return []
	}
}

const holds = (directory: string, path: string): boolean =>
	path === directory || path.startsWith(`${directory}${sep}`)

const foreignBundles = (
	appDataDir: string | undefined,
	pluginPaths: string[],
): Denial => ({
	directories: under(appDataDir, BUNDLE_ROOTS)
		.flatMap(entriesOf)
		.filter((bundle) => !pluginPaths.some((path) => holds(bundle, path))),
	files: [],
})

const ownedAttachments = (
	appDataDir: string | undefined,
	conversationId: string | undefined,
): string | undefined =>
	appDataDir && conversationId
		? join(appDataDir, ATTACHMENTS_DIRECTORY, conversationId)
		: undefined

const foreignAttachments = (
	appDataDir: string | undefined,
	owned: string | undefined,
): Denial => ({
	directories: under(appDataDir, [ATTACHMENTS_DIRECTORY]).flatMap((root) =>
		owned ? entriesOf(root).filter((entry) => entry !== owned) : [root],
	),
	files: [],
})

const deniedWrites = (home: string): Denial => ({
	directories: under(home, WRITE_DIRECTORIES),
	files: under(home, WRITE_FILES),
})

export type FloorScope = {
	appDataDir?: string
	conversationId?: string
	home: string
	mcpConfigPaths?: string[]
	platform: NodeJS.Platform
	pluginPaths: string[]
	writablePaths: string[]
}

const readFloor = ({
	appDataDir,
	conversationId,
	home,
	mcpConfigPaths = [],
	pluginPaths,
}: FloorScope) => {
	const attachments = ownedAttachments(appDataDir, conversationId)
	return {
		reads: deniedReads(home, appDataDir, mcpConfigPaths),
		bundles: foreignBundles(appDataDir, pluginPaths),
		attachments: foreignAttachments(appDataDir, attachments),
		trees: under(appDataDir, DENIED_TREES),
		readablePaths: attachments ? [...pluginPaths, attachments] : pluginPaths,
	}
}

const covers = (entry: string, path: string): boolean =>
	holds(entry, path) || matchesGlob(path, entry)

export const deniesRead = (scope: FloorScope, path: string): boolean => {
	const { reads, bundles, attachments, trees, readablePaths } = readFloor(scope)
	const refused = [reads, bundles, attachments].flatMap(pathsOf)
	if (refused.some((entry) => covers(entry, path))) {
		return true
	}
	return (
		trees.some((tree) => holds(tree, path)) &&
		!readablePaths.some((readable) => holds(readable, path))
	)
}

export const securityFloor = (scope: FloorScope): Settings => {
	const { platform, writablePaths } = scope
	const { reads, bundles, attachments, trees, readablePaths } = readFloor(scope)
	const writes = deniedWrites(scope.home)
	return {
		permissions: {
			deny: [
				...DENIED_TOOLS,
				...rulesFor("Read", reads, platform),
				...rulesFor("Read", bundles, platform),
				...rulesFor("Read", attachments, platform),
				...rulesFor("Edit", writes, platform),
			],
			...(writablePaths.length > 0
				? { additionalDirectories: writablePaths }
				: {}),
		},
		sandbox: {
			...SANDBOX,
			allowUnsandboxedCommands: allowsUnsandboxedCommands(platform),
			failIfUnavailable: failsWithoutSandbox(platform),
			filesystem: {
				denyRead: [...pathsOf(reads), ...trees],
				denyWrite: pathsOf(writes),
				...(readablePaths.length > 0 ? { allowRead: readablePaths } : {}),
			},
		},
	}
}
