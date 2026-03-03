use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hkdf::Hkdf;
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use zeroize::Zeroizing;

/// Derive encryption and auth keys from password + salt.
/// Returns (enc_key [u8;32], auth_hash [u8;32]).
/// The intermediate master key is zeroized before returning.
pub fn derive_keys(password: &str, salt_hex: &str) -> Result<([u8; 32], [u8; 32]), String> {
    let salt = hex::decode(salt_hex).map_err(|e| format!("Invalid salt hex: {e}"))?;

    // PBKDF2-SHA256 with 600,000 iterations → master key
    let mut master_key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 600_000, master_key.as_mut());

    // HKDF expand: enc key (info = "enc")
    let hk = Hkdf::<Sha256>::new(None, master_key.as_ref());
    let mut enc_key = [0u8; 32];
    hk.expand(b"enc", &mut enc_key)
        .map_err(|e| format!("HKDF enc expand failed: {e}"))?;

    // HKDF expand: auth key (info = "auth") → then PBKDF2 1 iter to get auth hash
    let mut auth_key_bits = Zeroizing::new([0u8; 32]);
    hk.expand(b"auth", auth_key_bits.as_mut())
        .map_err(|e| format!("HKDF auth expand failed: {e}"))?;

    // PBKDF2-SHA256 1 iteration, salt = password bytes → auth hash
    let mut auth_hash = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        auth_key_bits.as_ref(),
        password.as_bytes(),
        1,
        &mut auth_hash,
    );

    Ok((enc_key, auth_hash))
}

/// Encrypt plaintext with AES-256-GCM.
/// Output: Base64(12-byte IV || ciphertext+tag)
pub fn encrypt_vault(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init failed: {e}"))?;

    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&iv);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64.encode(combined))
}

/// Decrypt AES-256-GCM ciphertext.
/// Input: Base64(12-byte IV || ciphertext+tag)
pub fn decrypt_vault(encrypted_b64: &str, key: &[u8; 32]) -> Result<String, String> {
    let combined = BASE64
        .decode(encrypted_b64)
        .map_err(|e| format!("Base64 decode failed: {e}"))?;

    if combined.len() < 12 {
        return Err("Ciphertext too short".to_string());
    }

    let (iv, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(iv);

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init failed: {e}"))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed (wrong key or corrupted data)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {e}"))
}

/// Generate a cryptographically random 32-byte salt as a hex string.
#[allow(dead_code)]
pub fn generate_salt() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(&bytes)
}

// hex is not a direct dep; use simple impl
mod hex {
    #[allow(dead_code)]
    pub fn encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn decode(s: &str) -> Result<Vec<u8>, String> {
        if s.len() % 2 != 0 {
            return Err("Odd length hex string".to_string());
        }
        (0..s.len())
            .step_by(2)
            .map(|i| {
                u8::from_str_radix(&s[i..i + 2], 16)
                    .map_err(|e| format!("Invalid hex char at {i}: {e}"))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_salt_length() {
        let salt = generate_salt();
        assert_eq!(salt.len(), 64, "Salt should be 64 hex chars (32 bytes)");
        // Should be valid hex
        assert!(salt.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_salt_uniqueness() {
        let s1 = generate_salt();
        let s2 = generate_salt();
        assert_ne!(s1, s2, "Salts should be unique");
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = r#"{"tokens":[],"version":1}"#;

        let encrypted = encrypt_vault(plaintext, &key).expect("Encryption failed");
        let decrypted = decrypt_vault(&encrypted, &key).expect("Decryption failed");

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_encrypt_different_each_time() {
        let key = [42u8; 32];
        let plaintext = "same plaintext";

        let e1 = encrypt_vault(plaintext, &key).unwrap();
        let e2 = encrypt_vault(plaintext, &key).unwrap();
        assert_ne!(e1, e2, "Each encryption should use a unique IV");
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        let key1 = [42u8; 32];
        let key2 = [99u8; 32];
        let encrypted = encrypt_vault("secret", &key1).unwrap();
        assert!(decrypt_vault(&encrypted, &key2).is_err());
    }

    #[test]
    fn test_derive_keys_deterministic() {
        let salt = generate_salt();
        let (enc1, auth1) = derive_keys("mypassword", &salt).unwrap();
        let (enc2, auth2) = derive_keys("mypassword", &salt).unwrap();
        assert_eq!(enc1, enc2);
        assert_eq!(auth1, auth2);
    }

    #[test]
    fn test_derive_keys_different_passwords() {
        let salt = generate_salt();
        let (enc1, _) = derive_keys("password1", &salt).unwrap();
        let (enc2, _) = derive_keys("password2", &salt).unwrap();
        assert_ne!(enc1, enc2);
    }

    #[test]
    fn test_hex_roundtrip() {
        let bytes = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let encoded = hex::encode(&bytes);
        assert_eq!(encoded, "deadbeef");
        let decoded = hex::decode(&encoded).unwrap();
        assert_eq!(decoded, bytes);
    }
}
