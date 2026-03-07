use base32::Alphabet;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

/// Compute HOTP value given a raw key, counter, digit count, and algorithm.
pub fn compute_hotp(key: &[u8], counter: u64, digits: u32, algo: &str) -> Result<String, String> {
    let counter_bytes = counter.to_be_bytes();

    // Compute HMAC
    let hash: Vec<u8> = match algo.to_uppercase().as_str() {
        "SHA1" | "SHA-1" => {
            let mut mac =
                HmacSha1::new_from_slice(key).map_err(|e| format!("HMAC-SHA1 init: {e}"))?;
            mac.update(&counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        "SHA256" | "SHA-256" => {
            let mut mac =
                HmacSha256::new_from_slice(key).map_err(|e| format!("HMAC-SHA256 init: {e}"))?;
            mac.update(&counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        "SHA512" | "SHA-512" => {
            let mut mac =
                HmacSha512::new_from_slice(key).map_err(|e| format!("HMAC-SHA512 init: {e}"))?;
            mac.update(&counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        other => return Err(format!("Unsupported algorithm: {other}")),
    };

    // Dynamic truncation
    let offset = (hash[hash.len() - 1] & 0x0F) as usize;
    let truncated = ((hash[offset] as u32 & 0x7F) << 24)
        | ((hash[offset + 1] as u32) << 16)
        | ((hash[offset + 2] as u32) << 8)
        | (hash[offset + 3] as u32);

    let modulus = 10u32.pow(digits);
    let otp = truncated % modulus;

    // Zero-pad to digit count
    Ok(format!("{:0>width$}", otp, width = digits as usize))
}

/// Generate a TOTP code for the current time.
/// Returns (code, seconds_remaining_in_period).
pub fn generate_totp(
    secret_b32: &str,
    algorithm: &str,
    digits: u32,
    period: u64,
) -> Result<(String, u64), String> {
    // Normalize: remove spaces and uppercase
    let normalized: String = secret_b32
        .chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| c.to_ascii_uppercase())
        .collect();

    let key = base32::decode(Alphabet::RFC4648 { padding: false }, &normalized)
        .or_else(|| base32::decode(Alphabet::RFC4648 { padding: true }, &normalized))
        .ok_or_else(|| "Failed to base32-decode TOTP secret".to_string())?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System time error: {e}"))?
        .as_secs();

    let counter = now / period;
    let seconds_remaining = period - (now % period);

    let code = compute_hotp(&key, counter, digits, algorithm)?;

    Ok((code, seconds_remaining))
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 6238 test vectors use secret "12345678901234567890"
    // Base32 encoded: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const RFC_SECRET_B32: &str = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    // RFC 4226 test vectors for HOTP (SHA-1, 6 digits)
    // counter 0-9 expected values from RFC 4226 Appendix D
    const RFC4226_EXPECTED: &[&str] = &[
        "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871",
        "520489",
    ];

    #[test]
    fn test_hotp_rfc4226_vectors() {
        let key = b"12345678901234567890";
        for (counter, expected) in RFC4226_EXPECTED.iter().enumerate() {
            let result = compute_hotp(key, counter as u64, 6, "SHA1").unwrap();
            assert_eq!(
                &result, expected,
                "HOTP mismatch at counter {counter}: got {result}, expected {expected}"
            );
        }
    }

    // RFC 6238 TOTP test vectors (SHA-1, 8 digits)
    // Time values from RFC 6238 Appendix B
    #[test]
    fn test_totp_rfc6238_sha1() {
        let key = b"12345678901234567890";
        let test_cases = [
            (59u64, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
            (20000000000, "65353130"),
        ];
        for (time_secs, expected) in test_cases {
            let counter = time_secs / 30;
            let result = compute_hotp(key, counter, 8, "SHA1").unwrap();
            assert_eq!(
                result, expected,
                "TOTP SHA-1 mismatch at t={time_secs}: got {result}, expected {expected}"
            );
        }
    }

    #[test]
    fn test_totp_rfc6238_sha256() {
        let key = b"12345678901234567890123456789012";
        let test_cases = [
            (59u64, "46119246"),
            (1111111109, "68084774"),
            (1111111111, "67062674"),
            (1234567890, "91819424"),
            (2000000000, "90698825"),
            (20000000000, "77737706"),
        ];
        for (time_secs, expected) in test_cases {
            let counter = time_secs / 30;
            let result = compute_hotp(key, counter, 8, "SHA256").unwrap();
            assert_eq!(
                result, expected,
                "TOTP SHA-256 mismatch at t={time_secs}: got {result}, expected {expected}"
            );
        }
    }

    #[test]
    fn test_totp_rfc6238_sha512() {
        let key = b"1234567890123456789012345678901234567890123456789012345678901234";
        let test_cases = [
            (59u64, "90693936"),
            (1111111109, "25091201"),
            (1111111111, "99943326"),
            (1234567890, "93441116"),
            (2000000000, "38618901"),
            (20000000000, "47863826"),
        ];
        for (time_secs, expected) in test_cases {
            let counter = time_secs / 30;
            let result = compute_hotp(key, counter, 8, "SHA512").unwrap();
            assert_eq!(
                result, expected,
                "TOTP SHA-512 mismatch at t={time_secs}: got {result}, expected {expected}"
            );
        }
    }

    #[test]
    fn test_generate_totp_returns_valid_code() {
        // A well-known test secret
        let (code, remaining) = generate_totp(RFC_SECRET_B32, "SHA1", 6, 30).unwrap();
        assert_eq!(code.len(), 6, "Code should be 6 digits");
        assert!(code.chars().all(|c| c.is_ascii_digit()));
        assert!(remaining > 0 && remaining <= 30);
    }

    #[test]
    fn test_generate_totp_handles_spaces_in_secret() {
        // Some users paste secrets with spaces
        let secret_with_spaces = "GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ";
        let (code1, _) = generate_totp(RFC_SECRET_B32, "SHA1", 6, 30).unwrap();
        let (code2, _) = generate_totp(secret_with_spaces, "SHA1", 6, 30).unwrap();
        assert_eq!(code1, code2, "Spaces in secret should be ignored");
    }

    #[test]
    fn test_invalid_algorithm_returns_error() {
        let key = b"test";
        assert!(compute_hotp(key, 0, 6, "MD5").is_err());
    }
}
