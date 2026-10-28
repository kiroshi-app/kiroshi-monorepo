"use client"

import { Tabs } from "@base-ui/react/tabs"
import { type ReactNode, useId, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"

import {
	MCP_ATTENTION_FIELD,
	MCP_CONNECTION_DOT,
	MCP_DESTRUCTIVE_SURFACE,
} from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	ApplicationMetaLine,
	ApplicationVerifiedPill,
} from "@workspace/ui/components/plugin-settings/application-identity"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import {
	type ApplicationSetup,
	type CatalogueApplication,
	CataloguePage,
	type CataloguePageProps,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"
import { Button } from "@workspace/ui/components/ui/button"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationRefusal = {
	field: string
	reason: string
}

type InstallableField = {
	name: string
	description?: string
	concealed: boolean
}

type InstallableApplication = CatalogueApplication & {
	packageIdentity: string
	tools?: string[]
	fields?: InstallableField[]
	refusal?: ApplicationRefusal
}

const OWNER_COPY_KEY = {
	companion: "agent",
	space: "space",
	profile: "profile",
} as const satisfies Record<ApplicationsOwner["kind"], string>

const ownerNameOf = (owner: ApplicationsOwner) =>
	owner.kind === "profile" ? "" : owner.name

type FactTone = "muted" | "attention" | "done"

const FACT_TONE = {
	muted: { glyph: "text-muted-foreground", sentence: "text-muted-foreground" },
	attention: { glyph: "text-bot-badge-attention", sentence: "text-foreground" },
	done: { glyph: "text-state-connected", sentence: "text-muted-foreground" },
} as const satisfies Record<FactTone, { glyph: string; sentence: string }>

type FactLineProps = {
	icon: Icon
	children: ReactNode
	tone?: FactTone
}

const FactLine = ({
	icon: LineIcon,
	children,
	tone = "muted",
}: FactLineProps) => (
	<p className="flex items-start gap-1.75" data-slot="application-fact">
		<LineIcon
			aria-hidden="true"
			className={cn("mt-0.5 size-3.75 shrink-0", FACT_TONE[tone].glyph)}
		/>
		<span
			className={cn(
				"min-w-0 wrap-break-word text-[13px]/4.5",
				FACT_TONE[tone].sentence,
			)}
		>
			{children}
		</span>
	</p>
)

type HostedFactsProps = {
	name: string
	host: string
	setup: ApplicationSetup
}

const HostedFacts = ({ name, host, setup }: HostedFactsProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			{setup === "signIn" ? (
				<FactLine icon={Icons.ExternalLink}>
					{t("applications.install.signIn.fact", { name })}
				</FactLine>
			) : null}
			<FactLine icon={Icons.Cloud} tone="attention">
				<Trans
					components={{ host: <span className="font-mono" /> }}
					i18nKey="applications.install.hosting"
					t={t}
					values={{ host }}
				/>
			</FactLine>
		</>
	)
}

type SignInNoticeProps = {
	name: string
}

const SignInNotice = ({ name }: SignInNoticeProps) => {
	const { t } = useTranslation("bots")

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-xl border p-3",
				MCP_ATTENTION_FIELD,
			)}
		>
			<span className="mt-px flex size-4 shrink-0 items-center justify-center">
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full",
						MCP_CONNECTION_DOT.needsAuthorization,
					)}
				/>
			</span>
			<div className="flex min-w-0 flex-col gap-0.75">
				<p className="wrap-break-word font-medium text-foreground text-sm/4.5">
					{t("applications.install.signIn.title", { name })}
				</p>
				<p className="wrap-break-word text-muted-foreground text-xs/[17px]">
					{t("applications.install.signIn.description")}
				</p>
			</div>
		</div>
	)
}

type KeyFieldProps = {
	field: InstallableField
	value: string
	onValueChange: (value: string) => void
}

const KeyField = ({ field, value, onValueChange }: KeyFieldProps) => {
	const { t } = useTranslation("bots")
	const [isRevealed, setRevealed] = useState(false)
	const inputId = useId()
	const descriptionId = useId()

	return (
		<div className="flex flex-col gap-1.5">
			<label
				className="wrap-break-word font-mono font-medium text-[13px]/4.5 text-foreground"
				htmlFor={inputId}
			>
				{field.name}
			</label>
			<div className="flex h-9 items-center gap-2 rounded-control border border-input bg-card ps-3 pe-1 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30">
				<input
					aria-describedby={field.description ? descriptionId : undefined}
					autoComplete="off"
					className="min-w-0 flex-1 bg-transparent font-mono text-[13px]/5 text-foreground outline-none"
					id={inputId}
					onChange={(event) => onValueChange(event.target.value)}
					spellCheck={false}
					type={field.concealed && !isRevealed ? "password" : "text"}
					value={value}
				/>
				{field.concealed ? (
					<Button
						aria-controls={inputId}
						aria-label={
							isRevealed
								? t("applications.install.key.concealLabel", {
										field: field.name,
									})
								: t("applications.install.key.revealLabel", {
										field: field.name,
									})
						}
						className="text-muted-foreground"
						onClick={() => setRevealed(!isRevealed)}
						size="xs"
						variant="ghost"
					>
						{isRevealed
							? t("applications.install.key.conceal")
							: t("applications.install.key.reveal")}
					</Button>
				) : null}
			</div>
			{field.description ? (
				<p
					className="wrap-break-word text-muted-foreground text-xs/4"
					id={descriptionId}
				>
					{field.description}
				</p>
			) : null}
		</div>
	)
}

type InstallValues = Record<string, string>

type KeyPanelProps = {
	name: string
	owner: ApplicationsOwner
	fields: InstallableField[]
	values: InstallValues
	onValueChange: (name: string, value: string) => void
}

const KeyPanel = ({
	name,
	owner,
	fields,
	values,
	onValueChange,
}: KeyPanelProps) => {
	const { t } = useTranslation("bots")
	const titleId = useId()

	return (
		<section
			aria-labelledby={titleId}
			className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-3.5"
		>
			<p
				className="wrap-break-word font-medium text-foreground text-sm/5"
				id={titleId}
			>
				{t("applications.install.key.title", { name })}
			</p>
			{fields.map((field) => (
				<KeyField
					field={field}
					key={field.name}
					onValueChange={(value) => onValueChange(field.name, value)}
					value={values[field.name] ?? ""}
				/>
			))}
			<p className="wrap-break-word text-muted-foreground text-xs/4">
				{t(
					`applications.install.key.description.${OWNER_COPY_KEY[owner.kind]}`,
					{
						name: ownerNameOf(owner),
					},
				)}
			</p>
		</section>
	)
}

type NothingToSetUpProps = {
	isHosted: boolean
}

const NothingToSetUp = ({ isHosted }: NothingToSetUpProps) => {
	const { t } = useTranslation("bots")

	return (
		<FactLine icon={Icons.Check} tone="done">
			{t(`applications.install.${isHosted ? "hostedNone" : "none"}`)}
		</FactLine>
	)
}

type RefusedNoticeProps = {
	name: string
	refusal?: ApplicationRefusal
}

const RefusedNotice = ({ name, refusal }: RefusedNoticeProps) => {
	const { t } = useTranslation("bots")

	return (
		<div
			className={cn(
				"flex items-start gap-2.5 rounded-xl border p-3.5",
				MCP_DESTRUCTIVE_SURFACE,
			)}
		>
			<Icons.Blocked
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0 text-destructive"
			/>
			<div className="flex min-w-0 flex-col gap-0.75">
				<p className="wrap-break-word font-medium text-foreground text-sm/5">
					{t("applications.install.unavailable.title", { name })}
				</p>
				{refusal ? (
					<p className="wrap-break-word text-[13px]/4.5 text-muted-foreground">
						{t("applications.install.unavailable.description", {
							reason: refusal.reason,
						})}
					</p>
				) : null}
			</div>
		</div>
	)
}

type ToolListProps = {
	tools: string[]
}

const ToolList = ({ tools }: ToolListProps) => {
	const { t } = useTranslation("bots")
	const headingId = useId()

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-2">
			<div className="flex flex-wrap items-baseline gap-x-2">
				<h4 className="font-medium text-foreground text-sm/4.5" id={headingId}>
					{t("applications.install.tools.title")}
				</h4>
				<p className="text-muted-foreground text-xs/4 tabular-nums">
					{t("applications.install.tools.count.plain", {
						count: tools.length,
					})}
				</p>
			</div>
			<ul className="flex list-none flex-wrap gap-1.5 p-0">
				{tools.map((tool) => (
					<li
						className="min-h-6 min-w-0 max-w-full wrap-break-word rounded-full bg-muted px-2.5 py-1 font-mono text-foreground text-xs/4"
						key={tool}
					>
						{tool}
					</li>
				))}
			</ul>
		</section>
	)
}

type InstallActionProps = {
	setup: InstallableApplication["setup"]
	isHosted: boolean
	isInstalling: boolean
	isInstalled: boolean
	onInstall: () => void
}

const InstallAction = ({
	setup,
	isHosted,
	isInstalling,
	isInstalled,
	onInstall,
}: InstallActionProps) => {
	const { t } = useTranslation("bots")
	const isUnavailable = isInstalling || isInstalled
	const isSignIn = setup === "signIn" && !isHosted

	const readGlyph = () => {
		if (isInstalled) return Icons.Check
		if (isInstalling) return Icons.Loading
		return isSignIn ? Icons.ExternalLink : null
	}

	const Glyph = readGlyph()

	const readLabel = () => {
		if (isInstalled) return t("applications.install.done")
		return isSignIn
			? t("applications.install.signIn.action")
			: t("applications.add")
	}

	return (
		<Button
			aria-busy={isInstalling}
			aria-disabled={isUnavailable}
			className="rounded-full pr-3.5 has-data-[icon=inline-start]:pl-3 aria-disabled:pointer-events-none aria-disabled:opacity-50"
			onClick={() => {
				if (!isUnavailable) onInstall()
			}}
		>
			{Glyph ? (
				<Glyph
					aria-hidden="true"
					className={cn(
						"size-3.5",
						Glyph === Icons.Loading &&
							"animate-spin motion-reduce:animate-none",
					)}
					data-icon="inline-start"
				/>
			) : null}
			{readLabel()}
		</Button>
	)
}

type ApplicationInstallPageProps = Omit<CataloguePageProps, "children"> & {
	application: InstallableApplication
	owner: ApplicationsOwner
	isInstalling?: boolean
	isInstalled?: boolean
	failure?: string
	onInstall: (values: InstallValues) => void
}

const ApplicationInstallPage = ({
	application,
	owner,
	isInstalling = false,
	isInstalled = false,
	failure,
	onInstall,
	...page
}: ApplicationInstallPageProps) => {
	const { category } = page
	const { t } = useTranslation("bots")
	const body = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(body)
	const [values, setValues] = useState<InstallValues>({})
	const isPackage = !application.description
	const { host, refusal } = application
	const fields = application.fields ?? []

	const typeInto = (name: string, value: string) => {
		setValues((held) => ({ ...held, [name]: value }))
	}

	const asked = () =>
		Object.fromEntries(
			fields.map((field) => [field.name, values[field.name] ?? ""]),
		)
	const isRefused = application.setup === "unavailable"
	const hostedSource =
		host === undefined ? undefined : (application.source ?? host)

	const footnote = () =>
		hostedSource === undefined
			? t(`applications.install.footnote.${OWNER_COPY_KEY[owner.kind]}`, {
					name: ownerNameOf(owner),
				})
			: t(`applications.install.hostedFootnote.${OWNER_COPY_KEY[owner.kind]}`, {
					name: ownerNameOf(owner),
					source: hostedSource,
				})

	const setupBlock = () => {
		if (application.setup === "apiKey") {
			return (
				<KeyPanel
					fields={fields}
					name={application.name}
					onValueChange={typeInto}
					owner={owner}
					values={values}
				/>
			)
		}

		if (application.setup === "none") {
			return <NothingToSetUp isHosted={host !== undefined} />
		}

		if (isRefused) {
			return <RefusedNotice name={application.name} refusal={refusal} />
		}

		return host === undefined ? <SignInNotice name={application.name} /> : null
	}

	return (
		<CataloguePage {...page}>
			<div className="@container flex min-h-0 min-w-0 flex-1">
				<div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] @sm:grid-cols-[minmax(0,1fr)_auto] @sm:grid-rows-[auto_minmax(0,1fr)]">
					<div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 px-5 py-3 @sm:border-border @sm:border-b">
						<ApplicationMark mark={application.mark} />
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<div className="flex min-w-0 items-center gap-1.5">
								<h3
									className={cn(
										"truncate font-medium text-foreground text-sm/4.5",
										isPackage && "font-mono text-[15px]/4.5",
									)}
									title={application.name}
								>
									{application.name}
								</h3>
								{application.isVerified ? <ApplicationVerifiedPill /> : null}
							</div>
							<p
								className={cn(
									"wrap-break-word text-muted-foreground text-xs/4",
									isPackage && "font-mono",
								)}
							>
								{application.description ?? application.packageIdentity}
							</p>
							<ApplicationMetaLine
								source={application.source}
								useCount={application.useCount}
							/>
						</div>
					</div>

					<Tabs.Panel
						className="col-span-full row-start-3 flex min-h-0 flex-col gap-4.5 overflow-y-auto p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @sm:row-start-2"
						ref={body}
						value={category}
					>
						<div className="flex flex-col gap-1.75">
							{setupBlock()}
							{host === undefined ? null : (
								<HostedFacts
									host={host}
									name={application.name}
									setup={application.setup}
								/>
							)}
						</div>
						{failure ? (
							<p
								className="wrap-break-word text-destructive text-xs/4"
								role="alert"
							>
								{failure}
							</p>
						) : null}
						{application.tools === undefined ? null : (
							<ToolList tools={application.tools} />
						)}
						<div className="mt-auto flex items-start gap-2 border-border border-t pt-3">
							<Icons.Shield
								aria-hidden="true"
								className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
							/>
							<p className="min-w-0 wrap-break-word text-muted-foreground text-xs/[17px]">
								{footnote()}
							</p>
						</div>
					</Tabs.Panel>

					{isRefused ? null : (
						<div className="col-start-1 row-start-2 flex items-center border-border border-b px-5 pb-3 @sm:col-start-2 @sm:row-start-1 @sm:ps-0 @sm:pt-3">
							<InstallAction
								isHosted={host !== undefined}
								isInstalled={isInstalled}
								isInstalling={isInstalling}
								onInstall={() => onInstall(asked())}
								setup={application.setup}
							/>
						</div>
					)}
				</div>
			</div>
		</CataloguePage>
	)
}

export {
	ApplicationInstallPage,
	type ApplicationInstallPageProps,
	type InstallableApplication,
}
