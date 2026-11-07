import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	AWAITING_AUTH,
	boundEnv,
	declaredAgain,
	declaredWithout,
	leftOut,
	resolvedServers,
	resolveServers,
} from "./server-env"
import { leftOutLine } from "./system-layer"

import type { ServerEnv } from "../provider"

const probe = {
	command: "${RUNNER}",
	args: ["--token", "${TOKEN}"],
	env: { API_KEY: "${API_KEY}" },
}

const remote = {
	type: "http" as const,
	url: "${BASE_URL}/mcp",
	headers: { Authorization: "Bearer ${TOKEN}" },
}

const plain = { command: "python3", args: ["server.py"] }

const granola = { type: "http" as const, url: "https://mcp.granola.ai/mcp" }

const ACCESS_TOKEN = "KIROSHI_OAUTH_ACCESS_TOKEN"
const SERVER_URL = "KIROSHI_OAUTH_SERVER_URL"
const placeholder = (name: string) => `\${${name}}`

const held: ServerEnv = {
	base: { RUNNER: "node", TOKEN: "wide", API_KEY: "secret" },
	perServer: { probe: { TOKEN: "narrow" } },
}

describe("resolveServers", () => {
	it("leaves out a server referencing a connection name, defined by no scope", () => {
		for (const name of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) {
			const server = { command: "run", args: [`\${${name}}`] }

			const { servers, rejections } = resolveServers({ probe: server }, held)

			expect(servers).toEqual({})
			expect(rejections).toEqual(
				[leftOut("probe", `${name} is defined by no scope`)].map(leftOutLine),
			)
		}
	})

	it("expands every declared field from the base under the server's own overlay", () => {
		const { servers, rejections } = resolveServers({ probe }, held)

		expect(servers.probe).toEqual({
			command: "node",
			args: ["--token", "narrow"],
			env: { API_KEY: "secret" },
		})
		expect(rejections).toEqual([])
	})

	it("expands the url and the headers of a remote server", () => {
		const { servers } = resolveServers(
			{ remote },
			{ base: { BASE_URL: "https://host", TOKEN: "wide" } },
		)

		expect(servers.remote).toEqual({
			type: "http",
			url: "https://host/mcp",
			headers: { Authorization: "Bearer wide" },
		})
	})

	it("hands back a declaration holding no variable as it was given", () => {
		const { servers } = resolveServers({ plain }, held)

		expect(servers.plain).toBe(plain)
	})

	it("serves the default of a variable no scope defines", () => {
		const { servers, rejections } = resolveServers(
			{ dated: { command: "run", args: ["--at", "${WHEN:-noon}"] } },
			{},
		)

		expect(servers.dated).toEqual({ command: "run", args: ["--at", "noon"] })
		expect(rejections).toEqual([])
	})

	it("leaves out the server whose variable has neither value nor default, keeping the rest", () => {
		const { servers, rejections } = resolveServers({ probe, plain }, {})

		expect(Object.keys(servers)).toEqual(["plain"])
		expect(rejections).toEqual(
			['the server "probe" was left out: RUNNER is defined by no scope'].map(
				leftOutLine,
			),
		)
	})

	it("still leaves out a server waiting for authorization when the store could not be read", () => {
		const { rejections } = resolveServers(
			{ granola },
			{
				needsAuthorization: ["granola"],
				failure: "the environment store could not be read",
			},
		)

		expect(rejections).toContainEqual({
			detail: leftOut("granola", AWAITING_AUTH),
			state: "needs-auth",
		})
	})

	it("leaves out a server the host named as needing authorization, as a read of needs-auth would", () => {
		const { servers, rejections } = resolveServers(
			{ granola, plain },
			{
				perServer: { granola: { [ACCESS_TOKEN]: "stale" } },
				needsAuthorization: ["granola"],
			},
		)

		expect(Object.keys(servers)).toEqual(["plain"])
		expect(rejections).toEqual([
			{ detail: leftOut("granola", AWAITING_AUTH), state: "needs-auth" },
		])
		expect(JSON.stringify(rejections)).not.toContain("stale")
	})

	it("keeps a resolved value out of what it reports", () => {
		const { rejections } = resolveServers(
			{ probe },
			{ base: { RUNNER: "node", TOKEN: "wide" } },
		)

		expect(rejections.join(" ")).not.toContain("node")
		expect(rejections.join(" ")).not.toContain("wide")
	})

	it("names the store failure then every server it left out, when the store could not be read", () => {
		const { servers, rejections } = resolveServers(
			{ probe, plain },
			{ failure: "the environment store could not be read" },
		)

		expect(Object.keys(servers)).toEqual(["plain"])
		expect(rejections).toEqual(
			[
				"the environment store could not be read",
				'the server "probe" was left out: the environment store could not be read',
			].map(leftOutLine),
		)
	})

	it("reports nothing and keeps every server when the store failure costs none", () => {
		const { servers, rejections } = resolveServers(
			{ plain },
			{ failure: "the environment store could not be read" },
		)

		expect(servers.plain).toBe(plain)
		expect(rejections).toEqual([])
	})

	it("keeps a value of a scope out of what it reports when the store could not be read", () => {
		const { rejections } = resolveServers(
			{ probe },
			{ failure: "the environment store could not be read", base: held.base },
		)

		expect(rejections.join(" ")).not.toContain("node")
		expect(rejections.join(" ")).not.toContain("secret")
	})
})

describe("resolvedServers", () => {
	let bundle: string

	beforeEach(() => {
		bundle = mkdtempSync(join(tmpdir(), "kiroshi-server-env-"))
		writeFileSync(
			join(bundle, ".mcp.json"),
			JSON.stringify({ mcpServers: { probe, plain } }),
		)
	})

	afterEach(() => {
		rmSync(bundle, { recursive: true, force: true })
	})

	it("resolves what the bundle declares against the environment the request carries", () => {
		const { servers, rejections } = resolvedServers({
			cwd: "/tmp",
			partialMessages: true,
			pluginPath: bundle,
			serverEnv: held,
		})

		expect(servers.probe).toEqual({
			command: "node",
			args: ["--token", "narrow"],
			env: { API_KEY: "secret" },
		})
		expect(servers.plain).toEqual(plain)
		expect(rejections).toEqual([])
	})

	it("sends the stored access token as a bearer header on a server declaring no placeholder", () => {
		const { servers, rejections } = resolveServers(
			{ granola },
			{
				perServer: {
					granola: { [ACCESS_TOKEN]: "granted", [SERVER_URL]: granola.url },
				},
			},
		)

		expect(servers.granola).toEqual({
			type: "http",
			url: "https://mcp.granola.ai/mcp",
			headers: { Authorization: "Bearer granted" },
		})
		expect(rejections).toEqual([])
	})

	it("leaves a hand-written authorization header alone whatever its letter case", () => {
		const { servers } = resolveServers(
			{
				granola: { ...granola, headers: { authorization: "Bearer written" } },
			},
			{
				perServer: {
					granola: { [ACCESS_TOKEN]: "granted", [SERVER_URL]: granola.url },
				},
			},
		)

		expect(servers.granola).toEqual({
			type: "http",
			url: "https://mcp.granola.ai/mcp",
			headers: { authorization: "Bearer written" },
		})
	})

	it("adds the bearer header beside the headers a server expanded", () => {
		const { servers } = resolveServers(
			{ remote: { type: "http" as const, url: "${BASE_URL}/mcp" } },
			{
				base: { BASE_URL: "https://example.test" },
				perServer: {
					remote: {
						[ACCESS_TOKEN]: "granted",
						[SERVER_URL]: `${placeholder("BASE_URL")}/mcp`,
					},
				},
			},
		)

		expect(servers.remote).toEqual({
			type: "http",
			url: "https://example.test/mcp",
			headers: { Authorization: "Bearer granted" },
		})
	})

	it("adds no bearer header to a server that carries no url", () => {
		const { servers } = resolveServers(
			{ plain },
			{ perServer: { plain: { [ACCESS_TOKEN]: "granted" } } },
		)

		expect(servers.plain).toEqual(plain)
	})

	it("leaves out a url server holding no authorization header when the store failed", () => {
		const { servers, rejections } = resolveServers(
			{ granola },
			{ failure: "the keychain is locked" },
		)

		expect(servers.granola).toBeUndefined()
		expect(rejections).toEqual(
			[
				"the keychain is locked",
				leftOut("granola", "the environment store could not be read"),
			].map(leftOutLine),
		)
	})

	it("keeps a url server holding an authorization header of its own when the store failed", () => {
		const { servers, rejections } = resolveServers(
			{
				granola: { ...granola, headers: { authorization: "Bearer written" } },
			},
			{ failure: "the keychain is locked" },
		)

		expect(servers.granola).toEqual({
			type: "http",
			url: "https://mcp.granola.ai/mcp",
			headers: { authorization: "Bearer written" },
		})
		expect(rejections).toEqual([])
	})

	it("keeps a server naming no url and no variable when the store failed", () => {
		const { servers, rejections } = resolveServers(
			{ plain },
			{ failure: "the keychain is locked" },
		)

		expect(servers.plain).toEqual(plain)
		expect(rejections).toEqual([])
	})

	it("carries nothing for a session opened with no bundle", () => {
		expect(resolvedServers({ cwd: "/tmp", partialMessages: true })).toEqual({
			servers: {},
			rejections: [],
		})
	})
})

describe("bound grants", () => {
	const grant = { [ACCESS_TOKEN]: "granted", [SERVER_URL]: granola.url }
	const elsewhere = { type: "http" as const, url: "https://elsewhere.test/mcp" }
	it("attaches the bearer to the url the grant was issued for", () => {
		const { servers } = resolveServers(
			{ granola },
			{ perServer: { granola: grant } },
		)

		expect(servers.granola).toEqual({
			...granola,
			headers: { Authorization: "Bearer granted" },
		})
	})

	it("drops the bearer when a server of the same name declares another url", () => {
		const env = { perServer: { granola: grant } }

		const { servers } = resolveServers({ granola: elsewhere }, env)

		expect(servers.granola).toEqual(elsewhere)
		expect(boundEnv({ granola: elsewhere }, env).perServer?.granola).toEqual({})
	})

	it("keeps the grant of a server declaring the url it was issued for", () => {
		const env = { perServer: { granola: grant } }

		expect(boundEnv({ granola }, env).perServer?.granola).toEqual(grant)
	})

	it("drops the bearer of a grant bound to no url", () => {
		const { servers } = resolveServers(
			{ granola },
			{ perServer: { granola: { [ACCESS_TOKEN]: "granted" } } },
		)

		expect(servers.granola).toEqual(granola)
	})

	it("compares the declared url as written, before any expansion", () => {
		const { servers } = resolveServers(
			{ granola: { ...granola, url: `${granola.url}/` } },
			{ perServer: { granola: grant } },
		)

		expect(servers.granola).toEqual({ ...granola, url: `${granola.url}/` })
	})

	it("never expands a grant name as a placeholder, bound or not, even with a default", () => {
		const declarations = [
			{
				type: "http" as const,
				url: `https://x.test/${placeholder(ACCESS_TOKEN)}`,
			},
			{ ...granola, headers: { "X-Token": placeholder(ACCESS_TOKEN) } },
			{ command: "run", args: [placeholder(`${ACCESS_TOKEN}:-none`)] },
			{ command: "run", env: { TOKEN: placeholder(ACCESS_TOKEN) } },
		]
		for (const server of declarations) {
			const result = resolveServers(
				{ granola: server },
				{ base: { [ACCESS_TOKEN]: "granted" }, perServer: { granola: grant } },
			)

			expect(result.servers).toEqual({})
			expect(result.rejections).toEqual([
				leftOutLine(
					leftOut("granola", `${ACCESS_TOKEN} is defined by no scope`),
				),
			])
			expect(JSON.stringify(result)).not.toContain("granted")
		}
	})

	it("keeps expanding the other values of a server whose grant is withheld", () => {
		const { servers } = resolveServers(
			{
				granola: {
					type: "http" as const,
					url: `https://${placeholder("REGION")}.x.test/${placeholder("PATH")}`,
				},
			},
			{
				base: { PATH: "mcp" },
				perServer: { granola: { REGION: "eu", [ACCESS_TOKEN]: "granted" } },
			},
		)

		expect(servers.granola).toEqual({
			type: "http",
			url: "https://eu.x.test/mcp",
		})
	})
})

describe("declaredAgain", () => {
	it("names every server declared, carrying the renewed header on the one renewed", () => {
		const declared = declaredAgain(
			{ granola, plain, probe },
			"granola",
			"renewed-access-token",
		)

		expect(Object.keys(declared)).toEqual(["granola", "plain", "probe"])
		expect(declared.granola).toEqual({
			...granola,
			headers: { Authorization: "Bearer renewed-access-token" },
		})
		expect(declared.plain).toEqual(plain)
		expect(declared.probe).toEqual(probe)
	})

	it("replaces the header a first renewal left, keeping the others declared", () => {
		const carried = { ...granola, headers: { "X-Room": "main" } }

		const declared = declaredAgain(
			declaredAgain({ carried }, "carried", "first-access-token"),
			"carried",
			"second-access-token",
		)

		expect(declared.carried).toEqual({
			...granola,
			headers: {
				"X-Room": "main",
				Authorization: "Bearer second-access-token",
			},
		})
	})

	it("declares the set unchanged when it names no such server", () => {
		expect(declaredAgain({ granola }, "clock", "renewed")).toEqual({ granola })
	})
})

describe("declaredWithout", () => {
	it("names every other server the session holds and drops the one named", () => {
		expect(declaredWithout({ granola, plain, probe }, "granola")).toEqual({
			plain,
			probe,
		})
	})

	it("declares the set unchanged when it names no such server", () => {
		expect(declaredWithout({ granola }, "clock")).toEqual({ granola })
	})
})
