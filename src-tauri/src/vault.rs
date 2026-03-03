use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

const SESSION_STORE_PATH: &str = "session.json";
const VAULT_FILENAME: &str = "vault.bin";

// ── Data types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalVaultData {
    pub encrypted_b64: String,
    pub version: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub jwt: String,
    pub server_url: String,
    pub connection_mode: String,
    pub instance_token: Option<String>,
    pub vault_version: i64,
}

// ── Local vault (encrypted blob on disk) ──────────────────────────────────

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {e}"))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Cannot create app data dir: {e}"))?;
    Ok(data_dir.join(VAULT_FILENAME))
}

/// Persist the encrypted vault blob to disk.
pub fn save_local(app: &AppHandle, data: &LocalVaultData) -> Result<(), String> {
    let path = vault_path(app)?;
    let json = serde_json::to_string(data).map_err(|e| format!("Serialize error: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write vault file: {e}"))?;
    Ok(())
}

/// Load the encrypted vault blob from disk. Returns None if not found.
pub fn load_local(app: &AppHandle) -> Result<Option<LocalVaultData>, String> {
    let path = vault_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("Read vault file: {e}"))?;
    let data =
        serde_json::from_str::<LocalVaultData>(&json).map_err(|e| format!("Parse vault: {e}"))?;
    Ok(Some(data))
}

/// Delete the local vault file.
pub fn clear_local(app: &AppHandle) -> Result<(), String> {
    let path = vault_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Delete vault file: {e}"))?;
    }
    Ok(())
}

// ── Session store (JWT + metadata via tauri-plugin-store) ─────────────────

pub fn save_session(app: &AppHandle, data: &SessionData) -> Result<(), String> {
    let store = app
        .store(SESSION_STORE_PATH)
        .map_err(|e| format!("Open store: {e}"))?;

    let value =
        serde_json::to_value(data).map_err(|e| format!("Serialize session: {e}"))?;
    store.set("session", value);
    store.save().map_err(|e| format!("Save store: {e}"))?;
    Ok(())
}

pub fn load_session(app: &AppHandle) -> Result<Option<SessionData>, String> {
    let store = app
        .store(SESSION_STORE_PATH)
        .map_err(|e| format!("Open store: {e}"))?;

    match store.get("session") {
        Some(value) => {
            let data = serde_json::from_value::<SessionData>(value)
                .map_err(|e| format!("Parse session: {e}"))?;
            Ok(Some(data))
        }
        None => Ok(None),
    }
}

pub fn clear_session(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store(SESSION_STORE_PATH)
        .map_err(|e| format!("Open store: {e}"))?;
    store.delete("session");
    store.save().map_err(|e| format!("Save store: {e}"))?;
    Ok(())
}
