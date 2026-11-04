import { createContext, useContext } from "react"

import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"

const MarkdownImageResolverContext = createContext<ResolveImage | undefined>(
	undefined,
)

const useMarkdownImageResolver = () => useContext(MarkdownImageResolverContext)

export { MarkdownImageResolverContext, useMarkdownImageResolver }
