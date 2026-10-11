"use client"

import { type FormEvent, type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { Badge } from "@workspace/ui/components/ui/badge"
import { Button } from "@workspace/ui/components/ui/button"

type AccountPlan = "free" | "pro"

type AccountState =
	| { status: "signedOut" }
	| { status: "waiting" }
	| {
			status: "signedIn"
			name: string
			email: string
			plan: AccountPlan | null
	  }

type AccountPanelProps = {
	account: AccountState
	onSignIn: (email: string) => void
	onCancel: () => void
	onSignOut: () => void
}

const CAPTION_CLASS = "text-muted-foreground text-xs"

type AccountIntroProps = {
	title: string
	body: string
}

const AccountIntro = ({ title, body }: AccountIntroProps) => (
	<div className="flex max-w-120 flex-col gap-1">
		<h3 className="font-semibold text-foreground text-sm">{title}</h3>
		<p className="text-muted-foreground text-sm">{body}</p>
	</div>
)

type AccountRowProps = {
	label: string
	value: ReactNode
}

const AccountRow = ({ label, value }: AccountRowProps) => (
	<div className="flex items-start justify-between gap-4 px-3.5 py-3">
		<dt className="shrink-0 text-muted-foreground">{label}</dt>
		<dd className="min-w-0 wrap-break-word text-end text-foreground">
			{value}
		</dd>
	</div>
)

const AccountPanel = ({
	account,
	onSignIn,
	onCancel,
	onSignOut,
}: AccountPanelProps) => {
	const { t } = useTranslation("settings")
	const [email, setEmail] = useState("")

	if (account.status === "signedIn") {
		return (
			<div className="flex flex-col gap-5">
				<AccountIntro
					body={t("account.signedIn.body")}
					title={t("account.signedIn.title")}
				/>
				<dl className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
					<AccountRow label={t("account.signedIn.name")} value={account.name} />
					<AccountRow
						label={t("account.signedIn.email")}
						value={account.email}
					/>
					{account.plan ? (
						<AccountRow
							label={t("account.signedIn.plan.label")}
							value={
								<span className="flex items-center justify-end gap-2">
									{account.plan === "pro" ? (
										<Badge variant="secondary">
											{t("account.signedIn.plan.beta")}
										</Badge>
									) : null}
									{t(`account.signedIn.plan.${account.plan}`)}
								</span>
							}
						/>
					) : null}
				</dl>
				<div className="flex flex-col items-start gap-2">
					<Button onClick={onSignOut} variant="outline">
						{t("account.signedIn.signOut")}
					</Button>
					<p className={CAPTION_CLASS}>{t("account.signedIn.caption")}</p>
				</div>
			</div>
		)
	}

	const isWaiting = account.status === "waiting"

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const address = email.trim()
		if (address && event.currentTarget.checkValidity()) onSignIn(address)
	}

	return (
		<form className="flex flex-col gap-5" noValidate onSubmit={submit}>
			<AccountIntro
				body={t("account.signedOut.body")}
				title={t("account.signedOut.title")}
			/>
			{isWaiting ? null : (
				<div className="max-w-120">
					<SettingsField
						kind="email"
						label={t("account.signedOut.email")}
						onValueChange={setEmail}
						value={email}
					/>
				</div>
			)}
			<div className="flex flex-col items-start gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						className="px-3.5 data-disabled:pointer-events-none data-disabled:opacity-60"
						disabled={isWaiting}
						focusableWhenDisabled
						size="lg"
						type={isWaiting ? "button" : "submit"}
					>
						{isWaiting ? (
							<>
								<Icons.Loading
									aria-hidden="true"
									className="size-3.5 animate-spin motion-reduce:animate-none"
								/>
								{t("account.waiting.label")}
							</>
						) : (
							<>
								{t("account.signedOut.signIn")}
								<Icons.ExternalLink aria-hidden="true" className="size-3.5" />
							</>
						)}
					</Button>
					{isWaiting ? (
						<Button onClick={onCancel} size="lg" variant="outline">
							{t("account.waiting.cancel")}
						</Button>
					) : null}
				</div>
				{isWaiting ? (
					<p className={CAPTION_CLASS}>{t("account.waiting.caption")}</p>
				) : null}
			</div>
		</form>
	)
}

export { AccountPanel, type AccountPanelProps, type AccountState }
