use kiroshi_rune_kit::surfaces::s14_library::{BlockMenuAction, HandleEvent};

use super::State;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BlockMenu {
	pub is_beside: bool,
	pub block: String,
	pub is_turn_into_shown: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BlockDrag {
	pub is_beside: bool,
	pub from: usize,
	pub to: usize,
	pub offset: (f32, f32),
}

impl BlockDrag {
	pub fn landing(&self) -> usize {
		if self.to > self.from { self.to + 1 } else { self.to }
	}
}

impl State {
	pub fn handle_block_handle(&mut self, is_beside: bool, block: &str, event: HandleEvent) {
		match event {
			HandleEvent::Press => {
				self.block_drag = None;
				let block = block.to_owned();
				self.block_menu = Some(BlockMenu { is_beside, block, is_turn_into_shown: false });
			}
			HandleEvent::Drag { from, offset, to } => {
				self.block_drag = Some(BlockDrag { is_beside, from, to, offset });
			}
			HandleEvent::DragEnd => self.block_drag = None,
			HandleEvent::Insert => {
				let update =
					self.document_mut(is_beside).and_then(|document| document.insert_below(block));
				self.send(is_beside, update);
			}
			HandleEvent::Move { from, to } => {
				let update =
					self.document_mut(is_beside).and_then(|document| document.move_block(from, to));
				self.send(is_beside, update);
			}
		}
	}

	pub fn handle_block_menu(&mut self, action: BlockMenuAction) {
		match action {
			BlockMenuAction::TurnIntoShown | BlockMenuAction::TurnIntoHidden => {
				if let Some(menu) = self.block_menu.as_mut() {
					menu.is_turn_into_shown = action == BlockMenuAction::TurnIntoShown;
				}
			}
			_ => self.apply_block_menu(action),
		}
	}

	fn apply_block_menu(&mut self, action: BlockMenuAction) {
		let Some(BlockMenu { is_beside, block, .. }) = self.block_menu.take() else { return };
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some(at) = document.block_at(&block) else { return };
		let update = match action {
			BlockMenuAction::TurnIntoShown | BlockMenuAction::TurnIntoHidden => None,
			BlockMenuAction::TurnInto(kind) if kind == document.blocks[at].kind() => None,
			BlockMenuAction::TurnInto(kind) => {
				document.convert(&block, kind, None);
				document.flushed()
			}
			BlockMenuAction::Duplicate => document.duplicate(&block),
			BlockMenuAction::MoveUp => at.checked_sub(1).and_then(|to| document.move_block(at, to)),
			BlockMenuAction::MoveDown => document.move_block(at, at + 1),
			BlockMenuAction::Delete => document.remove_block(&block),
		};
		self.send(is_beside, update);
	}

	pub fn close_block_menu(&mut self) {
		self.block_menu = None;
	}

	pub fn dragged(&self, is_beside: bool) -> Option<&BlockDrag> {
		self.block_drag.as_ref().filter(|drag| drag.is_beside == is_beside)
	}

	pub fn handled_block(&self, is_beside: bool) -> Option<&str> {
		if let Some(menu) = self.block_menu.as_ref().filter(|menu| menu.is_beside == is_beside) {
			return Some(&menu.block);
		}
		self.document(is_beside)?.focused().map(|field| field.block.as_str())
	}
}
