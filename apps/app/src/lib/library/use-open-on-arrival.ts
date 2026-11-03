import { useState } from "react"

type ArrivingItem = { id: string }

type Arrival<Item extends ArrivingItem> = {
	name: string | undefined
	items: Item[]
	isListing: boolean
	open: (item: Item) => void
}

export const useOpenOnArrival = <Item extends ArrivingItem>({
	name,
	items,
	isListing,
	open,
}: Arrival<Item>) => {
	const [arrival, setArrival] = useState(name)
	if (arrival === undefined || isListing) {
		return
	}
	setArrival(undefined)
	const arrived = items.find((item) => item.id === arrival)
	if (arrived) {
		open(arrived)
	}
}
