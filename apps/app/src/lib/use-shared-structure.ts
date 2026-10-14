import { replaceEqualDeep } from "@tanstack/react-query"
import { useState } from "react"

const createSharer = <Value>() => {
	let held: Value | undefined
	return (next: Value): Value => {
		held = replaceEqualDeep(held, next)
		return held
	}
}

export const useSharedStructure = <Value>(next: Value): Value => {
	const [share] = useState(createSharer<Value>)
	return share(next)
}
