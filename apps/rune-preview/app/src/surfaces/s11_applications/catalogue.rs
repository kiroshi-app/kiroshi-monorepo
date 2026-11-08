use kiroshi_core::applications::contract::{Application, Install};
use kiroshi_rune_kit::surfaces::s11_applications::catalogue::Category;
use rune::TextEdit;

use super::calls::{Call, Concealed, Found, InstallFailure};
use super::{Reading, Which};
use crate::host::HostError;

const BUCKETS: [(&str, Category); 16] = [
	("Commerce & shopping", Category::CommerceShopping),
	("Communication", Category::Communication),
	("Consumer health", Category::ConsumerHealth),
	("Creative", Category::Creative),
	("Data & analytics", Category::DataAnalytics),
	("Developer tools", Category::DeveloperTools),
	("Education", Category::Education),
	("Financial services", Category::FinancialServices),
	("Health & life sciences", Category::HealthLifeSciences),
	("Legal", Category::Legal),
	("Media & entertainment", Category::MediaEntertainment),
	("Nonprofit", Category::Nonprofit),
	("Productivity", Category::Productivity),
	("Sales & marketing", Category::SalesMarketing),
	("Travel", Category::Travel),
	("Other", Category::Other),
];

pub enum Landed {
	Fresh,
	Unrefreshed(Option<HostError>),
	Failed(HostError),
}

pub struct Picked {
	pub name: String,
	pub keys: Vec<TextEdit>,
	pub revealed: Vec<bool>,
}

pub struct Catalogue {
	pub which: Which,
	pub curated: Vec<Application>,
	pub curated_read: Reading,
	pub directory: Vec<Application>,
	pub directory_read: Reading,
	pub has_partly_failed: bool,
	pub is_stale: bool,
	pub query: TextEdit,
	pub category: Category,
	pub picked: Option<Picked>,
	pub installing: Option<String>,
	pub failure: Option<InstallFailure>,
	pub spare: TextEdit,
	searched: String,
	generation: u64,
}

fn categories_of(application: &Application) -> Vec<Category> {
	let railed: Vec<Category> = application
		.categories
		.iter()
		.map(|bucket| {
			BUCKETS
				.iter()
				.find(|(name, _)| name == bucket)
				.map_or(Category::Other, |(_, category)| *category)
		})
		.collect();
	if railed.is_empty() { vec![Category::Other] } else { railed }
}

fn is_under(application: &Application, category: Category, declared: &[String]) -> bool {
	match category {
		Category::Everything => true,
		Category::OnThisMachine => declared.contains(&application.name),
		category => categories_of(application).contains(&category),
	}
}

fn narrowed<'a>(
	applications: impl Iterator<Item = &'a Application> + Clone,
	needle: &str,
) -> Vec<&'a Application> {
	let is_title_match = |held: &Application| held.title.to_lowercase().contains(needle);
	let is_description_match =
		|held: &Application| held.description.to_lowercase().contains(needle);
	let titled = applications.clone().filter(|&held| is_title_match(held));
	let described =
		applications.filter(|&held| !is_title_match(held) && is_description_match(held));
	titled.chain(described).collect()
}

fn key_names(application: &Application) -> Vec<(String, String)> {
	match &application.install {
		Install::Key { fields } => {
			fields.iter().map(|field| (field.name.clone(), field.secret.clone())).collect()
		}
		Install::Nothing | Install::Oauth | Install::Refused(_) => Vec::new(),
	}
}

impl Catalogue {
	pub fn opened(which: Which) -> (Catalogue, Vec<Call>) {
		let catalogue = Catalogue {
			which,
			curated: Vec::new(),
			curated_read: Reading::Pending,
			directory: Vec::new(),
			directory_read: Reading::Pending,
			has_partly_failed: false,
			is_stale: false,
			query: TextEdit::new(""),
			category: Category::Everything,
			picked: None,
			installing: None,
			failure: None,
			spare: TextEdit::new(""),
			searched: String::new(),
			generation: 0,
		};
		let search = Call::Search { generation: 0, query: String::new() };
		(catalogue, vec![Call::ReadCatalogue, search])
	}

	pub fn has_failed(&self) -> bool {
		let holds_no_rows = self.curated.is_empty() && self.directory.is_empty();
		self.directory_read == Reading::Failed
			|| (self.curated_read == Reading::Failed && holds_no_rows)
	}

	pub fn is_loading(&self) -> bool {
		let is_reading_curated = self.curated_read == Reading::Pending && self.curated.is_empty();
		let is_reading_directory =
			self.directory_read == Reading::Pending && self.directory.is_empty();
		!self.has_failed() && (is_reading_curated || is_reading_directory)
	}

	pub fn visible(&self, declared: &[String]) -> Vec<&Application> {
		let needle = self.query.text.trim().to_lowercase();
		let category = self.category;
		let curated = self.curated.iter().filter(|held| is_under(held, category, declared));
		let beyond = self.directory.iter().filter(|held| {
			!self.curated.iter().any(|curated| curated.name == held.name)
				&& is_under(held, category, declared)
		});
		let mut shown = narrowed(curated, &needle);
		shown.extend(narrowed(beyond, &needle));
		shown
	}

	pub fn picked_application(&self) -> Option<&Application> {
		let name = &self.picked.as_ref()?.name;
		self.curated.iter().chain(&self.directory).find(|held| &held.name == name)
	}

	pub fn typed(&mut self) -> Option<Call> {
		if self.query.text == self.searched {
			return None;
		}
		self.searched = self.query.text.clone();
		Some(self.asked())
	}

	fn asked(&mut self) -> Call {
		self.generation += 1;
		self.directory_read = Reading::Pending;
		Call::Search { generation: self.generation, query: self.searched.clone() }
	}

	pub fn catalogue_read(
		&mut self,
		read: Result<Vec<Application>, HostError>,
	) -> Option<HostError> {
		match read {
			Ok(curated) => {
				self.curated = curated;
				self.curated_read = Reading::Done;
				None
			}
			Err(failure) => {
				self.curated_read = Reading::Failed;
				Some(failure)
			}
		}
	}

	pub fn searched(&mut self, generation: u64, found: Result<Found, HostError>) -> Option<Landed> {
		if generation != self.generation {
			return None;
		}
		let landed = match found {
			Ok(found) => {
				self.directory = found.applications;
				self.is_stale = found.is_stale.unwrap_or(false);
				self.has_partly_failed = found.registry_failure.is_some();
				if self.has_partly_failed { Landed::Unrefreshed(None) } else { Landed::Fresh }
			}
			Err(failure) if self.directory.is_empty() => {
				self.directory_read = Reading::Failed;
				return Some(Landed::Failed(failure));
			}
			Err(failure) => Landed::Unrefreshed(Some(failure)),
		};
		self.directory_read = Reading::Done;
		Some(landed)
	}

	pub fn retried(&mut self) -> Vec<Call> {
		let mut calls = Vec::new();
		if self.curated_read == Reading::Failed {
			self.curated_read = Reading::Pending;
			calls.push(Call::ReadCatalogue);
		}
		calls.push(self.asked());
		calls
	}

	pub fn pick(&mut self, name: String) {
		self.failure = None;
		let count = self
			.curated
			.iter()
			.chain(&self.directory)
			.find(|held| held.name == name)
			.map_or(0, |held| key_names(held).len());
		let keys = (0..count).map(|_| TextEdit::new("")).collect();
		self.picked = Some(Picked { name, keys, revealed: vec![false; count] });
	}

	pub fn leave(&mut self) {
		self.picked = None;
		self.failure = None;
	}

	pub fn reveal(&mut self, index: usize) {
		let revealed = self.picked.as_mut().and_then(|picked| picked.revealed.get_mut(index));
		if let Some(revealed) = revealed {
			*revealed = !*revealed;
		}
	}

	pub fn key_mut(&mut self, index: usize) -> &mut TextEdit {
		match self.picked.as_mut().and_then(|picked| picked.keys.get_mut(index)) {
			Some(key) => key,
			None => &mut self.spare,
		}
	}

	pub fn typed_keys(&self) -> Result<Vec<(String, Concealed)>, InstallFailure> {
		let Some(application) = self.picked_application() else { return Ok(Vec::new()) };
		if let Install::Refused(refusal) = &application.install {
			return Err(InstallFailure::Refused(refusal.reason.clone()));
		}
		let keys = self.picked.as_ref().map(|picked| picked.keys.as_slice()).unwrap_or_default();
		let named = key_names(application);
		let unfilled: Vec<String> = named
			.iter()
			.enumerate()
			.filter(|(index, _)| keys.get(*index).is_none_or(|key| key.text.trim().is_empty()))
			.map(|(_, (name, _))| name.clone())
			.collect();
		if !unfilled.is_empty() {
			return Err(InstallFailure::Missing(unfilled));
		}
		Ok(named
			.into_iter()
			.zip(keys)
			.map(|((_, secret), key)| (secret, Concealed(key.text.clone())))
			.collect())
	}
}
