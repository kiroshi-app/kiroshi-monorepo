use serde::Deserialize;

const GIGABYTE: f64 = 1024.0 * 1024.0 * 1024.0;

const HEADER: &str = "-- Specs";

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Specs {
	pub app_version: String,
	git_commit: String,
	install_kind: String,
	os_name: String,
	os_build: String,
	arch: String,
	ram_bytes: Option<u64>,
	agent_version: Option<String>,
	provider: Option<String>,
	side: String,
	plan: Option<String>,
}

fn on_one_line(text: &str) -> String {
	text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn ram_of(bytes: Option<u64>) -> Option<String> {
	bytes.map(|bytes| format!("{} GB", (bytes as f64 / GIGABYTE).round()))
}

pub fn specs_text(specs: &Specs) -> String {
	let fields = [
		("App version", Some(specs.app_version.clone())),
		("Commit", Some(specs.git_commit.clone())),
		("Install", Some(specs.install_kind.clone())),
		("OS", Some(specs.os_name.clone())),
		("OS build", Some(specs.os_build.clone())),
		("Arch", Some(specs.arch.clone())),
		("RAM", ram_of(specs.ram_bytes)),
		("Agent version", specs.agent_version.clone()),
		("Provider", specs.provider.clone()),
		("Side", Some(specs.side.clone())),
		("Plan", specs.plan.clone()),
	];
	let lines: Vec<String> = fields
		.into_iter()
		.filter_map(|(label, value)| {
			let value = on_one_line(&value?);
			(!value.is_empty()).then(|| format!("{label}: {value}"))
		})
		.collect();
	if lines.is_empty() {
		return String::new();
	}
	std::iter::once(HEADER.to_owned()).chain(lines).collect::<Vec<_>>().join("\n")
}
