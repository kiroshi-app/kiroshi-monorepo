import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BRAND_NAME } from "@workspace/ui/components/app-icon-mark"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"

const BOOT_MARK_SIZE = 96

type AppBootScreenProps = Omit<ComponentProps<"div">, "children">

function AppBootScreen(props: AppBootScreenProps) {
	const { t } = useTranslation("common")
	const prefersReducedMotion = usePrefersReducedMotion()
	const status = t("boot.status")

	return (
		<FullWindowLayout data-slot="app-boot-screen" {...props}>
			<FullWindowContent>
				<DitheredFieldAvatar
					hasGround={false}
					ink="foreground"
					name={BRAND_NAME}
					size={BOOT_MARK_SIZE}
					state="thinking"
				/>
				{prefersReducedMotion ? (
					<p className="mt-6 text-muted-foreground text-sm" role="status">
						{status}
					</p>
				) : (
					<span className="sr-only" role="status">
						{status}
					</span>
				)}
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export { AppBootScreen, BOOT_MARK_SIZE }
