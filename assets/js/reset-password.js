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

const HOME_URL = "index.html";
const REDIRECT_SECONDS = 4;

/** Replaces the form with a success state and takes the user to the home page. */
function showResetSuccess() {
  const card = document.querySelector(".private-access-card");
  if (!card) { window.location.replace(HOME_URL); return; }
  card.classList.add("reset-done");
  card.innerHTML = `
    <img class="private-access-brand" src="assets/images/logo.webp?v=2" alt="Mujeres con Propósito" />
    <div class="reset-check" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <span class="private-access-eyebrow">Listo</span>
    <h3>Contraseña creada</h3>
    <p role="status">Ya puedes iniciar sesión con tu nueva contraseña. Te llevamos a la página principal en <strong id="resetCountdown">${REDIRECT_SECONDS}</strong> s.</p>
    <a class="btn reset-home-btn" href="${HOME_URL}">Ir a la página principal</a>
    <a class="reset-panel-link" href="admin.html">Entrar al panel</a>
    <div class="reset-bar"><span></span></div>`;
  let left = REDIRECT_SECONDS;
  const counter = document.getElementById("resetCountdown");
  const tick = setInterval(() => {
    left -= 1;
    if (counter) counter.textContent = String(Math.max(left, 0));
    if (left <= 0) { clearInterval(tick); window.location.replace(HOME_URL); }
  }, 1000);
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

    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
    await resetClient.auth.signOut({ scope: "local" }).catch(() => {});
    showResetSuccess();
    return;
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
