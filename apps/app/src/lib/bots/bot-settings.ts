import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import {
	BLANK_BOT_PERMISSIONS,
	BLOT_TINTS,
	type BotModelOption,
	type BotSettingsValue,
	DEFAULT_BOT_OUTPUT_STYLE,
	readBotPermissionMode,
} from "@workspace/ui/components/bot-settings"
import type { CompanionSummary } from "@workspace/ui/components/space-settings-dialog/companions-section"

import { rosterTimestamp } from "./roster-timestamp"

import { avatarSrc } from "../host"
import type {
	CompanionCounts,
	BotPermissions as HostBotPermissions,
	OfferedModel_Serialize,
} from "@/lib/bindings"
import type { SidebarActivity } from "../chat/screen-model"
import type {
	AvatarBlot,
	Bot,
	BotIdentity,
} from "../conversations/store-contract"
import type { LastWord } from "../conversations/transcript-state"

export const FALLBACK_MODELS = ["opus", "fable", "sonnet", "haiku"]

const NEW_BOT_MODEL = "opus"

const UNRUNNABLE_MODEL = "default"

export const CHANGING_TOOLS = ["Bash", "Edit", "NotebookEdit", "Write"]

const withoutChangingTools = (denied: string[]): string[] =>
	denied.filter((tool) => !CHANGING_TOOLS.includes(tool))

export const deniesChanges = (denied: string[]): boolean =>
	CHANGING_TOOLS.every((tool) => denied.includes(tool))

const withNoEffort = (value: string): OfferedModel_Serialize => ({
	value,
	supportedEffortLevels: [],
})

export const modelOptionsFor = (
	model: string,
	catalogue: OfferedModel_Serialize[],
): BotModelOption[] => {
	const read = catalogue.filter(({ value }) => value !== UNRUNNABLE_MODEL)
	const offered = read.length > 0 ? read : FALLBACK_MODELS.map(withNoEffort)
	const isOffered =
		offered.some(({ value }) => value === model) || model === UNRUNNABLE_MODEL
	const models = isOffered ? offered : [...offered, withNoEffort(model)]
	return models.map(({ value, supportedEffortLevels }) => ({
		label: value,
		value,
		supportedEfforts: supportedEffortLevels,
	}))
}

export const BOT_NAMES = [
	"Bean",
	"Biscuit",
	"Bramble",
	"Bubble",
	"Buttons",
	"Clover",
	"Cricket",
	"Dimple",
	"Doodle",
	"Ember",
	"Fern",
	"Fig",
	"Fizz",
	"Gizmo",
	"Honey",
	"Jelly",
	"Kiwi",
	"Mango",
	"Marble",
	"Mittens",
	"Mochi",
	"Muffin",
	"Nimbus",
	"Noodle",
	"Nugget",
	"Olive",
	"Peanut",
	"Pebble",
	"Pickle",
	"Pip",
	"Plum",
	"Poppy",
	"Sprout",
	"Toast",
	"Twig",
	"Waffle",
] as const

const nextBlot = (bots: Bot[]): AvatarBlot => {
	const marked = new Set(bots.map((bot) => bot.avatarBlot))
	return (
		BLOT_TINTS.find((tint) => !marked.has(tint)) ??
		BLOT_TINTS[bots.length % BLOT_TINTS.length]
	)
}

const nextName = (bots: Bot[]): string => {
	const carried = new Set(bots.map((bot) => bot.name))
	const free = BOT_NAMES.filter((name) => !carried.has(name))
	const pool = free.length > 0 ? free : BOT_NAMES
	return pool[Math.floor(Math.random() * pool.length)]
}

export const newBotIdentity = (bots: Bot[]): BotIdentity => ({
	name: nextName(bots),
	title: "",
	model: NEW_BOT_MODEL,
	avatarBlot: nextBlot(bots),
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
})

export const toSettingsValue = (bot: Bot): BotSettingsValue => ({
	identity: {
		blot: bot.avatarBlot ?? undefined,
		image: avatarSrc(bot.avatarImagePath),
	},
	name: bot.name,
	title: bot.title,
	instructions: bot.instructions,
	model: bot.model,
	effort: bot.effort,
	permissions: {
		...bot.permissions,
		defaultMode: readBotPermissionMode(bot.permissions.defaultMode),
	},
})

export const toCompanionSummary = (
	bot: Bot,
	counts: CompanionCounts | undefined,
): CompanionSummary => ({
	id: bot.id,
	name: bot.name,
	blot: bot.avatarBlot ?? undefined,
	seed: bot.id,
	image: avatarSrc(bot.avatarImagePath),
	title: bot.title,
	instructions: bot.instructions,
	permissionMode: readBotPermissionMode(bot.permissions.defaultMode),
	skillsCount: counts?.skillsCount,
	applicationsCount: counts?.applicationsCount,
})

export const toIdentity = (
	value: BotSettingsValue,
	bot: Bot,
): Pick<Bot, keyof BotIdentity> => ({
	name: value.name,
	title: value.title,
	model: value.model,
	avatarBlot: value.identity.blot ?? null,
	avatarImagePath: value.identity.image ? bot.avatarImagePath : null,
	instructions: value.instructions,
	deniedTools: withoutChangingTools(bot.deniedTools),
	permissions: value.permissions,
	outputStyle: bot.outputStyle,
	effort: value.effort,
})

const listOf = (items: string[]): string => [...items].sort().join(",")

const permissionsOf = (permissions: HostBotPermissions): string =>
	[
		permissions.defaultMode,
		listOf(permissions.allow),
		listOf(permissions.ask),
		listOf(permissions.deny),
	].join("|")

export const changesRuntime = (bot: Bot, value: BotSettingsValue): boolean => {
	const next = toIdentity(value, bot)
	return (
		next.instructions !== bot.instructions ||
		next.model !== bot.model ||
		next.effort !== bot.effort ||
		listOf(next.deniedTools) !== listOf(bot.deniedTools) ||
		permissionsOf(next.permissions) !== permissionsOf(bot.permissions)
	)
}

export type RosterActivity = {
	working: Record<string, SidebarActivity>
	previews: Record<string, LastWord | undefined>
}

const lastSpokeAt = (bot: Bot, activity: RosterActivity): number =>
	activity.previews[bot.id]?.at ?? bot.createdAt

const mostRecentFirst = (bots: Bot[], activity: RosterActivity): Bot[] =>
	bots.toSorted(
		(one, other) => lastSpokeAt(other, activity) - lastSpokeAt(one, activity),
	)

export const toRosterBots = (
	bots: Bot[],
	activity: RosterActivity,
	now: number,
): AppSidebarBot[] =>
	mostRecentFirst(bots, activity).map((bot) => {
		const working = activity.working[bot.id]
		const preview = activity.previews[bot.id]
		return {
			id: bot.id,
			name: bot.name,
			sectionId: bot.sectionId,
			pinPosition: bot.pinPosition,
			title: bot.title || undefined,
			blot: bot.avatarBlot ?? undefined,
			image: avatarSrc(bot.avatarImagePath),
			lastMessage: preview?.text,
			timestamp: preview ? rosterTimestamp(preview.at, now) : undefined,
			lastActivityAt: lastSpokeAt(bot, activity),
			status: working?.isWorking ? "working" : "idle",
			pose: working?.kind,
		}
	})
