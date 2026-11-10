import { useState } from "react"

import type { BotModelOption } from "@workspace/ui/components/bot-settings"

import { modelOptionsFor } from "./bot-settings"

import type { OfferedModel_Serialize } from "@/lib/bindings"
import type { Bot } from "../conversations/store-contract"

type OpenedModel = Pick<Bot, "id" | "model">

const openedModelOf = ({ id, model }: Bot): OpenedModel => ({ id, model })

export const useModelOptions = (
	bot: Bot | undefined,
	catalogue: OfferedModel_Serialize[],
): BotModelOption[] => {
	const [opened, setOpened] = useState<OpenedModel | null>(null)
	if (bot && opened?.id !== bot.id) {
		setOpened(openedModelOf(bot))
	}
	const openedModel = opened?.id === bot?.id ? opened?.model : bot?.model
	return modelOptionsFor(openedModel ?? "", catalogue)
}
