/// Макрос для логирования предупреждений, работает в нативных тестах.
/// В WASM не выводит ничего — ошибки обрабатываются на стороне TypeScript.
#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("WARN: {}", format!($($arg)*));
    };
}
