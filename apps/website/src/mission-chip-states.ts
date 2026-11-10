import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import type { MissionState } from "@workspace/ui/components/mission"

export const CHIP_STATE_OF: Partial<Record<MissionState, BotMissionState>> = {
	waiting_human: "waiting",
	failed: "failed",
	ready_to_merge: "ready",
	working: "working",
	waiting_bot: "working",
}
