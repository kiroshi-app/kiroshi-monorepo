"use client"

import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"

type DiagnosticsFieldsProps = {
	onDiagnosticsCopy: () => void
	onLogReveal: () => void
	onLogClear: () => void | Promise<void>
	className?: string
}

const DiagnosticsFields = ({
	onDiagnosticsCopy,
	onLogReveal,
	onLogClear,
	className,
}: DiagnosticsFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div className={className} data-slot="diagnostics-fields">
			<SettingsGroup grid="gap-4" label={t("diagnostics.label")}>
				<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
					{t("diagnostics.description")}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button onClick={onDiagnosticsCopy} size="sm" variant="outline">
						{t("diagnostics.copy")}
					</Button>
					<Button onClick={onLogReveal} size="sm" variant="outline">
						{t("diagnostics.reveal")}
					</Button>
					<ConfirmDialog
						confirmLabel={t("diagnostics.clear.action")}
						description={t("diagnostics.clear.description")}
						failureLabel={t("diagnostics.clear.failed")}
						onConfirm={onLogClear}
						title={t("diagnostics.clear.title")}
						trigger={t("diagnostics.clear.action")}
						triggerClassName={buttonVariants({
							size: "sm",
							variant: "outline",
						})}
					/>
				</div>
			</SettingsGroup>
		</div>
	)
}

export { DiagnosticsFields, type DiagnosticsFieldsProps }
