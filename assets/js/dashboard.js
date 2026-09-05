const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
const SUPABASE_TABLE = "unirse";
let dashboardSupabaseClient = null;

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function fetchDashboardDataFromSupabase() {
  const client = getDashboardSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

let allUsers = [];
let filteredUsers = [];
let pageSize = 10;
let currentPage = 1;

const searchInput = document.getElementById("searchInput");
const paisFilter = document.getElementById("paisFilter");
const comunidadFilter = document.getElementById("comunidadFilter");
const cristianaFilter = document.getElementById("cristianaFilter");
const usersTableBody = document.getElementById("usersTableBody");
const summaryTotalCountEls = document.querySelectorAll(".summaryTotalCount");
const totalCount = document.getElementById("totalCount");
const filteredCount = document.getElementById("filteredCount");
const countriesCount = document.getElementById("countriesCount");
const communitiesCount = document.getElementById("communitiesCount");
const monthlyCount = document.getElementById("monthlyCount");
const upcomingBirthdaysCount = document.getElementById("upcomingBirthdaysCount");
const communityBreakdown = document.getElementById("communityBreakdown");
const upcomingBirthdaysList = document.getElementById("upcomingBirthdaysList");
const sortUsersSelect = document.getElementById("sortUsersSelect");
const filteredCountFooter = document.getElementById("filteredCountFooter");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const mobileFiltersBtn = document.getElementById("mobileFiltersBtn");
const filtersPanel = document.querySelector(".filters-panel");
const activeFilterChips = document.getElementById("activeFilterChips");
const dashboardToast = document.getElementById("dashboardToast");
const dashboardPagination = document.getElementById("dashboardPagination");
const paginationSummary = document.getElementById("paginationSummary");
const paginationPageText = document.getElementById("paginationPageText");
const paginationPrevBtn = document.getElementById("paginationPrevBtn");
const paginationNextBtn = document.getElementById("paginationNextBtn");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const homePageBtn = document.getElementById("homePageBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");
const dashboardRefreshBtn = document.getElementById("dashboardRefreshBtn");
const dashboardLogoutBtn = document.getElementById("dashboardLogoutBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const lastUpdatedText = document.getElementById("lastUpdatedText");
const dashboardRoleBadge = document.getElementById("dashboardRoleBadge");
const dashboardUserName = document.getElementById("dashboardUserName");
const dashboardAccessScreen = document.getElementById("dashboardAccessScreen");
const dashboardAccessEmail = document.getElementById("dashboardAccessEmail");
const dashboardAccessCode = document.getElementById("dashboardAccessCode");
const dashboardLoginBtn = document.getElementById("dashboardLoginBtn");
const dashboardCancelBtn = document.getElementById("dashboardCancelBtn");
const dashboardForgotPasswordBtn = document.getElementById("dashboardForgotPasswordBtn");
const dashboardLoginMsg = document.getElementById("dashboardLoginMsg");
const dashboardUsePasskeyBtn = document.getElementById("dashboardUsePasskeyBtn");
const dashboardEnrollPasskeyBtn = document.getElementById("dashboardEnrollPasskeyBtn");
const pdfArea = document.getElementById("pdfArea");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sidebarHomeBtn = document.getElementById("sidebarHomeBtn");
const sidebarAdminBtn = document.getElementById("sidebarAdminBtn");
const sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
const sidebarExportBtn = document.getElementById("sidebarExportBtn");
const sidebarCsvBtn = document.getElementById("sidebarCsvBtn");
const dashboardRecordModal = document.getElementById("dashboardRecordModal");
const dashboardRecordForm = document.getElementById("dashboardRecordForm");
const dashboardRecordSaveBtn = document.getElementById("dashboardRecordSaveBtn");
let dashboardLoaded = false;
let toastTimer = null;
let dashboardAccess = { is_super_admin: false, permissions: ["read_only"], is_revoked: false, nombre: "" };

function populateRecordSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;
  const existing = new Set(Array.from(select.options).map((option) => option.value));
  values.forEach((value) => {
    if (existing.has(value)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

const sharedFormOptions = window.McpFormOptions || {};
populateRecordSelect("dashboardRecordPaisResidencia", sharedFormOptions.countries || []);
populateRecordSelect("dashboardRecordPaisNacimiento", sharedFormOptions.countries || []);
populateRecordSelect("dashboardRecordComunidad", sharedFormOptions.communities || []);
populateRecordSelect("dashboardRecordCristiana", sharedFormOptions.christianStatuses || []);
populateRecordSelect("dashboardRecordEstatusMatrimonial", sharedFormOptions.maritalStatuses || []);

function sanitizeRecordName(value) {
  return String(value || "")
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
}

function sanitizeRecordPhone(value) {
  const cleaned = String(value || "").replace(/[^\d+]/g, "");
  return cleaned.replace(/(?!^)\+/g, "");
}

["dashboardRecordNombre", "dashboardRecordApellido"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", function () {
    const cleanValue = sanitizeRecordName(this.value);
    if (this.value !== cleanValue) this.value = cleanValue;
  });
});

document.getElementById("dashboardRecordTelefono")?.addEventListener("input", function () {
  const cleanValue = sanitizeRecordPhone(this.value);
  if (this.value !== cleanValue) this.value = cleanValue;
});

const dashboardRecordPhoneField = document.getElementById("dashboardRecordTelefono");
const dashboardRecordPhoneInput = dashboardRecordPhoneField && typeof window.intlTelInput === "function"
  ? window.intlTelInput(dashboardRecordPhoneField, {
      initialCountry: "us",
      preferredCountries: ["us", "do", "es"],
      separateDialCode: true,
      dropdownContainer: document.body
    })
  : null;

function composeDashboardRoleLabel(access) {
  if (access.is_super_admin) return "Super Admin";
  const labels = [];
  if (access.permissions.includes("editor")) labels.push("Editor de devocionales");
  if (access.permissions.includes("reviewer")) labels.push("Revisor de devocionales");
  if (access.permissions.includes("read_export")) labels.push("Manager");
  return labels.length ? labels.join(" + ") : "Vista simple";
}

function canDashboardExport() {
  return dashboardAccess.is_super_admin || dashboardAccess.permissions.includes("read_export");
}

function canDashboardManageRecords() {
  return dashboardAccess.is_super_admin;
}

function canDashboardEnterAdmin() {
  return (
    dashboardAccess.is_super_admin ||
    dashboardAccess.permissions.includes("editor") ||
    dashboardAccess.permissions.includes("reviewer")
  );
}

function applyDashboardRole(access) {
  dashboardAccess = {
    is_super_admin: Boolean(access?.is_super_admin),
    permissions: Array.isArray(access?.permissions) ? access.permissions : ["read_only"],
    is_revoked: Boolean(access?.is_revoked),
    nombre: String(access?.nombre || "").trim()
  };
  const canExport = canDashboardExport();
  [exportCsvBtn, exportPdfBtn, sidebarCsvBtn, sidebarExportBtn].forEach((element) => {
    if (element) element.hidden = !canExport;
  });
  const canEnterAdmin = canDashboardEnterAdmin();
  [adminPanelBtn, sidebarAdminBtn].forEach((element) => {
    if (element) element.hidden = !canEnterAdmin;
  });
  const adminBtnLabel = dashboardAccess.is_super_admin ? "Admin" : "Devocionales";
  ["adminPanelBtnLabel", "sidebarAdminBtnLabel"].forEach((id) => {
    const label = document.getElementById(id);
    if (label) label.textContent = adminBtnLabel;
  });
  if (dashboardRoleBadge) dashboardRoleBadge.textContent = composeDashboardRoleLabel(dashboardAccess);
  document.body.dataset.userRole = dashboardAccess.is_super_admin ? "super_admin" : dashboardAccess.permissions.join(",");
  if (filteredUsers.length) renderCurrentPage();
}

async function loadDashboardRole() {
  const client = getDashboardSupabaseClient();
  const identityResult = await client.auth.getUser();
  const user = identityResult?.data?.user;
  const { data, error } = await client
    .from("user_roles")
    .select("is_super_admin,permissions,is_revoked,nombre")
    .eq("user_id", user?.id || "")
    .maybeSingle();
  if (error) throw new Error("No se pudo verificar el rol de acceso.");
  const access = {
    is_super_admin: Boolean(data?.is_super_admin),
    permissions: Array.isArray(data?.permissions) ? data.permissions : ["read_only"],
    is_revoked: Boolean(data?.is_revoked),
    nombre: String(data?.nombre || "").trim()
  };
  if (access.is_revoked) {
    await client.auth.signOut();
    throw new Error("El acceso de esta cuenta fue revocado.");
  }
  const metadata = user?.user_metadata || {};
  const displayName = access.nombre || metadata.full_name || metadata.name || metadata.display_name || user?.email || "Usuario";
  if (dashboardUserName) dashboardUserName.textContent = displayName;
  applyDashboardRole(access);
  return dashboardAccess;
}

function showDashboardToast(message) {
  if (!dashboardToast) return;
  dashboardToast.textContent = message;
  dashboardToast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dashboardToast.classList.remove("visible"), 3000);
}

function showDashboardLoginMsg(text) {
  if (!dashboardLoginMsg) return;
  dashboardLoginMsg.style.display = "block";
  dashboardLoginMsg.className = "form-message err";
  dashboardLoginMsg.textContent = text;
}

function getResetPasswordRedirectUrl() {
  const basePath = window.location.pathname.replace(/[^/]*$/, "reset-password.html");
  return `${window.location.origin}${basePath}`;
}

function getDashboardSupabaseClient() {
  if (!window.supabase) throw new Error("Supabase JS no está cargado.");
  if (!dashboardSupabaseClient) {
    dashboardSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return dashboardSupabaseClient;
}

async function validateDashboardPassword() {
  const email = dashboardAccessEmail?.value.trim() || "";
  const password = dashboardAccessCode?.value || "";

  if (!email || !password) {
    showDashboardLoginMsg("Escribe tu email y contraseña.");
    (!email ? dashboardAccessEmail : dashboardAccessCode)?.focus();
    return false;
  }

  const client = getDashboardSupabaseClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    showDashboardLoginMsg("Login incorrecto o usuario no autorizado.");
    dashboardAccessCode.value = "";
    dashboardAccessCode?.focus();
    return false;
  }

  return true;
}

async function sendDashboardPasswordReset() {
  const email = dashboardAccessEmail?.value.trim() || "";

  if (!email) {
    showDashboardLoginMsg("Escribe tu email para enviarte el enlace.");
    dashboardAccessEmail?.focus();
    return;
  }

  const client = getDashboardSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: getResetPasswordRedirectUrl()
  });

  if (error) {
    showDashboardLoginMsg("No se pudo enviar el correo de recuperación.");
    return;
  }

  if (!dashboardLoginMsg) return;
  dashboardLoginMsg.style.display = "block";
  dashboardLoginMsg.className = "form-message ok";
  dashboardLoginMsg.textContent = "Te enviamos un enlace para cambiar tu contraseña.";
}

async function hasPrivateAccessGranted() {
  const client = getDashboardSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("No se pudo verificar la sesión de Supabase.", error);
    return false;
  }

  return Boolean(data?.session);
}

async function requireActiveSessionForPasskey() {
  if (await hasPrivateAccessGranted()) return true;
  showDashboardLoginMsg("Por seguridad, primero entra con email y contrasena en este dispositivo.");
  dashboardAccessEmail?.focus();
  return false;
}

async function unlockDashboard() {
  try {
    await loadDashboardRole();
  } catch (error) {
    console.error(error);
    showDashboardLoginMsg(error.message);
    return false;
  }

  document.body.classList.remove("private-locked");
  if (dashboardAccessScreen) dashboardAccessScreen.style.display = "none";
  if (pdfArea) pdfArea.style.display = "";

  if (!dashboardLoaded) {
    dashboardLoaded = true;
    loadDashboardData();
  }
  return true;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] != null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return "";
}

function normalizeUser(user, index) {
  const nombre = pick(user, ["nombre", "firstName"]);
  const apellido = pick(user, ["apellido", "lastName"]);
  const nombreCompleto = pick(user, ["nombreCompleto", "fullName"]) || `${nombre} ${apellido}`.trim();

  return {
    id: pick(user, ["id"]) || index + 1,
    timestamp: pick(user, ["created_at", "createdAt", "timestamp", "fecha"]),
    nombre,
    apellido,
    nombreCompleto,
    email: pick(user, ["email", "correo"]),
    telefono: pick(user, ["telefono", "phone", "phoneNumber"]),
    paisResidencia: pick(user, ["pais_residencia", "paisResidencia", "paisVive", "pais", "country"]),
    comunidad: pick(user, ["comunidad", "community"]),
    cristiana: pick(user, ["cristiana", "cristianaStatus", "faithStatus"]),
    fechaNacimiento: pick(user, ["fecha_nacimiento", "fechaNacimiento", "birthDate"]),
    ultimoCorreoCumpleanos: pick(user, ["ultimo_correo_cumpleanos"]),
    paisNacimiento: pick(user, ["pais_nacimiento", "paisNacimiento", "birthCountry"]),
    estatusMatrimonial: pick(user, ["estatus_matrimonial", "estatusMatrimonial", "maritalStatus"]),
    hijos: pick(user, ["hijos", "children"]),
    comentarios: pick(user, ["comments", "comentarios"])
  };
}

function fillSelectOptions(select, values, defaultLabel = "Todos") {
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="">${defaultLabel}</option>`;

  const unique = [...new Set(
    values
      .map((v) => String(v || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));

  unique.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if ([...select.options].some((opt) => opt.value === currentValue)) {
    select.value = currentValue;
  }
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function cristianaStatusClass(value) {
  const normalized = normalizeText(value);
  if (normalized === "si") return "status-si";
  if (normalized === "todavia") return "status-todavia";
  if (normalized === "no") return "status-no";
  return "status-default";
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

const COUNTRY_DIAL_CODES = {
  "alemania": "49", "andorra": "376", "argentina": "54", "australia": "61", "austria": "43",
  "belgica": "32", "bolivia": "591", "brasil": "55", "canada": "1", "chile": "56", "china": "86",
  "colombia": "57", "costa rica": "506", "cuba": "53", "dinamarca": "45", "ecuador": "593",
  "el salvador": "503", "espana": "34", "estados unidos": "1", "finlandia": "358", "francia": "33",
  "guatemala": "502", "haiti": "509", "honduras": "504", "irlanda": "353", "italia": "39",
  "luxemburgo": "352", "mexico": "52", "nicaragua": "505", "noruega": "47", "paises bajos": "31",
  "panama": "507", "paraguay": "595", "peru": "51", "polonia": "48", "portugal": "351",
  "reino unido": "44", "republica dominicana": "1", "rumania": "40", "suecia": "46", "suiza": "41",
  "uruguay": "598", "venezuela": "58"
};

function internationalPhone(phone, country) {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  const digits = phoneDigits(raw);
  if (!digits) return raw;
  if (raw.startsWith("+")) return `+${digits}`;

  const dialCode = COUNTRY_DIAL_CODES[normalizeText(country)];
  if (!dialCode) return raw;
  if (digits.startsWith(dialCode)) return `+${digits}`;

  return `+${dialCode} ${digits.replace(/^0+/, "")}`;
}

function renderTable(users) {
  if (!usersTableBody) return;

  if (!users.length) {
    usersTableBody.innerHTML = `<p class="empty-cell">No hay registros para mostrar.</p>`;
    return;
  }

  usersTableBody.innerHTML = users.map((user) => {
    const displayPhone = internationalPhone(user.telefono, user.paisResidencia);
    return `
    <div class="user-row">
      <div class="user-row-id">
        <div class="user-avatar">${escapeHtml(getInitials(user.nombreCompleto))}</div>
        <div class="user-row-main">
          <span class="user-row-date">${escapeHtml(formatDate(user.timestamp))}</span>
          <strong class="user-row-name">${escapeHtml(user.nombreCompleto)}</strong>
          <span class="user-row-sub">${escapeHtml(user.email)}</span>
        </div>
      </div>
      <div class="user-row-fields">
        <div class="field-block">
          <span class="field-label">Teléfono</span>
          <strong>${escapeHtml(displayPhone) || "—"}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">País residencia</span>
          <strong>${escapeHtml(user.paisResidencia)}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">Comunidad</span>
          <strong>${escapeHtml(user.comunidad)}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">Cristiana</span>
          <span class="status-pill ${cristianaStatusClass(user.cristiana)}">${escapeHtml(user.cristiana) || "—"}</span>
        </div>
      </div>
      <button type="button" class="user-row-toggle" aria-expanded="false" aria-label="Ver más detalles">
        <span class="user-row-toggle-arrow">⌄</span>
      </button>
      <div class="user-row-extra">
        <div class="field-block field-block-wide user-quick-actions">
          ${user.email ? `<a href="mailto:${escapeHtml(user.email)}">Enviar correo</a>` : ""}
          ${displayPhone ? `<a href="tel:${escapeHtml(displayPhone.replace(/\s/g, ""))}">Llamar</a>` : ""}
          ${phoneDigits(displayPhone) ? `<a href="https://wa.me/${phoneDigits(displayPhone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
          ${canDashboardManageRecords() ? `<button type="button" data-edit-user="${escapeHtml(user.id)}">Editar</button><button type="button" class="danger" data-delete-user="${escapeHtml(user.id)}">Eliminar</button>` : ""}
        </div>
        <div class="field-block">
          <span class="field-label">Fecha de nacimiento</span>
          <strong>${escapeHtml(formatDate(user.fechaNacimiento))}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">Último correo de cumpleaños</span>
          <strong>${user.ultimoCorreoCumpleanos ? escapeHtml(formatDate(user.ultimoCorreoCumpleanos)) : "Nunca enviado"}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">País de nacimiento</span>
          <strong>${escapeHtml(user.paisNacimiento)}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">Estatus matrimonial</span>
          <strong>${escapeHtml(user.estatusMatrimonial)}</strong>
        </div>
        <div class="field-block">
          <span class="field-label">Hijos</span>
          <strong>${escapeHtml(user.hijos)}</strong>
        </div>
        <div class="field-block field-block-wide">
          <span class="field-label">Comentarios</span>
          <strong>${escapeHtml(user.comentarios) || "—"}</strong>
        </div>
      </div>
    </div>
  `;
  }).join("");
}

function renderPagination() {
  if (!dashboardPagination) return;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = filteredUsers.length ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, filteredUsers.length);

  dashboardPagination.hidden = filteredUsers.length <= pageSize;
  if (paginationSummary) paginationSummary.textContent = `Mostrando ${start}–${end} de ${filteredUsers.length}`;
  if (paginationPageText) paginationPageText.textContent = `Página ${currentPage} de ${totalPages}`;
  if (paginationPrevBtn) paginationPrevBtn.disabled = currentPage <= 1;
  if (paginationNextBtn) paginationNextBtn.disabled = currentPage >= totalPages;
}

function renderCurrentPage() {
  const start = (currentPage - 1) * pageSize;
  renderTable(filteredUsers.slice(start, start + pageSize));
  renderPagination();
}

function sortFilteredUsers() {
  const mode = sortUsersSelect?.value || "newest";
  const textSort = (field) => (a, b) => String(a[field] || "").localeCompare(String(b[field] || ""), "es", { sensitivity: "base" });
  const time = (user) => new Date(user.timestamp).getTime() || 0;
  const sorts = {
    newest: (a, b) => time(b) - time(a), oldest: (a, b) => time(a) - time(b),
    "name-asc": textSort("nombreCompleto"), "name-desc": (a, b) => textSort("nombreCompleto")(b, a),
    country: textSort("paisResidencia"), community: textSort("comunidad")
  };
  filteredUsers.sort(sorts[mode] || sorts.newest);
}

function isUpcomingBirthday(value) {
  if (!value) return false;
  const birth = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  return (next - today) / 86400000 <= 30;
}

function daysUntilBirthday(value) {
  if (!value) return Infinity;
  const birth = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return Infinity;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

function birthdayDateLabel(value) {
  const birth = new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${String(birth.getDate()).padStart(2, "0")} ${months[birth.getMonth()]}`;
}

function wasBirthdayEmailSentToday(value) {
  if (!value) return false;
  const sent = new Date(value);
  if (Number.isNaN(sent.getTime())) return false;
  const now = new Date();
  return sent.getFullYear() === now.getFullYear() && sent.getMonth() === now.getMonth() && sent.getDate() === now.getDate();
}

function renderDashboardInsights() {
  if (communityBreakdown) {
    const counts = new Map();
    allUsers.forEach((user) => { const name = user.comunidad || "Sin comunidad"; counts.set(name, (counts.get(name) || 0) + 1); });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map((row) => row[1]));
    communityBreakdown.innerHTML = rows.length ? rows.map(([name, count]) => `<div class="community-row"><strong>${escapeHtml(name)}</strong><div class="community-bar"><span style="width:${Math.round(count / max * 100)}%"></span></div><span>${count}</span></div>`).join("") : `<p class="empty-cell">Sin datos de comunidad.</p>`;
  }
  if (upcomingBirthdaysList) {
    const people = allUsers.map((user) => ({ user, days: daysUntilBirthday(user.fechaNacimiento) })).filter((item) => item.days <= 30).sort((a, b) => a.days - b.days).slice(0, 5);
    upcomingBirthdaysList.innerHTML = people.length ? people.map(({ user, days }) => {
      const emailSent = days === 0 ? wasBirthdayEmailSentToday(user.ultimoCorreoCumpleanos) : false;
      return `
      <div class="birthday-row">
        <div class="birthday-person">
          <span class="birthday-tag birthday-date-tag">${birthdayDateLabel(user.fechaNacimiento)}</span>
          <strong>${escapeHtml(user.nombreCompleto)}</strong>
        </div>
        <div class="birthday-tags">
          <span class="birthday-tag birthday-days-tag${days === 0 ? " is-today" : ""}">${days === 0 ? "Hoy" : `En ${days} día${days === 1 ? "" : "s"}`}</span>
          ${days === 0 ? `<span class="birthday-tag birthday-email-tag${emailSent ? " is-sent" : " is-pending"}">${emailSent ? "✓ Correo enviado" : "Correo pendiente"}</span>` : ""}
        </div>
      </div>
    `;
    }).join("") : `<p class="empty-cell">No hay cumpleaños en los próximos 30 días.</p>`;
  }
}

function toggleUserRow(toggleBtn) {
  const row = toggleBtn.closest(".user-row");
  if (!row) return;

  const expanded = row.classList.toggle("expanded");
  toggleBtn.setAttribute("aria-expanded", String(expanded));
  toggleBtn.setAttribute("aria-label", expanded ? "Ocultar detalles" : "Ver detalles");
}

function updateCounters() {
  if (summaryTotalCountEls?.length) {
    summaryTotalCountEls.forEach((el) => {
      el.textContent = allUsers.length;
    });
  }
  if (totalCount) totalCount.textContent = allUsers.length;
  if (filteredCount) filteredCount.textContent = filteredUsers.length;
  if (countriesCount) {
    countriesCount.textContent = new Set(allUsers.map((user) => normalizeText(user.paisResidencia)).filter(Boolean)).size;
  }
  if (communitiesCount) {
    communitiesCount.textContent = new Set(allUsers.map((user) => normalizeText(user.comunidad)).filter(Boolean)).size;
  }
  if (monthlyCount) {
    const now = new Date();
    monthlyCount.textContent = allUsers.filter((user) => { const date = new Date(user.timestamp); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }).length;
  }
  if (upcomingBirthdaysCount) upcomingBirthdaysCount.textContent = allUsers.filter((user) => isUpcomingBirthday(user.fechaNacimiento)).length;
  if (filteredCountFooter) filteredCountFooter.textContent = filteredUsers.length;
  renderDashboardInsights();
}

function applyFilters() {
  const search = normalizeText(searchInput?.value);
  const pais = paisFilter?.value || "";
  const comunidad = comunidadFilter?.value || "";
  const cristiana = cristianaFilter?.value || "";
  const activeFilterCount = [search, pais, comunidad, cristiana].filter(Boolean).length;
  if (mobileFiltersBtn) mobileFiltersBtn.lastChild.textContent = activeFilterCount ? `Filtros (${activeFilterCount})` : "Más filtros";
  if (activeFilterChips) {
    const chips = [search && ["search", `Búsqueda: ${searchInput.value.trim()}`], pais && ["pais", `País: ${pais}`], comunidad && ["comunidad", `Comunidad: ${comunidad}`], cristiana && ["cristiana", `Cristiana: ${cristiana}`]].filter(Boolean);
    activeFilterChips.innerHTML = chips.map(([key, label]) => `<button type="button" data-clear-filter="${key}">${escapeHtml(label)} ×</button>`).join("");
  }

  filteredUsers = allUsers.filter((user) => {
    const haystack = normalizeText([
      user.nombre,
      user.apellido,
      user.nombreCompleto,
      user.email,
      user.telefono,
      user.paisResidencia,
      user.comunidad,
      user.cristiana
    ].join(" "));

    const matchesSearch = !search || haystack.includes(search);
    const matchesPais = !pais || user.paisResidencia === pais;
    const matchesComunidad = !comunidad || user.comunidad === comunidad;
    const matchesCristiana = !cristiana || user.cristiana === cristiana;

    return matchesSearch && matchesPais && matchesComunidad && matchesCristiana;
  });

  sortFilteredUsers();
  currentPage = 1;
  renderCurrentPage();
  updateCounters();
}

function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function exportCSV() {
  if (!canDashboardExport()) {
    showDashboardToast("Tu rol no permite exportar registros.");
    return;
  }
  const headers = ["Nombre", "Email", "Teléfono", "País residencia", "Comunidad", "Cristiana", "Fecha nacimiento", "País nacimiento", "Estatus matrimonial", "Hijos", "Comentarios", "Fecha registro"];
  const rows = filteredUsers.map((u) => [u.nombreCompleto, u.email, u.telefono, u.paisResidencia, u.comunidad, u.cristiana, u.fechaNacimiento, u.paisNacimiento, u.estatusMatrimonial, u.hijos, u.comentarios, u.timestamp]);
  const blob = new Blob(["\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `mujeres-con-proposito-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click(); URL.revokeObjectURL(url);
  showDashboardToast(`CSV descargado con ${filteredUsers.length} registros.`);
}

function clearFilters() {
  if (searchInput) searchInput.value = "";
  if (paisFilter) paisFilter.value = "";
  if (comunidadFilter) comunidadFilter.value = "";
  if (cristianaFilter) cristianaFilter.value = "";
  applyFilters();
}

async function loadDashboardData() {
  try {
    if (dashboardRefreshBtn) dashboardRefreshBtn.disabled = true;
    if (lastUpdatedText) {
      lastUpdatedText.textContent = "Cargando datos desde Supabase...";
    }
    if (usersTableBody) usersTableBody.innerHTML = Array.from({ length: 3 }, () => `<div class="user-row skeleton"><div class="skeleton-block skeleton-avatar"></div><div class="skeleton-lines"><span class="skeleton-block"></span><span class="skeleton-block"></span></div></div>`).join("");

    const data = await fetchDashboardDataFromSupabase();

    const rawUsers = Array.isArray(data)
      ? data
      : Array.isArray(data.usuarios)
        ? data.usuarios
        : Array.isArray(data.Usuarios)
          ? data.Usuarios
          : Array.isArray(data.users)
            ? data.users
            : Array.isArray(data.data)
              ? data.data
              : [];

    if (!rawUsers.length) {
      console.warn("Dashboard: no se detectaron registros de usuario en la respuesta.", data);
    }

    allUsers = rawUsers
      .map(normalizeUser)
      .filter((user) =>
        user && (
          String(user.nombre || "").trim() ||
          String(user.apellido || "").trim() ||
          String(user.email || "").trim()
        )
      );

    fillSelectOptions(paisFilter, allUsers.map((u) => u.paisResidencia), "Todos");
    fillSelectOptions(comunidadFilter, allUsers.map((u) => u.comunidad), "Todas");
    fillSelectOptions(cristianaFilter, allUsers.map((u) => u.cristiana), "Todas");

    applyFilters();

    if (lastUpdatedText) {
      lastUpdatedText.textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    }
  } catch (error) {
    console.error("ERROR DASHBOARD:", error);

    const message = error?.message || "Error cargando datos del dashboard.";
    if (usersTableBody) {
      usersTableBody.innerHTML = `<p class="empty-cell">${escapeHtml(message)}</p>`;
    }

    if (lastUpdatedText) {
      lastUpdatedText.textContent = message;
    }
  } finally {
    if (dashboardRefreshBtn) dashboardRefreshBtn.disabled = false;
  }
}

async function loadPdfDependencies() {
  if (!window.McpScripts) throw new Error("El cargador de recursos no está disponible.");
  await window.McpScripts.load("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await window.McpScripts.load("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js");
  if (!window.jspdf || typeof window.jspdf.jsPDF?.API?.autoTable !== "function") {
    throw new Error("Las librerías PDF no se cargaron correctamente.");
  }
}

async function exportPDF() {
  if (!canDashboardExport()) {
    showDashboardToast("Tu rol no permite exportar registros.");
    return;
  }
  try {
    if (exportPdfBtn) exportPdfBtn.disabled = true;
    await loadPdfDependencies();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const exportDate = new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const headers = [[
      "Registro", "Nombre", "Email", "Teléfono", "País residencia", "Comunidad",
      "Cristiana", "Nacimiento", "País nacimiento", "Estado civil", "Hijos"
    ]];
    const rows = filteredUsers.map((user) => [
      formatDate(user.timestamp) || "—",
      user.nombreCompleto || "—",
      user.email || "—",
      internationalPhone(user.telefono, user.paisResidencia) || "—",
      user.paisResidencia || "—",
      user.comunidad || "—",
      user.cristiana || "—",
      formatDate(user.fechaNacimiento) || "—",
      user.paisNacimiento || "—",
      user.estatusMatrimonial || "—",
      user.hijos || "—"
    ]);

    pdf.setTextColor(113, 55, 47);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Lista de usuarias — Mujeres con Propósito", 8, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 102, 102);
    pdf.text(`${filteredUsers.length} registro${filteredUsers.length === 1 ? "" : "s"} · Exportado el ${exportDate}`, 8, 18);

    if (rows.length) {
      pdf.autoTable({
        startY: 23,
        head: headers,
        body: rows,
        theme: "grid",
        margin: { top: 10, right: 8, bottom: 14, left: 8 },
        styles: {
          font: "helvetica",
          fontSize: 6.3,
          cellPadding: 1.7,
          valign: "middle",
          overflow: "linebreak",
          lineColor: [232, 216, 208],
          lineWidth: 0.15,
          textColor: [64, 45, 41]
        },
        headStyles: {
          fillColor: [153, 62, 53],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 6.5,
          minCellHeight: 8
        },
        alternateRowStyles: { fillColor: [252, 247, 244] },
        columnStyles: {
          0: { cellWidth: 19 },
          1: { cellWidth: 34 },
          2: { cellWidth: 46 },
          3: { cellWidth: 27 },
          4: { cellWidth: 27 },
          5: { cellWidth: 25 },
          6: { cellWidth: 18 },
          7: { cellWidth: 21 },
          8: { cellWidth: 27 },
          9: { cellWidth: 24 },
          10: { cellWidth: 10, halign: "center" }
        }
      });
    } else {
      pdf.setFontSize(11);
      pdf.setTextColor(90, 70, 66);
      pdf.text("No hay registros que coincidan con los filtros actuales.", 8, 32);
    }

    const totalPages = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(120, 102, 102);
      pdf.text(`Exportado el ${exportDate}`, 8, pageHeight - 6);
      pdf.text(`Página ${page} de ${totalPages}`, pageWidth - 8, pageHeight - 6, { align: "right" });
    }

    pdf.save(`lista-usuarias-${new Date().toISOString().slice(0, 10)}.pdf`);
    showDashboardToast(`PDF descargado con ${filteredUsers.length} registros.`);
  } catch (error) {
    console.error("ERROR PDF:", error);
    alert("No se pudo generar el PDF.");
  } finally {
    if (exportPdfBtn) exportPdfBtn.disabled = false;
  }
}

function setRecordField(id, value) {
  const field = document.getElementById(id);
  if (!field) return;
  const normalizedValue = value == null ? "" : String(value);
  if (field instanceof HTMLSelectElement && normalizedValue && !Array.from(field.options).some((option) => option.value === normalizedValue)) {
    const legacyOption = document.createElement("option");
    legacyOption.value = normalizedValue;
    legacyOption.textContent = `${normalizedValue} (valor actual)`;
    field.appendChild(legacyOption);
  }
  field.value = normalizedValue;
}

function getRecordField(id, { trim = true } = {}) {
  const value = document.getElementById(id)?.value ?? "";
  return trim ? value.trim() : value;
}

function closeRecordModal() {
  if (!dashboardRecordModal) return;
  dashboardRecordModal.hidden = true;
  document.body.classList.remove("record-modal-open");
}

function openRecordModal(userId) {
  if (!canDashboardManageRecords()) {
    showDashboardToast("Tu rol no permite editar registros.");
    return;
  }
  const user = allUsers.find((entry) => String(entry.id) === String(userId));
  if (!user || !dashboardRecordModal) return;
  setRecordField("dashboardRecordId", user.id);
  setRecordField("dashboardRecordNombre", user.nombre);
  setRecordField("dashboardRecordApellido", user.apellido);
  setRecordField("dashboardRecordEmail", user.email);
  setRecordField("dashboardRecordTelefono", user.telefono);
  dashboardRecordPhoneInput?.setNumber(internationalPhone(user.telefono, user.paisResidencia));
  setRecordField("dashboardRecordPaisResidencia", user.paisResidencia);
  setRecordField("dashboardRecordComunidad", user.comunidad);
  setRecordField("dashboardRecordCristiana", user.cristiana || "Sí");
  setRecordField("dashboardRecordFechaNacimiento", String(user.fechaNacimiento || "").slice(0, 10));
  setRecordField("dashboardRecordPaisNacimiento", user.paisNacimiento);
  setRecordField("dashboardRecordEstatusMatrimonial", user.estatusMatrimonial);
  setRecordField("dashboardRecordHijos", user.hijos);
  setRecordField("dashboardRecordComentarios", user.comentarios);
  dashboardRecordModal.hidden = false;
  document.body.classList.add("record-modal-open");
  document.getElementById("dashboardRecordNombre")?.focus();
}

dashboardRecordForm?.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!canDashboardManageRecords()) {
    showDashboardToast("Tu rol no permite editar registros.");
    return;
  }

  const userId = getRecordField("dashboardRecordId");
  const email = getRecordField("dashboardRecordEmail").toLowerCase();
  const telefono = dashboardRecordPhoneInput?.getNumber() || sanitizeRecordPhone(getRecordField("dashboardRecordTelefono"));
  const duplicate = allUsers.find((user) => String(user.id) !== String(userId) && (
    (email && String(user.email || "").trim().toLowerCase() === email) ||
    (phoneDigits(telefono) && phoneDigits(user.telefono) === phoneDigits(telefono))
  ));
  if (duplicate) {
    showDashboardToast("Ya existe otra usuaria con ese correo o teléfono.");
    return;
  }

  const payload = {
    nombre: getRecordField("dashboardRecordNombre"),
    apellido: getRecordField("dashboardRecordApellido"),
    email,
    telefono,
    pais_residencia: getRecordField("dashboardRecordPaisResidencia"),
    comunidad: getRecordField("dashboardRecordComunidad"),
    cristiana: getRecordField("dashboardRecordCristiana", { trim: false }),
    fecha_nacimiento: getRecordField("dashboardRecordFechaNacimiento", { trim: false }) || null,
    pais_nacimiento: getRecordField("dashboardRecordPaisNacimiento"),
    estatus_matrimonial: getRecordField("dashboardRecordEstatusMatrimonial"),
    hijos: Math.max(0, Number.parseInt(getRecordField("dashboardRecordHijos") || "0", 10) || 0),
    comments: getRecordField("dashboardRecordComentarios")
  };

  const namePattern = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,}$/;
  if (!namePattern.test(payload.nombre)) {
    showDashboardToast("El nombre solo puede contener letras, espacios, apóstrofe o guion.");
    return;
  }
  if (!namePattern.test(payload.apellido)) {
    showDashboardToast("El apellido solo puede contener letras, espacios, apóstrofe o guion.");
    return;
  }
  if (!/^\+?\d{7,15}$/.test(sanitizeRecordPhone(payload.telefono))) {
    showDashboardToast("El teléfono no es válido.");
    return;
  }
  if (dashboardRecordPhoneInput?.isValidNumber && !dashboardRecordPhoneInput.isValidNumber()) {
    showDashboardToast("El teléfono no es válido para el país seleccionado.");
    return;
  }
  const birthDate = new Date(`${payload.fecha_nacimiento}T00:00:00`);
  const today = new Date();
  const minimumAdultDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  if (Number.isNaN(birthDate.getTime()) || birthDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    showDashboardToast("La fecha de nacimiento no puede ser hoy o futura.");
    return;
  }
  if (birthDate > minimumAdultDate) {
    showDashboardToast("La usuaria debe ser mayor de 18 años.");
    return;
  }

  dashboardRecordSaveBtn.disabled = true;
  try {
    const client = getDashboardSupabaseClient();
    const { error } = await client.from(SUPABASE_TABLE).update(payload).eq("id", userId);
    if (error) throw error;
    closeRecordModal();
    await loadDashboardData();
    showDashboardToast("Registro actualizado correctamente.");
  } catch (error) {
    console.error("ERROR ACTUALIZANDO REGISTRO:", error);
    const message = error?.code === "23505"
      ? "Ya existe otra usuaria con ese correo o teléfono."
      : error?.message || "No se pudo actualizar el registro.";
    showDashboardToast(message);
  } finally {
    dashboardRecordSaveBtn.disabled = false;
  }
});

dashboardRecordModal?.addEventListener("click", function (event) {
  if (event.target.closest("[data-close-record-modal]")) closeRecordModal();
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && dashboardRecordModal && !dashboardRecordModal.hidden) closeRecordModal();
});

usersTableBody?.addEventListener("click", async function (event) {
  const editButton = event.target.closest("[data-edit-user]");
  if (editButton) {
    openRecordModal(editButton.dataset.editUser);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-user]");
  if (deleteButton) {
    if (!canDashboardManageRecords()) {
      showDashboardToast("Tu rol no permite eliminar registros.");
      return;
    }
    const user = allUsers.find((entry) => String(entry.id) === String(deleteButton.dataset.deleteUser));
    const label = user?.nombreCompleto || "esta usuaria";
    if (!window.confirm(`¿Eliminar definitivamente el registro de ${label}? Esta acción no se puede deshacer.`)) return;
    deleteButton.disabled = true;
    try {
      const { error } = await getDashboardSupabaseClient().from(SUPABASE_TABLE).delete().eq("id", deleteButton.dataset.deleteUser);
      if (error) throw error;
      await loadDashboardData();
      showDashboardToast("Registro eliminado correctamente.");
    } catch (error) {
      console.error("ERROR ELIMINANDO REGISTRO:", error);
      deleteButton.disabled = false;
      showDashboardToast(error?.message || "No se pudo eliminar el registro.");
    }
    return;
  }

  const toggleBtn = event.target.closest(".user-row-toggle");
  if (toggleBtn) {
    toggleUserRow(toggleBtn);
    return;
  }

  const identity = event.target.closest(".user-row-id");
  const identityToggle = identity?.closest(".user-row")?.querySelector(".user-row-toggle");
  if (identityToggle && window.matchMedia("(max-width: 760px)").matches) {
    toggleUserRow(identityToggle);
  }
});

searchInput?.addEventListener("input", applyFilters);
paisFilter?.addEventListener("change", applyFilters);
comunidadFilter?.addEventListener("change", applyFilters);
cristianaFilter?.addEventListener("change", applyFilters);
sortUsersSelect?.addEventListener("change", function () { sortFilteredUsers(); currentPage = 1; renderCurrentPage(); });
clearFiltersBtn?.addEventListener("click", clearFilters);
activeFilterChips?.addEventListener("click", function (event) {
  const key = event.target.closest("[data-clear-filter]")?.dataset.clearFilter;
  if (key === "search" && searchInput) searchInput.value = "";
  if (key === "pais" && paisFilter) paisFilter.value = "";
  if (key === "comunidad" && comunidadFilter) comunidadFilter.value = "";
  if (key === "cristiana" && cristianaFilter) cristianaFilter.value = "";
  if (key) applyFilters();
});
mobileFiltersBtn?.addEventListener("click", function () {
  const open = filtersPanel?.classList.toggle("filters-open") || false;
  this.setAttribute("aria-expanded", String(open));
  this.lastChild.textContent = open ? "Menos filtros" : "Más filtros";
});
paginationPrevBtn?.addEventListener("click", function () {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderCurrentPage();
  usersTableBody?.scrollIntoView({ behavior: "smooth", block: "start" });
});
paginationNextBtn?.addEventListener("click", function () {
  if (currentPage * pageSize >= filteredUsers.length) return;
  currentPage += 1;
  renderCurrentPage();
  usersTableBody?.scrollIntoView({ behavior: "smooth", block: "start" });
});
pageSizeSelect?.addEventListener("change", function () { pageSize = Number(this.value) || 10; currentPage = 1; renderCurrentPage(); });
homePageBtn?.addEventListener("click", function () {
  window.location.href = "index.html";
});
adminPanelBtn?.addEventListener("click", function () {
  window.location.href = "admin.html";
});
exportPdfBtn?.addEventListener("click", exportPDF);
exportCsvBtn?.addEventListener("click", exportCSV);
dashboardRefreshBtn?.addEventListener("click", loadDashboardData);
sidebarHomeBtn?.addEventListener("click", () => homePageBtn?.click());
sidebarAdminBtn?.addEventListener("click", () => adminPanelBtn?.click());
sidebarLogoutBtn?.addEventListener("click", () => dashboardLogoutBtn?.click());
sidebarExportBtn?.addEventListener("click", () => {
  exportPdfBtn?.click();
  closeSidebar();
});
sidebarCsvBtn?.addEventListener("click", () => { exportCSV(); closeSidebar(); });

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  sidebarToggleBtn?.setAttribute("aria-expanded", "false");
}

sidebarToggleBtn?.addEventListener("click", function () {
  const isOpen = document.body.classList.toggle("sidebar-open");
  sidebarToggleBtn.setAttribute("aria-expanded", String(isOpen));
});
sidebarBackdrop?.addEventListener("click", closeSidebar);
window.addEventListener("resize", function () {
  if (window.innerWidth > 760) closeSidebar();
});

document.addEventListener("visibilitychange", async function () {
  if (document.hidden || !dashboardLoaded) return;

  try {
    await loadDashboardRole();
  } catch (error) {
    console.error(error);
    window.location.reload();
    return;
  }

  loadDashboardData();
});

dashboardLoginBtn?.addEventListener("click", async function () {
  if (!await validateDashboardPassword()) return;
  await unlockDashboard();
});

dashboardCancelBtn?.addEventListener("click", function () {
  window.location.href = "index.html";
});

dashboardForgotPasswordBtn?.addEventListener("click", sendDashboardPasswordReset);

dashboardEnrollPasskeyBtn?.addEventListener("click", async function () {
  try {
    if (!window.McpPasskeyAuth) {
      showDashboardLoginMsg("Face ID/huella no esta disponible en este navegador.");
      return;
    }

    if (!await validateDashboardPassword()) return;
    await window.McpPasskeyAuth.enroll(dashboardAccessEmail?.value || "");
    if (dashboardLoginMsg) {
      dashboardLoginMsg.style.display = "block";
      dashboardLoginMsg.className = "form-message ok";
      dashboardLoginMsg.textContent = "Face ID/huella activado en este dispositivo.";
    }
    await unlockDashboard();
  } catch (error) {
    console.error(error);
    showDashboardLoginMsg(error?.message || "No se pudo activar Face ID/huella.");
  }
});

dashboardUsePasskeyBtn?.addEventListener("click", async function () {
  try {
    if (!window.McpPasskeyAuth) {
      showDashboardLoginMsg("Face ID/huella no esta disponible en este navegador.");
      return;
    }

    if (!await requireActiveSessionForPasskey()) return;
    await window.McpPasskeyAuth.verify();
    await unlockDashboard();
  } catch (error) {
    console.error(error);
    showDashboardLoginMsg(error?.message || "No se pudo verificar Face ID/huella.");
  }
});

dashboardLogoutBtn?.addEventListener("click", async function () {
  const client = getDashboardSupabaseClient();
  await client.auth.signOut();
  dashboardLoaded = false;
  document.body.classList.add("private-locked");
  if (pdfArea) pdfArea.style.display = "none";
  if (dashboardAccessScreen) dashboardAccessScreen.style.display = "";
  if (dashboardAccessCode) dashboardAccessCode.value = "";
  dashboardAccessEmail?.focus();
});

dashboardAccessCode?.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    dashboardLoginBtn?.click();
  }
});

dashboardAccessEmail?.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    dashboardAccessCode?.focus();
  }
});

hasPrivateAccessGranted().then(async (hasSession) => {
  if (hasSession) {
    await unlockDashboard();
    return;
  }

  dashboardAccessEmail?.focus();
});

if (window.lucide) {
  window.lucide.createIcons();
}
