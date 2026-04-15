use wasm_bindgen::prelude::*;

// Эта функция будет доступна из JavaScript
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust v2.1! Your input: {}", input)
}
