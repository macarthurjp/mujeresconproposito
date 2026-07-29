(function initializeScriptLoader() {
  const pendingScripts = new Map();

  function load(url, attributes = {}) {
    if (pendingScripts.has(url)) return pendingScripts.get(url);

    const promise = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.src === url);
      if (existing?.dataset.loaded === "true") {
        resolve(existing);
        return;
      }

      const script = existing || document.createElement("script");
      script.src = url;
      script.async = true;
      Object.entries(attributes).forEach(([name, value]) => {
        script.setAttribute(name, value);
      });

      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve(script);
      }, { once: true });
      script.addEventListener("error", () => {
        pendingScripts.delete(url);
        reject(new Error(`No se pudo cargar el recurso externo: ${url}`));
      }, { once: true });

      if (!existing) document.head.appendChild(script);
    });

    pendingScripts.set(url, promise);
    return promise;
  }

  window.McpScripts = { load };
})();
