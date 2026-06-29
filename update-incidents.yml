#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const xml2js = require("xml2js");

const JCYL_INCIDENTS_URL =
  "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incidencias-en-la-red-de-carreteras-titularidad-de-la-junta-de-castilla-y-leon/records";
const DGT_DATEX_URL = "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml";
const DEFAULT_DGT_PROVINCES = ["Palencia"];

const DEFAULT_OUT = path.resolve(__dirname, "..", "www", "data", "puntok-incidents-palencia.json");
const DEFAULT_DATA = path.resolve(__dirname, "..", "www", "data", "puntok-data.js");

function parseArgs(argv) {
  const args = {
    out: process.env.PUNTOK_INCIDENTS_OUT || DEFAULT_OUT,
    data: process.env.PUNTOK_DATA_FILE || DEFAULT_DATA,
    dgtDatexUrl: process.env.PUNTOK_DGT_DATEX_URL || DGT_DATEX_URL,
    province: process.env.PUNTOK_INCIDENTS_PROVINCE || "Palencia",
    provinces: (process.env.PUNTOK_DGT_PROVINCES || DEFAULT_DGT_PROVINCES.join(","))
      .split(",")
      .map(cleanText)
      .filter(Boolean),
    limit: Number(process.env.PUNTOK_INCIDENTS_LIMIT || 80)
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") args.data = argv[++i];
    if (arg === "--dgt-datex-url") args.dgtDatexUrl = argv[++i];
    if (arg === "--no-dgt-datex") args.dgtDatexUrl = "";
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--province") args.province = argv[++i];
    if (arg === "--dgt-provinces") args.provinces = argv[++i].split(",").map(cleanText).filter(Boolean);
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

function normalizeKey(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml,*/*",
      "user-agent": "PuntoK-Rescate-incidents/1.0"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.text();
}

async function parseXml(xml) {
  return xml2js.parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix],
    attrNameProcessors: [xml2js.processors.stripPrefix]
  });
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = firstText(...value);
      if (found) return found;
    } else if (value != null && typeof value === "object") {
      const found = firstText(value.value, value.values, value._);
      if (found) return found;
    } else {
      const text = cleanText(value);
      if (text) return text;
    }
  }
  return "";
}

function loadPuntokRoadIds(file) {
  if (!file || !fs.existsSync(file)) return null;
  const sandbox = { window: {} };
  const code = fs.readFileSync(file, "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
  return new Set((sandbox.window.PUNTOK_DATA?.roads || []).map((road) => normalizeKey(road.id)).filter(Boolean));
}

function dgtSeverity(record) {
  const values = [
    firstText(record.severity),
    firstText(record.roadOrCarriagewayOrLaneManagementType),
    firstText(record.trafficElementExtension?.trafficConstrictionType),
    firstText(record.cause?.causeType),
    firstText(record.cause?.detailedCauseType?.roadMaintenanceType)
  ].map((value) => normalizeKey(value));
  if (values.some((value) => /CLOSURE|CARRIAGEWAYCLOSURES|LANECLOSURE|ACCIDENT|OBSTRUCTION|CONGESTION|HIGH/.test(value))) return "high";
  if (values.some((value) => /DO NOT USE|ROADWORKS|MAINTENANCE|SPEED|MEDIUM|ABNORMALTRAFFIC/.test(value))) return "medium";
  return "low";
}

function humanizeDgtValue(value) {
  const dictionary = {
    abnormalTraffic: "Tráfico anómalo",
    accident: "Accidente",
    carriagewayClosures: "Corte de calzada",
    doNotUseSpecifiedLanesOrCarriageways: "Carriles/calzada afectados",
    generalObstruction: "Obstáculo",
    intermittentShortTermClosures: "Cortes intermitentes",
    laneClosures: "Carriles cortados",
    maintenanceWorks: "Obras de mantenimiento",
    roadMaintenance: "Mantenimiento",
    roadworks: "Obras",
    singleAlternateLineTraffic: "Paso alternativo",
    speedManagement: "Gestión de velocidad"
  };
  const text = cleanText(value);
  return dictionary[text] || text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (match) => match.toUpperCase());
}

function dgtPoint(location, pointName) {
  const point = location?.tpegLinearLocation?.[pointName];
  const extension = point?._tpegNonJunctionPointExtension?.extendedTpegNonJunctionPoint || {};
  return {
    lat: Number(firstText(point?.pointCoordinates?.latitude)),
    lng: Number(firstText(point?.pointCoordinates?.longitude)),
    pk: Number(firstText(extension.kilometerPoint)),
    municipality: firstText(extension.municipality),
    province: firstText(extension.province),
    autonomousCommunity: firstText(extension.autonomousCommunity)
  };
}

function dgtLocation(record) {
  const location = record.locationReference || {};
  const linear = location.tpegLinearLocation || {};
  const from = dgtPoint(location, "from");
  const to = dgtPoint(location, "to");
  const points = [from, to].filter((point) => Number.isFinite(point.pk));
  const provinces = [...new Set([from.province, to.province].filter(Boolean))];
  const municipalities = [...new Set([from.municipality, to.municipality].filter(Boolean))];
  return {
    road: firstText(location.supplementaryPositionalDescription?.roadInformation?.roadName),
    direction: firstText(linear.tpegDirection, linear._tpegLinearLocationExtension?.extendedTpegLinearLocation?.tpegDirectionRoad),
    pk: points.length ? formatPkRange(Math.min(...points.map((point) => point.pk)), Math.max(...points.map((point) => point.pk))) : "",
    pkStart: points.length ? Math.min(...points.map((point) => point.pk)) : null,
    pkEnd: points.length ? Math.max(...points.map((point) => point.pk)) : null,
    province: provinces.join(", "),
    municipalities: municipalities.join(", "),
    lat: Number.isFinite(from.lat) ? from.lat : to.lat,
    lng: Number.isFinite(from.lng) ? from.lng : to.lng
  };
}

function normalizeDgtRecord(record, situationId) {
  const location = dgtLocation(record);
  const cause = humanizeDgtValue(firstText(record.cause?.detailedCauseType?.roadMaintenanceType, record.cause?.causeType));
  const type = humanizeDgtValue(firstText(record.roadOrCarriagewayOrLaneManagementType, record.$?.type));
  const comment = firstText(record.generalPublicComment?.comment?.values?.value);
  const validity = record.validity?.validityTimeSpecification || {};
  const direction = location.direction ? `Sentido: ${humanizeDgtValue(location.direction)}.` : "";
  const where = [location.municipalities, location.province].filter(Boolean).join(" · ");
  const detail = [where, direction, comment].filter(Boolean).join(" ");
  return {
    id: `dgt-${situationId || "s"}-${record.$?.id || "record"}`,
    source: "DGT DATEX2 v3.7",
    province: location.province,
    road: location.road,
    pk: location.pk,
    pkStart: location.pkStart,
    pkEnd: location.pkEnd,
    title: [type || "Incidencia DGT", cause].filter(Boolean).join(" · "),
    description: detail,
    severity: dgtSeverity(record),
    updatedAt: firstText(record.situationRecordVersionTime, validity.overallStartTime),
    location: where,
    url: "https://nap.dgt.es/dataset/incidencias-dgt-datex2-v37",
    lat: location.lat,
    lng: location.lng
  };
}

function provinceAllowed(province, allowedProvinces) {
  const values = province.split(",").map(normalizeKey).filter(Boolean);
  const allowed = new Set(allowedProvinces.map(normalizeKey));
  return values.some((value) => allowed.has(value));
}

async function optionalSource(name, promise) {
  try {
    return { name, incidents: await promise, error: "" };
  } catch (error) {
    return { name, incidents: [], error: error.message || String(error) };
  }
}

async function fetchDgtDatexIncidents({ dgtDatexUrl, data, provinces }) {
  if (!dgtDatexUrl) return [];
  const roadIds = loadPuntokRoadIds(data);
  const xml = await fetchText(dgtDatexUrl);
  const payload = await parseXml(xml);
  const situations = asArray(payload.payload?.situation);
  const incidents = [];
  for (const situation of situations) {
    for (const record of asArray(situation.situationRecord)) {
      const incident = normalizeDgtRecord(record, situation.$?.id);
      if (!incident.road) continue;
      if (roadIds && !roadIds.has(normalizeKey(incident.road))) continue;
      if (!provinceAllowed(incident.province, provinces)) continue;
      incidents.push(incident);
    }
  }
  return incidents;
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

function dedupeIncidents(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.source, item.road, item.pk, item.title, item.severity].map(normalizeKey).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const results = await Promise.all([
    optionalSource("Junta de Castilla y Leon", fetchJcylIncidents(args)),
    optionalSource("DGT JSON", fetchOptionalDgtIncidents()),
    optionalSource("DGT DATEX2 v3.7", fetchDgtDatexIncidents(args))
  ]);
  const sourceErrors = results.filter((result) => result.error).map((result) => `${result.name}: ${result.error}`);
  for (const error of sourceErrors) console.warn(`Warning: ${error}`);
  const [jcylIncidents, dgtJsonIncidents, dgtDatexIncidents] = results.map((result) => result.incidents);
  const dgtIncidents = [...dgtDatexIncidents, ...dgtJsonIncidents];
  const incidents = dedupeIncidents([...dgtIncidents, ...jcylIncidents]).sort(sortIncidents).slice(0, args.limit);
  const payload = {
    version: `github-actions-${new Date().toISOString().slice(0, 10)}`,
    updatedAt: new Date().toISOString(),
    source: dgtIncidents.length
      ? "DGT + Junta de Castilla y Leon"
      : "Junta de Castilla y Leon - Datos Abiertos",
    warnings: sourceErrors,
    sources: [
      {
        name: "Junta de Castilla y Leon - Incidencias de carreteras",
        url: "https://analisis.datosabiertos.jcyl.es/explore/dataset/incidencias-en-la-red-de-carreteras-titularidad-de-la-junta-de-castilla-y-leon/"
      },
      ...(dgtIncidents.length
        ? [{ name: "DGT DATEX2 v3.7", url: args.dgtDatexUrl || process.env.DGT_INCIDENTS_JSON_URL }]
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
