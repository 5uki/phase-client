const CREDENTIAL_KEY = "phase.biometric.credentialId";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function hasBiometricCredential(): boolean {
  return Boolean(localStorage.getItem(CREDENTIAL_KEY));
}

export function clearBiometricCredential(): void {
  localStorage.removeItem(CREDENTIAL_KEY);
}

export async function registerBiometricCredential(): Promise<void> {
  if (!window.PublicKeyCredential) {
    throw new Error("当前设备不支持生物识别解锁");
  }

  const challenge = randomChallenge();
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Phase Client" },
      user: {
        id: userId,
        name: "phase-local-user",
        displayName: "Phase Local User",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
      attestation: "none",
    },
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("生物识别注册失败");
  }

  const credentialId = toBase64Url(new Uint8Array(credential.rawId));
  localStorage.setItem(CREDENTIAL_KEY, credentialId);
}

export async function verifyBiometricUnlock(): Promise<void> {
  const credentialId = localStorage.getItem(CREDENTIAL_KEY);
  if (!credentialId) {
    throw new Error("未找到生物识别凭据，请在设置中重新开启");
  }

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          id: fromBase64Url(credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  });

  if (!assertion) {
    throw new Error("生物识别验证失败");
  }
}
