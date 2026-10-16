import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Application,
	ApplicationPort,
	InstallField,
} from "./application-port"

import { describeFailure } from "../failure-report"
import {
	declaredServers,
	declareServer,
	undeclareServer,
} from "../bots/mcp-server-writes"
import type { EnvOwner, EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type InstallTarget = {
	owner: EnvOwner
	declared: string[]
	connect: (name: string, url: string) => Promise<void>
	settle: () => Promise<void>
}

const isRecord = (reason: unknown): reason is Record<string, unknown> =>
	typeof reason === "object" && reason !== null

const refusalTextOf = (reason: unknown): string => {
	if (reason instanceof Error) {
		return reason.message
	}
	if (typeof reason === "string") {
		return reason
	}
	if (isRecord(reason) && typeof reason.kind === "string") {
		return typeof reason.detail === "string"
			? `${reason.kind}: ${reason.detail}`
			: reason.kind
	}
	return describeFailure(reason)
}

export const serverScopeOf = (owner: EnvOwner, name: string): EnvScope => ({
	kind: "server",
	name,
	owner,
})

export type InstallValues = Record<string, string>

type TypedValue = { field: InstallField; value: string }

const typedValuesOf = (
	install: Application["install"],
	values: InstallValues,
): TypedValue[] =>
	install.kind === "key"
		? install.fields.map((field) => ({
				field,
				value: values[field.name] ?? "",
			}))
		: []

const urlOf = (application: Application) =>
	readMcpServerLaunch(application.config).url ?? ""

export type InstallRun = {
	application: Application
	target: InstallTarget
	values: InstallValues
}

export type InstallDependencies = {
	port: ApplicationPort
	store: TranscriptStore
	reportFailure: (notice: NoticeMessage) => void
}

export const installFailureOf = (reason: unknown) =>
	i18n.t("bots:applications.install.failed", {
		reason: refusalTextOf(reason),
	})

const refusalOf = async (step: () => Promise<void>) => {
	try {
		await step()
		return null
	} catch (refusal) {
		return refusal
	}
}

const deleteWrittenSecrets = async (
	store: TranscriptStore,
	owner: EnvOwner,
	name: string,
) => {
	const scope = serverScopeOf(owner, name)
	const written = await store.environmentVariables(scope)
	for (const entry of written) {
		if (entry.definedIn.kind === "server") {
			await store.deleteEnvironmentVariable(scope, entry.name)
		}
	}
}

const rollBackDeclaration = async (
	{ store, reportFailure }: InstallDependencies,
	owner: EnvOwner,
	name: string,
) => {
	const secretsRefusal = await refusalOf(() =>
		deleteWrittenSecrets(store, owner, name),
	)
	const undeclareRefusal = await refusalOf(() =>
		undeclareServer(store, owner, name),
	)
	const refusal = undeclareRefusal ?? secretsRefusal
	if (!refusal) {
		return
	}
	reportFailure({
		title: i18n.t("bots:applications.install.rollback.title", { name }),
		description: i18n.t("bots:applications.install.rollback.description", {
			reason: refusalTextOf(refusal),
		}),
	})
}

const writeKeys = async (
	store: TranscriptStore,
	owner: EnvOwner,
	name: string,
	asked: TypedValue[],
) => {
	const scope = serverScopeOf(owner, name)
	for (const { field, value } of asked) {
		await store.setEnvironmentVariable(scope, field.secret, value)
	}
}

const isDeclaredUnder = async (
	store: TranscriptStore,
	owner: EnvOwner,
	name: string,
) => {
	const held = await declaredServers(store, owner)
	return held.some((server) => server.name === name)
}

const askedValuesOf = (application: Application, values: InstallValues) => {
	if (application.install.kind === "refused") {
		throw new Error(application.install.reason)
	}
	const asked = typedValuesOf(application.install, values)
	const unfilled = asked.filter((held) => held.value.trim() === "")
	if (unfilled.length > 0) {
		throw new Error(
			i18n.t("bots:applications.install.missing", {
				fields: unfilled.map((held) => held.field.name).join(", "),
			}),
		)
	}
	return asked
}

export const runInstall = async (
	dependencies: InstallDependencies,
	{ application, target, values }: InstallRun,
) => {
	const { port, store } = dependencies
	const asked = askedValuesOf(application, values)
	const unrunnable = await port.runnable(application.config)
	if (unrunnable) {
		throw new Error(unrunnable.reason)
	}
	const { owner } = target
	const wasDeclared = await isDeclaredUnder(store, owner, application.name)
	await declareServer(store, owner, application.name, application.config, {
		title: application.title,
		logo: application.logo,
		logoUrl: application.logoUrl,
	})
	const orRollBack = async (step: () => Promise<void>) => {
		try {
			await step()
		} catch (refusal) {
			if (!wasDeclared) {
				await rollBackDeclaration(dependencies, owner, application.name)
			}
			throw refusal
		}
	}
	await orRollBack(() => writeKeys(store, owner, application.name, asked))
	if (application.install.kind === "oauth") {
		await orRollBack(() => target.connect(application.name, urlOf(application)))
	}
}
