import type { FailureSpecs } from "@workspace/ui/components/notice-surface"

import { commands, type Diagnostics } from "./bindings"
import { scrubFailureText } from "./failure-text-scrubber"

const GIGABYTE = 1024 ** 3

const ramOf = (bytes: number | null) =>
	bytes === null ? undefined : `${Math.round(bytes / GIGABYTE)} GB`

const specsOf = (diagnostics: Diagnostics): FailureSpecs => ({
	appVersion: diagnostics.appVersion,
	commit: diagnostics.gitCommit,
	installKind: diagnostics.installKind,
	os: diagnostics.osName,
	osBuild: diagnostics.osBuild,
	arch: diagnostics.arch,
	ram: ramOf(diagnostics.ramBytes),
	agentVersion: diagnostics.agentVersion ?? undefined,
	provider: diagnostics.provider
		? scrubFailureText(diagnostics.provider)
		: undefined,
	side: diagnostics.side,
	plan: diagnostics.plan ?? undefined,
})

export const readFailureSpecs = async (): Promise<FailureSpecs> =>
	specsOf(await commands.diagnostics())
