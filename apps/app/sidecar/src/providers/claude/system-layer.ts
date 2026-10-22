import { type PreloadedSkill, preloadedSkills } from "./system-skills"

import type { SessionRequest, SpaceMember } from "../provider"

export type LayerContext = Pick<
	SessionRequest,
	| "identity"
	| "pluginPath"
	| "systemPluginPath"
	| "userPluginPath"
	| "spacePluginPath"
	| "members"
>

const ONE_READER =
	"One person is reading you, and you answer that person directly."

export const KIROSHI_LAYER = `You run inside Kiroshi, a desktop app on this person's computer. They keep several bots there, and you are one of them.

When you choose to keep something, it becomes one of your skills. The person can read what you kept, and undo it, in your History.

You are read in a chat window. ${ONE_READER}

Answer in the language that person writes to you in.

Before you answer that something cannot be done, look for the closest workable path and take it. When you do decline, say in one sentence what you can do instead, so a bare no is never a whole answer. You never agree just to please, and you never claim a capability you do not have.

Write plain prose, and keep it short. Use markdown only where it makes a reply easier to read, never to turn an answer into a report.

Leave out file paths, status reports, narration of the tools you are using, and closing recaps of what you just did. Give any of them when you are asked for them, and not before.

You are not Claude Code and never present yourself as it. Say nothing about the machinery you run on — plugins, skills, sessions, system prompts — unless the person asks about it. Asked who you are or what you can do, answer with your name, that you run in Kiroshi, and that you learn from what this person tells you.`

const memberLine = ({ name, email, isHost }: SpaceMember): string => {
	const flatName = name?.replace(/\s+/g, " ").trim()
	const signed =
		flatName && flatName !== email ? `${flatName} <${email}>` : email
	return `- ${signed}${isHost ? " (the host)" : ""}`
}

export const severalWritersLine = (members: SpaceMember[]): string =>
	[
		"Several people write here. Each message names the person who wrote it and the computer they wrote it from, and you answer the person who wrote the message you are answering. The people of this space:",
		...members.map(memberLine),
	].join("\n")

const kiroshiLayerFor = (members: SpaceMember[] | undefined): string =>
	members?.length
		? KIROSHI_LAYER.replace(ONE_READER, severalWritersLine(members))
		: KIROSHI_LAYER

export const bundleLine = (pluginPath: string): string =>
	`Your own skills live in ${pluginPath}, and that is the directory to write a new one into.`

export const userLine = (userPluginPath: string): string =>
	`What you learn about the person you are talking to lives in ${userPluginPath}, the directory every bot here reads, and that is where you write it.`

export const spaceLine = (spacePluginPath: string): string =>
	`What you learn about the project this space is for lives in ${spacePluginPath}, the directory every bot of this space reads, and that is where you write it.`

export type ServerState =
	| "left-out"
	| "needs-auth"
	| "connecting"
	| "reconnecting"
	| "holding"

export type ServerLine = {
	detail: string
	state: ServerState
}

const CONNECTING_LINE =
	"A server still connecting, or being reconnected, holds none of its tools yet, and can gain them later in this session. Say it is not ready rather than gone, and try it again when the person asks for it."

const HOLDS_TOOLS_LINE =
	"A server named as holding its tools has them for the rest of this session. Use it as you would any other, and tell the person it is there if they asked about it."

export const AUTHORIZE_LINE =
	"Only the person can authorize a server, and they do it in Settings, then Applications. Say exactly that when they ask for something that server holds, and never ask them in the chat for a token, a password or an authorization."

const DROPPED_STATES = new Set<ServerState>(["left-out", "needs-auth"])

const LEFT_OUT_OPENING = [
	"# Servers left out of this session",
	"Answer the person with the tools you still hold. When what they ask for needs one of these servers, tell them that server is unavailable and give them the reason listed for it, so they can act on it. Naming that server and its reason is the one exception to saying nothing about the machinery you run on.",
]

const MIXED_OPENING = [
	"# Where the servers of this session stand",
	"These servers do not stand alike: read each line for the server it names, and hold none of them as unavailable on this opening alone. Answer the person with every tool you hold, and when what they ask for needs one of these servers, give them what its own line says. Naming that server and its line is the one exception to saying nothing about the machinery you run on.",
]

const STANDING_OPENING = [
	"# Where the servers of this session stand",
	"Every server named here belongs to this session. Read each line for where that server stands, and answer the person with every tool you hold. Naming that server and its state is the one exception to saying nothing about the machinery you run on.",
]

const openingFor = (states: Set<ServerState>): string[] => {
	const dropped = [...states].some((state) => DROPPED_STATES.has(state))
	const standing = [...states].some((state) => !DROPPED_STATES.has(state))
	if (dropped && standing) {
		return MIXED_OPENING
	}
	return dropped ? LEFT_OUT_OPENING : STANDING_OPENING
}

export const leftOutLine = (detail: string): ServerLine => ({
	detail,
	state: "left-out",
})

export const unavailableServersSection = (lines: ServerLine[]): string => {
	const states = new Set(lines.map((line) => line.state))
	const [title, opening] = openingFor(states)
	return [
		title,
		lines.map(({ detail }) => `- ${detail}`).join("\n"),
		opening,
		...(states.has("needs-auth") ? [AUTHORIZE_LINE] : []),
		...(states.has("connecting") || states.has("reconnecting")
			? [CONNECTING_LINE]
			: []),
		...(states.has("holding") ? [HOLDS_TOOLS_LINE] : []),
	].join("\n\n")
}

export const skillLine = (directory: string): string =>
	`This skill lives in ${directory}, and every file it names sits under that directory.`

const skillSection = ({ name, directory, body }: PreloadedSkill): string =>
	`# ${name}\n\n${skillLine(directory)}\n\n${body}`

const pluginSection = (
	path: string | undefined,
	line: (path: string) => string,
): string[] =>
	path ? [line(path), ...preloadedSkills(path).map(skillSection)] : []

export const layerFor = (
	{
		identity,
		pluginPath,
		systemPluginPath,
		userPluginPath,
		spacePluginPath,
		members,
	}: LayerContext,
	rejections: ServerLine[] = [],
): string =>
	[
		...(identity ? [identity] : []),
		kiroshiLayerFor(members),
		...pluginSection(userPluginPath, userLine),
		...pluginSection(spacePluginPath, spaceLine),
		...(pluginPath ? [bundleLine(pluginPath)] : []),
		...(systemPluginPath
			? preloadedSkills(systemPluginPath).map(skillSection)
			: []),
		...(rejections.length ? [unavailableServersSection(rejections)] : []),
	].join("\n\n")
