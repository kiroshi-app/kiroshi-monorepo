import { useEffect, useState } from "react"

type ArrivingItem = { id: string }

type Arrival<Item extends ArrivingItem> = {
	name: string | undefined
	items: Item[]
	isListing: boolean
	open: (item: Item) => void
	consume?: () => void
}

export const useOpenOnArrival = <Item extends ArrivingItem>({
	name,
	items,
	isListing,
	open,
	consume,
}: Arrival<Item>) => {
	const [arrival, setArrival] = useState<string>()
	if (name !== arrival && !isListing) {
		setArrival(name)
		const arrived = items.find((item) => item.id === name)
		if (arrived) {
			open(arrived)
		}
	}

	useEffect(() => {
		if (arrival !== undefined) {
			consume?.()
		}
	}, [arrival, consume])
}
