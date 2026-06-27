#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const JCYL_INCIDENTS_URL =
  "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incidencias-en-la-red-de-carreteras-titularidad-de-la-junta-de-castilla-y-leon/records";

const DEFAULT_OUT = path.resolve(__dirname, "..", "www", "data", "puntok-incidents-palencia.json");

function parseArgs(argv) {
  const args = {
    out: process.env.PUNTOK_INCIDENTS_OUT || DEFAULT_OUT,
    province: process.env.PUNTOK_INCIDENTS_PROVINCE || "Palencia",
    limit: Number(process.env.PUNTOK_INCIDENTS_LIMIT || 80)
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--province") args.province = argv[++i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

function severityFromType(type = "") {
  const value = String(type).toLowerCase();
  if (value.includes("cort")) return "high";
  if (value.includes("dif")) return "high";
  if (value.includes("precau")) return "medium";
  return "low";
}

function cleanText(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text || text === "--") return "";
  return text.replace(/\s+/g, " ");
}

function formatPkRange(start, end) {
  if (start == null && end == null) return "";
  const first = Number(start);
  const last = Number(end);
  if (Number.isFinite(first) && Number.isFinite(last) && Math.abs(first - last) > 0.001) {
    return `${formatPk(first)}-${formatPk(last)}`;
  }
  if (Number.isFinite(first)) return formatPk(first);
  if (Number.isFinite(last)) return formatPk(last);
  return "";
}

function formatPk(value) {
  return Number(value).toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function normalizeJcylIncident(row) {
  const road = cleanText(row.via);
  const type = cleanText(row.tipo);
  const cause = cleanText(row.causa);
  const tramo = cleanText(row.tramo);
  const observations = cleanText(row.observaciones);
  const route = cleanText(row.rutaalt);
  const modified = row.fechamodificacion || row.fechaalta || "";
  const title = [type || "Incidencia", cause].filter(Boolean).join(" · ");
  const details = [tramo, observations, route ? `Ruta alternativa: ${route}` : ""].filter(Boolean).join(". ");

  return {
    id: `jcyl-${row.numincidencia || road}-${row.pkinicio || "pk"}`,
    source: "Junta de Castilla y Leon",
    province: cleanText(row.provincia),
    road,
    pk: formatPkRange(row.pkinicio, row.pkfin),
    pkStart: row.pkinicio ?? null,
    pkEnd: row.pkfin ?? null,
    title,
    description: details,
    severity: severityFromType(type),
    updatedAt: modified,
    location: tramo,
    url: cleanText(row.masinfo)
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PuntoK-Rescate-incidents/1.0"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.json();
}

async function fetchJcylIncidents({ province, limit }) {
  const url = new URL(JCYL_INCIDENTS_URL);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("where", `provincia="${province}"`);
  url.searchParams.set("order_by", "fechamodificacion DESC, fechaalta DESC");
  const payload = await fetchJson(url);
  return (payload.results || []).map(normalizeJcylIncident);
}

async function fetchOptionalDgtIncidents() {
  const url = process.env.DGT_INCIDENTS_JSON_URL;
  if (!url) return [];
  const payload = await fetchJson(url);
  const items = payload.incidents || payload.items || [];
  return items.map((item) => ({
    id: item.id || `dgt-${item.road || item.carretera || Math.random()}`,
    source: item.source || "DGT",
    province: item.province || item.provincia || "",
    road: item.road || item.carretera || item.via || "",
    pk: item.pk || item.puntoKilometrico || "",
    title: item.title || item.titulo || item.tipo || "Incidencia DGT",
    description: item.description || item.descripcion || item.detalle || "",
    severity: item.severity || item.gravedad || "medium",
    updatedAt: item.updatedAt || item.fecha || item.time || "",
    location: item.location || item.localizacion || item.tramo || "",
    url: item.url || item.masinfo || ""
  }));
}

function sortIncidents(a, b) {
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const severity = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
  if (severity) return severity;
  return String(a.road).localeCompare(String(b.road), "es", { numeric: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const [jcylIncidents, dgtIncidents] = await Promise.all([
    fetchJcylIncidents(args),
    fetchOptionalDgtIncidents()
  ]);
  const incidents = [...dgtIncidents, ...jcylIncidents].sort(sortIncidents).slice(0, args.limit);
  const payload = {
    version: `github-actions-${new Date().toISOString().slice(0, 10)}`,
    updatedAt: new Date().toISOString(),
    source: dgtIncidents.length
      ? "DGT + Junta de Castilla y Leon"
      : "Junta de Castilla y Leon - Datos Abiertos",
    sources: [
      {
        name: "Junta de Castilla y Leon - Incidencias de carreteras",
        url: "https://analisis.datosabiertos.jcyl.es/explore/dataset/incidencias-en-la-red-de-carreteras-titularidad-de-la-junta-de-castilla-y-leon/"
      },
      ...(dgtIncidents.length
        ? [{ name: "DGT", url: process.env.DGT_INCIDENTS_JSON_URL }]
        : [])
    ],
    incidents
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${incidents.length} incident(s) to ${args.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
