import { describe, expect, it } from "vitest"

import { LOCAL_COMMANDS } from "./joined-hosts-invoke"

import committed from "../../../contracts/host-only-commands.json?raw"

const APP_SOURCES: string[] = Object.values(
	import.meta.glob<string>(
		["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}", "!../bindings.ts"],
		{ query: "?raw", import: "default", eager: true },
	),
)

type HostOnlyCommand = {
	command: string
	screen?: string
}

const hostOnlyCommands: HostOnlyCommand[] = JSON.parse(committed)

const sendsToAJoinedHost = (command: string): boolean =>
	!LOCAL_COMMANDS.has(command) &&
	APP_SOURCES.some((source) => source.includes(`"${command}"`))

const misplacedSend = ({ command, screen }: HostOnlyCommand): string[] => {
	const isSent = sendsToAJoinedHost(command)
	if (isSent && screen === undefined) {
		return [
			`${command} is host-only but the app sends it to a joined host: keep it in LOCAL_COMMANDS, or list it with its host-only screen in apps/app/contracts/host-only-commands.json and HOST_ONLY_SCREENS`,
		]
	}
	if (!isSent && screen !== undefined) {
		return [
			`${command} is listed with the ${screen} screen but the app no longer sends it to a joined host: drop its screen from apps/app/contracts/host-only-commands.json and HOST_ONLY_SCREENS`,
		]
	}
	return []
}

describe("the host-only commands the app sends to a joined host", () => {
	it("tells a command kept on this Mac from one sent to a joined host", () => {
		expect(sendsToAJoinedHost("space_list")).toBe(false)
		expect(sendsToAJoinedHost("conversation_local_ids")).toBe(false)
		expect(sendsToAJoinedHost("a_command_no_screen_names")).toBe(false)
		expect(sendsToAJoinedHost("conversation_today_of_agent")).toBe(true)
	})

	it("sends a host-only command to a joined host only from its host-only screen", () => {
		const misplaced = hostOnlyCommands.flatMap(misplacedSend)

		expect(misplaced, misplaced.join("\n")).toEqual([])
	})
})
