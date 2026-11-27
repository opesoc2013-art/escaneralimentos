/* =========================================================
   Escáner de Alimentos — app.js
   Usa la API pública de Open Food Facts (no necesita clave)
   ========================================================= */

// ---------- 1. Configuración ----------
const API_URL = "https://world.openfoodfacts.org/api/v2/product/";
const CAMPOS = [
  "code", "product_name", "product_name_es", "brands", "quantity",
  "image_front_small_url", "image_front_url",
  "nutriscore_grade", "nova_group", "nutrient_levels", "nutriments",
  "allergens_tags", "ingredients_text_es", "ingredients_text"
].join(",");
const MAX_HISTORIAL = 10;

// ---------- 2. Elementos de la página ----------
const $ = (id) => document.getElementById(id);
const btnEscanear = $("btnEscanear");
const btnDetener = $("btnDetener");
const lectorWrap = $("lectorWrap");
const formBuscar = $("formBuscar");
const inputCodigo = $("inputCodigo");
const estado = $("estado");
const resultado = $("resultado");
const historialCard = $("historialCard");
const listaHistorial = $("historial");
const btnTema = $("btnTema");
const btnDescargar = $("btnDescargar");
const modalIos = $("modalIos");

// ---------- 3. Textos en castellano ----------
const ALERGENOS = {
  "en:gluten": "Gluten", "en:milk": "Leche", "en:eggs": "Huevo",
  "en:nuts": "Frutos secos", "en:peanuts": "Maní", "en:soybeans": "Soja",
  "en:fish": "Pescado", "en:crustaceans": "Crustáceos", "en:molluscs": "Moluscos",
  "en:celery": "Apio", "en:mustard": "Mostaza", "en:sesame-seeds": "Sésamo",
  "en:sulphur-dioxide-and-sulphites": "Sulfitos", "en:lupin": "Lupino"
};
// Íconos dibujados con SVG
const ICONO_PAQUETE = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>`;
const ICONO_ALERTA = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/></svg>`;

const NIVELES = { low: "Bajo", moderate: "Moderado", high: "Alto" };
const NUTRIENTES_NIVEL = {
  "fat": "Grasas", "saturated-fat": "Grasas saturadas",
  "sugars": "Azúcares", "salt": "Sal"
};
const NOVA = {
  1: "Sin procesar o mínimamente procesado",
  2: "Ingrediente culinario procesado",
  3: "Alimento procesado",
  4: "Ultraprocesado"
};

// ---------- 4. Utilidades ----------
// Evita que un texto de la base de datos se interprete como código HTML
function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function mostrarEstado(mensaje, tipo = "info") {
  estado.hidden = false;
  estado.className = "estado" + (tipo === "error" ? " error" : "");
  estado.innerHTML = tipo === "cargando"
    ? `<span class="spinner"></span>${escapar(mensaje)}`
    : escapar(mensaje);
}
function ocultarEstado() { estado.hidden = true; }

function numero(valor, decimales = 1) {
  if (valor === undefined || valor === null || valor === "") return "–";
  const n = Number(valor);
  return Number.isNaN(n) ? "–" : n.toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

// ---------- 5. Consultar la API ----------
async function pedirProducto(codigo) {
  const url = `${API_URL}${encodeURIComponent(codigo)}.json?fields=${CAMPOS}&lc=es`;
  const respuesta = await fetch(url);
  // La API responde 404 cuando el producto no existe: no es un error de conexión
  if (!respuesta.ok && respuesta.status !== 404) {
    throw new Error("Error del servidor (" + respuesta.status + ")");
  }
  const datos = await respuesta.json();
  return datos.status === 1 ? datos.product : null;
}

async function buscarProducto(codigo) {
  codigo = String(codigo).replace(/\D/g, "");
  if (codigo.length < 8 || codigo.length > 14) {
    mostrarEstado("El código debe tener entre 8 y 14 números.", "error");
    return;
  }
  resultado.hidden = true;
  mostrarEstado("Buscando el producto…", "cargando");

  try {
    let producto = await pedirProducto(codigo);
    // Los códigos UPC de 12 números a veces están guardados con un 0 adelante
    if (!producto && codigo.length === 12) producto = await pedirProducto("0" + codigo);

    if (!producto) {
      mostrarEstado(`No encontramos el código ${codigo}. Puede que todavía no esté cargado en Open Food Facts.`, "error");
      return;
    }
    ocultarEstado();
    mostrarProducto(producto, codigo);
    guardarEnHistorial(producto, codigo);
  } catch (error) {
    console.error(error);
    mostrarEstado("No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.", "error");
  }
}

// ---------- 6. Mostrar el resultado ----------
function mostrarProducto(p, codigo) {
  const nombre = p.product_name_es || p.product_name || "Producto sin nombre";
  const foto = p.image_front_url || p.image_front_small_url;
  const n = p.nutriments || {};
  const nota = (p.nutriscore_grade || "").toLowerCase();
  const notaValida = ["a", "b", "c", "d", "e"].includes(nota);

  // Cabecera con foto, nombre y marca
  let html = `
    <div class="producto-head">
      ${foto
        ? `<img class="producto-img" src="${escapar(foto)}" alt="Foto de ${escapar(nombre)}">`
        : `<div class="producto-img sin-foto">${ICONO_PAQUETE}</div>`}
      <div>
        <h2 class="producto-nombre">${escapar(nombre)}</h2>
        <p class="producto-marca">${escapar(p.brands || "Marca desconocida")}
          ${p.quantity ? " · " + escapar(p.quantity) : ""}</p>
        <p class="producto-marca">Código: ${escapar(codigo)}</p>
      </div>
    </div>`;

  // Nutri-Score y NOVA
  html += `<div class="puntajes">
      <div class="puntaje ${notaValida ? "nota-" + nota : ""}">
        <small>Nutri-Score</small>
        <strong>${notaValida ? nota.toUpperCase() : "–"}</strong>
      </div>
      <div class="puntaje">
        <small>Grupo NOVA</small>
        <strong>${p.nova_group ? escapar(p.nova_group) : "–"}</strong>
        <small>${p.nova_group ? escapar(NOVA[p.nova_group] || "") : "Sin dato"}</small>
      </div>
    </div>`;

  // Niveles de grasas, azúcares y sal
  const niveles = p.nutrient_levels || {};
  const filasNivel = Object.keys(NUTRIENTES_NIVEL)
    .filter((clave) => niveles[clave])
    .map((clave) => `<li>${NUTRIENTES_NIVEL[clave]}
        <span class="nivel nivel-${escapar(niveles[clave])}">${NIVELES[niveles[clave]] || escapar(niveles[clave])}</span></li>`)
    .join("");
  if (filasNivel) {
    html += `<h3 class="seccion-titulo">Niveles por cada 100 g</h3><ul class="niveles">${filasNivel}</ul>`;
  }

  // Tabla nutricional
  html += `<h3 class="seccion-titulo">Información nutricional (100 g)</h3>
    <table class="tabla"><tbody>
      <tr><td>Energía</td><td>${numero(n["energy-kcal_100g"], 0)} kcal</td></tr>
      <tr><td>Grasas totales</td><td>${numero(n.fat_100g)} g</td></tr>
      <tr><td>Grasas saturadas</td><td>${numero(n["saturated-fat_100g"])} g</td></tr>
      <tr><td>Carbohidratos</td><td>${numero(n.carbohydrates_100g)} g</td></tr>
      <tr><td>Azúcares</td><td>${numero(n.sugars_100g)} g</td></tr>
      <tr><td>Fibra</td><td>${numero(n.fiber_100g)} g</td></tr>
      <tr><td>Proteínas</td><td>${numero(n.proteins_100g)} g</td></tr>
      <tr><td>Sodio</td><td>${n.sodium_100g !== undefined ? numero(n.sodium_100g * 1000, 0) + " mg" : "–"}</td></tr>
    </tbody></table>`;

  // Alérgenos
  const alergenos = (p.allergens_tags || []).map((t) => ALERGENOS[t] || t.replace(/^..:/, ""));
  html += `<h3 class="seccion-titulo">Alérgenos</h3>`;
  html += alergenos.length
    ? `<div class="alergenos">${alergenos.map((a) => `<span class="alergeno">${ICONO_ALERTA}${escapar(a)}</span>`).join("")}</div>`
    : `<p class="ingredientes">No hay alérgenos declarados en la base de datos.</p>`;

  // Ingredientes
  const ingredientes = p.ingredients_text_es || p.ingredients_text;
  html += `<h3 class="seccion-titulo">Ingredientes</h3>
    <p class="ingredientes">${ingredientes ? escapar(ingredientes) : "Sin lista de ingredientes cargada."}</p>`;

  html += `<p class="fuente">Ver ficha completa en
    <a href="https://world.openfoodfacts.org/product/${encodeURIComponent(codigo)}" target="_blank" rel="noopener">Open Food Facts</a></p>`;

  resultado.innerHTML = html;
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 7. Historial (se guarda en el celular) ----------
function leerHistorial() {
  try { return JSON.parse(localStorage.getItem("historial")) || []; }
  catch { return []; }
}

function guardarEnHistorial(p, codigo) {
  const item = {
    codigo,
    nombre: p.product_name_es || p.product_name || "Producto sin nombre",
    foto: p.image_front_small_url || p.image_front_url || ""
  };
  const lista = leerHistorial().filter((x) => x.codigo !== codigo);
  lista.unshift(item);
  try { localStorage.setItem("historial", JSON.stringify(lista.slice(0, MAX_HISTORIAL))); } catch {}
  pintarHistorial();
}

function pintarHistorial() {
  const lista = leerHistorial();
  historialCard.hidden = lista.length === 0;
  listaHistorial.innerHTML = lista.map((x) => `
    <li><button data-codigo="${escapar(x.codigo)}">
      ${x.foto ? `<img src="${escapar(x.foto)}" alt="">` : `<span class="sin-foto">${ICONO_PAQUETE}</span>`}
      <span>${escapar(x.nombre)}<span class="cod">${escapar(x.codigo)}</span></span>
    </button></li>`).join("");
}

listaHistorial.addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-codigo]");
  if (boton) buscarProducto(boton.dataset.codigo);
});
$("btnBorrarHistorial").addEventListener("click", () => {
  try { localStorage.removeItem("historial"); } catch {}
  pintarHistorial();
});

// ---------- 8. Búsqueda manual y ejemplos ----------
formBuscar.addEventListener("submit", (e) => {
  e.preventDefault();
  buscarProducto(inputCodigo.value);
});
document.querySelectorAll(".chip-btn").forEach((b) =>
  b.addEventListener("click", () => {
    inputCodigo.value = b.dataset.codigo;
    buscarProducto(b.dataset.codigo);
  })
);

// ---------- 9. Escáner con la cámara ----------
let lector = null;

async function iniciarEscaner() {
  if (typeof Html5Qrcode === "undefined") {
    mostrarEstado("No se cargó el lector de códigos. Recargá la página.", "error");
    return;
  }
  lectorWrap.hidden = false;
  btnEscanear.hidden = true;
  ocultarEstado();

  lector = new Html5Qrcode("lector", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E
    ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  try {
    await lector.start(
      { facingMode: "environment" },          // cámara de atrás
      { fps: 10, qrbox: { width: 260, height: 140 } },
      async (codigoLeido) => {                  // cuando lee un código
        if (navigator.vibrate) navigator.vibrate(120);
        await detenerEscaner();
        inputCodigo.value = codigoLeido;
        buscarProducto(codigoLeido);
      },
      () => {}                                   // ignora los cuadros sin código
    );
  } catch (error) {
    console.error(error);
    await detenerEscaner();
    mostrarEstado("No pudimos abrir la cámara. Revisá que le diste permiso al navegador.", "error");
  }
}

async function detenerEscaner() {
  if (lector) {
    try { if (lector.isScanning) await lector.stop(); lector.clear(); } catch {}
    lector = null;
  }
  lectorWrap.hidden = true;
  btnEscanear.hidden = false;
}

btnEscanear.addEventListener("click", iniciarEscaner);
btnDetener.addEventListener("click", detenerEscaner);

// ---------- 10. Modo claro / oscuro ----------
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]').content = tema === "oscuro" ? "#0f1712" : "#16a34a";
}
let temaGuardado = null;
try { temaGuardado = localStorage.getItem("tema"); } catch {}
aplicarTema(temaGuardado || (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"));

btnTema.addEventListener("click", () => {
  const nuevo = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
  aplicarTema(nuevo);
  try { localStorage.setItem("tema", nuevo); } catch {}
});

// ---------- 11. Botón "Descargar app" ----------
let avisoInstalacion = null;
const yaInstalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);

// Android / Chrome: el navegador avisa que la app se puede instalar
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  avisoInstalacion = e;
  btnDescargar.hidden = false;
});

// iPhone: no hay aviso automático, mostramos instrucciones
if (esIphone && !yaInstalada) btnDescargar.hidden = false;

btnDescargar.addEventListener("click", async () => {
  if (avisoInstalacion) {
    avisoInstalacion.prompt();
    await avisoInstalacion.userChoice;
    avisoInstalacion = null;
    btnDescargar.hidden = true;
  } else if (esIphone) {
    modalIos.hidden = false;
  }
});
$("btnCerrarModal").addEventListener("click", () => (modalIos.hidden = true));
window.addEventListener("appinstalled", () => (btnDescargar.hidden = true));

// ---------- 12. Service worker (permite instalarla y abrirla rápido) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW no registrado", e));
  });
}

// ---------- 13. Inicio ----------
pintarHistorial();
