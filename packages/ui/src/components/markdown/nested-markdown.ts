import { type ComponentType, createContext } from "react"

type NestedMarkdownProps = {
	children: string
}

export const NestedMarkdownContext =
	createContext<ComponentType<NestedMarkdownProps> | null>(null)
