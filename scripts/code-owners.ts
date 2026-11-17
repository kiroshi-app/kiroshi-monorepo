import { readFileSync } from "node:fs"

const USAGE_ERROR = 64

export type OwnedPath = {
	path: string
	line: number
	pattern: string
}

type Rule = {
	line: number
	pattern: string
	matcher: RegExp
	isOwned: boolean
}

const escapeRegExp = (character: string) =>
	character.replace(/[.+^${}()|[\]\\]/g, "\\$&")

const globToRegExpSource = (glob: string) => {
	let source = ""
	let index = 0
	while (index < glob.length) {
		const rest = glob.slice(index)
		const isSegmentStart = index === 0 || glob[index - 1] === "/"
		if (isSegmentStart && rest.startsWith("**/")) {
			source += "(?:.*/)?"
			index += 3
		} else if (isSegmentStart && rest === "**") {
			source += ".*"
			index += 2
		} else if (rest[0] === "*") {
			source += "[^/]*"
			index += 1
		} else if (rest[0] === "?") {
			source += "[^/]"
			index += 1
		} else {
			source += escapeRegExp(rest[0] ?? "")
			index += 1
		}
	}
	return source
}

const belowPatternSource = (pattern: string, glob: string) => {
	if (pattern.endsWith("/")) return "/.*"
	if (glob.split("/").at(-1)?.includes("*")) return ""
	return "(?:/.*)?"
}

const patternToRegExp = (pattern: string) => {
	const glob = pattern.replace(/^\//, "").replace(/\/$/, "")
	const isAnchored = pattern.startsWith("/") || glob.includes("/")
	const prefix = isAnchored ? "^" : "^(?:.*/)?"
	return new RegExp(
		`${prefix}${globToRegExpSource(glob)}${belowPatternSource(pattern, glob)}$`,
	)
}

const parseRules = (codeOwners: string): Rule[] =>
	codeOwners.split("\n").flatMap((text, index) => {
		const [pattern, ...rest] = text.trim().split(/\s+/)
		if (!pattern || pattern.startsWith("#")) return []
		const commentStart = rest.findIndex((token) => token.startsWith("#"))
		const owners = commentStart === -1 ? rest : rest.slice(0, commentStart)
		return [
			{
				line: index + 1,
				pattern,
				matcher: patternToRegExp(pattern),
				isOwned: owners.length > 0,
			},
		]
	})

export const findOwnedPaths = (
	codeOwners: string,
	paths: string[],
): OwnedPath[] => {
	const rules = parseRules(codeOwners)
	return paths.flatMap((path) => {
		const rule = rules.findLast(({ matcher }) => matcher.test(path))
		if (!rule?.isOwned) return []
		return [{ path, line: rule.line, pattern: rule.pattern }]
	})
}

export const describeOwnedPath = ({ path, line, pattern }: OwnedPath) =>
	`${path} is owned by CODEOWNERS line ${line}: ${pattern}`

if (import.meta.main) {
	const [codeOwnersFile, ...rest] = process.argv.slice(2)
	if (!codeOwnersFile || rest.length > 0) {
		console.error(
			"code-owners.ts: usage: bun scripts/code-owners.ts <CODEOWNERS file>, the paths one per line on stdin",
		)
		process.exit(USAGE_ERROR)
	}
	const paths = (await Bun.stdin.text()).split("\n").filter(Boolean)
	const owned = findOwnedPaths(readFileSync(codeOwnersFile, "utf8"), paths)
	for (const ownedPath of owned) console.log(describeOwnedPath(ownedPath))
}
