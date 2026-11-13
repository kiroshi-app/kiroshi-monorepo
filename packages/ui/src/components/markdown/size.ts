import { createContext } from "react"

export type MarkdownSize = "chat" | "answer"

export const MarkdownSizeContext = createContext<MarkdownSize>("chat")
