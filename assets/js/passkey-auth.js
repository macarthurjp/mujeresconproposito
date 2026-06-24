(function () {
  const STORAGE_KEY = "mcp930_passkey_auth_v1";
  const RP_NAME = "Mujeres con Proposito";

  function toBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function fromBase64Url(value) {
    const base64 = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function getRandomBytes(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function getStoredCredential() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function storeCredential(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async function isAvailable() {
    if (!window.PublicKeyCredential || !navigator.credentials || !window.crypto?.getRandomValues) {
      return false;
    }

    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
      return true;
    }

    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) {
      return false;
    }
  }

  async function enroll(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Escribe tu email antes de activar Face ID o huella.");
    }

    if (!await isAvailable()) {
      throw new Error("Este dispositivo o navegador no permite Face ID/huella para esta pagina.");
    }

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: getRandomBytes(32),
        rp: { name: RP_NAME },
        user: {
          id: getRandomBytes(16),
          name: normalizedEmail,
          displayName: normalizedEmail
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required"
        },
        attestation: "none",
        timeout: 60000
      }
    });

    if (!credential?.rawId) {
      throw new Error("No se pudo activar Face ID/huella.");
    }

    storeCredential({
      email: normalizedEmail,
      credentialId: toBase64Url(credential.rawId),
      createdAt: new Date().toISOString()
    });

    return getStoredCredential();
  }

  async function verify() {
    const stored = getStoredCredential();
    if (!stored?.credentialId) {
      throw new Error("Primero activa Face ID/huella con tu email y contrasena.");
    }

    if (!await isAvailable()) {
      throw new Error("Este dispositivo o navegador no permite Face ID/huella para esta pagina.");
    }

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: getRandomBytes(32),
        allowCredentials: [{
          type: "public-key",
          id: fromBase64Url(stored.credentialId)
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    if (!credential) {
      throw new Error("No se pudo verificar Face ID/huella.");
    }

    return stored;
  }

  window.McpPasskeyAuth = {
    enroll,
    getStoredCredential,
    isAvailable,
    verify
  };
})();
