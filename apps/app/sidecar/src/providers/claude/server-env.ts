import type { Options } from "@anthropic-ai/claude-agent-sdk"

import { sessionServers } from "./bundle-servers"
import { leftOutLine, type ServerLine } from "./system-layer"

import type { ServerEnv, SessionRequest } from "../provider"

export type Servers = NonNullable<Options["mcpServers"]>
type Server = Servers[string]
type Values = Record<string, string>

const EXPANDED_FIELDS = ["command", "args", "env", "url", "headers"] as const
const PLACEHOLDER = /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g
const OPENING = "${"

const GRANT_PREFIX = "KIROSHI_OAUTH_"
export const ACCESS_TOKEN = `${GRANT_PREFIX}ACCESS_TOKEN`
export const SERVER_URL = `${GRANT_PREFIX}SERVER_URL`
const AUTHORIZATION = "authorization"

export type ResolvedServers = {
	servers: Servers
	rejections: ServerLine[]
}

const declaredFields = (server: Server): [string, unknown][] => {
	const declared = server as Record<string, unknown>
	return EXPANDED_FIELDS.filter((field) => field in declared).map((field) => [
		field,
		declared[field],
	])
}

const declaresVariable = (server: Server): boolean =>
	JSON.stringify(declaredFields(server)).includes(OPENING)

const isGrantName = (name: string): boolean => name.startsWith(GRANT_PREFIX)

const expandText = (text: string, values: Values, missing: string[]): string =>
	text.replace(PLACEHOLDER, (whole, name: string, fallback?: string) => {
		if (isGrantName(name)) {
			missing.push(name)
			return whole
		}
		const held = values[name]
		if (held !== undefined) {
			return held
		}
		if (fallback !== undefined) {
			return fallback
		}
		missing.push(name)
		return whole
	})

const expandValue = (
	value: unknown,
	values: Values,
	missing: string[],
): unknown => {
	if (typeof value === "string") {
		return expandText(value, values, missing)
	}
	if (Array.isArray(value)) {
		return value.map((held) => expandValue(held, values, missing))
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, held]) => [
				key,
				expandValue(held, values, missing),
			]),
		)
	}
	return value
}

const expandServer = (
	server: Server,
	values: Values,
	missing: string[],
): Server => {
	const expanded = declaredFields(server).map(([field, value]) => [
		field,
		expandValue(value, values, missing),
	])
	return { ...server, ...Object.fromEntries(expanded) } as Server
}

const declaredHeaders = (server: Server): Values => {
	const declared = (server as Record<string, unknown>).headers
	return declared && typeof declared === "object" ? (declared as Values) : {}
}

const carriesUrl = (server: Server): boolean =>
	typeof (server as Record<string, unknown>).url === "string"

const declaresAuthorization = (server: Server): boolean =>
	Object.keys(declaredHeaders(server)).some(
		(held) => held.toLowerCase() === AUTHORIZATION,
	)

const needsTheStore = (server: Server): boolean =>
	declaresVariable(server) ||
	(carriesUrl(server) && !declaresAuthorization(server))

const withBearer = (server: Server, token: string): Server =>
	({
		...server,
		headers: { ...declaredHeaders(server), Authorization: `Bearer ${token}` },
	}) as Server

const authorized = (server: Server, own: Values | undefined): Server => {
	const token = own?.[ACCESS_TOKEN]
	if (!token || !carriesUrl(server) || declaresAuthorization(server)) {
		return server
	}
	return withBearer(server, token)
}

const withoutGrant = (own: Values): Values =>
	Object.fromEntries(Object.entries(own).filter(([name]) => !isGrantName(name)))

const canonicalUrl = (url: string): string => {
	if (!URL.canParse(url)) {
		return url
	}
	const { protocol, username, password, host, pathname, search } = new URL(url)
	if (!host) {
		return url
	}
	const credentials = password ? `${username}:${password}` : username
	const userinfo = credentials ? `${credentials}@` : ""
	return `${protocol}//${userinfo}${host}${pathname.replace(/\/+$/, "")}${search}`
}

const holdsItsGrant = (server: Server | undefined, own: Values): boolean => {
	const bound = own[SERVER_URL]
	const declared = (server as Record<string, unknown> | undefined)?.url
	return (
		bound !== undefined &&
		typeof declared === "string" &&
		canonicalUrl(declared) === canonicalUrl(bound)
	)
}

export const boundEnv = (servers: Servers, env: ServerEnv): ServerEnv => ({
	...env,
	perServer: Object.fromEntries(
		Object.entries(env.perServer ?? {}).map(([name, own]) => [
			name,
			holdsItsGrant(servers[name], own) ? own : withoutGrant(own),
		]),
	),
})

export const declaredWithout = (servers: Servers, name: string): Servers =>
	Object.fromEntries(
		Object.entries(servers).filter(([held]) => held !== name),
	) as Servers

export const declaredAgain = (
	servers: Servers,
	name: string,
	token: string,
): Servers => {
	const held = servers[name]
	return held ? { ...servers, [name]: withBearer(held, token) } : servers
}

const LEFT_OUT = "was left out"
const LEFT_OUT_SEPARATOR = `${LEFT_OUT}: `
const SERVER_NAMED = /^the server "([^"]+)"/

export const AWAITING_AUTH = "it is waiting for you to authorize it"

export const leftOut = (name: string, reason: string) =>
	`the server "${name}" ${LEFT_OUT_SEPARATOR}${reason}`

export const serverNamed = (detail: string): string | undefined =>
	SERVER_NAMED.exec(detail)?.[1]

export const leftOutReason = (detail: string): string | undefined => {
	const at = detail.indexOf(LEFT_OUT_SEPARATOR)
	return at < 0 ? undefined : detail.slice(at + LEFT_OUT_SEPARATOR.length)
}

const UNREADABLE_STORE = "the environment store could not be read"

export const resolveServers = (
	servers: Servers,
	env: ServerEnv,
): ResolvedServers => {
	const kept: Servers = {}
	const rejections: ServerLine[] = []
	const bound = boundEnv(servers, env)
	for (const [name, server] of Object.entries(servers)) {
		const own = bound.perServer?.[name]
		if (env.needsAuthorization?.includes(name)) {
			rejections.push({
				detail: leftOut(name, AWAITING_AUTH),
				state: "needs-auth",
			})
			continue
		}
		if (env.failure && needsTheStore(server)) {
			rejections.push(leftOutLine(leftOut(name, UNREADABLE_STORE)))
			continue
		}
		if (!declaresVariable(server)) {
			kept[name] = authorized(server, own)
			continue
		}
		const missing: string[] = []
		const expanded = expandServer(server, { ...env.base, ...own }, missing)
		const [absent] = missing
		if (absent) {
			rejections.push(
				leftOutLine(leftOut(name, `${absent} is defined by no scope`)),
			)
			continue
		}
		kept[name] = authorized(expanded, own)
	}
	if (env.failure && rejections.length) {
		return {
			servers: kept,
			rejections: [leftOutLine(env.failure), ...rejections],
		}
	}
	return { servers: kept, rejections }
}

export const requestedServers = (request: SessionRequest): Servers =>
	request.pluginPath
		? sessionServers({
				pluginPath: request.pluginPath,
				systemPluginPath: request.systemPluginPath,
				userPluginPath: request.userPluginPath,
				spacePluginPath: request.spacePluginPath,
			})
		: {}

export const resolvedServers = (request: SessionRequest): ResolvedServers =>
	resolveServers(requestedServers(request), request.serverEnv ?? {})
