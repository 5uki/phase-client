mod api;
mod commands;
mod crypto;
mod totp;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::cmd_health,
            commands::cmd_sh_setup,
            commands::cmd_sh_open,
            commands::cmd_encrypt_vault,
            commands::cmd_put_vault,
            commands::cmd_load_local_vault,
            commands::cmd_decrypt_local_vault,
            commands::cmd_clear_session,
            commands::cmd_totp_start_ticker,
            commands::cmd_totp_stop_ticker,
            commands::cmd_get_sessions,
            commands::cmd_delete_session,
            commands::cmd_logout,
            commands::cmd_reencrypt_vault,
            commands::cmd_restore_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
