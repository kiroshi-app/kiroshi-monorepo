import { RouterProvider } from "@tanstack/react-router"
import { useState } from "react"

import { createWorkspaceRouter } from "@/workspace-router"

export function App() {
	const [router] = useState(createWorkspaceRouter)
	return <RouterProvider router={router} />
}
