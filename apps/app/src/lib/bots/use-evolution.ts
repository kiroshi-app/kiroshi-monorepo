import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import {
	type EvolutionSourceOptions,
	startEvolutionSource,
} from "./evolution-source"

import { failureReporterIn } from "../failure-report"
import { pluginQueryKeys } from "../plugins/plugin-query-keys"

type EvolutionOptions = Pick<EvolutionSourceOptions, "driver" | "roster"> & {
	isDriverWindow: boolean
}

const leaveToDriverWindow = () => undefined

export const useEvolution = ({
	driver,
	roster,
	isDriverWindow,
}: EvolutionOptions) => {
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
				reportFailure: isDriverWindow
					? failureReporterIn("evolution-source")
					: leaveToDriverWindow,
			}),
		[driver, roster, queryClient, isDriverWindow],
	)
}
