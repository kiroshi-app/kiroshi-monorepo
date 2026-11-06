use serde::de::DeserializeOwned;
use serde_json::json;

use crate::host::{Host, Profile};
use crate::model::{ClaudeAccountReport, ClaudeInventory, ClaudeItem, KiroshiAccountState};

pub struct ClaudeLogin {
	pub email: String,
	pub plan: String,
}

pub struct ImportChoices {
	pub agents: Vec<ClaudeItem>,
	pub claude_md: Option<ClaudeItem>,
	pub skills: Vec<ClaudeItem>,
}

pub struct KiroshiSignIn {
	pub email: String,
	pub plan: Option<String>,
}

#[derive(Default)]
pub struct DevProfile {
	pub claude: Option<ClaudeLogin>,
	pub import: Option<ImportChoices>,
	pub kiroshi: Option<KiroshiSignIn>,
}

pub fn read() -> DevProfile {
	let host = match Host::connect(Profile::Dev) {
		Ok(host) => host,
		Err(failure) => {
			eprintln!("onboarding reads nothing from Kiroshi Dev: {}", failure.title());
			return DevProfile::default();
		}
	};
	DevProfile {
		claude: read_or_log(&host, "agent_account").and_then(claude_login),
		import: read_or_log(&host, "claude_import_inventory").and_then(import_choices),
		kiroshi: read_or_log(&host, "account_state").and_then(kiroshi_sign_in),
	}
}

fn read_or_log<T: DeserializeOwned>(host: &Host, command: &str) -> Option<T> {
	host.invoke(command, json!({}))
		.map_err(|failure| eprintln!("onboarding couldn't read {command}: {}", failure.detail()))
		.ok()
}

fn claude_login(report: ClaudeAccountReport) -> Option<ClaudeLogin> {
	let account = report.account.filter(|_| report.authenticated)?;
	Some(ClaudeLogin { email: account.email?, plan: account.plan? })
}

fn import_choices(inventory: ClaudeInventory) -> Option<ImportChoices> {
	let ClaudeInventory::Found { agents, skills, claude_md } = inventory else { return None };
	let choices = ImportChoices { agents, claude_md, skills };
	(!choices.is_empty()).then_some(choices)
}

fn kiroshi_sign_in(state: KiroshiAccountState) -> Option<KiroshiSignIn> {
	match state {
		KiroshiAccountState::SignedIn { email, plan } => Some(KiroshiSignIn { email, plan }),
		KiroshiAccountState::SignedOut => None,
	}
}

impl ImportChoices {
	pub fn is_empty(&self) -> bool {
		self.agents.is_empty() && self.claude_md.is_none() && self.skills.is_empty()
	}

	pub fn keys(&self) -> Vec<String> {
		let rows = self.agents.iter().chain(&self.claude_md).chain(&self.skills);
		rows.filter(|item| !item.already_imported).map(|item| item.key.clone()).collect()
	}
}
