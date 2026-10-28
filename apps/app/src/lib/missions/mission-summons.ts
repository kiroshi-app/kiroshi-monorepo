import type { MissionState } from "./mission-contract"

export type SummonedMissionState = Extract<
	MissionState,
	"working" | "waiting_bot"
>

const SUMMONS_OF = {
	working: "Carry out this mission.",
	waiting_bot:
		"The coding session of this mission is blocked and waiting on you.",
} as const satisfies Record<SummonedMissionState, string>

const LEGACY_SUMMONS_OF = new Map<string, SummonedMissionState>([
	[
		"The coding agent of this mission is blocked and waiting on you.",
		"waiting_bot",
	],
])

const SUMMONED_STATES = Object.keys(SUMMONS_OF) as SummonedMissionState[]

export const summonedStateOfText = (
	text: string,
): SummonedMissionState | undefined =>
	SUMMONED_STATES.find((state) => SUMMONS_OF[state] === text) ??
	LEGACY_SUMMONS_OF.get(text)

export const isSummonedMissionState = (
	state: MissionState,
): state is SummonedMissionState => state in SUMMONS_OF

export const missionSummonsFor = (state: SummonedMissionState): string =>
	SUMMONS_OF[state]
