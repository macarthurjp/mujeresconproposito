document.addEventListener("DOMContentLoaded", function () {
  const body = document.body;

  const CONTACT_EMAILS = ["mujeresconproposito930@gmail.com", "ing.arthur03@gmail.com"];
  const CONTACT_EMAIL = CONTACT_EMAILS.join(", ");

  // Supabase configuration: reemplaza con tu proyecto Supabase.
  // Usa la URL del proyecto y la clave de API pública (Client API Key).
  const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";

  async function supabaseInsert(table, record) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase no está configurado.");
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    });

    return response;
  }

  function hasSupabaseConfig() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("https://"));
  }

  async function sendJoinToSupabase(payload) {
    return supabaseInsert("unirse", {
      id: payload.id,
      nombre: payload.nombre,
      apellido: payload.apellido,
      email: payload.email,
      telefono: payload.telefono,
      fecha_nacimiento: payload.fecha_nacimiento || null,
      estatus_matrimonial: payload.estatus_matrimonial || null,
      pais_nacimiento: payload.pais_nacimiento,
      pais_residencia: payload.pais_residencia,
      cristiana: payload.cristiana,
      comunidad: payload.comunidad,
      comments: payload.comments || null,
      hijos: payload.hijos ? Number(payload.hijos) : 0
    });
  }


  async function sendContactToSupabase(payload) {
    return supabaseInsert("contact_messages", {
      nombre: payload.nombre,
      email: payload.email,
      mensaje: payload.mensaje,
      destino: payload.destino,
      source: "web"
    });
  }

  function getSupabaseBrowserClient() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!window.mcpSupabaseClient) {
      window.mcpSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.mcpSupabaseClient;
  }

  async function invokeEmailEdgeFunction(functionName, payload) {
    const client = getSupabaseBrowserClient();
    if (!client?.functions) {
      throw new Error("Supabase Functions no está disponible.");
    }

    const { data, error } = await client.functions.invoke(functionName, {
      body: payload
    });

    if (error) {
      let details = "";

      if (error.context) {
        try {
          const errorBody = await error.context.clone().json();
          details = errorBody?.error || errorBody?.message || JSON.stringify(errorBody);
        } catch (_) {
          try {
            details = await error.context.clone().text();
          } catch (_) {
            details = "";
          }
        }
      }

      throw new Error(details || error.message || "Error llamando Edge Function.");
    }

    return data;
  }

  async function sendWelcomeEmailWithEdgeFunction(payload) {
    return invokeEmailEdgeFunction("send-welcome-email", {
      nombre: payload.nombre || "",
      apellido: payload.apellido || "",
      email: payload.email || "",
      comunidad: payload.comunidad || ""
    });
  }

  async function sendBirthdayEmailForNewMember(payload) {
    if (!payload.id) return { ok: false, skipped: true };

    return invokeEmailEdgeFunction("send-birthday-emails", {
      memberId: payload.id
    });
  }

  async function sendAdminRegistrationEmailWithEdgeFunction(payload) {
    return invokeEmailEdgeFunction("send-admin-notification", {
      nombre: payload.nombre || "",
      apellido: payload.apellido || "",
      email: payload.email || "",
      telefono: payload.telefono || "",
      fecha_nacimiento: payload.fecha_nacimiento || "",
      estatus_matrimonial: payload.estatus_matrimonial || "",
      pais_nacimiento: payload.pais_nacimiento || "",
      pais_residencia: payload.pais_residencia || "",
      cristiana: payload.cristiana || "",
      comunidad: payload.comunidad || "",
      comments: payload.comments || "",
      hijos: payload.hijos || "0"
    });
  }

  async function sendContactEmailWithEdgeFunction(payload) {
    return invokeEmailEdgeFunction("send-contact-email", {
      nombre: payload.nombre || "",
      email: payload.email || "",
      mensaje: payload.mensaje || "",
      destino: payload.destino || CONTACT_EMAIL
    });
  }

  async function getTodayBirthdaysFromEdgeFunction() {
    return invokeEmailEdgeFunction("get-today-birthdays", {});
  }

  async function uploadImageToSupabaseBucket(file, bucket, folder = "uploads") {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Supabase JS no está cargado o configurado.");
    if (!file) throw new Error("No se seleccionó archivo.");

    const safeName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .toLowerCase();

    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg"
      });

    if (uploadError) throw uploadError;

    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  function formatTimeForDisplay(timeValue) {
    const match = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return String(timeValue || "").trim();

    const hour24 = Number(match[1]);
    const minutes = match[2];
    if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return String(timeValue || "").trim();

    return minutes === "00" ? `${hour24}h` : `${hour24}h${minutes}`;
  }

  function getTimeInputValue(scheduleText) {
    const value = String(scheduleText || "").trim();
    if (!value) return "";

    const europeanHourMatch = value.match(/\b([01]?\d|2[0-3])h(?:([0-5]\d))?\b/i);
    if (europeanHourMatch) {
      return `${europeanHourMatch[1].padStart(2, "0")}:${europeanHourMatch[2] || "00"}`;
    }

    const twentyFourHourMatch = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (twentyFourHourMatch) {
      return `${twentyFourHourMatch[1].padStart(2, "0")}:${twentyFourHourMatch[2]}`;
    }

    const twelveHourMatch = value.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*([AP]\.?M\.?)\b/i);
    if (!twelveHourMatch) return "";

    let hour = Number(twelveHourMatch[1]);
    const minutes = twelveHourMatch[2];
    const period = twelveHourMatch[3].toUpperCase().replace(/\./g, "");
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minutes}`;
  }

  function getHourOptions(selectedHour = "") {
    const selected = String(selectedHour || "").padStart(2, "0");
    return Array.from({ length: 24 }, (_, hour) => {
      const value = String(hour).padStart(2, "0");
      return `<option value="${value}" ${value === selected ? "selected" : ""}>${hour}h</option>`;
    }).join("");
  }

  function getMinuteOptions(selectedMinutes = "00") {
    const selected = String(selectedMinutes || "00").padStart(2, "0");
    return ["00", "15", "30", "45"].map((minutes) =>
      `<option value="${minutes}" ${minutes === selected ? "selected" : ""}>${minutes} min</option>`
    ).join("");
  }

  function splitTimeValue(timeValue) {
    const [hour = "00", minutes = "00"] = String(timeValue || "00:00").split(":");
    return {
      hour: hour.padStart(2, "0"),
      minutes: ["00", "15", "30", "45"].includes(minutes) ? minutes : "00"
    };
  }

  function combineTimeParts(hour, minutes) {
    if (hour === "" || hour == null) return "";
    return `${String(hour).padStart(2, "0")}:${String(minutes || "00").padStart(2, "0")}`;
  }

  const EVENT_WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  function joinSpanishList(items) {
    const cleanItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (cleanItems.length <= 1) return cleanItems[0] || "";
    if (cleanItems.length === 2) return `${cleanItems[0]} y ${cleanItems[1]}`;
    return `${cleanItems.slice(0, -1).join(", ")} y ${cleanItems[cleanItems.length - 1]}`;
  }

  function getScheduleParts(scheduleText) {
    const value = String(scheduleText || "").trim();
    const lowerValue = value.toLowerCase();
    const days = EVENT_WEEK_DAYS.filter((day) => lowerValue.includes(day.toLowerCase()));
    const frequency = lowerValue.includes("diario") || lowerValue.includes("lunes a viernes")
      ? "diario"
      : days.length >= 2
        ? "dos-veces"
        : "semanal";

    return {
      frequency,
      days,
      time: getTimeInputValue(value)
    };
  }

  function buildEventSchedule({ frequency, days, time }) {
    const selectedDays = Array.isArray(days) ? days.filter(Boolean) : [];
    const displayTime = formatTimeForDisplay(time);

    if (!displayTime) {
      throw new Error("Selecciona la hora del evento.");
    }

    if (frequency === "diario") {
      return `Diario · ${displayTime}`;
    }

    if (frequency === "semanal") {
      if (selectedDays.length !== 1) {
        throw new Error("Para un evento semanal, selecciona exactamente 1 día.");
      }
      return `${selectedDays[0]} · ${displayTime}`;
    }

    if (frequency === "dos-veces") {
      if (selectedDays.length !== 2) {
        throw new Error("Para dos veces a la semana, selecciona exactamente 2 días.");
      }
      return `${joinSpanishList(selectedDays)} · ${displayTime}`;
    }

    throw new Error("Selecciona una frecuencia válida.");
  }

  function updateScheduleDaysVisibility(frequencySelect, daysContainer) {
    if (!frequencySelect || !daysContainer) return;
    const isDaily = frequencySelect.value === "diario";
    daysContainer.classList.toggle("is-hidden", isDaily);
    daysContainer.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.disabled = isDaily;
      if (isDaily) checkbox.checked = false;
    });
  }

  /* -----------------------------------------
     PAÍSES
  ----------------------------------------- */
  const countries = [
    "Afganistán","Albania","Alemania","Andorra","Angola","Antigua y Barbuda",
    "Arabia Saudita","Argelia","Argentina","Armenia","Australia","Austria",
    "Azerbaiyán","Bahamas","Bangladés","Barbados","Baréin","Bélgica","Belice",
    "Benín","Bielorrusia","Bolivia","Bosnia y Herzegovina","Botsuana","Brasil",
    "Brunéi","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Camboya","Camerún",
    "Canadá","Catar","Chad","Chile","China","Chipre","Colombia","Comoras","Congo",
    "Corea del Norte","Corea del Sur","Costa de Marfil","Costa Rica","Croacia",
    "Cuba","Dinamarca","Dominica","Ecuador","Egipto","El Salvador",
    "Emiratos Árabes Unidos","Eritrea","Eslovaquia","Eslovenia","España",
    "Estados Unidos","Estonia","Esuatini","Etiopía","Filipinas","Finlandia","Fiyi",
    "Francia","Gabón","Gambia","Georgia","Ghana","Granada","Grecia","Guatemala",
    "Guinea","Guinea-Bisáu","Guinea Ecuatorial","Guyana","Haití","Honduras",
    "Hungría","India","Indonesia","Irak","Irán","Irlanda","Islandia",
    "Islas Marshall","Islas Salomón","Israel","Italia","Jamaica","Japón","Jordania",
    "Kazajistán","Kenia","Kirguistán","Kiribati","Kuwait","Laos","Lesoto","Letonia",
    "Líbano","Liberia","Libia","Liechtenstein","Lituania","Luxemburgo",
    "Macedonia del Norte","Madagascar","Malasia","Malaui","Maldivas","Malí","Malta",
    "Marruecos","Mauricio","Mauritania","México","Micronesia","Moldavia","Mónaco",
    "Mongolia","Montenegro","Mozambique","Namibia","Nauru","Nepal","Nicaragua",
    "Níger","Nigeria","Noruega","Nueva Zelanda","Omán","Países Bajos","Pakistán",
    "Palaos","Panamá","Papúa Nueva Guinea","Paraguay","Perú","Polonia","Portugal",
    "Reino Unido","República Centroafricana","República Checa","República del Congo",
    "República Dominicana","Ruanda","Rumania","Rusia","Samoa",
    "San Cristóbal y Nieves","San Marino","San Vicente y las Granadinas",
    "Santa Lucía","Santo Tomé y Príncipe","Senegal","Serbia","Seychelles",
    "Sierra Leona","Singapur","Siria","Somalia","Sri Lanka","Sudáfrica","Sudán",
    "Sudán del Sur","Suecia","Suiza","Surinam","Tailandia","Tanzania","Tayikistán",
    "Timor Oriental","Togo","Tonga","Trinidad y Tobago","Túnez","Turkmenistán",
    "Turquía","Tuvalu","Ucrania","Uganda","Uruguay","Uzbekistán","Vanuatu",
    "Vaticano","Venezuela","Vietnam","Yemen","Zambia","Zimbabue","Otro"
  ];

  function fillCountrySelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentOptions = Array.from(select.querySelectorAll("option")).map(opt => opt.value);
    countries.forEach(country => {
      if (!currentOptions.includes(country)) {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
      }
    });
  }

  fillCountrySelect("pais_nacimiento");
  fillCountrySelect("pais_residencia");

  /* -----------------------------------------
     HELPERS
  ----------------------------------------- */
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function getField(obj, keys = [], fallback = "") {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function isImageUrl(value) {
  const url = String(value || "").trim();

  return /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(url)
    || /^https?:\/\/.*(supabase|googleusercontent|drive\.google|cloudinary|images|img)/i.test(url);
}
   /* -----------------------------------------
     EVENTOS DINÁMICOS + CARRUSEL
  ----------------------------------------- */
  const eventsTrack = document.getElementById("eventsGrid");
  const eventsLeft = document.getElementById("eventsLeft");
  const eventsRight = document.getElementById("eventsRight");
  let eventsIndex = 0;

  let eventsStartX = 0;
  let eventsCurrentX = 0;
  let eventsIsDragging = false;
  let eventsAutoplay = null;

  function getEventsVisibleCount() {
    if (window.innerWidth <= 620) return 1;
    if (window.innerWidth <= 920) return 2;
    return 3;
  }

    function getEventsGap() {
    if (!eventsTrack) return 0;
    const styles = window.getComputedStyle(eventsTrack);
    return parseFloat(styles.gap || styles.columnGap || "0") || 0;
  }

    function getEventsCardWidth() {
    const cards = eventsTrack ? Array.from(eventsTrack.querySelectorAll(".card")) : [];
    if (!cards.length) return 0;
    return cards[0].offsetWidth || cards[0].getBoundingClientRect().width || 0;
  }

  function getEventsMaxIndex() {
    if (!eventsTrack) return 0;
    const cards = Array.from(eventsTrack.querySelectorAll(".card"));
    return Math.max(0, cards.length - getEventsVisibleCount());
  }

  function stopEventsAutoplay() {
    if (eventsAutoplay) {
      clearInterval(eventsAutoplay);
      eventsAutoplay = null;
    }
  }

  function startEventsAutoplay() {
    if (!eventsTrack) return;
    stopEventsAutoplay();

    const cards = Array.from(eventsTrack.querySelectorAll(".card"));
    const visibleCount = getEventsVisibleCount();

    if (cards.length <= visibleCount) return;

    eventsAutoplay = setInterval(() => {
      const maxIndex = getEventsMaxIndex();

      if (eventsIndex >= maxIndex) {
        eventsIndex = 0;
      } else {
        eventsIndex += 1;
      }

      updateEventsCarousel(true);
    }, 4500);
  }

  function refreshEventsCarousel() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateEventsCarousel(false);
      });
    });
  }

  function getEventsOffsetByIndex(index) {
    if (!eventsTrack) return 0;
    const cards = Array.from(eventsTrack.querySelectorAll(".card"));
    if (!cards.length || !cards[index]) return 0;
    return cards[index].offsetLeft;
  }

  function updateEventsCarousel(withAnimation = true) {
    if (!eventsTrack || !eventsLeft || !eventsRight) return;

    const cards = Array.from(eventsTrack.querySelectorAll(".card"));
    const visibleCount = getEventsVisibleCount();

    if (!cards.length) {
      eventsLeft.classList.add("hidden");
      eventsRight.classList.add("hidden");
      return;
    }

    const maxIndex = Math.max(0, cards.length - visibleCount);

    if (eventsIndex < 0) eventsIndex = 0;
    if (eventsIndex > maxIndex) eventsIndex = maxIndex;

    const cardWidth = getEventsCardWidth();
    const gap = getEventsGap();
    const scrollAmount = (cardWidth + gap) * eventsIndex;

    eventsTrack.scrollTo({
      left: scrollAmount,
      behavior: withAnimation ? "smooth" : "auto"
    });

    eventsLeft.classList.toggle("hidden", eventsIndex === 0 || cards.length <= visibleCount);
    eventsRight.classList.toggle("hidden", eventsIndex >= maxIndex || cards.length <= visibleCount);
  }

  function bindEventsSwipe() {
    if (!eventsTrack || eventsTrack.dataset.swipeBound === "events" || eventsTrack.dataset.disableTransformSwipe === "true") return;

    eventsTrack.addEventListener("touchstart", (e) => {
      if (!e.touches.length) return;
      stopEventsAutoplay();
      eventsIsDragging = true;
      eventsStartX = e.touches[0].clientX;
      eventsCurrentX = eventsStartX;
      eventsTrack.style.transition = "none";
    }, { passive: true });

    eventsTrack.addEventListener("touchmove", (e) => {
      if (!eventsIsDragging || !e.touches.length) return;

      eventsCurrentX = e.touches[0].clientX;
      const diff = eventsCurrentX - eventsStartX;

      const baseOffset = getEventsOffsetByIndex(eventsIndex);
      const dragOffset = baseOffset - diff;

      eventsTrack.style.transform = `translateX(-${Math.max(0, dragOffset)}px)`;
    }, { passive: true });

    eventsTrack.addEventListener("touchend", () => {
      if (!eventsIsDragging) return;
      eventsIsDragging = false;

      const diff = eventsCurrentX - eventsStartX;
      const threshold = 50;
      const maxIndex = getEventsMaxIndex();

      if (diff < -threshold && eventsIndex < maxIndex) {
        eventsIndex += 1;
      } else if (diff > threshold && eventsIndex > 0) {
        eventsIndex -= 1;
      }

      updateEventsCarousel(true);
      startEventsAutoplay();
    });

    eventsTrack.addEventListener("touchcancel", () => {
      eventsIsDragging = false;
      updateEventsCarousel(true);
      startEventsAutoplay();
    });

    eventsTrack.dataset.swipeBound = "events";
  }

  function bindEventsCarousel() {
    if (!eventsTrack || !eventsLeft || !eventsRight) return;

    if (eventsLeft.dataset.bound !== "true" && eventsLeft.dataset.bound !== "hard-fixed") {
      eventsLeft.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopEventsAutoplay();
        eventsIndex = Math.max(0, eventsIndex - 1);
        updateEventsCarousel(true);
        startEventsAutoplay();
      };
      eventsLeft.dataset.bound = "true";
    }

    if (eventsRight.dataset.bound !== "true" && eventsRight.dataset.bound !== "hard-fixed") {
      eventsRight.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopEventsAutoplay();
        eventsIndex = Math.min(getEventsMaxIndex(), eventsIndex + 1);
        updateEventsCarousel(true);
        startEventsAutoplay();
      };
      eventsRight.dataset.bound = "true";
    }

    eventsTrack.onmouseenter = stopEventsAutoplay;
    eventsTrack.onmouseleave = startEventsAutoplay;

    eventsLeft.onmouseenter = stopEventsAutoplay;
    eventsRight.onmouseenter = stopEventsAutoplay;
    eventsLeft.onmouseleave = startEventsAutoplay;
    eventsRight.onmouseleave = startEventsAutoplay;

    bindEventsSwipe();
    refreshEventsCarousel();
    startEventsAutoplay();
  }

  function renderEvents(events) {
    const eventsGrid = document.getElementById("eventsGrid") || document.querySelector("#events .card-grid");
    if (!eventsGrid) {
      console.warn("No se encontró el contenedor de eventos (#eventsGrid o #events .card-grid)");
      return;
    }

    const rawItems = Array.isArray(events) ? events : [];

    const items = rawItems.map(item => ({
      icon: getField(item, ["icon", "Icon"], "✨"),
      title: getField(item, ["title", "titulo", "Titulo", "nombre", "Nombre"], "Actividad"),
      schedule: getField(item, ["schedule", "horario", "Horario", "fecha", "Fecha"], "Próximamente"),
      link: getField(item, ["link", "Link", "url", "URL"], "#")
    }));

    function renderEventIcon(icon, title) {
      const safeIcon = String(icon || "✦").trim();

      if (isImageUrl(safeIcon)) {
        return `
          <div class="card-icon premium-icon event-image-icon">
            <img src="${escapeHtml(safeIcon)}" alt="${escapeHtml(title || "Icono del evento")}" loading="lazy">
          </div>
        `;
      }

      return `<div class="card-icon premium-icon">${escapeHtml(safeIcon || "✦")}</div>`;
    }

    eventsGrid.innerHTML = items.length ? items.map(item => `
      <div class="card">
        ${renderEventIcon(item.icon, item.title)}
        <h3>${escapeHtml(item.title || "Actividad")}</h3>
        <p><strong>${escapeHtml(item.schedule || "Próximamente")}</strong></p>
        <a class="btn" href="${escapeHtml(item.link || "#")}" target="_blank" rel="noopener noreferrer">Unirme</a>
      </div>
    `).join("") : `
      <div class="card">
        <div class="card-icon premium-icon">✦</div>
        <h3>Sin eventos publicados</h3>
        <p><strong>Agrega eventos desde el admin.</strong></p>
      </div>
    `;

    eventsGrid.scrollLeft = 0;
    eventsGrid.style.transform = "none";
    eventsGrid.style.transition = "none";
    eventsIndex = 0;
    bindEventsCarousel();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateEventsCarousel(false);
        if (typeof window.mcpHardFixEventsArrows === "function") {
          window.mcpHardFixEventsArrows();
        }
      });
    });

    setTimeout(() => {
      if (typeof window.mcpHardFixEventsArrows === "function") {
        window.mcpHardFixEventsArrows();
      }
    }, 180);
  }
  /* -----------------------------------------
     CARRUSEL INVITADAS
  ----------------------------------------- */
  const inviteesTrack = document.getElementById("inviteesTrack");
  const inviteesLeft = document.getElementById("invLeft");
  const inviteesRight = document.getElementById("invRight");
  let inviteesIndex = 0;

  let inviteesStartX = 0;
  let inviteesCurrentX = 0;
  let inviteesIsDragging = false;
	  let inviteesMoved = false;
	  let hasSupabaseInviteesResponse = false;

  function getInviteesVisibleCount() {
    if (window.innerWidth <= 768) return 1;
    return 2;
  }

  function getInviteesGap() {
  if (!inviteesTrack) return 0;
  const styles = window.getComputedStyle(inviteesTrack);
  return parseFloat(styles.gap || styles.columnGap || "0") || 0;
  }

  function getInviteesCardWidth() {
    const cards = inviteesTrack ? Array.from(inviteesTrack.querySelectorAll(".card")) : [];
    if (!cards.length) return 0;
    return cards[0].offsetWidth || cards[0].getBoundingClientRect().width || 0;
  }

  function getInviteesMaxIndex() {
    if (!inviteesTrack) return 0;
    const cards = Array.from(inviteesTrack.querySelectorAll(".card"));
    return Math.max(0, cards.length - getInviteesVisibleCount());
  }

  function setInviteesTranslate(offset, withAnimation = true) {
    if (!inviteesTrack) return;
    inviteesTrack.style.transition = withAnimation
      ? "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    inviteesTrack.style.transform = `translateX(-${offset}px)`;
  }

  function getInviteesOffsetByIndex(index) {
    if (!inviteesTrack) return 0;
    const cards = Array.from(inviteesTrack.querySelectorAll(".card"));
    if (!cards.length || !cards[index]) return 0;
    return cards[index].offsetLeft;
  }

  function updateInviteesCarousel(withAnimation = true) {
    if (!inviteesTrack || !inviteesLeft || !inviteesRight) return;

    const cards = Array.from(inviteesTrack.querySelectorAll(".card"));
    const visibleCount = getInviteesVisibleCount();

    if (!cards.length) {
      setInviteesTranslate(0, withAnimation);
      inviteesLeft.classList.add("hidden");
      inviteesRight.classList.add("hidden");
      return;
    }

    const maxIndex = Math.max(0, cards.length - visibleCount);

    if (inviteesIndex < 0) inviteesIndex = 0;
    if (inviteesIndex > maxIndex) inviteesIndex = maxIndex;

    const offset = getInviteesOffsetByIndex(inviteesIndex);
    setInviteesTranslate(offset, withAnimation);

    inviteesLeft.classList.toggle("hidden", inviteesIndex === 0 || cards.length <= visibleCount);
    inviteesRight.classList.toggle("hidden", inviteesIndex >= maxIndex || cards.length <= visibleCount);
  }

  function goToInviteesIndex(newIndex) {
    inviteesIndex = newIndex;
    updateInviteesCarousel(true);
  }

  function bindInviteesSwipe() {
    if (!inviteesTrack || inviteesTrack.dataset.swipeBound === "invitees") return;

    inviteesTrack.addEventListener("touchstart", (e) => {
      if (!e.touches.length) return;
      inviteesIsDragging = true;
      inviteesMoved = false;
      inviteesStartX = e.touches[0].clientX;
      inviteesCurrentX = inviteesStartX;
      inviteesTrack.style.transition = "none";
    }, { passive: true });

    inviteesTrack.addEventListener("touchmove", (e) => {
      if (!inviteesIsDragging || !e.touches.length) return;

      inviteesCurrentX = e.touches[0].clientX;
      const diff = inviteesCurrentX - inviteesStartX;

      if (Math.abs(diff) > 8) {
        inviteesMoved = true;
      }

      const baseOffset = getInviteesOffsetByIndex(inviteesIndex);
      const dragOffset = baseOffset - diff;

      inviteesTrack.style.transform = `translateX(-${Math.max(0, dragOffset)}px)`;
    }, { passive: true });

     inviteesTrack.addEventListener("touchend", () => {
      if (!inviteesIsDragging) return;
      inviteesIsDragging = false;

      const diff = inviteesCurrentX - inviteesStartX;
      const threshold = 50;
      const maxIndex = getInviteesMaxIndex();

      if (diff < -threshold && inviteesIndex < maxIndex) {
        inviteesIndex += 1;
      } else if (diff > threshold && inviteesIndex > 0) {
        inviteesIndex -= 1;
      }

      updateInviteesCarousel(true);

      setTimeout(() => {
        inviteesMoved = false;
      }, 0);
    });

      inviteesTrack.addEventListener("touchcancel", () => {
      inviteesIsDragging = false;
      updateInviteesCarousel(true);
      inviteesMoved = false;
    });

    inviteesTrack.dataset.swipeBound = "invitees";
  }

  function refreshInviteesCarousel() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateInviteesCarousel(false);
      });
    });
  }

  function bindInviteesCarousel() {
    if (!inviteesTrack || !inviteesLeft || !inviteesRight) return;

    if (inviteesLeft.dataset.bound !== "true") {
      inviteesLeft.onclick = () => {
        goToInviteesIndex(inviteesIndex - 1);
      };
      inviteesLeft.dataset.bound = "true";
    }

    if (inviteesRight.dataset.bound !== "true") {
      inviteesRight.onclick = () => {
        goToInviteesIndex(inviteesIndex + 1);
      };
      inviteesRight.dataset.bound = "true";
    }

    bindInviteesSwipe();
    refreshInviteesCarousel();
  }

  /* -----------------------------------------
     MENÚ HAMBURGUESA
  ----------------------------------------- */
    const menu = document.getElementById("nav-menu");
  const menuOverlay = document.getElementById("menu-overlay");
  const hamburger = document.querySelector(".hamburger");

  if (hamburger) {
    hamburger.setAttribute("aria-expanded", "false");
  }

  function syncHamburgerState() {
    const isOpen = !!(menu && (menu.classList.contains("open") || menu.classList.contains("show")));

    if (hamburger) {
      hamburger.classList.toggle("active", isOpen);
      hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    if (menuOverlay) {
      menuOverlay.classList.toggle("visible", isOpen);
    }
  }

  function closeMenu() {
    menu?.classList.remove("open");
    menu?.classList.remove("show");
    menu?.classList.remove("active");
    document.body.classList.remove("menu-open");
    menuOverlay?.classList.remove("visible");
    menuOverlay?.classList.remove("active");
    syncHamburgerState();
  }

  window.toggleMenu = function () {
    if (!menu) return;
    menu.classList.toggle("open");
    document.body.classList.toggle("menu-open", menu.classList.contains("open"));
    syncHamburgerState();
  };

  closeMenu();

  menuOverlay?.addEventListener("click", function () {
    closeMenu();
  });
    menu?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 850) {
        closeMenu();
      }
    });
  });

  /* -----------------------------------------
     LIGHTBOX GALERÍA
  ----------------------------------------- */
  let galleryImages = [];
  let galleryIndex = 0;
  let lightboxTouchStartX = 0;
  let lightboxTouchCurrentX = 0;
  let lightboxTouchActive = false;

  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const nextBtn = document.getElementById("next");
  const prevBtn = document.getElementById("prev");

  function updateLightboxCounter() {
  if (lightboxCounter) {
    lightboxCounter.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
  }
}
function isLightboxOpen() {
  return !!lightbox?.classList.contains("open");
}

function showPrevLightboxImage() {
  if (!galleryImages.length) return;
  galleryIndex = (galleryIndex - 1 + galleryImages.length) % galleryImages.length;
  if (lightboxImg) lightboxImg.src = galleryImages[galleryIndex];
  updateLightboxCounter();
}

function showNextLightboxImage() {
  if (!galleryImages.length) return;
  galleryIndex = (galleryIndex + 1) % galleryImages.length;
  if (lightboxImg) lightboxImg.src = galleryImages[galleryIndex];
  updateLightboxCounter();
}

function handleLightboxKeyboard(e) {
  if (!isLightboxOpen()) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    showPrevLightboxImage();
    return;
  }

  if (e.key === "ArrowRight") {
    e.preventDefault();
    showNextLightboxImage();
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    lightbox?.classList.remove("open");
  }
}
function setLightboxImage(src) {
  if (lightboxImg) lightboxImg.src = src;
}

function openLightboxFromImages(images = [], startIndex = 0) {
  if (!Array.isArray(images) || !images.length) return;

  galleryImages = images.filter(Boolean);
  if (!galleryImages.length) return;

  galleryIndex = Math.max(0, Math.min(startIndex, galleryImages.length - 1));
  setLightboxImage(galleryImages[galleryIndex]);
  lightbox?.classList.add("open");
  updateLightboxCounter();
}

function getVisibleActiveGalleryImages() {
  return Array.from(document.querySelectorAll(".gallery-row.active img"));
}

function openLightbox(src, index) {
  const visibleImgs = getVisibleActiveGalleryImages();
  const visibleSources = visibleImgs.map(img => img.src).filter(Boolean);

  if (visibleSources.length) {
    openLightboxFromImages(visibleSources, index);
    return;
  }

  if (!src) return;
  openLightboxFromImages([src], 0);
}

  function bindGalleryClicks() {
  document.querySelectorAll(".gallery-stack-card").forEach(card => {
    card.removeEventListener("click", handleGalleryStackClick);
    card.addEventListener("click", handleGalleryStackClick);

    card.removeEventListener("keydown", handleGalleryStackKeydown);
    card.addEventListener("keydown", handleGalleryStackKeydown);
  });
}

function handleGalleryStackClick(e) {
  const card = e.currentTarget;
  const images = JSON.parse(card.dataset.images || "[]").filter(Boolean);
  if (!images.length) return;

  openLightboxFromImages(images, 0);
}

function handleGalleryStackKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleGalleryStackClick({ currentTarget: e.currentTarget });
  }
}

  nextBtn?.addEventListener("click", function (e) {
  e.stopPropagation();
  showNextLightboxImage();
});

/* =========================================================
   MCP930 — HARD FIX EVENTOS ARROWS
   Este bloque va al final para sobrescribir cualquier lógica anterior.
========================================================= */
(function hardFixEventsArrows() {
  // Expose the function to window for programmatic calls
  function init() {
    window.mcpHardFixEventsArrows = init;
    const track = document.getElementById("eventsGrid");
    const left = document.getElementById("eventsLeft");
    const right = document.getElementById("eventsRight");

    if (!track || !left || !right) return;

    track.dataset.disableTransformSwipe = "true";

    track.style.overflowX = "auto";
    track.style.display = "flex";
    track.style.flexWrap = "nowrap";
    track.style.scrollBehavior = "smooth";
    track.style.transform = "none";
    track.style.transition = "none";
    track.style.webkitOverflowScrolling = "touch";

    function forceEventCardWidths() {
      const cardWidth = window.innerWidth <= 620
        ? "86vw"
        : window.innerWidth <= 920
          ? "calc((100% - 24px) / 2)"
          : "calc((100% - 48px) / 3)";

      track.querySelectorAll(".card").forEach(card => {
        card.style.flex = `0 0 ${cardWidth}`;
        card.style.width = cardWidth;
        card.style.minWidth = cardWidth;
        card.style.maxWidth = "none";
      });
    }

    forceEventCardWidths();

    function getAmount() {
      const firstCard = track.querySelector(".card");
      if (!firstCard) return 360;
      const styles = window.getComputedStyle(track);
      const gap = parseFloat(styles.gap || styles.columnGap || "0") || 24;
      return firstCard.getBoundingClientRect().width + gap;
    }

    function updateButtons() {
      forceEventCardWidths();

      const cards = Array.from(track.querySelectorAll(".card"));
      const visibleCount = window.innerWidth <= 620 ? 1 : window.innerWidth <= 920 ? 2 : 3;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const current = track.scrollLeft;
      const canScroll = cards.length > visibleCount;

      left.classList.toggle("hidden", !canScroll || current <= 5);
      right.classList.toggle("hidden", !canScroll || current >= maxScroll - 5);

      left.disabled = !canScroll || current <= 5;
      right.disabled = !canScroll || current >= maxScroll - 5;

      left.setAttribute("aria-disabled", left.disabled ? "true" : "false");
      right.setAttribute("aria-disabled", right.disabled ? "true" : "false");

      left.style.pointerEvents = left.disabled ? "none" : "auto";
      right.style.pointerEvents = right.disabled ? "none" : "auto";
      left.style.opacity = left.disabled ? "0.35" : "1";
      right.style.opacity = right.disabled ? "0.35" : "1";
    }

    function move(direction) {
      track.style.transform = "none";
      track.style.transition = "none";
      track.scrollBy({
        left: direction * getAmount(),
        behavior: "smooth"
      });

      setTimeout(updateButtons, 80);
      setTimeout(updateButtons, 360);
      setTimeout(updateButtons, 700);
    }

    left.dataset.bound = "hard-fixed";
    right.dataset.bound = "hard-fixed";

    left.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      move(-1);
      return false;
    };

    right.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      move(1);
      return false;
    };

    track.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", function () {
      track.style.transform = "none";
      forceEventCardWidths();
      updateButtons();
    });

    setTimeout(updateButtons, 100);
    setTimeout(updateButtons, 600);
    setTimeout(updateButtons, 1200);
    setTimeout(function () {
      forceEventCardWidths();
      updateButtons();
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



prevBtn?.addEventListener("click", function (e) {
  e.stopPropagation();
  showPrevLightboxImage();
});

  lightbox?.addEventListener("click", function (e) {
    if (e.target.id === "lightbox") {
      lightbox.classList.remove("open");
    }
  });
  document.addEventListener("keydown", handleLightboxKeyboard);

  lightbox?.addEventListener("touchstart", function (e) {
  if (!isLightboxOpen() || !e.touches.length) return;
  lightboxTouchActive = true;
  lightboxTouchStartX = e.touches[0].clientX;
  lightboxTouchCurrentX = lightboxTouchStartX;
}, { passive: true });

lightbox?.addEventListener("touchmove", function (e) {
  if (!lightboxTouchActive || !e.touches.length) return;
  lightboxTouchCurrentX = e.touches[0].clientX;
}, { passive: true });

lightbox?.addEventListener("touchend", function () {
  if (!lightboxTouchActive) return;

  const diff = lightboxTouchCurrentX - lightboxTouchStartX;
  const threshold = 50;

  lightboxTouchActive = false;

  if (diff <= -threshold) {
    showNextLightboxImage();
    return;
  }

  if (diff >= threshold) {
    showPrevLightboxImage();
  }
});

lightbox?.addEventListener("touchcancel", function () {
  lightboxTouchActive = false;
});
  /* -----------------------------------------
     LIGHTBOX INVITADAS
  ----------------------------------------- */
  const inviteeLightbox = document.getElementById("invitee-lightbox");
  const inviteeImg = document.getElementById("invitee-lightbox-img");
  const inviteeName = document.getElementById("invitee-lightbox-name");
  const inviteeTitle = document.getElementById("invitee-lightbox-title");
  const inviteeClose = document.getElementById("invitee-lightbox-close");

  window.openInviteeLightbox = function (img, name, title) {
    if (inviteeImg) inviteeImg.src = img;
    if (inviteeName) inviteeName.textContent = name;
    if (inviteeTitle) inviteeTitle.textContent = title;
    inviteeLightbox?.classList.add("open");
  };

  inviteeClose?.addEventListener("click", function () {
    inviteeLightbox?.classList.remove("open");
  });

  inviteeLightbox?.addEventListener("click", function (e) {
    if (e.target.id === "invitee-lightbox") {
      inviteeLightbox.classList.remove("open");
    }
  });

  /* -----------------------------------------
     YOUTUBE AUTO SLIDE
  ----------------------------------------- */
  const ytCarousel = document.querySelector(".youtube-carousel");
  let ytOffset = 0;

  function autoSlideYouTube() {
    if (!ytCarousel) return;
    ytOffset += 320;
    if (ytOffset >= ytCarousel.scrollWidth) ytOffset = 0;

    ytCarousel.scrollTo({
      left: ytOffset,
      behavior: "smooth"
    });
  }

  if (ytCarousel) {
    setInterval(autoSlideYouTube, 3000);
  }

  /* -----------------------------------------
     MODAL DONACIÓN
  ----------------------------------------- */
  const donateModal = document.getElementById("donateModal");
  const openDonateModalBtn = document.getElementById("openDonateModal");
  const openDonateFromMenuBtn = document.getElementById("openDonateFromMenu");
  const closeDonateModalBtn = document.getElementById("closeDonateModal");
  const donateModalContent = document.querySelector("#donateModal .modal-content");

  function openDonateModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    closeMenu();
    donateModal?.classList.add("open");
    body.style.overflow = "hidden";
  }

  function closeDonateModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    donateModal?.classList.remove("open");
    body.style.overflow = "";
  }

  openDonateModalBtn?.addEventListener("click", openDonateModal);
  openDonateFromMenuBtn?.addEventListener("click", openDonateModal);
  closeDonateModalBtn?.addEventListener("click", closeDonateModal);

  donateModal?.addEventListener("click", function (e) {
    if (e.target === donateModal) {
      closeDonateModal();
    }
  });

  donateModalContent?.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  /* -----------------------------------------
     MODAL UNIRSE
  ----------------------------------------- */
  const joinModal = document.getElementById("joinModal");
  const joinForm = document.getElementById("joinForm");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const joinModalContent = document.querySelector("#joinModal .join-modal-content");

  const openJoinModalMenuBtn = document.getElementById("openJoinModalMenu");
  const openJoinModalHeroBtn = document.getElementById("openJoinModalHero");
  const openJoinModalSectionBtn = document.getElementById("openJoinModalSection");
  const closeJoinModalBtn = document.getElementById("closeJoinModal");

  function openJoinModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    closeMenu();
    joinModal?.classList.add("open");
    body.style.overflow = "hidden";
  }

  function closeJoinModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    joinModal?.classList.remove("open");
    body.style.overflow = "";
  }

  openJoinModalMenuBtn?.addEventListener("click", openJoinModal);
  openJoinModalHeroBtn?.addEventListener("click", openJoinModal);
  openJoinModalSectionBtn?.addEventListener("click", openJoinModal);
  closeJoinModalBtn?.addEventListener("click", closeJoinModal);

  joinModal?.addEventListener("click", function (e) {
    if (e.target === joinModal) {
      closeJoinModal();
    }
  });

  joinModalContent?.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  function shouldAutoOpenJoinModal() {
    const params = new URLSearchParams(window.location.search);
    const formParam = (params.get("form") || "").toLowerCase();
    const hash = (window.location.hash || "").toLowerCase();
    return formParam === "unirse" || formParam === "join" || hash === "#formulario" || hash === "#unirse";
  }

  if (shouldAutoOpenJoinModal()) {
    window.setTimeout(() => {
      openJoinModal();
      document.getElementById("nombre")?.focus();
    }, 250);
  }

  /* -----------------------------------------
     FORMULARIO UNIRSE
  ----------------------------------------- */
  const joinMessage = document.getElementById("joinMessage");

  function showJoinMessage(message, type) {
    if (!joinMessage) {
      alert(message);
      return;
    }

    joinMessage.textContent = message;
    joinMessage.className = type === "ok" ? "form-message ok" : "form-message err";
    joinMessage.style.display = "block";
  }

  function clearJoinMessage() {
    if (!joinMessage) return;
    joinMessage.textContent = "";
    joinMessage.className = "form-message";
    joinMessage.style.display = "none";
  }

  function normalizeJoinPhone(phone) {
    return String(phone || "").replace(/[^\d+]/g, "").trim();
  }

  function sanitizeJoinName(value) {
    return String(value || "")
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, "")
      .replace(/\s{2,}/g, " ")
      .trimStart();
  }

  function sanitizeJoinPhone(value) {
    const cleaned = String(value || "").replace(/[^\d+]/g, "");
    return cleaned.replace(/(?!^)\+/g, "");
  }

  function sanitizeJoinChildren(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function createRegistrationId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function bindJoinInputSanitizers() {
    const nameFields = [
      document.getElementById("nombre"),
      document.getElementById("apellido")
    ];
    const phoneField = document.getElementById("telefono");
    const childrenField = document.getElementById("hijos");

    nameFields.forEach((field) => {
      field?.addEventListener("input", function () {
        const sanitized = sanitizeJoinName(this.value);
        if (this.value !== sanitized) this.value = sanitized;
      });
    });

    phoneField?.addEventListener("input", function () {
      const sanitized = sanitizeJoinPhone(this.value);
      if (this.value !== sanitized) this.value = sanitized;
    });

    childrenField?.addEventListener("input", function () {
      const sanitized = sanitizeJoinChildren(this.value);
      if (this.value !== sanitized) this.value = sanitized;
    });
  }

  bindJoinInputSanitizers();

  function isAdultBirthDate(dateString) {
    if (!dateString) return false;

    const birthDate = new Date(dateString + "T00:00:00");
    if (Number.isNaN(birthDate.getTime())) return false;

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (birthDate >= todayOnly) {
      return false;
    }

    let age = todayOnly.getFullYear() - birthDate.getFullYear();
    const monthDiff = todayOnly.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && todayOnly.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age >= 18;
  }

  function validateJoinFormFrontend(payload) {
    // Validar campos uno por uno para detectar exactamente cuál falla
    if (!payload.nombre) return "Falta el nombre.";
    if (!payload.apellido) return "Falta el apellido.";
    if (!payload.email) return "Falta el correo.";
    if (!payload.telefono) return "Falta el teléfono.";
    if (!payload.fecha_nacimiento) return "Falta la fecha de nacimiento.";
    if (!payload.pais_nacimiento) return "Falta el país de nacimiento.";
    if (!payload.pais_residencia) return "Falta el país donde vive.";
    if (!payload.cristiana) return "Falta indicar si eres cristiana.";
    if (!payload.comunidad) return "Falta seleccionar la comunidad.";

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
    if (!emailOk) {
      return "El correo no es válido.";
    }

    const nameOk = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,}$/.test(payload.nombre);
    if (!nameOk) {
      return "El nombre solo puede tener letras, espacios, apóstrofe o guion.";
    }

    const lastNameOk = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,}$/.test(payload.apellido);
    if (!lastNameOk) {
      return "El apellido solo puede tener letras, espacios, apóstrofe o guion.";
    }

    const phoneClean = normalizeJoinPhone(payload.telefono);
    if (!/^\+?\d{7,15}$/.test(phoneClean)) {
      return "El teléfono no es válido.";
    }

    if (!/^\d+$/.test(String(payload.hijos || "0")) || Number(payload.hijos || 0) < 0) {
      return "La cantidad de hijos debe ser un número válido.";
    }

    // Validar fecha futura primero
    const birthDate = new Date(payload.fecha_nacimiento);
    const today = new Date();
    if (birthDate >= today) {
      return "La fecha de nacimiento no puede ser hoy o futura.";
    }

    // Validar mayoría de edad
    if (!isAdultBirthDate(payload.fecha_nacimiento)) {
      return "Debes ser mayor de 18 años para registrarte.";
    }

    return "";
  }

  joinForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearJoinMessage();

    const submitBtn = joinForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : "Enviar";

    const payload = {
      id: createRegistrationId(),
      action: "register",
      nombre: sanitizeJoinName(document.getElementById("nombre")?.value || "").trim(),
      apellido: sanitizeJoinName(document.getElementById("apellido")?.value || "").trim(),
      email: document.getElementById("email")?.value.trim() || "",
      telefono: sanitizeJoinPhone(document.getElementById("telefono")?.value || "").trim(),
      fecha_nacimiento: document.getElementById("fecha_nacimiento")?.value.trim() || "",
      estatus_matrimonial: document.getElementById("estatus_matrimonial")?.value.trim() || "",
      pais_nacimiento: document.getElementById("pais_nacimiento")?.value.trim() || "",
      pais_residencia: document.getElementById("pais_residencia")?.value.trim() || "",
      cristiana: document.getElementById("cristiana")?.value.trim() || "",
      comunidad: document.getElementById("comunidad")?.value.trim() || "",
      comments: document.getElementById("comments")?.value.trim() || document.getElementById("comentarios")?.value.trim() || "",
      hijos: sanitizeJoinChildren(document.getElementById("hijos")?.value || document.getElementById("cantidad_hijos")?.value || "0") || "0"
    };

    const frontendError = validateJoinFormFrontend(payload);
    if (frontendError) {
      showJoinMessage(frontendError, "err");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";
    }

    if (loadingOverlay) loadingOverlay.style.display = "flex";

    try {
      if (!hasSupabaseConfig()) {
        throw new Error("Supabase no está configurado.");
      }

      const response = await sendJoinToSupabase(payload);
      if (!response.ok) {
        const text = await response.text();
        let errorBody = {};

        try {
          errorBody = text ? JSON.parse(text) : {};
        } catch (_) {
          errorBody = {};
        }

        const error = new Error(`Error Supabase ${response.status}: ${text || response.statusText}`);

        if (response.status === 401) {
          error.userMessage = "El registro no está disponible temporalmente. Intenta nuevamente más tarde.";
        } else if (response.status === 409 || errorBody.code === "23505") {
          error.userMessage = "Este correo ya esta registrado. Si ya llenaste el formulario, no necesitas enviarlo otra vez.";
        }

        throw error;
      }

      const emailResults = await Promise.allSettled([
        sendWelcomeEmailWithEdgeFunction(payload),
        sendAdminRegistrationEmailWithEdgeFunction(payload),
        sendBirthdayEmailForNewMember(payload)
      ]);

      emailResults.forEach((result) => {
        if (result.status === "rejected") {
          console.warn("No se pudo enviar un correo desde Edge Function.", result.reason);
        }
      });

      // --- Begin new success flow for gracias-unirse.html ---
      const nombreBienvenida = encodeURIComponent(payload.nombre || "");
      const emailBienvenida = encodeURIComponent(payload.email || "");

      closeJoinModal();
      if (loadingOverlay) loadingOverlay.style.display = "none";
      if (joinForm) joinForm.reset();

      setTimeout(function () {
        window.location.href = `gracias-unirse.html?nombre=${nombreBienvenida}&email=${emailBienvenida}`;
      }, 500);
      // --- End new success flow ---
    } catch (error) {
      if (loadingOverlay) loadingOverlay.style.display = "none";
      showJoinMessage(error.userMessage || "Ocurrió un error al enviar el formulario. Intenta de nuevo.", "err");
      console.error("Error en registro:", error);
      // Do NOT close the join modal on error
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      // Ensure loadingOverlay is hidden unless on gracias-unirse.html
      if (loadingOverlay && !window.location.href.includes("gracias-unirse.html")) {
        loadingOverlay.style.display = "none";
      }
    }
  });

  /* -----------------------------------------
   GALERÍA DINÁMICA APILADA POR REGIÓN + BLOQUES
   Estados Unidos / RD / Europa
----------------------------------------- */
function normalizeGalleryText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function normalizeObjectKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[/\\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getGalleryField(item, keys = []) {
  for (const key of keys) {
    const value = item?.[key];
    if (value != null && String(value).trim() !== "") {
      return value;
    }
  }

  if (item && typeof item === "object") {
    const normalizedKeys = keys.map(normalizeObjectKey);
    for (const [rawKey, rawValue] of Object.entries(item)) {
      if (rawValue == null || String(rawValue).trim() === "") continue;
      const normalizedKey = normalizeObjectKey(rawKey);
      if (normalizedKeys.some(k => normalizedKey === k || normalizedKey.includes(k) || k.includes(normalizedKey))) {
        return rawValue;
      }
    }
  }

  return "";
}

function getGalleryPhotoUrl(item) {
  return getGalleryField(item, ["fotoUrl", "fotoURL", "FotoURL", "foto", "Foto", "photo", "photoUrl", "photoURL", "image", "imagen", "url", "img", "imagenUrl", "imageUrl"]);
}

function isGalleryItemActive(item) {
  const rawValue = normalizeGalleryText(
    getGalleryField(item, ["activa", "Activa", "active", "estado"])
  );

  if (!rawValue) return true;

  return ["si", "sí", "true", "1", "activo", "activa"].includes(rawValue);
}

function getActiveGalleryRowId() {
  return document.querySelector(".gallery-row.active")?.id || "usa";
}

function getGalleryRegionKey(categoria) {
  const value = normalizeGalleryText(categoria);

  if (value === "estados unidos" || value === "usa" || value === "eeuu") {
    return "usa";
  }

  if (value === "republica dominicana" || value === "república dominicana" || value === "rd") {
    return "rd";
  }

  if (value === "europa" || value === "eu") {
    return "eu";
  }

  return "";
}

function getGalleryBlockTitle(item) {
  return String(
    getGalleryField(item, ["texto", "Texto", "actividad", "Actividad", "titulo", "Titulo"]) || "Actividad"
  ).trim() || "Actividad";
}

function getGalleryOrder(item, fallbackIndex) {
  const raw = Number(getGalleryField(item, ["orden", "Orden"]));
  return Number.isFinite(raw) ? raw : fallbackIndex + 1;
}

function getLocalInviteesFallback() {
  return [
    { foto: "assets/images/gabriela.PNG", nombre: "Gabriela", titulo: "Líder de Comunidad", activa: true, orden: 1 },
    { foto: "assets/images/yunilda.PNG", nombre: "Yunilda", titulo: "Mentora Espiritual", activa: true, orden: 2 },
    { foto: "assets/images/tu-foto.JPG", nombre: "Invitada Especial", titulo: "Conferencista", activa: true, orden: 3 }
  ];
}

function getLocalGalleryFallback() {
  return [
    { categoria: "Estados Unidos", foto: "assets/images/IMG_8253.jpeg", texto: "Reunión de Liderazgo", orden: 1 },
    { categoria: "Estados Unidos", foto: "assets/images/IMG_8254.jpeg", texto: "Círculo de Oración", orden: 2 },
    { categoria: "República Dominicana", foto: "assets/images/IMG_8260.jpeg", texto: "Encuentro de Mujeres", orden: 1 },
    { categoria: "República Dominicana", foto: "assets/images/IMG_8257.jpeg", texto: "Taller de Propósito", orden: 2 },
    { categoria: "Europa", foto: "assets/images/IMG_8290.jpeg", texto: "Retiro Espiritual", orden: 1 },
    { categoria: "Europa", foto: "assets/images/IMG_8291.jpeg", texto: "Jornada de Fe", orden: 2 }
  ];
}

function createGalleryBlock(title, items) {
  const block = document.createElement("div");
  block.className = "gallery-activity-block";

  const heading = document.createElement("h3");
  heading.className = "gallery-activity-title";
  heading.textContent = title;
  block.appendChild(heading);

  const stack = document.createElement("div");
  stack.className = "gallery-stack-card";
  stack.setAttribute("role", "button");
  stack.setAttribute("tabindex", "0");
  stack.setAttribute("aria-label", `Abrir galería de ${title}`);

  const imageList = items.map(item => getGalleryPhotoUrl(item)).filter(Boolean);
  stack.dataset.images = JSON.stringify(imageList);
  stack.dataset.title = title;

  const previewImages = imageList.length >= 3
    ? imageList.slice(0, 3)
    : [...imageList, ...imageList].slice(0, Math.max(1, imageList.length));

  previewImages.forEach((src, index) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = title;
    img.loading = "lazy";
    img.className = `gallery-stack-photo stack-${Math.min(index + 1, 3)}`;
    stack.appendChild(img);
  });

  const overlay = document.createElement("div");
  overlay.className = "gallery-stack-overlay";
  overlay.innerHTML = `
    <span class="gallery-stack-label">Ver fotos</span>
    <span class="gallery-stack-count">${imageList.length} fotos</span>
  `;
  stack.appendChild(overlay);

  block.appendChild(stack);
  return block;
}

const galleryPageByRegion = { usa: 0, rd: 0, eu: 0 };

function getGalleryPageSize() {
  return 3;
}

function getActiveGalleryBlocks() {
  const activeRow = document.querySelector(".gallery-row.active");
  return activeRow ? Array.from(activeRow.querySelectorAll(".gallery-activity-block")) : [];
}

function updateGalleryCategoryPagination() {
  const activeRow = document.querySelector(".gallery-row.active");
  const prevBtn = document.getElementById("galleryPrev");
  const nextBtn = document.getElementById("galleryNext");
  if (!activeRow || !prevBtn || !nextBtn) return;

  const regionId = activeRow.id || "usa";
  const blocks = getActiveGalleryBlocks();
  const pageSize = getGalleryPageSize();
  const maxPage = Math.max(0, Math.ceil(blocks.length / pageSize) - 1);
  const page = Math.min(galleryPageByRegion[regionId] || 0, maxPage);
  galleryPageByRegion[regionId] = page;

  blocks.forEach((block, index) => {
    const isVisible = index >= page * pageSize && index < (page + 1) * pageSize;
    block.hidden = !isVisible;
  });

  const shouldShowArrows = blocks.length > pageSize;
  prevBtn.style.display = shouldShowArrows ? "" : "none";
  nextBtn.style.display = shouldShowArrows ? "" : "none";
  prevBtn.disabled = page === 0;
  nextBtn.disabled = page >= maxPage;
  prevBtn.classList.toggle("hidden", !shouldShowArrows || page === 0);
  nextBtn.classList.toggle("hidden", !shouldShowArrows || page >= maxPage);
}

function bindGalleryCategoryPagination() {
  const prevBtn = document.getElementById("galleryPrev");
  const nextBtn = document.getElementById("galleryNext");
  if (!prevBtn || !nextBtn || prevBtn.dataset.bound === "gallery-categories") return;

  prevBtn.addEventListener("click", () => {
    const regionId = getActiveGalleryRowId();
    galleryPageByRegion[regionId] = Math.max(0, (galleryPageByRegion[regionId] || 0) - 1);
    updateGalleryCategoryPagination();
  });

  nextBtn.addEventListener("click", () => {
    const regionId = getActiveGalleryRowId();
    galleryPageByRegion[regionId] = (galleryPageByRegion[regionId] || 0) + 1;
    updateGalleryCategoryPagination();
  });

  prevBtn.dataset.bound = "gallery-categories";
  nextBtn.dataset.bound = "gallery-categories";
}

function renderGaleria(galeria) {
  const usa = document.getElementById("usa");
  const rd = document.getElementById("rd");
  const eu = document.getElementById("eu");

  if (!usa || !rd || !eu) {
    console.error("No se encontraron los contenedores de galería: #usa, #rd, #eu");
    return;
  }

  usa.innerHTML = "";
  rd.innerHTML = "";
  eu.innerHTML = "";

  let galeriasValidas = Array.isArray(galeria)
    ? galeria.filter(item => item && getGalleryPhotoUrl(item) && isGalleryItemActive(item))
    : [];

  if (!galeriasValidas.length) {
    galeriasValidas = getLocalGalleryFallback();
  }

  console.log("Galería recibida:", galeriasValidas);

  const grouped = {
    usa: new Map(),
    rd: new Map(),
    eu: new Map()
  };

  galeriasValidas.forEach((item, index) => {
    const regionKey = getGalleryRegionKey(
  getGalleryField(item, ["categoria", "Categoria", "category"])
);
    if (!regionKey) {
      console.warn(
  "Categoría no reconocida:",
  getGalleryField(item, ["categoria", "Categoria", "category"])
);
      return;
    }

    const blockTitle = getGalleryBlockTitle(item);
    const blockKey = normalizeGalleryText(blockTitle) || `actividad-${index}`;

    if (!grouped[regionKey].has(blockKey)) {
      grouped[regionKey].set(blockKey, {
        title: blockTitle,
        order: getGalleryOrder(item, index),
        items: []
      });
    }

    grouped[regionKey].get(blockKey).items.push(item);
  });

  [
    { id: "usa", element: usa },
    { id: "rd", element: rd },
    { id: "eu", element: eu }
  ].forEach(region => {
    const blocks = Array.from(grouped[region.id].values())
      .sort((a, b) => a.order - b.order);

    blocks.forEach(blockData => {
      const block = createGalleryBlock(blockData.title, blockData.items);
      region.element.appendChild(block);
    });
  });

  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".gallery-row").forEach(row => row.classList.remove("active"));

  const usaTab = document.querySelector('.tab[data-target="usa"]');
  const rdTab = document.querySelector('.tab[data-target="rd"]');
  const euTab = document.querySelector('.tab[data-target="eu"]');

  if (usa.children.length > 0) {
    usa.classList.add("active");
    usaTab?.classList.add("active");
  } else if (rd.children.length > 0) {
    rd.classList.add("active");
    rdTab?.classList.add("active");
  } else if (eu.children.length > 0) {
    eu.classList.add("active");
    euTab?.classList.add("active");
  } else {
    usa.classList.add("active");
    usaTab?.classList.add("active");
  }

  galleryPageByRegion.usa = 0;
  galleryPageByRegion.rd = 0;
  galleryPageByRegion.eu = 0;
  bindGalleryCategoryPagination();
  updateGalleryCategoryPagination();

  requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    updateGalleryCategoryPagination();
    bindGalleryClicks();
  });
});
}

  /* -----------------------------------------
     INVITADAS DINÁMICAS
  ----------------------------------------- */
    function renderInvitees(invitees) {
    const grid = document.getElementById("inviteesTrack");
    if (!grid) return;

    let normalizedInvitees = Array.isArray(invitees)
      ? invitees.map((item, index) => {
          const activaRaw = normalizeGalleryText(getField(item, ["activa", "Activa", "active", "Active"], "Sí"));
          return {
            fotoUrl: getField(item, ["fotoUrl", "fotoURL", "FotoURL", "fotourl", "FotoUrl", "foto_url", "Foto URL", "FotoURL", "foto", "Foto", "imagen", "image", "photo", "photoUrl", "photoURL", "url"]),
            nombre: getField(item, ["nombre", "Nombre", "name", "Name"], "Invitada"),
            titulo: getField(item, ["titulo", "Titulo", "título", "Título", "title", "Title"], ""),
            activa: !["no", "false", "0", "inactiva", "inactivo"].includes(activaRaw),
            orden: Number(getField(item, ["orden", "Orden", "order", "Order"], index + 1)) || index + 1
          };
        })
          .filter(item => item.fotoUrl && item.activa)
          .sort((a, b) => a.orden - b.orden)
      : [];

	    if (!normalizedInvitees.length && !hasSupabaseInviteesResponse) {
	      normalizedInvitees = getLocalInviteesFallback();
	    }

	    if (!normalizedInvitees.length) {
	      grid.innerHTML = `
	        <div class="card">
	          <h3>Sin destacadas publicadas</h3>
	          <p class="invitee-title">Activa o agrega destacadas desde el admin.</p>
	        </div>
	      `;
	      updateInviteesCarousel();
	      return;
	    }

    grid.innerHTML = normalizedInvitees.map(item => `
  <div class="card"
       data-foto="${escapeHtml(item.fotoUrl)}"
       data-nombre="${escapeHtml(item.nombre)}"
       data-titulo="${escapeHtml(item.titulo)}">
    <img src="${escapeHtml(item.fotoUrl)}" alt="${escapeHtml(item.nombre)}">
    <h3>${escapeHtml(item.nombre)}</h3>
    <p class="invitee-title">${escapeHtml(item.titulo)}</p>
  </div>
`).join("");

    inviteesIndex = 0;

    const refresh = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateInviteesCarousel(false);
        });
      });
    };

      const images = grid.querySelectorAll("img");
    const inviteeCards = grid.querySelectorAll(".card");

    inviteeCards.forEach(card => {
      card.addEventListener("click", () => {
        if (inviteesMoved) {
          inviteesMoved = false;
          return;
        }

        openInviteeLightbox(
          card.dataset.foto || "",
          card.dataset.nombre || "",
          card.dataset.titulo || ""
        );
      });
    });

    images.forEach(img => {
      if (!img.complete) {
        img.addEventListener("load", refresh, { once: true });
      }
    });

    refresh();
    bindInviteesCarousel();
  }

  /* -----------------------------------------
     CARGAR DATOS DINÁMICOS
  ----------------------------------------- */
      async function loadDynamicContent() {
    let data = {};

    let invitadas = Array.isArray(data.invitadas)
      ? data.invitadas
      : Array.isArray(data.Invitadas)
        ? data.Invitadas
        : Array.isArray(data.invites)
          ? data.invites
          : Array.isArray(data.Invites)
            ? data.Invites
            : [];

    let galeria = Array.isArray(data.galeria)
      ? data.galeria
      : Array.isArray(data.Galeria)
        ? data.Galeria
        : Array.isArray(data.gallery)
          ? data.gallery
          : Array.isArray(data.Gallery)
            ? data.Gallery
            : [];

    let eventos = [];

    const supabaseBrowserClient = getSupabaseBrowserClient();

    if (supabaseBrowserClient) {
      try {
        const [inviteesResult, galleryResult, eventsResult, birthdaysResult] = await Promise.all([
	          supabaseBrowserClient
	            .from("destacadas")
	            .select("fotoUrl:foto_url,nombre,titulo,orden,activa")
	            .eq("activa", true)
	            .order("orden", { ascending: true }),
          supabaseBrowserClient
            .from("galeria")
            .select("foto:foto_url,categoria,texto,orden,activa")
            .eq("activa", true)
            .order("orden", { ascending: true }),
          supabaseBrowserClient
            .from("eventos")
            .select("icon:icono,title:titulo,schedule:horario,link,activa,orden")
            .eq("activa", true)
            .order("orden", { ascending: true }),
          getTodayBirthdaysFromEdgeFunction()
        ]);

	        if (!inviteesResult.error && Array.isArray(inviteesResult.data)) {
	          hasSupabaseInviteesResponse = true;
	          invitadas = inviteesResult.data;
	        }

        if (!galleryResult.error && Array.isArray(galleryResult.data) && galleryResult.data.length) {
          galeria = galleryResult.data;
        }

        if (!eventsResult.error && Array.isArray(eventsResult.data)) {
          eventos = eventsResult.data;
        }

        if (birthdaysResult?.ok && Array.isArray(birthdaysResult.cumpleanerasHoy)) {
          data.cumpleanerasHoy = birthdaysResult.cumpleanerasHoy;
        }
      } catch (error) {
        console.error("Error cargando contenido desde Supabase:", error);
      }
    }

    renderInvitees(invitadas);
    renderGaleria(galeria);
    renderEvents(eventos);
    renderContactCalendar({ ...data, eventos });
  }

  /* -----------------------------------------
     TABS GALERÍA
  ----------------------------------------- */
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", function () {
      document.querySelector(".tab.active")?.classList.remove("active");
      tab.classList.add("active");

      document.querySelector(".gallery-row.active")?.classList.remove("active");
      const targetRow = document.getElementById(tab.dataset.target);
      targetRow?.classList.add("active");

      if (targetRow) {
        updateGalleryCategoryPagination();
        bindGalleryClicks();
      }
    });
  });

  /* -----------------------------------------
     REVEAL
  ----------------------------------------- */
  const revealElements = document.querySelectorAll(".reveal");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  revealElements.forEach(el => observer.observe(el));

  /* -----------------------------------------
     CERRAR CON ESC
  ----------------------------------------- */
    document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMenu();
      if (joinModal?.classList.contains("open")) closeJoinModal();
      if (donateModal?.classList.contains("open")) closeDonateModal();
      if (lightbox?.classList.contains("open")) lightbox.classList.remove("open");
      if (inviteeLightbox?.classList.contains("open")) inviteeLightbox.classList.remove("open");
    }
  });

  /* -----------------------------------------
     CALENDARIO CONTACTO
  ----------------------------------------- */
function renderContactCalendar(apiData = {}) {
  const todayText = document.getElementById("calendarTodayText");
  const activitiesList = document.getElementById("todayActivitiesList");
  let nextActivityList = document.getElementById("nextActivityList");
  const birthdaysList = document.getElementById("todayBirthdaysList");

  if (!todayText || !activitiesList || !birthdaysList) return;

  if (!nextActivityList) {
    const activitiesBlock = activitiesList.closest(".calendar-block");

    if (activitiesBlock && activitiesBlock.parentElement) {
      const nextBlock = document.createElement("div");
      nextBlock.className = "calendar-block";
      nextBlock.innerHTML = `
        <h4>Próxima actividad</h4>
        <div id="nextActivityList" class="calendar-list"></div>
      `;

      activitiesBlock.insertAdjacentElement("afterend", nextBlock);
      nextActivityList = nextBlock.querySelector("#nextActivityList");
    }
  }

  const now = new Date();
  const dayOfWeek = now.getDay();

  todayText.textContent = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const rawEventos = Array.isArray(apiData.eventos)
    ? apiData.eventos
    : Array.isArray(apiData.Eventos)
      ? apiData.Eventos
      : [];

  const sourceActivities = rawEventos.map(item => ({
        title: getField(item, ["title", "titulo", "Titulo", "nombre", "Nombre"], "Actividad"),
        schedule: getField(item, ["schedule", "horario", "Horario", "fecha", "Fecha"], "Próximamente"),
        description: getField(item, ["description", "descripcion", "Descripcion", "detalle", "Detalle"], "Actividad de Mujeres con Propósito.")
      }));

  const dayMap = {
    domingo: 0,
    domingos: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    miércoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    sábado: 6,
    sabados: 6,
    sábados: 6
  };

  function normalizeScheduleText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseEventDays(scheduleText) {
    const normalized = normalizeScheduleText(scheduleText);

    if (!normalized) return [];

    if (normalized.includes("lunes a viernes")) {
      return [1, 2, 3, 4, 5];
    }

    const matches = Object.entries(dayMap)
      .filter(([label]) => normalized.includes(label))
      .map(([, value]) => value);

    return [...new Set(matches)];
  }

  function extractEventTime(scheduleText) {
    const value = String(scheduleText || "");
    const europeanHourMatch = value.match(/\b([01]?\d|2[0-3])h(?:([0-5]\d))?\b/i);
    if (europeanHourMatch) {
      return `${Number(europeanHourMatch[1])}h${europeanHourMatch[2] || ""}`;
    }

    const match = value.match(/(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)/);
    return match ? match[1].replace(/\s+/g, " ").trim() : "Próximamente";
  }

  function getNextActivity(itemDays = []) {
    if (!itemDays.length) return null;

    const sortedDays = [...itemDays].sort((a, b) => a - b);
    const sameOrNextDay = sortedDays.find(day => day >= dayOfWeek);
    const nextDay = sameOrNextDay != null ? sameOrNextDay : sortedDays[0];
    const distance = nextDay >= dayOfWeek
      ? nextDay - dayOfWeek
      : 7 - dayOfWeek + nextDay;

    return { nextDay, distance };
  }

  function getDayLabel(dayNumber) {
    const labels = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado"
    ];

    return labels[dayNumber] || "Próximamente";
  }

  const normalizedActivities = sourceActivities.map(item => {
    const schedule = item.schedule || "";
    const days = parseEventDays(schedule);
    const nextInfo = getNextActivity(days);

    return {
      title: item.title,
      schedule,
      time: extractEventTime(schedule),
      description: schedule
        ? `${schedule}${item.description ? ` · ${item.description}` : ""}`
        : (item.description || "Actividad de Mujeres con Propósito."),
      days,
      nextInfo
    };
  });

  const todayActivities = normalizedActivities.filter(item => item.days.includes(dayOfWeek));

  const upcomingActivities = normalizedActivities
    .filter(item => item.nextInfo)
    .filter(item => !item.days.includes(dayOfWeek))
    .sort((a, b) => {
      if (a.nextInfo.distance !== b.nextInfo.distance) {
        return a.nextInfo.distance - b.nextInfo.distance;
      }
      return a.time.localeCompare(b.time, undefined, { numeric: true, sensitivity: "base" });
    });

  const nextActivity = upcomingActivities[0] || null;

  const hasAnyActivity = normalizedActivities.length > 0;
  const todayContent = todayActivities.length
    ? todayActivities.map(item => `
        <div class="calendar-item">
          <span class="calendar-item-time">${escapeHtml(item.time)}</span>
          <div class="calendar-item-title">${escapeHtml(item.title)}</div>
          <div class="calendar-item-desc">${escapeHtml(item.description)}</div>
        </div>
      `).join("")
    : hasAnyActivity
      ? normalizedActivities.map(item => `
          <div class="calendar-item">
            <span class="calendar-item-time">${escapeHtml(item.time)}</span>
            <div class="calendar-item-title">${escapeHtml(item.title)}</div>
            <div class="calendar-item-desc">${escapeHtml(item.description)}</div>
          </div>
        `).join("")
      : '<div class="calendar-empty">No hay actividades programadas para hoy.</div>';

  activitiesList.innerHTML = todayActivities.length
    ? todayContent
    : hasAnyActivity
      ? `<div class="calendar-note">No hay actividades programadas para hoy, pero aquí están las próximas sesiones disponibles:</div>${todayContent}`
      : todayContent;

  if (nextActivityList) {
    nextActivityList.innerHTML = nextActivity
      ? `
          <div class="calendar-item">
            <span class="calendar-item-time">${escapeHtml(getDayLabel(nextActivity.nextInfo.nextDay))} · ${escapeHtml(nextActivity.time)}</span>
            <div class="calendar-item-title">${escapeHtml(nextActivity.title)}</div>
            <div class="calendar-item-desc">${escapeHtml(nextActivity.description)}</div>
          </div>
        `
      : '<div class="calendar-empty">No hay próximas actividades programadas.</div>';
  }

  const todayBirthdays = Array.isArray(apiData.cumpleanerasHoy)
    ? apiData.cumpleanerasHoy
    : [];

  birthdaysList.innerHTML = todayBirthdays.length
    ? todayBirthdays.map(person => `
        <div class="calendar-item">
          <div class="calendar-item-title">${escapeHtml(person.nombreCompleto || "Cumpleañera")}</div>
          <div class="calendar-item-desc">¡Hoy está de cumpleaños!</div>
        </div>
      `).join("")
    : '<div class="calendar-empty">No hay cumpleaños registrados para hoy.</div>';
}

  /* -----------------------------------------
     INIT
  ----------------------------------------- */

    window.addEventListener("resize", () => {
    if (window.innerWidth > 850) {
      closeMenu();
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bindGalleryClicks();
      });

      inviteesIndex = 0;
      if (eventsTrack) {
        eventsTrack.scrollLeft = 0;
        eventsTrack.style.transform = "none";
        eventsTrack.style.transition = "none";
      }
      eventsIndex = 0;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateInviteesCarousel(false);
          updateEventsCarousel(false);
        });
      });
    });
  });

  /* -----------------------------------------
     ADMIN SIMPLE: SUBIR FOTOS Y EVENTOS A SUPABASE
  ----------------------------------------- */
  window.mcpUploadDestacada = async function ({ file, nombre, titulo, orden }) {
    const fotoUrl = await uploadImageToSupabaseBucket(file, "mcp930-images", "destacadas");
    const client = getAdminSupabaseClient();
    const { error } = await client.from("destacadas").insert({
      foto_url: fotoUrl,
      nombre,
      titulo,
      orden: Number(orden || 1),
      activa: true
    });
    if (error) throw error;
    await loadDynamicContent();
    return fotoUrl;
  };

  window.mcpUploadGaleria = async function ({ file, categoria, texto, orden }) {
    const fotoUrl = await uploadImageToSupabaseBucket(file, "mcp930-images", "galeria");
    const client = getAdminSupabaseClient();
    const { error } = await client.from("galeria").insert({
      foto_url: fotoUrl,
      categoria,
      texto,
      orden: Number(orden || 1),
      activa: true
    });
    if (error) throw error;
    await loadDynamicContent();
    return fotoUrl;
  };

  window.mcpSaveEvento = async function ({ icono, titulo, horario, link, orden }) {
    const client = getAdminSupabaseClient();
    const { error } = await client.from("eventos").insert({
      icono: icono || "✦",
      titulo,
      horario,
      link,
      orden: Number(orden || 1),
      activa: true
    });
    if (error) throw error;
    await loadDynamicContent();
    return true;
  };

    /* -----------------------------------------
     ADMIN PANEL UI SUPABASE
  ----------------------------------------- */
  const adminLoginBtn = document.getElementById("adminLoginBtn");
	  const adminAccessEmail = document.getElementById("adminAccessEmail");
	  const adminAccessCode = document.getElementById("adminAccessCode");
	  const adminLoginMsg = document.getElementById("adminLoginMsg");
	  const adminLoginCard = document.getElementById("adminLoginCard");
	  const adminDashboard = document.getElementById("adminDashboard");
	  const adminLoginDashboardBtn = document.getElementById("adminLoginDashboardBtn");
	  const adminCancelBtn = document.getElementById("adminCancelBtn");
	  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
	  const adminForgotPasswordBtn = document.getElementById("adminForgotPasswordBtn");
	  const adminUsePasskeyBtn = document.getElementById("adminUsePasskeyBtn");
	  const adminEnrollPasskeyBtn = document.getElementById("adminEnrollPasskeyBtn");

	  function showAdminMsg(el, text, ok = true) {
	    if (!el) return;
	    el.style.display = "block";
	    el.className = `form-message ${ok ? "ok" : "err"}`;
	    el.textContent = text;
	  }

	  function getResetPasswordRedirectUrl() {
	    const basePath = window.location.pathname.replace(/[^/]*$/, "reset-password.html");
	    return `${window.location.origin}${basePath}`;
	  }

	  function getAdminSupabaseClient() {
	    const client = getSupabaseBrowserClient();
	    if (!client) throw new Error("Supabase JS no está cargado o configurado.");
	    return client;
	  }

	  async function fetchAdminRows(table) {
	    const client = getAdminSupabaseClient();
	    let query = client
	      .from(table)
	      .select("*")
	      .order("orden", { ascending: true });

	    const { data, error } = await query;

	    if (error) throw error;
	    return Array.isArray(data) ? data : [];
	  }

	  async function updateAdminRow(table, id, values) {
	    const client = getAdminSupabaseClient();
	    const { data, error } = await client
	      .from(table)
	      .update(values)
	      .eq("id", id)
	      .select("id")
	      .maybeSingle();
	    if (error) throw error;
	    if (!data) {
	      throw new Error(`No se actualizó ${table}. Revisa permisos de update en Supabase o que el registro exista.`);
	    }
	  }

	  async function deleteAdminRow(table, id) {
	    const client = getAdminSupabaseClient();
	    const { error } = await client.from(table).delete().eq("id", id);
	    if (error) throw error;
	  }

	  function renderAdminList(containerId, rows, type) {
	    const container = document.getElementById(containerId);
	    if (!container) return;

	    if (!rows.length) {
	      container.innerHTML = `<div class="admin-empty">No hay contenido guardado todavía.</div>`;
	      return;
	    }

	    container.innerHTML = rows.map((row) => {
	      const title = type === "galeria"
	        ? (row.texto || row.categoria || "Foto de galería")
	        : (row.titulo || row.nombre || "Contenido");
	      const subtitle = type === "eventos"
	        ? row.horario || ""
	        : type === "destacadas"
	          ? row.nombre || ""
	          : row.categoria || "";
	      const image = row.foto_url
	        ? `<img src="${escapeHtml(row.foto_url)}" alt="${escapeHtml(title)}" loading="lazy">`
	        : isImageUrl(row.icono)
            ? `<img src="${escapeHtml(row.icono)}" alt="${escapeHtml(title)}" loading="lazy">`
            : `<span class="admin-item-icon">${escapeHtml(row.icono || "✦")}</span>`;

	      return `
	        <div class="admin-content-item" data-admin-type="${type}" data-admin-id="${escapeHtml(row.id)}">
	          <div class="admin-item-media">${image}</div>
	          <div class="admin-item-body">
	            <strong>${escapeHtml(title)}</strong>
	            <span>${escapeHtml(subtitle)}</span>
	            <small>Orden ${escapeHtml(row.orden || 1)} · ${row.activa === false ? "Oculto" : "Visible"}</small>
	          </div>
	          <div class="admin-item-actions">
	            <button type="button" data-admin-action="edit">Editar</button>
	            <button type="button" data-admin-action="toggle">${row.activa === false ? "Mostrar" : "Ocultar"}</button>
	            <button type="button" data-admin-action="delete" class="danger">Borrar</button>
	          </div>
	        </div>
	      `;
	    }).join("");
	  }

	  const galleryCommunityLabels = {
	    usa: "Estados Unidos",
	    rd: "República Dominicana",
	    eu: "Europa"
	  };

	  function getGalleryCommunityLabel(value) {
	    const key = getGalleryRegionKey(value) || String(value || "").trim();
	    return galleryCommunityLabels[key] || value || "Sin comunidad";
	  }

	  function renderAdminGalleryGroups(rows) {
	    const container = document.getElementById("adminGaleriaList");
	    if (!container) return;

	    if (!rows.length) {
	      container.innerHTML = `<div class="admin-empty">No hay contenido guardado todavía.</div>`;
	      return;
	    }

	    const communities = new Map();
	    rows.forEach((row) => {
	      const communityKey = getGalleryRegionKey(row.categoria) || "sin-comunidad";
	      const communityLabel = getGalleryCommunityLabel(row.categoria);
	      const eventTitle = String(row.texto || "Sin categoría").trim() || "Sin categoría";
	      const eventKey = normalizeGalleryText(eventTitle) || "sin-categoria";

	      if (!communities.has(communityKey)) {
	        communities.set(communityKey, {
	          label: communityLabel,
	          events: new Map()
	        });
	      }

	      const community = communities.get(communityKey);
	      if (!community.events.has(eventKey)) {
	        community.events.set(eventKey, {
	          title: eventTitle,
	          rows: []
	        });
	      }

	      community.events.get(eventKey).rows.push(row);
	    });

	    const communityOrder = ["usa", "rd", "eu", "sin-comunidad"];
	    const sortedCommunities = Array.from(communities.entries())
	      .sort((a, b) => communityOrder.indexOf(a[0]) - communityOrder.indexOf(b[0]));

	    container.innerHTML = sortedCommunities.map(([communityKey, community]) => {
	      const events = Array.from(community.events.values())
	        .sort((a, b) => {
	          const orderA = Math.min(...a.rows.map(row => Number(row.orden || 1)));
	          const orderB = Math.min(...b.rows.map(row => Number(row.orden || 1)));
	          return orderA - orderB;
	        });

	      const eventMarkup = events.map((eventGroup, eventIndex) => {
	        const rowsMarkup = eventGroup.rows
	          .sort((a, b) => Number(a.orden || 1) - Number(b.orden || 1))
	          .map((row) => {
	            const title = row.texto || "Foto de galería";
	            const image = row.foto_url
	              ? `<img src="${escapeHtml(row.foto_url)}" alt="${escapeHtml(title)}" loading="lazy">`
	              : `<span class="admin-item-icon">✦</span>`;

	            return `
	              <div class="admin-content-item" data-admin-type="galeria" data-admin-id="${escapeHtml(row.id)}">
	                <div class="admin-item-media">${image}</div>
	                <div class="admin-item-body">
	                  <strong>${escapeHtml(title)}</strong>
	                  <span>${escapeHtml(community.label)}</span>
	                  <small>Orden ${escapeHtml(row.orden || 1)} · ${row.activa === false ? "Oculto" : "Visible"}</small>
	                </div>
	                <div class="admin-item-actions">
	                  <button type="button" data-admin-action="edit">Editar</button>
	                  <button type="button" data-admin-action="toggle">${row.activa === false ? "Mostrar" : "Ocultar"}</button>
	                  <button type="button" data-admin-action="delete" class="danger">Borrar</button>
	                </div>
	              </div>
	            `;
	          }).join("");

	        return `
	          <details class="admin-gallery-event" ${eventIndex === 0 ? "open" : ""}>
	            <summary>
	              <span>${escapeHtml(eventGroup.title)}</span>
	              <small>${eventGroup.rows.length} ${eventGroup.rows.length === 1 ? "foto" : "fotos"}</small>
	            </summary>
	            <div class="admin-gallery-event-items">${rowsMarkup}</div>
	          </details>
	        `;
	      }).join("");

	      return `
	        <details class="admin-gallery-community" data-gallery-community="${escapeHtml(communityKey)}" open>
	          <summary>
	            <span>${escapeHtml(community.label)}</span>
	            <small>${events.length} ${events.length === 1 ? "categoría" : "categorías"}</small>
	          </summary>
	          <div class="admin-gallery-community-events">${eventMarkup}</div>
	        </details>
	      `;
	    }).join("");
	  }

	  function populateAdminGalleryEventOptions(rows = adminContentCache.galeria || []) {
	    const communitySelect = document.getElementById("adminGaleriaCategoria");
	    const eventSelect = document.getElementById("adminGaleriaEventoSelect");
	    if (!communitySelect || !eventSelect) return;

	    const selectedCommunity = communitySelect.value || "usa";
	    const uniqueEvents = new Map();

	    rows.forEach((row) => {
	      const communityKey = getGalleryRegionKey(row.categoria);
	      const eventTitle = String(row.texto || "").trim();
	      const eventKey = normalizeGalleryText(eventTitle);
	      if (communityKey !== selectedCommunity || !eventTitle || uniqueEvents.has(eventKey)) return;
	      uniqueEvents.set(eventKey, eventTitle);
	    });

	    eventSelect.innerHTML = `
	      <option value="">Nueva categoría</option>
	      ${Array.from(uniqueEvents.values()).sort((a, b) => a.localeCompare(b)).map((title) => `
	        <option value="${escapeHtml(title)}">${escapeHtml(title)}</option>
	      `).join("")}
	    `;
	  }

	  function getCanonicalGalleryEventTitle(community, eventTitle) {
	    const normalizedTitle = normalizeGalleryText(eventTitle);
	    if (!normalizedTitle) return "";

	    const existing = (adminContentCache.galeria || []).find((row) =>
	      getGalleryRegionKey(row.categoria) === community &&
	      normalizeGalleryText(row.texto) === normalizedTitle
	    );

	    return existing?.texto || String(eventTitle || "").trim();
	  }

	  function renderAdminError(containerId, error) {
	    const container = document.getElementById(containerId);
	    if (!container) return;
	    container.innerHTML = `
	      <div class="admin-empty admin-error">
	        No se pudo cargar. Revisa permisos RLS/policies en Supabase.
	      </div>
	    `;
	    console.error(error);
	  }

	  let adminContentCache = {
	    eventos: [],
	    destacadas: [],
	    galeria: []
	  };

	  async function loadAdminContent() {
	    const results = await Promise.allSettled([
	      fetchAdminRows("eventos"),
	      fetchAdminRows("destacadas"),
	      fetchAdminRows("galeria")
	    ]);

	    const eventos = results[0].status === "fulfilled" ? results[0].value : [];
	    const destacadas = results[1].status === "fulfilled" ? results[1].value : [];
	    const galeria = results[2].status === "fulfilled" ? results[2].value : [];

	    adminContentCache = { eventos, destacadas, galeria };

	    results[0].status === "fulfilled"
	      ? renderAdminList("adminEventosList", eventos, "eventos")
	      : renderAdminError("adminEventosList", results[0].reason);
	    results[1].status === "fulfilled"
	      ? renderAdminList("adminDestacadasList", destacadas, "destacadas")
	      : renderAdminError("adminDestacadasList", results[1].reason);
	    results[2].status === "fulfilled"
	      ? renderAdminGalleryGroups(galeria)
	      : renderAdminError("adminGaleriaList", results[2].reason);
	    if (results[2].status === "fulfilled") {
	      populateAdminGalleryEventOptions(galeria);
	    }
	  }

	  async function refreshAdminAndSite() {
	    await loadDynamicContent();
	    await loadAdminContent();
	  }

	  function getAdminEditFields(type, row) {
	    if (type === "eventos") {
	      return [
	        { name: "icono", label: "Icono actual o emoji", value: row.icono || "✦" },
	        { name: "icono_file", label: "Cambiar icono con imagen (opcional)", type: "file" },
	        { name: "titulo", label: "Título", value: row.titulo || "" },
	        { name: "horario", label: "Horario", type: "schedule", value: row.horario || "" },
	        { name: "link", label: "Link", value: row.link || "" },
	        { name: "orden", label: "Orden", type: "number", value: row.orden || 1 },
	        { name: "activa", label: "Estado", type: "select", value: row.activa === false ? "false" : "true" }
	      ];
	    }

	    if (type === "destacadas") {
	      return [
	        { name: "foto_url", label: "URL pública actual", value: row.foto_url || "" },
	        { name: "foto_file", label: "Cambiar foto en Supabase (opcional)", type: "file" },
	        { name: "nombre", label: "Nombre", value: row.nombre || "" },
	        { name: "titulo", label: "Título", value: row.titulo || "" },
	        { name: "orden", label: "Orden", type: "number", value: row.orden || 1 },
	        { name: "activa", label: "Estado", type: "select", value: row.activa === false ? "false" : "true" }
	      ];
	    }

	    return [
	      { name: "foto_url", label: "URL pública actual", value: row.foto_url || "" },
	      { name: "foto_file", label: "Cambiar foto en Supabase (opcional)", type: "file" },
	      { name: "categoria", label: "Comunidad", type: "select-category", value: row.categoria || "usa" },
	      { name: "texto", label: "Categoría / evento", value: row.texto || "" },
	      { name: "orden", label: "Orden", type: "number", value: row.orden || 1 },
	      { name: "activa", label: "Estado", type: "select", value: row.activa === false ? "false" : "true" }
	    ];
	  }

	  function openAdminEditModal(type, row) {
	    return new Promise((resolve) => {
	      const fields = getAdminEditFields(type, row);
	      const typeLabel = type === "eventos" ? "evento" : type === "destacadas" ? "destacada" : "foto";
	      const modal = document.createElement("div");
	      modal.className = "admin-edit-modal";
	      modal.innerHTML = `
	        <div class="admin-edit-card" role="dialog" aria-modal="true">
	          <h3>Editar ${escapeHtml(typeLabel)}</h3>
	          <form class="admin-edit-form">
	            ${fields.map((field) => {
	              if (field.type === "select") {
	                return `
	                  <label>
	                    <span>${escapeHtml(field.label)}</span>
	                    <select name="${escapeHtml(field.name)}">
	                      <option value="true" ${field.value === "true" ? "selected" : ""}>Visible</option>
	                      <option value="false" ${field.value === "false" ? "selected" : ""}>Oculto</option>
	                    </select>
	                  </label>
	                `;
	              }

	              if (field.type === "select-category") {
	                return `
	                  <label>
	                    <span>${escapeHtml(field.label)}</span>
	                    <select name="${escapeHtml(field.name)}">
	                      <option value="usa" ${field.value === "usa" ? "selected" : ""}>USA</option>
	                      <option value="rd" ${field.value === "rd" ? "selected" : ""}>RD</option>
	                      <option value="eu" ${field.value === "eu" ? "selected" : ""}>EU</option>
	                    </select>
	                  </label>
	                `;
	              }

	              if (field.type === "file") {
	                return `
	                  <label>
	                    <span>${escapeHtml(field.label)}</span>
	                    <input type="file" name="${escapeHtml(field.name)}" accept="image/*">
	                    <small class="admin-edit-help">Si eliges una imagen nueva, se sube al bucket y reemplaza la URL actual.</small>
	                  </label>
	                `;
	              }

	              if (field.type === "schedule") {
	                const parts = getScheduleParts(field.value);
	                const timeParts = splitTimeValue(parts.time);
	                const dayCheckboxes = EVENT_WEEK_DAYS.map((day) => `
	                  <label>
	                    <input type="checkbox" name="${escapeHtml(field.name)}_dias" value="${escapeHtml(day)}" ${parts.days.includes(day) ? "checked" : ""}>
	                    ${escapeHtml(day)}
	                  </label>
	                `).join("");
	                return `
	                  <div class="admin-edit-schedule" data-schedule-group="${escapeHtml(field.name)}">
	                    <span>${escapeHtml(field.label)}</span>
	                    <select name="${escapeHtml(field.name)}_frecuencia" data-schedule-frequency>
	                      <option value="diario" ${parts.frequency === "diario" ? "selected" : ""}>Diario</option>
	                      <option value="semanal" ${parts.frequency === "semanal" ? "selected" : ""}>Semanal</option>
	                      <option value="dos-veces" ${parts.frequency === "dos-veces" ? "selected" : ""}>Dos veces a la semana</option>
	                    </select>
	                    <div class="admin-schedule-days" data-schedule-days>
	                      <span>Día(s)</span>
	                      ${dayCheckboxes}
	                    </div>
	                    <div class="admin-time-selects">
	                      <select name="${escapeHtml(field.name)}_hora" required>
	                        ${getHourOptions(timeParts.hour)}
	                      </select>
	                      <select name="${escapeHtml(field.name)}_minutos" required>
	                        ${getMinuteOptions(timeParts.minutes)}
	                      </select>
	                    </div>
	                  </div>
	                `;
	              }

	              return `
	                <label>
	                  <span>${escapeHtml(field.label)}</span>
	                  <input
	                    type="${field.type === "number" ? "number" : field.type === "time" ? "time" : "text"}"
	                    name="${escapeHtml(field.name)}"
	                    value="${escapeHtml(field.value)}"
	                    ${field.type === "number" ? "min=\"1\"" : ""}
	                    ${field.type === "time" ? "required" : ""}
	                  >
	                </label>
	              `;
	            }).join("")}
	            <div class="admin-edit-actions">
	              <button type="button" class="admin-edit-cancel">Cancelar</button>
	              <button type="submit">Guardar</button>
	            </div>
	          </form>
	        </div>
	      `;

	      function close(value) {
	        document.body.style.overflow = "";
	        modal.remove();
	        resolve(value);
	      }

	      document.body.appendChild(modal);
	      document.body.style.overflow = "hidden";
	      modal.querySelectorAll("[data-schedule-group]").forEach((group) => {
	        const frequencySelect = group.querySelector("[data-schedule-frequency]");
	        const daysContainer = group.querySelector("[data-schedule-days]");
	        updateScheduleDaysVisibility(frequencySelect, daysContainer);
	        frequencySelect?.addEventListener("change", () => updateScheduleDaysVisibility(frequencySelect, daysContainer));
	      });
	      modal.querySelector("input, select")?.focus();

	      modal.addEventListener("click", (event) => {
	        if (event.target === modal) close(null);
	      });

	      modal.querySelector(".admin-edit-cancel")?.addEventListener("click", () => close(null));
	      modal.querySelector(".admin-edit-form")?.addEventListener("submit", (event) => {
	        event.preventDefault();
	        const formData = new FormData(event.currentTarget);
	        const values = Object.fromEntries(formData.entries());
	        const photoFile = formData.get("foto_file");
	        const iconFile = formData.get("icono_file");
	        if (photoFile instanceof File && photoFile.size > 0) {
	          values.foto_file = photoFile;
	        } else {
	          delete values.foto_file;
	        }
	        if (iconFile instanceof File && iconFile.size > 0) {
	          values.icono_file = iconFile;
	        } else {
	          delete values.icono_file;
	        }
	        if (type === "eventos") {
	          try {
	            values.horario = buildEventSchedule({
	              frequency: values.horario_frecuencia,
	              days: formData.getAll("horario_dias"),
	              time: combineTimeParts(values.horario_hora, values.horario_minutos)
	            });
	          } catch (error) {
	            alert(error?.message || "Completa el horario del evento.");
	            return;
	          }
	        }
	        close(values);
	      });
	    });
	  }

	  async function resolveEditedPhotoUrl(values, currentUrl, folder) {
	    if (values.foto_file instanceof File && values.foto_file.size > 0) {
	      return uploadImageToSupabaseBucket(values.foto_file, "mcp930-images", folder);
	    }

	    return values.foto_url || currentUrl || "";
	  }

	  async function resolveEditedIconUrl(values, currentIcon) {
	    if (values.icono_file instanceof File && values.icono_file.size > 0) {
	      return uploadImageToSupabaseBucket(values.icono_file, "mcp930-images", "eventos");
	    }

	    return values.icono || currentIcon || "✦";
	  }

	  async function editAdminItem(type, id) {
	    const row = adminContentCache[type]?.find((item) => String(item.id) === String(id));
	    if (!row) return;
	    const values = await openAdminEditModal(type, row);
	    if (!values) return;

	    if (type === "eventos") {
	      const icono = await resolveEditedIconUrl(values, row.icono);
	      await updateAdminRow("eventos", id, {
	        icono,
	        titulo: values.titulo || "",
	        horario: formatTimeForDisplay(values.horario),
	        link: values.link || "",
	        orden: Number(values.orden || 1),
	        activa: values.activa !== "false"
	      });
	    }

	    if (type === "destacadas") {
	      const fotoUrl = await resolveEditedPhotoUrl(values, row.foto_url, "destacadas");
	      await updateAdminRow("destacadas", id, {
	        foto_url: fotoUrl,
	        nombre: values.nombre || "",
	        titulo: values.titulo || "",
	        orden: Number(values.orden || 1),
	        activa: values.activa !== "false"
	      });
	    }

	    if (type === "galeria") {
	      const fotoUrl = await resolveEditedPhotoUrl(values, row.foto_url, "galeria");
	      await updateAdminRow("galeria", id, {
	        foto_url: fotoUrl,
	        categoria: values.categoria || "usa",
	        texto: values.texto || "",
	        orden: Number(values.orden || 1),
	        activa: values.activa !== "false"
	      });
	    }

	    await refreshAdminAndSite();
	  }

	  async function handleAdminListAction(event) {
	    const button = event.target.closest("[data-admin-action]");
	    if (!button) return;

	    const item = button.closest(".admin-content-item");
	    const type = item?.dataset.adminType;
	    const id = item?.dataset.adminId;
	    const action = button.dataset.adminAction;
	    const row = adminContentCache[type]?.find((entry) => String(entry.id) === String(id));

	    if (!type || !id || !row) return;

	    try {
	      if (action === "edit") {
	        await editAdminItem(type, id);
	      }

	      if (action === "toggle") {
	        await updateAdminRow(type, id, { activa: row.activa === false });
	        await refreshAdminAndSite();
	      }

	      if (action === "delete" && window.confirm("¿Quieres borrar este contenido?")) {
	        await deleteAdminRow(type, id);
	        await refreshAdminAndSite();
	      }
	    } catch (error) {
	      console.error(error);
	      const details = [
	        error?.message,
	        error?.details,
	        error?.hint,
	        error?.code
	      ].filter(Boolean).join("\n");
	      window.alert(`No se pudo completar la acción.\n\n${details || "Revisa Supabase y las políticas de permisos."}`);
	    }
	  }

	  function getVisibleEventsForImport() {
	    return Array.from(document.querySelectorAll("#eventsGrid .card")).map((card, index) => ({
	      icono: card.querySelector(".card-icon img")?.getAttribute("src") || card.querySelector(".card-icon")?.textContent.trim() || "✦",
	      titulo: card.querySelector("h3")?.textContent.trim() || "",
	      horario: card.querySelector("p")?.textContent.trim() || "",
	      link: card.querySelector("a")?.getAttribute("href") || "#",
	      orden: index + 1,
	      activa: true
	    })).filter((item) => item.titulo);
	  }

	  function getVisibleInviteesForImport() {
	    const visibleItems = Array.from(document.querySelectorAll("#inviteesTrack .card")).map((card, index) => ({
	      foto_url: card.dataset.foto || card.querySelector("img")?.getAttribute("src") || "",
	      nombre: card.dataset.nombre || card.querySelector("h3")?.textContent.trim() || "",
	      titulo: card.dataset.titulo || card.querySelector(".invitee-title")?.textContent.trim() || "",
	      orden: index + 1,
	      activa: true
	    })).filter((item) => item.foto_url && item.nombre);

	    const fallbackItems = getLocalInviteesFallback().map((item, index) => ({
	      foto_url: item.foto,
	      nombre: item.nombre,
	      titulo: item.titulo,
	      orden: item.orden || index + 1,
	      activa: true
	    }));

	    return [...visibleItems, ...fallbackItems];
	  }

	  function getVisibleGalleryForImport() {
	    const regions = [
	      { id: "usa", categoria: "usa" },
	      { id: "rd", categoria: "rd" },
	      { id: "eu", categoria: "eu" }
	    ];

	    const visibleItems = regions.flatMap((region) => {
	      const container = document.getElementById(region.id);
	      if (!container) return [];

	      const stacks = Array.from(container.querySelectorAll(".gallery-stack-card"));
	      if (stacks.length) {
	        return stacks.flatMap((stack, stackIndex) => {
	          let images = [];
	          try {
	            images = JSON.parse(stack.dataset.images || "[]");
	          } catch (error) {
	            images = [];
	          }

	          return [...new Set(images)].map((src, imageIndex) => ({
	            foto_url: src,
	            categoria: region.categoria,
	            texto: stack.dataset.title || "Actividad",
	            orden: stackIndex + imageIndex + 1,
	            activa: true
	          }));
	        });
	      }

	      return Array.from(container.querySelectorAll("img")).map((img, index) => ({
	        foto_url: img.getAttribute("src") || "",
	        categoria: region.categoria,
	        texto: img.getAttribute("alt") || "Actividad",
	        orden: index + 1,
	        activa: true
	      }));
	    }).filter((item) => item.foto_url);

	    const fallbackItems = getLocalGalleryFallback().map((item, index) => ({
	      foto_url: item.foto,
	      categoria: getGalleryRegionKey(item.categoria) || "usa",
	      texto: item.texto || "Actividad",
	      orden: item.orden || index + 1,
	      activa: true
	    }));

	    return [...visibleItems, ...fallbackItems];
	  }

	  function isDuplicateAdminItem(type, item) {
	    const rows = adminContentCache[type] || [];
	    if (type === "eventos") {
	      return rows.some((row) => normalizeGalleryText(row.titulo) === normalizeGalleryText(item.titulo));
	    }

	    if (type === "destacadas") {
	      return rows.some((row) =>
	        normalizeGalleryText(row.nombre) === normalizeGalleryText(item.nombre) ||
	        String(row.foto_url || "") === String(item.foto_url || "")
	      );
	    }

	    return rows.some((row) => String(row.foto_url || "") === String(item.foto_url || ""));
	  }

	  function isMcpStorageUrl(value) {
	    return String(value || "").includes("/storage/v1/object/public/mcp930-images/");
	  }

	  function shouldCopyImageToStorage(value) {
	    const raw = String(value || "").trim();
	    if (!raw || raw === "✦") return false;
	    if (isMcpStorageUrl(raw)) return false;
	    return isImageUrl(raw) || raw.startsWith("assets/");
	  }

	  function buildImportFileName(sourceUrl, fallbackName = "imagen") {
	    try {
	      const url = new URL(sourceUrl, window.location.href);
	      const name = decodeURIComponent(url.pathname.split("/").pop() || fallbackName);
	      return name.includes(".") ? name : `${name}.jpg`;
	    } catch (_) {
	      return `${fallbackName}.jpg`;
	    }
	  }

	  function getGoogleDriveImageId(sourceUrl) {
	    try {
	      const url = new URL(sourceUrl, window.location.href);
	      if (!url.hostname.includes("drive.google.com")) return "";

	      const queryId = url.searchParams.get("id");
	      if (queryId) return queryId;

	      const filePathMatch = url.pathname.match(/\/d\/([^/]+)/);
	      return filePathMatch?.[1] || "";
	    } catch (_) {
	      return "";
	    }
	  }

	  function getImportFetchUrl(sourceUrl) {
	    const driveId = getGoogleDriveImageId(sourceUrl);
	    if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w1200`;
	    return new URL(sourceUrl, window.location.href).href;
	  }

	  async function uploadImageUrlToMcpStorage(sourceUrl, folder, fallbackName) {
	    if (!shouldCopyImageToStorage(sourceUrl)) return sourceUrl;

	    const absoluteUrl = getImportFetchUrl(sourceUrl);
	    const response = await fetch(absoluteUrl, { cache: "no-store" });

	    if (!response.ok) {
	      throw new Error(`No pude leer la imagen para importarla al bucket: ${sourceUrl}`);
	    }

	    const blob = await response.blob();
	    const type = blob.type || "image/jpeg";
	    const fileName = buildImportFileName(sourceUrl, fallbackName);
	    const file = new File([blob], fileName, { type });

	    return uploadImageToSupabaseBucket(file, "mcp930-images", folder);
	  }

	  function findExistingImportedItem(type, item) {
	    const rows = adminContentCache[type] || [];

	    if (type === "eventos") {
	      return rows.find((row) => normalizeGalleryText(row.titulo) === normalizeGalleryText(item.titulo));
	    }

	    if (type === "destacadas") {
	      return rows.find((row) =>
	        normalizeGalleryText(row.nombre) === normalizeGalleryText(item.nombre) ||
	        String(row.foto_url || "") === String(item.foto_url || "")
	      );
	    }

	    return rows.find((row) => String(row.foto_url || "") === String(item.foto_url || ""));
	  }

	  async function prepareImportedItemForStorage(type, item) {
	    if (type === "eventos") {
	      return {
	        ...item,
	        icono: await uploadImageUrlToMcpStorage(item.icono, "eventos", item.titulo || "evento")
	      };
	    }

	    if (type === "destacadas") {
	      return {
	        ...item,
	        foto_url: await uploadImageUrlToMcpStorage(item.foto_url, "destacadas", item.nombre || "destacada")
	      };
	    }

	    return {
	      ...item,
	      foto_url: await uploadImageUrlToMcpStorage(item.foto_url, "galeria", item.texto || "galeria")
	    };
	  }

	  async function migrateExistingAdminImagesToStorage(type) {
	    const table = type === "eventos" ? "eventos" : type === "destacadas" ? "destacadas" : "galeria";
	    const rows = adminContentCache[type] || [];
	    let updated = 0;

	    for (const row of rows) {
	      if (type === "eventos") {
	        if (!shouldCopyImageToStorage(row.icono)) continue;
	        const icono = await uploadImageUrlToMcpStorage(row.icono, "eventos", row.titulo || "evento");
	        if (isMcpStorageUrl(icono)) {
	          await updateAdminRow(table, row.id, { icono });
	          updated += 1;
	        }
	        continue;
	      }

	      if (!shouldCopyImageToStorage(row.foto_url)) continue;
	      const folder = type === "destacadas" ? "destacadas" : "galeria";
	      const fallback = type === "destacadas" ? row.nombre : row.texto;
	      const fotoUrl = await uploadImageUrlToMcpStorage(row.foto_url, folder, fallback || type);

	      if (isMcpStorageUrl(fotoUrl)) {
	        await updateAdminRow(table, row.id, { foto_url: fotoUrl });
	        updated += 1;
	      }
	    }

	    return updated;
	  }

	  async function importVisibleAdminContent(type) {
	    const table = type === "eventos" ? "eventos" : type === "destacadas" ? "destacadas" : "galeria";
	    const items = type === "eventos"
	      ? getVisibleEventsForImport()
	      : type === "destacadas"
	        ? getVisibleInviteesForImport()
	        : getVisibleGalleryForImport();
	    const freshItems = [];
	    let updatedItems = await migrateExistingAdminImagesToStorage(type);

	    for (const item of items) {
	      const existing = findExistingImportedItem(type, item);
	      const preparedItem = await prepareImportedItemForStorage(type, item);

	      if (!existing) {
	        freshItems.push(preparedItem);
	        continue;
	      }

	      if (type === "eventos" && shouldCopyImageToStorage(existing.icono) && isMcpStorageUrl(preparedItem.icono)) {
	        await updateAdminRow(table, existing.id, { icono: preparedItem.icono });
	        updatedItems += 1;
	      }

	      if (type !== "eventos" && shouldCopyImageToStorage(existing.foto_url) && isMcpStorageUrl(preparedItem.foto_url)) {
	        await updateAdminRow(table, existing.id, { foto_url: preparedItem.foto_url });
	        updatedItems += 1;
	      }
	    }

	    if (!freshItems.length && !updatedItems) {
	      window.alert("No encontré contenido nuevo para importar.");
	      return;
	    }

	    const client = getAdminSupabaseClient();
	    if (freshItems.length) {
	      const { error } = await client.from(table).insert(freshItems);
	      if (error) throw error;
	    }

	    await refreshAdminAndSite();
	    window.alert(`Importados ${freshItems.length} elementos. Actualizados ${updatedItems} enlaces al bucket.`);
	  }

	  document.querySelectorAll("[data-admin-import]").forEach((button) => {
	    button.addEventListener("click", async function () {
	      try {
	        await importVisibleAdminContent(this.dataset.adminImport);
	      } catch (error) {
	        console.error(error);
	        const details = [
	          error?.message,
	          error?.details,
	          error?.hint,
	          error?.code
	        ].filter(Boolean).join("\n");
	        window.alert(`No se pudo importar.\n\n${details || "Revisa permisos de insert en Supabase."}`);
	      }
	    });
	  });

	  async function hasPrivateAccessGranted() {
	    const client = getAdminSupabaseClient();
	    const { data, error } = await client.auth.getSession();
	    if (error) {
	      console.warn("No se pudo verificar la sesión de Supabase.", error);
	      return false;
	    }

	    return Boolean(data?.session);
	  }

	  function unlockAdminPanel() {
	    if (adminLoginCard) adminLoginCard.style.display = "none";
	    if (adminDashboard) adminDashboard.style.display = "block";
	    loadAdminContent().catch((error) => {
	      console.error(error);
	      showAdminMsg(adminLoginMsg, "No se pudo cargar el contenido del admin.", false);
	    });
	  }

	  async function requireActiveSessionForPasskey() {
	    if (await hasPrivateAccessGranted()) return true;
	    showAdminMsg(adminLoginMsg, "Por seguridad, primero entra con email y contrasena en este dispositivo.", false);
	    adminAccessEmail?.focus();
	    return false;
	  }

	  async function validateAdminPassword() {
	    const email = adminAccessEmail?.value.trim() || "";
	    const password = adminAccessCode?.value || "";

	    if (!email || !password) {
	      showAdminMsg(adminLoginMsg, "Escribe tu email y contraseña.", false);
	      (!email ? adminAccessEmail : adminAccessCode)?.focus();
	      return false;
	    }

	    const client = getAdminSupabaseClient();
	    const { error } = await client.auth.signInWithPassword({ email, password });

	    if (error) {
	      showAdminMsg(adminLoginMsg, "Login incorrecto o usuario no autorizado.", false);
	      adminAccessCode.value = "";
	      adminAccessCode?.focus();
	      return false;
	    }

	    return true;
	  }

	  async function sendAdminPasswordReset() {
	    const email = adminAccessEmail?.value.trim() || "";

	    if (!email) {
	      showAdminMsg(adminLoginMsg, "Escribe tu email para enviarte el enlace.", false);
	      adminAccessEmail?.focus();
	      return;
	    }

	    const client = getAdminSupabaseClient();
	    const { error } = await client.auth.resetPasswordForEmail(email, {
	      redirectTo: getResetPasswordRedirectUrl()
	    });

	    if (error) {
	      showAdminMsg(adminLoginMsg, "No se pudo enviar el correo de recuperación.", false);
	      return;
	    }

	    showAdminMsg(adminLoginMsg, "Te enviamos un enlace para cambiar tu contraseña.", true);
	  }

	  adminLoginBtn?.addEventListener("click", async function () {
	    if (!await validateAdminPassword()) return;
	    unlockAdminPanel();
	  });

	  adminLoginDashboardBtn?.addEventListener("click", async function () {
	    if (!await validateAdminPassword()) return;
	    window.location.href = "dashboard.html";
	  });

	  adminCancelBtn?.addEventListener("click", function () {
	    window.location.href = "index.html";
	  });

	  adminForgotPasswordBtn?.addEventListener("click", sendAdminPasswordReset);

	  adminEnrollPasskeyBtn?.addEventListener("click", async function () {
	    try {
	      if (!window.McpPasskeyAuth) {
	        showAdminMsg(adminLoginMsg, "Face ID/huella no esta disponible en este navegador.", false);
	        return;
	      }

	      if (!await validateAdminPassword()) return;
	      await window.McpPasskeyAuth.enroll(adminAccessEmail?.value || "");
	      showAdminMsg(adminLoginMsg, "Face ID/huella activado en este dispositivo.", true);
	      unlockAdminPanel();
	    } catch (error) {
	      console.error(error);
	      showAdminMsg(adminLoginMsg, error?.message || "No se pudo activar Face ID/huella.", false);
	    }
	  });

	  adminUsePasskeyBtn?.addEventListener("click", async function () {
	    try {
	      if (!window.McpPasskeyAuth) {
	        showAdminMsg(adminLoginMsg, "Face ID/huella no esta disponible en este navegador.", false);
	        return;
	      }

	      if (!await requireActiveSessionForPasskey()) return;
	      await window.McpPasskeyAuth.verify();
	      unlockAdminPanel();
	    } catch (error) {
	      console.error(error);
	      showAdminMsg(adminLoginMsg, error?.message || "No se pudo verificar Face ID/huella.", false);
	    }
	  });

	  adminLogoutBtn?.addEventListener("click", async function () {
	    const client = getAdminSupabaseClient();
	    await client.auth.signOut();
	    if (adminDashboard) adminDashboard.style.display = "none";
	    if (adminLoginCard) adminLoginCard.style.display = "";
	    if (adminAccessCode) adminAccessCode.value = "";
	    adminAccessEmail?.focus();
	  });

  adminAccessCode?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      adminLoginBtn?.click();
    }
  });

  adminAccessEmail?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      adminAccessCode?.focus();
    }
  });

  if (adminLoginCard && adminDashboard) {
    hasPrivateAccessGranted().then((hasSession) => {
      if (!hasSession) {
        adminAccessEmail?.focus();
        return;
      }

      adminLoginCard.style.display = "none";
      adminDashboard.style.display = "block";
      loadAdminContent().catch((error) => {
        console.error(error);
        showAdminMsg(adminLoginMsg, "No se pudo cargar el contenido del admin.", false);
      });
    });
  }

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      const target = this.dataset.adminTab;
      document.querySelectorAll(".admin-tab").forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".admin-tab-panel").forEach((panel) => panel.classList.remove("active"));
      this.classList.add("active");
      document.getElementById(`admin-${target}`)?.classList.add("active");
    });
  });

  const adminEventoFrecuencia = document.getElementById("adminEventoFrecuencia");
  const adminEventoDias = document.getElementById("adminEventoDias");
  const adminEventoHora = document.getElementById("adminEventoHora");
  const adminEventoMinutos = document.getElementById("adminEventoMinutos");
  if (adminEventoHora && !adminEventoHora.options.length) {
    adminEventoHora.innerHTML = getHourOptions("19");
  }
  updateScheduleDaysVisibility(adminEventoFrecuencia, adminEventoDias);
  adminEventoFrecuencia?.addEventListener("change", () => {
    updateScheduleDaysVisibility(adminEventoFrecuencia, adminEventoDias);
  });

  function getAdminEventScheduleFromForm() {
    const frequency = adminEventoFrecuencia?.value || "diario";
    const days = Array.from(adminEventoDias?.querySelectorAll("input[type='checkbox']:checked") || [])
      .map((checkbox) => checkbox.value);
    const time = combineTimeParts(adminEventoHora?.value || "", adminEventoMinutos?.value || "00");
    return buildEventSchedule({ frequency, days, time });
  }

  document.getElementById("adminEventForm")?.addEventListener("submit", async function (event) {
    event.preventDefault();
    const msg = document.getElementById("adminEventoMsg");
    const iconFile = document.getElementById("adminEventoIconoFoto")?.files?.[0];

    try {
      const icono = iconFile
        ? await uploadImageToSupabaseBucket(iconFile, "mcp930-images", "eventos")
        : document.getElementById("adminEventoIcono")?.value || "✦";

      await window.mcpSaveEvento({
        icono,
        titulo: document.getElementById("adminEventoTitulo")?.value || "",
        horario: getAdminEventScheduleFromForm(),
        link: document.getElementById("adminEventoLink")?.value || "",
        orden: document.getElementById("adminEventoOrden")?.value || 1
	      });

	      this.reset();
	      updateScheduleDaysVisibility(adminEventoFrecuencia, adminEventoDias);
	      showAdminMsg(msg, "Evento guardado correctamente.", true);
	      await loadAdminContent();
	    } catch (error) {
      console.error(error);
      const detail = error?.message ? ` ${error.message}` : "";
      showAdminMsg(msg, `No se pudo guardar el evento.${detail}`, false);
    }
  });

  document.getElementById("adminDestacadaForm")?.addEventListener("submit", async function (event) {
    event.preventDefault();
    const msg = document.getElementById("adminDestacadaMsg");
    const file = document.getElementById("adminDestacadaFoto")?.files?.[0];

    try {
      await window.mcpUploadDestacada({
        file,
        nombre: document.getElementById("adminDestacadaNombre")?.value || "",
        titulo: document.getElementById("adminDestacadaTitulo")?.value || "",
        orden: document.getElementById("adminDestacadaOrden")?.value || 1
      });

	      this.reset();
	      showAdminMsg(msg, "Destacada subida correctamente.", true);
	      await loadAdminContent();
	    } catch (error) {
      console.error(error);
      showAdminMsg(msg, "No se pudo subir la destacada. Revisa Supabase Storage.", false);
    }
  });

  document.getElementById("adminGaleriaCategoria")?.addEventListener("change", function () {
    populateAdminGalleryEventOptions();
    const eventSelect = document.getElementById("adminGaleriaEventoSelect");
    const eventInput = document.getElementById("adminGaleriaTexto");
    if (eventSelect) eventSelect.value = "";
    if (eventInput) eventInput.value = "";
  });

  document.getElementById("adminGaleriaEventoSelect")?.addEventListener("change", function () {
    const eventInput = document.getElementById("adminGaleriaTexto");
    if (eventInput && this.value) eventInput.value = this.value;
  });

  document.getElementById("adminGaleriaForm")?.addEventListener("submit", async function (event) {
    event.preventDefault();
    const msg = document.getElementById("adminGaleriaMsg");
    const file = document.getElementById("adminGaleriaFoto")?.files?.[0];
    const community = document.getElementById("adminGaleriaCategoria")?.value || "usa";
    const selectedEvent = document.getElementById("adminGaleriaEventoSelect")?.value || "";
    const typedEvent = document.getElementById("adminGaleriaTexto")?.value || "";
    const eventTitle = getCanonicalGalleryEventTitle(community, selectedEvent || typedEvent);

    try {
      await window.mcpUploadGaleria({
        file,
        categoria: community,
        texto: eventTitle,
        orden: document.getElementById("adminGaleriaOrden")?.value || 1
      });

	      this.reset();
	      populateAdminGalleryEventOptions();
	      showAdminMsg(msg, "Foto subida correctamente.", true);
	      await loadAdminContent();
	    } catch (error) {
      console.error(error);
      showAdminMsg(msg, "No se pudo subir la foto. Revisa Supabase Storage.", false);
    }
	  });
	  document.getElementById("adminEventosList")?.addEventListener("click", handleAdminListAction);
	  document.getElementById("adminDestacadasList")?.addEventListener("click", handleAdminListAction);
	  document.getElementById("adminGaleriaList")?.addEventListener("click", handleAdminListAction);
	  /* -----------------------------------------
     ADMIN PANEL SAFETY INIT
  ----------------------------------------- */
	  function showAdminSectionFromHash() {
	    const adminSection = document.getElementById("admin");
	    if (!adminSection) return;
	    const isAdminPage = document.body?.dataset.adminPage === "true";
	    adminSection.style.display = isAdminPage || window.location.hash === "#admin" ? "block" : "none";
	  }

  showAdminSectionFromHash();
  window.addEventListener("hashchange", showAdminSectionFromHash);
    /* -----------------------------------------
     SOUNDCLOUD MINI PLAYER
  ----------------------------------------- */
  function initSoundCloudPlayer(attempt = 0) {
    const iframe = document.getElementById("soundcloudWidget");
    const trackList = document.getElementById("scTrackList");
    // Limitar altura del listado (estilo Spotify compacto)
    const title = document.getElementById("scCurrentTitle");
    const playBtn = document.getElementById("scPlayBtn");
    const prevBtn = document.getElementById("scPrevBtn");
    const nextBtn = document.getElementById("scNextBtn");

    if (!iframe || !trackList || !title || !playBtn || !prevBtn || !nextBtn) return;

    if (!window.SC?.Widget) {
      if (attempt < 20) {
        window.setTimeout(() => initSoundCloudPlayer(attempt + 1), 300);
        return;
      }

      title.textContent = "No se pudo conectar con SoundCloud";
      trackList.innerHTML = '<div class="sc-track-placeholder">Abre la playlist para escuchar los audios.</div>';
      playBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    if (iframe.dataset.scInitialized === "true") return;
    iframe.dataset.scInitialized = "true";

    const widget = window.SC.Widget(iframe);
    let sounds = [];
    let current = 0;
    let playing = false;

    function updateTrackListViewport() {
      const isMobile = window.innerWidth <= 768;
      const maxVisibleTracks = isMobile ? 2 : 3;
      const estimatedRowHeight = isMobile ? 64 : 68;
      const hasScrollableList = sounds.length > maxVisibleTracks;

      trackList.style.paddingRight = hasScrollableList ? "6px" : "0";
      trackList.style.overflowY = hasScrollableList ? "auto" : "hidden";
      trackList.style.maxHeight = hasScrollableList
        ? `${maxVisibleTracks * estimatedRowHeight}px`
        : "none";

      trackList.classList.toggle("sc-list-scrollable", hasScrollableList);
      trackList.classList.toggle("sc-list-compact", !hasScrollableList);
    }

    function render() {
      updateTrackListViewport();
      trackList.innerHTML = sounds.length
        ? sounds.map((s, i) => `
            <div class="sc-track ${i === current ? "active" : ""}" data-i="${i}">
              <span class="sc-track-index">${i === current ? "▶" : String(i + 1).padStart(2, "0")}</span>
              <span class="sc-track-title">${s.title}</span>
            </div>
          `).join("")
        : `<div class="sc-track-placeholder">No se encontraron audios.</div>`;

      trackList.querySelectorAll(".sc-track").forEach(el => {
        el.onclick = () => {
          current = Number(el.dataset.i);
          widget.skip(current);
          widget.play();
        };
      });
    }

    const readyTimeout = window.setTimeout(() => {
      title.textContent = "SoundCloud tardó demasiado en responder";
      trackList.innerHTML = '<div class="sc-track-placeholder">Usa “Ver playlist” para escuchar los audios.</div>';
    }, 12000);

    widget.bind(window.SC.Widget.Events.READY, () => {
      window.clearTimeout(readyTimeout);
      widget.getSounds(data => {
        sounds = Array.isArray(data) ? data : [];
        if (sounds.length) {
          title.textContent = sounds[0].title;
        } else {
          title.textContent = "No hay audios disponibles";
        }
        render();
      });
    });

    widget.bind(window.SC.Widget.Events.PLAY, () => {
      playing = true;
      playBtn.textContent = "❚❚";

      widget.getCurrentSound(s => {
        if (!s) return;
        title.textContent = s.title;
        const found = sounds.findIndex(x => x.id === s.id);
        if (found !== -1) current = found;
        render();
      });
    });

    widget.bind(window.SC.Widget.Events.PAUSE, () => {
      playing = false;
      playBtn.textContent = "▶";
    });

    playBtn.onclick = () => {
      playing ? widget.pause() : widget.play();
    };

    prevBtn.onclick = () => {
      if (!sounds.length) return;
      current = current > 0 ? current - 1 : sounds.length - 1;
      widget.skip(current);
      widget.play();
    };

    nextBtn.onclick = () => {
      if (!sounds.length) return;
      current = current < sounds.length - 1 ? current + 1 : 0;
      widget.skip(current);
      widget.play();
    };

    window.addEventListener("resize", () => {
      updateTrackListViewport();
    });
  }
/* -----------------------------------------
   ACCESO OCULTO: ADMIN + DASHBOARD
----------------------------------------- */
(function initHiddenPrivateAccess() {
  const ADMIN_URL = "admin.html";
  const footer = document.querySelector("footer");

  let footerTapCount = 0;
  let footerTapTimer = null;
  let holdTimer = null;
  let holdTriggered = false;
  let typedSequence = "";
  let sequenceTimer = null;
  const secretSequence = "mcpadmin";

  function openPrivateAccess() {
    window.location.href = ADMIN_URL;
  }

  function resetFooterTaps() {
    footerTapCount = 0;
    if (footerTapTimer) {
      clearTimeout(footerTapTimer);
      footerTapTimer = null;
    }
  }

  function startFooterHold() {
    holdTriggered = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdTriggered = true;
      resetFooterTaps();
      openPrivateAccess();
    }, 1400);
  }

  function stopFooterHold() {
    clearTimeout(holdTimer);
  }

  if (footer) {
    footer.addEventListener("click", () => {
      if (holdTriggered) {
        holdTriggered = false;
        return;
      }

      footerTapCount += 1;

      if (footerTapTimer) {
        clearTimeout(footerTapTimer);
      }

      footerTapTimer = setTimeout(() => {
        footerTapCount = 0;
      }, 1800);

      if (footerTapCount >= 3) {
        resetFooterTaps();
        openPrivateAccess();
      }
    });

    footer.addEventListener("mousedown", startFooterHold);
    footer.addEventListener("touchstart", startFooterHold, { passive: true });

    footer.addEventListener("mouseup", stopFooterHold);
    footer.addEventListener("mouseleave", stopFooterHold);
    footer.addEventListener("touchend", stopFooterHold);
    footer.addEventListener("touchcancel", stopFooterHold);

    footer.addEventListener("dblclick", (e) => {
      e.preventDefault();
      resetFooterTaps();
      openPrivateAccess();
    });

    footer.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      resetFooterTaps();
      openPrivateAccess();
    });
  }

  document.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement?.tagName || "";
    const isTypingField = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
    if (isTypingField) return;

    if (e.key.length !== 1) return;

    typedSequence += e.key.toLowerCase();

    if (!secretSequence.startsWith(typedSequence)) {
      typedSequence = e.key.toLowerCase() === secretSequence[0] ? secretSequence[0] : "";
    }

    if (typedSequence === secretSequence) {
      typedSequence = "";
      openPrivateAccess();
      return;
    }

    clearTimeout(sequenceTimer);
    sequenceTimer = setTimeout(() => {
      typedSequence = "";
    }, 1800);
  });
})();

initSoundCloudPlayer();
loadDynamicContent();

/* -----------------------------------------
   FORMULARIO CONTACTO
----------------------------------------- */
const contactForm = document.getElementById("contactForm");

if (contactForm) {
  contactForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const btn = document.getElementById("cSubmitBtn");
    const msg = document.getElementById("contactMsg");

    if (!btn || !msg) return;

    btn.disabled = true;
    btn.textContent = "Enviando...";
    msg.textContent = "";
    msg.style.color = "";

    const payload = {
      action: "contact",
      destino: CONTACT_EMAIL,
      nombre: document.getElementById("cNombre")?.value.trim() || "",
      email: document.getElementById("cEmail")?.value.trim() || "",
      mensaje: document.getElementById("cMensaje")?.value.trim() || ""
    };

    try {
      if (!hasSupabaseConfig()) {
        throw new Error("Supabase no está configurado.");
      }

      const response = await sendContactToSupabase(payload);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Error Supabase ${response.status}: ${text || response.statusText}`);
      }

      await sendContactEmailWithEdgeFunction(payload);

      if (msg) {
        msg.textContent = "Mensaje enviado correctamente.";
        msg.style.color = "#2f8f4b";
      }

      if (contactForm) {
        contactForm.reset();
      }
    } catch (error) {
      console.error("Error enviando contacto:", error);
      if (msg) {
        msg.textContent = "Ocurrió un error al enviar tu mensaje. Intenta de nuevo.";
        msg.style.color = "#b72e2e";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar";
      }
    }
  });
}

});
