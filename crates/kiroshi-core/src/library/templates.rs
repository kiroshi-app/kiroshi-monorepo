use super::contract::{LibraryError, LibraryTemplate};

struct Template {
	id: &'static str,
	title: &'static str,
	markdown: &'static str,
}

const TEMPLATES: &[Template] = &[
	Template {
		id: "meeting-notes",
		title: "Meeting notes",
		markdown: include_str!("templates/meeting-notes.md"),
	},
	Template {
		id: "project-brief",
		title: "Project brief",
		markdown: include_str!("templates/project-brief.md"),
	},
	Template {
		id: "decision-record",
		title: "Decision record",
		markdown: include_str!("templates/decision-record.md"),
	},
	Template {
		id: "weekly-update",
		title: "Weekly update",
		markdown: include_str!("templates/weekly-update.md"),
	},
];

pub fn listed() -> Vec<LibraryTemplate> {
	TEMPLATES
		.iter()
		.map(|template| LibraryTemplate {
			id: template.id.to_owned(),
			title: template.title.to_owned(),
		})
		.collect()
}

pub fn markdown_of(id: &str) -> Result<&'static str, LibraryError> {
	TEMPLATES
		.iter()
		.find(|template| template.id == id)
		.map(|template| template.markdown)
		.ok_or_else(|| LibraryError::UnknownTemplate { id: id.to_owned() })
}
