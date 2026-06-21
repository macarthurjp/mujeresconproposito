const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdW55d2l5aXlpZGh5b2RzYmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk5OTYsImV4cCI6MjA5NzQ1NTk5Nn0.e0w2FTvxbeKmAIUBY-xKPgnG5Txy3JIpiHi6HSeoT68";

const resetClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const backToAdminBtn = document.getElementById("backToAdminBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const resetPasswordMsg = document.getElementById("resetPasswordMsg");

function showResetMessage(text, ok = false) {
  if (!resetPasswordMsg) return;
  resetPasswordMsg.style.display = "block";
  resetPasswordMsg.className = `form-message ${ok ? "ok" : "err"}`;
  resetPasswordMsg.textContent = text;
}

async function ensureRecoverySession() {
  const { data } = await resetClient.auth.getSession();
  if (data?.session) return true;

  await new Promise((resolve) => setTimeout(resolve, 700));
  const refreshed = await resetClient.auth.getSession();
  return Boolean(refreshed.data?.session);
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

    showResetMessage("Contraseña actualizada correctamente. Ya puedes entrar al admin.", true);
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

backToAdminBtn?.addEventListener("click", function () {
  window.location.href = "admin.html";
});

backHomeBtn?.addEventListener("click", function () {
  window.location.href = "index.html";
});

newPasswordInput?.focus();
