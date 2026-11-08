pub mod editor;
pub(crate) mod inline;
pub mod model;
pub mod view;

#[cfg(test)]
mod tests;

pub const SAMPLE: &str = "# Launch notes

The **block editor** in _Rune_, with `inline code` and a [link](https://kiroshi.app).

- [ ] Port the slash menu
- [x] Mirror the block model

```rust
fn main() {
	let blocks = 2000;
	println!(\"{blocks}\");
}
```

> [!NOTE]
> Rune carries the text field, the block editor is ours.

| Surface | State |
| --- | --- |
| Text | Ready |

";
