import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { createSiteRouter } from "./router"

const router = createSiteRouter()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<I18nProvider>
			<RouterProvider router={router} />
		</I18nProvider>
	</StrictMode>,
)
