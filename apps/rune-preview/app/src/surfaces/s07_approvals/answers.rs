use std::collections::HashMap;

use kiroshi_core::agent::contract::{AskedQuestion, QuestionRequest};

pub const QUESTION_MESSAGE_PREFIX: &str = "question-";

const PICK_SEPARATOR: &str = ", ";

const ANSWER_SEPARATOR: &str = "\n\n";

#[derive(Clone, Debug, PartialEq)]
pub struct Pick {
	pub chosen: Vec<usize>,
	pub written: String,
}

impl Pick {
	pub fn answer_to(&self, asked: &AskedQuestion) -> String {
		let written = self.written.trim();
		if !written.is_empty() {
			return written.to_owned();
		}
		let labels = self.chosen.iter().filter_map(|&index| asked.options.get(index));
		labels.map(|option| option.label.as_str()).collect::<Vec<_>>().join(PICK_SEPARATOR)
	}
}

pub fn question_message_id_of(request_id: &str) -> String {
	format!("{QUESTION_MESSAGE_PREFIX}{request_id}")
}

pub fn answers_of(request: &QuestionRequest, picks: &[Pick]) -> HashMap<String, String> {
	request
		.questions
		.iter()
		.zip(picks)
		.map(|(asked, pick)| (asked.question.clone(), pick.answer_to(asked)))
		.collect()
}

pub fn answered_text(request: &QuestionRequest, answers: &HashMap<String, String>) -> String {
	request
		.questions
		.iter()
		.filter_map(|asked| answers.get(&asked.question).filter(|answer| !answer.is_empty()))
		.map(String::as_str)
		.collect::<Vec<_>>()
		.join(ANSWER_SEPARATOR)
}
