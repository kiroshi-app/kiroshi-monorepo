import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import {
	type EvolutionSourceOptions,
	startEvolutionSource,
} from "./evolution-source"

import { pluginQueryKeys } from "../plugins/plugin-query-keys"

type EvolutionOptions = Pick<EvolutionSourceOptions, "driver" | "roster">

export const useEvolution = ({ driver, roster }: EvolutionOptions) => {
	const queryClient = useQueryClient()

	useEffect(
		() =>
			startEvolutionSource({
				driver,
				roster,
				rereadPlugin: (scope) => {
					void queryClient.invalidateQueries({
						queryKey: pluginQueryKeys.scope(scope),
					})
				},
			}),
		[driver, roster, queryClient],
	)
}
