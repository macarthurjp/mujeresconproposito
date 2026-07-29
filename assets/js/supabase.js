(function initializeMcpSupabase() {
  const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
  const CONTACT_EMAILS = ["mujeresconproposito930@gmail.com", "ing.arthur03@gmail.com"];
  const CONTACT_EMAIL = CONTACT_EMAILS.join(", ");

  const IMAGE_UPLOAD_PROFILES = {
    eventos: { maxWidth: 512, maxHeight: 512, quality: 0.82 },
    destacadas: { maxWidth: 1200, maxHeight: 1600, quality: 0.82 },
    galeria: { maxWidth: 1600, maxHeight: 1600, quality: 0.8 },
    uploads: { maxWidth: 1600, maxHeight: 1600, quality: 0.8 }
  };

  function hasSupabaseConfig() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("https://"));
  }

  function getSupabaseBrowserClient() {
    if (!window.supabase || !hasSupabaseConfig()) return null;
    if (!window.mcpSupabaseClient) {
      window.mcpSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.mcpSupabaseClient;
  }

  async function supabaseInsert(table, record) {
    if (!hasSupabaseConfig()) throw new Error("Supabase no está configurado.");

    return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    });
  }

  function sendJoinToSupabase(payload) {
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

  function sendContactToSupabase(payload) {
    return supabaseInsert("contact_messages", {
      nombre: payload.nombre,
      email: payload.email,
      mensaje: payload.mensaje,
      destino: payload.destino,
      source: "web"
    });
  }

  async function invokeEmailEdgeFunction(functionName, payload) {
    const client = getSupabaseBrowserClient();
    if (!client?.functions) throw new Error("Supabase Functions no está disponible.");

    const { data, error } = await client.functions.invoke(functionName, { body: payload });
    if (!error) return data;

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

  function sendWelcomeEmailWithEdgeFunction(payload) {
    return invokeEmailEdgeFunction("send-welcome-email", {
      nombre: payload.nombre || "",
      apellido: payload.apellido || "",
      email: payload.email || "",
      comunidad: payload.comunidad || ""
    });
  }

  function sendBirthdayEmailForNewMember(payload) {
    if (!payload.id) return Promise.resolve({ ok: false, skipped: true });
    return invokeEmailEdgeFunction("send-birthday-emails", { memberId: payload.id });
  }

  function sendAdminRegistrationEmailWithEdgeFunction(payload) {
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

  function sendContactEmailWithEdgeFunction(payload) {
    return invokeEmailEdgeFunction("send-contact-email", {
      nombre: payload.nombre || "",
      email: payload.email || "",
      mensaje: payload.mensaje || "",
      destino: payload.destino || CONTACT_EMAIL
    });
  }

  function getTodayBirthdaysFromEdgeFunction() {
    return invokeEmailEdgeFunction("get-today-birthdays", {});
  }

  function getOptimizedImageName(fileName) {
    const baseName = String(fileName || "imagen")
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return `${baseName || "imagen"}.webp`;
  }

  async function decodeUploadImage(file) {
    if ("createImageBitmap" in window) {
      return createImageBitmap(file, { imageOrientation: "from-image" });
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("El navegador no pudo comprimir la imagen."));
      }, type, quality);
    });
  }

  async function optimizeImageForUpload(file, folder = "uploads") {
    if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
      throw new Error("Selecciona un archivo de imagen válido.");
    }
    if (file.size > 25 * 1024 * 1024) throw new Error("La imagen supera el límite de 25 MB.");
    if (["image/svg+xml", "image/gif", "image/heic", "image/heif"].includes(file.type)) {
      throw new Error("Usa una imagen JPG, PNG, WebP o AVIF.");
    }

    const profile = IMAGE_UPLOAD_PROFILES[folder] || IMAGE_UPLOAD_PROFILES.uploads;
    let image;
    try {
      image = await decodeUploadImage(file);
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) throw new Error("La imagen no tiene dimensiones válidas.");

      const scale = Math.min(1, profile.maxWidth / sourceWidth, profile.maxHeight / sourceHeight);
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("El navegador no pudo preparar la imagen.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const optimizedBlob = await canvasToBlob(canvas, "image/webp", profile.quality);
      return new File([optimizedBlob], getOptimizedImageName(file.name), {
        type: "image/webp",
        lastModified: Date.now()
      });
    } catch (error) {
      throw new Error(`No se pudo optimizar la imagen. ${error?.message || ""}`.trim());
    } finally {
      if (image && typeof image.close === "function") image.close();
    }
  }

  async function uploadImageToSupabaseBucket(file, bucket, folder = "uploads") {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Supabase JS no está cargado o configurado.");
    if (!file) throw new Error("No se seleccionó archivo.");

    const optimizedFile = await optimizeImageForUpload(file, folder);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${optimizedFile.name}`;
    const { error } = await client.storage.from(bucket).upload(path, optimizedFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: optimizedFile.type
    });
    if (error) throw error;

    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  window.McpSupabase = {
    CONTACT_EMAIL,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getSupabaseBrowserClient,
    getTodayBirthdaysFromEdgeFunction,
    hasSupabaseConfig,
    optimizeImageForUpload,
    sendAdminRegistrationEmailWithEdgeFunction,
    sendBirthdayEmailForNewMember,
    sendContactEmailWithEdgeFunction,
    sendContactToSupabase,
    sendJoinToSupabase,
    sendWelcomeEmailWithEdgeFunction,
    uploadImageToSupabaseBucket
  };

  window.mcpOptimizeImageUpload = optimizeImageForUpload;
})();
