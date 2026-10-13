import { useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { botQueryKeys } from "./bot-query-keys"
import { readModelCatalogue } from "./model-catalogue"

import type { OfferedModel_Serialize } from "@/lib/bindings"

type ModelCatalogue = {
	models: OfferedModel_Serialize[]
	hasFailedToLoad: boolean
}

const NO_MODELS: OfferedModel_Serialize[] = []

export const useModelCatalogue = (): ModelCatalogue => {
	const { data = NO_MODELS, isError } = useQuery({
		queryKey: botQueryKeys.modelCatalogue(),
		queryFn: readModelCatalogue,
		meta: {
			failureNotice: () => ({ title: i18n.t("bots:runtime.model.unreadable") }),
			raisedIn: "use-model-catalogue",
		},
	})

	return { models: isError ? NO_MODELS : data, hasFailedToLoad: isError }
}
