const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";

const resetClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const resetPasswordMsg = document.getElementById("resetPasswordMsg");

function showResetMessage(text, ok = false) {
  if (!resetPasswordMsg) return;
  resetPasswordMsg.style.display = "block";
  resetPasswordMsg.className = `form-message ${ok ? "ok" : "err"}`;
  resetPasswordMsg.textContent = text;
}

function getLinkErrorDescription() {
  const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const description = params.get("error_description");
  return description ? description.replace(/\+/g, " ") : "";
}

async function ensureRecoverySession() {
  const { data } = await resetClient.auth.getSession();
  if (data?.session) return true;

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      subscription.unsubscribe();
      const refreshed = await resetClient.auth.getSession();
      resolve(Boolean(refreshed.data?.session));
    }, 4000);

    const { data: { subscription } } = resetClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(true);
      }
    });
  });
}

savePasswordBtn?.addEventListener("click", async function () {
  const password = newPasswordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";

  if (password.length < 8) {
    showResetMessage("La contraseña debe tener al menos 8 caracteres.");
    newPasswordInput?.focus();
    return;
  }

  if (password !== confirmPassword) {
    showResetMessage("Las contraseñas no coinciden.");
    confirmPasswordInput?.focus();
    return;
  }

  savePasswordBtn.disabled = true;
  savePasswordBtn.textContent = "Guardando...";

  try {
    const hasSession = await ensureRecoverySession();
    if (!hasSession) {
      throw new Error("No hay una sesión de recuperación activa.");
    }

    const { error } = await resetClient.auth.updateUser({ password });
    if (error) throw error;

    showResetMessage("Contraseña actualizada correctamente. Ya puedes cerrar esta página e iniciar sesión.", true);
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
  } catch (error) {
    console.error(error);
    showResetMessage("No se pudo cambiar la contraseña. Abre de nuevo el enlace del correo.");
  } finally {
    savePasswordBtn.disabled = false;
    savePasswordBtn.textContent = "Guardar";
  }
});

newPasswordInput?.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmPasswordInput?.focus();
  }
});

confirmPasswordInput?.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    savePasswordBtn?.click();
  }
});

const linkError = getLinkErrorDescription();
if (linkError) {
  showResetMessage(`El enlace no es válido: ${linkError}. Pide que te envíen uno nuevo y ábrelo directo (sin vista previa de un escáner de correo) apenas te llegue.`);
} else {
  newPasswordInput?.focus();
}
