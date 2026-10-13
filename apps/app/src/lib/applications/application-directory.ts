import type { Application, ApplicationPort } from "./application-port"

export type ApplicationDirectory = {
	applications: Application[]
	isStale: boolean
	hasPartlyFailed: boolean
}

const holdsRows = (held: ApplicationDirectory | undefined) =>
	held !== undefined && held.applications.length > 0

export const readDirectory = async (
	port: ApplicationPort,
	held: ApplicationDirectory | undefined,
	reportUnrefreshed: () => void,
): Promise<ApplicationDirectory> => {
	try {
		const found = await port.search("")
		const hasPartlyFailed = found.registryFailure !== undefined
		if (hasPartlyFailed) reportUnrefreshed()
		if (hasPartlyFailed && held && holdsRows(held)) {
			return { ...held, hasPartlyFailed }
		}
		return {
			applications: found.applications,
			isStale: found.isStale === true,
			hasPartlyFailed,
		}
	} catch (reason) {
		if (!held || !holdsRows(held)) throw reason
		reportUnrefreshed()
		return held
	}
}
