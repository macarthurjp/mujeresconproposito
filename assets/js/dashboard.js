const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdW55d2l5aXlpZGh5b2RzYmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk5OTYsImV4cCI6MjA5NzQ1NTk5Nn0.e0w2FTvxbeKmAIUBY-xKPgnG5Txy3JIpiHi6HSeoT68";
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

const searchInput = document.getElementById("searchInput");
const paisFilter = document.getElementById("paisFilter");
const comunidadFilter = document.getElementById("comunidadFilter");
const cristianaFilter = document.getElementById("cristianaFilter");
const usersTableBody = document.getElementById("usersTableBody");
const summaryTotalCountEls = document.querySelectorAll(".summaryTotalCount");
const totalCount = document.getElementById("totalCount");
const filteredCount = document.getElementById("filteredCount");
const filteredCountFooter = document.getElementById("filteredCountFooter");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const homePageBtn = document.getElementById("homePageBtn");
const dashboardLogoutBtn = document.getElementById("dashboardLogoutBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const lastUpdatedText = document.getElementById("lastUpdatedText");
const dashboardAccessScreen = document.getElementById("dashboardAccessScreen");
const dashboardAccessEmail = document.getElementById("dashboardAccessEmail");
const dashboardAccessCode = document.getElementById("dashboardAccessCode");
const dashboardLoginBtn = document.getElementById("dashboardLoginBtn");
const dashboardAdminBtn = document.getElementById("dashboardAdminBtn");
const dashboardCancelBtn = document.getElementById("dashboardCancelBtn");
const dashboardForgotPasswordBtn = document.getElementById("dashboardForgotPasswordBtn");
const dashboardLoginMsg = document.getElementById("dashboardLoginMsg");
const dashboardUsePasskeyBtn = document.getElementById("dashboardUsePasskeyBtn");
const dashboardEnrollPasskeyBtn = document.getElementById("dashboardEnrollPasskeyBtn");
const pdfArea = document.getElementById("pdfArea");
let dashboardLoaded = false;

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

function unlockDashboard() {
  document.body.classList.remove("private-locked");
  if (dashboardAccessScreen) dashboardAccessScreen.style.display = "none";
  if (pdfArea) pdfArea.style.display = "";

  if (!dashboardLoaded) {
    dashboardLoaded = true;
    loadDashboardData();
  }
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
    cristiana: pick(user, ["cristiana", "cristianaStatus", "faithStatus"])
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

function renderTable(users) {
  if (!usersTableBody) return;

  if (!users.length) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">No hay registros para mostrar.</td>
      </tr>
    `;
    return;
  }

  usersTableBody.innerHTML = users.map((user) => `
    <tr>
      <td>${escapeHtml(formatDate(user.timestamp))}</td>
      <td>${escapeHtml(user.nombreCompleto)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.telefono)}</td>
      <td>${escapeHtml(user.paisResidencia)}</td>
      <td>${escapeHtml(user.comunidad)}</td>
      <td>${escapeHtml(user.cristiana)}</td>
    </tr>
  `).join("");
}

function updateCounters() {
  if (summaryTotalCountEls?.length) {
    summaryTotalCountEls.forEach((el) => {
      el.textContent = allUsers.length;
    });
  }
  if (totalCount) totalCount.textContent = allUsers.length;
  if (filteredCount) filteredCount.textContent = filteredUsers.length;
  if (filteredCountFooter) filteredCountFooter.textContent = filteredUsers.length;
}

function applyFilters() {
  const search = normalizeText(searchInput?.value);
  const pais = paisFilter?.value || "";
  const comunidad = comunidadFilter?.value || "";
  const cristiana = cristianaFilter?.value || "";

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

  renderTable(filteredUsers);
  updateCounters();
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
    if (lastUpdatedText) {
      lastUpdatedText.textContent = "Cargando datos desde Supabase...";
    }

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

    filteredUsers = [...allUsers];

    fillSelectOptions(paisFilter, allUsers.map((u) => u.paisResidencia), "Todos");
    fillSelectOptions(comunidadFilter, allUsers.map((u) => u.comunidad), "Todas");
    fillSelectOptions(cristianaFilter, allUsers.map((u) => u.cristiana), "Todas");

    renderTable(filteredUsers);
    updateCounters();

    if (lastUpdatedText) {
      lastUpdatedText.textContent = "Actualizado correctamente";
    }
  } catch (error) {
    console.error("ERROR DASHBOARD:", error);

    const message = error?.message || "Error cargando datos del dashboard.";
    if (usersTableBody) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-cell">${message}</td>
        </tr>
      `;
    }

    if (lastUpdatedText) {
      lastUpdatedText.textContent = message;
    }
  }
}

async function exportPDF() {
  const area = document.getElementById("pdfArea");
  if (!area || typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
    alert("No se pudo exportar el PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;

  try {
    if (exportPdfBtn) {
      exportPdfBtn.disabled = true;
    }

    document.body.classList.add("exporting-pdf");

    const canvas = await html2canvas(area, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: document.body.scrollWidth,
      windowHeight: document.body.scrollHeight,
      scrollX: 0,
      scrollY: -window.scrollY
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("l", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const leftRightMargin = 15;
    const topMarginFirstPage = 15;
    const topMarginOtherPages = 22;
    const bottomMargin = 22;
    const footerHeight = 10;

    const imgWidth = pageWidth - leftRightMargin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pagePadding = 10; // espacio entre páginas

let yOffset = 0; // cuánto de la imagen ya se ha usado

// Primera página
pdf.addImage(
  imgData,
  "PNG",
  leftRightMargin,
  topMarginFirstPage,
  imgWidth,
  imgHeight
);

yOffset += pageHeight - topMarginFirstPage - bottomMargin - footerHeight;

// Páginas siguientes
while (yOffset < imgHeight) {
  pdf.addPage();

  const position = topMarginOtherPages - yOffset + pagePadding;

  pdf.addImage(
    imgData,
    "PNG",
    leftRightMargin,
    position,
    imgWidth,
    imgHeight
  );

  yOffset += pageHeight - topMarginOtherPages - bottomMargin - footerHeight;
}


    const totalPages = pdf.internal.getNumberOfPages();
    const exportDate = new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    pdf.setPage(totalPages);
    pdf.setFontSize(10);
    pdf.setTextColor(120, 102, 102);
    pdf.text(
      `Exportado el ${exportDate}`,
      leftRightMargin,
      pageHeight - 8
    );
    pdf.text(
      `Página ${totalPages} de ${totalPages}`,
      pageWidth - leftRightMargin,
      pageHeight - 8,
      { align: "right" }
    );

    pdf.save("dashboard-mujeres-con-proposito.pdf");
  } catch (error) {
    console.error("ERROR PDF:", error);
    alert("No se pudo generar el PDF.");
  } finally {
    document.body.classList.remove("exporting-pdf");

    if (exportPdfBtn) {
      exportPdfBtn.disabled = false;
    }
  }
}

searchInput?.addEventListener("input", applyFilters);
paisFilter?.addEventListener("change", applyFilters);
comunidadFilter?.addEventListener("change", applyFilters);
cristianaFilter?.addEventListener("change", applyFilters);
clearFiltersBtn?.addEventListener("click", clearFilters);
homePageBtn?.addEventListener("click", function () {
  window.location.href = "index.html";
});
exportPdfBtn?.addEventListener("click", exportPDF);

dashboardLoginBtn?.addEventListener("click", async function () {
  if (!await validateDashboardPassword()) return;
  unlockDashboard();
});

dashboardAdminBtn?.addEventListener("click", async function () {
  if (!await validateDashboardPassword()) return;
  window.location.href = "admin.html";
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
    unlockDashboard();
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
    unlockDashboard();
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

hasPrivateAccessGranted().then((hasSession) => {
  if (hasSession) {
    unlockDashboard();
    return;
  }

  dashboardAccessEmail?.focus();
});
