"use client"

import { useState } from "react"

type Travel = "forward" | "back"

type Seen = {
	rank: number
	isWatching: boolean
	travel?: Travel
}

const travelBetween = (from: number, to: number): Travel | undefined => {
	if (to > from) return "forward"
	if (to < from) return "back"
	return undefined
}

const useTravel = (rank: number, isWatching = true) => {
	const [seen, setSeen] = useState<Seen>({ rank, isWatching })

	if (seen.rank === rank && seen.isWatching === isWatching) return seen.travel

	const travel =
		seen.isWatching && isWatching ? travelBetween(seen.rank, rank) : undefined
	setSeen({ rank, isWatching, travel })
	return travel
}

export { type Travel, useTravel }
