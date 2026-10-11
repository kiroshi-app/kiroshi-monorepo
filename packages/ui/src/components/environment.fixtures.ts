import type { EnvironmentEntry } from "@workspace/ui/components/environment-panel"

export const SPACE_ENVIRONMENT: EnvironmentEntry[] = [
	{ name: "ATLAS_TOKEN", definedIn: "space", servedFrom: "space" },
	{ name: "ATLAS_REGION", definedIn: "space", servedFrom: "bot" },
	{ name: "LEDGER_KEY", definedIn: "space", servedFrom: "server" },
]

export const BOT_ENVIRONMENT: EnvironmentEntry[] = [
	{ name: "ATLAS_TOKEN", definedIn: "space", servedFrom: "space" },
	{
		name: "ATLAS_REGION",
		definedIn: "bot",
		servedFrom: "bot",
		overrides: "space",
	},
	{ name: "BOT_SEED", definedIn: "bot", servedFrom: "bot" },
	{ name: "LEDGER_KEY", definedIn: "bot", servedFrom: "server" },
]

export const SERVER_ENVIRONMENT: EnvironmentEntry[] = [
	{ name: "ATLAS_TOKEN", definedIn: "space", servedFrom: "space" },
	{
		name: "LEDGER_KEY",
		definedIn: "server",
		servedFrom: "server",
		overrides: "bot",
	},
	{ name: "SERVER_TIMEOUT_MS", definedIn: "server", servedFrom: "server" },
]

export const LONG_ENVIRONMENT_ENTRY: EnvironmentEntry = {
	name: "NIGHTLY_INGESTION_PIPELINE_INSPECTOR_DEAD_LETTER_QUEUE_URL",
	definedIn: "bot",
	servedFrom: "server",
}

export const UNSET_NEEDS_VALUE_ENTRY: EnvironmentEntry = {
	name: "NIGHTLY_INGESTION_PIPELINE_INSPECTOR_DEAD_LETTER_QUEUE_TOKEN",
	definedIn: "bot",
	servedFrom: "bot",
	isUnset: true,
}

export const UNSET_SERVED_ELSEWHERE_ENTRY: EnvironmentEntry = {
	name: "MAILER_API_KEY",
	definedIn: "bot",
	servedFrom: "space",
	isUnset: true,
}
