import { createContext, useContext } from "react"

import type { WorkspaceAssembly } from "./use-workspace-assembly"

export const WorkspaceContext = createContext<WorkspaceAssembly | null>(null)

export const useWorkspace = () => {
	const workspace = useContext(WorkspaceContext)
	if (!workspace) {
		throw new Error("useWorkspace is read outside the workspace layout")
	}
	return workspace
}
