mod api;
mod commands;
mod crypto;
mod totp;
mod vault;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState, GlobalShortcutExt};
use std::str::FromStr;

#[cfg(target_os = "windows")]
use window_vibrancy::{apply_mica, apply_acrylic};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Apply Vibrancy to Spotlight window
            if let Some(window) = app.get_webview_window("spotlight") {
                #[cfg(target_os = "windows")]
                {
                    if apply_mica(&window, None).is_err() {
                        let _ = apply_acrylic(&window, Some((18, 18, 18, 125)));
                    }
                }

                #[cfg(target_os = "macos")]
                {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Open Main Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
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
            commands::cmd_offline_unlock,
            commands::cmd_set_spotlight_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
