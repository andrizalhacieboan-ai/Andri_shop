import axios from "axios";

const api = () => {
  const domain = process.env.PTERO_DOMAIN;
  const apikey = process.env.PTERO_API_KEY;
  if (!domain || !apikey) throw new Error("Konfigurasi PTERO_DOMAIN / PTERO_API_KEY belum diisi");
  return { domain, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apikey}` } };
};

const RESOURCE_MAP = {
  "1gb": { ram: 1000, disk: 1000, cpu: 40 },   "2gb": { ram: 2000, disk: 1000, cpu: 60 },
  "3gb": { ram: 3000, disk: 2000, cpu: 80 },   "4gb": { ram: 4000, disk: 2000, cpu: 100 },
  "5gb": { ram: 5000, disk: 3000, cpu: 120 },  "6gb": { ram: 6000, disk: 3000, cpu: 140 },
  "7gb": { ram: 7000, disk: 4000, cpu: 160 },  "8gb": { ram: 8000, disk: 4000, cpu: 180 },
  "9gb": { ram: 9000, disk: 5000, cpu: 200 },  "10gb": { ram: 10000, disk: 5000, cpu: 220 },
  unlimited: { ram: 0, disk: 0, cpu: 0 }, 
};

// Sanitasi username (Pterodactyl hanya menerima a-z 0-9 _ . -)
export function sanitizeUsername(raw) {
  return String(raw || "").toLowerCase().trim()
    .replace(/[^a-z0-9_.-]/g, "")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 20);
}

// Auto-retry dengan suffix acak jika username/email sudah dipakai
async function createUser(username, password, opts = {}) {
  const { domain, headers } = api();
  const emailDomain = process.env.PANEL_EMAIL_DOMAIN || "andristore.com";
  let uname = username;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(`${domain}/api/application/users`, {
        email: `${uname}@${emailDomain}`,
        username: uname,
        first_name: uname,
        last_name: opts.lastName || "Server",
        root_admin: !!opts.rootAdmin,
        language: "en",
        password,
      }, { headers, timeout: 15000 });
      return res.data.attributes;
    } catch (err) {
      const detail = err.response?.data?.errors?.map(e => e.detail).join(". ") || "";
      const duplicate = /already|taken|exists|unique|duplicate/i.test(detail + " " + err.message);
      if (duplicate && attempt < 2) {
        uname = `${username}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 20);
        continue;
      }
      throw err;
    }
  }
}

export async function createPanel(username, ramKey, customPassword) {
  const { domain, headers } = api();
  const nestid = parseInt(process.env.PTERO_NEST_ID);
  const egg = parseInt(process.env.PTERO_EGG_ID);
  const loc = parseInt(process.env.PTERO_LOCATION_ID);
  const limits = RESOURCE_MAP[ramKey] || RESOURCE_MAP.unlimited;
  const uname = sanitizeUsername(username);

  if (uname.length < 3) return { success: false, message: "Username tidak valid (min. 3 karakter, hanya huruf kecil & angka)" };

  try {
    const user = await createUser(uname, customPassword);

    const eggRes = await axios.get(
      `${domain}/api/application/nests/${nestid}/eggs/${egg}?include=variables`,
      { headers, timeout: 15000 }
    );
    const eggData = eggRes.data.attributes;
    const environment = {};
    (eggData.relationships?.variables?.data || []).forEach(v => {
      environment[v.attributes.env_variable] = v.attributes.server_value || v.attributes.default_value;
    });

    const serverRes = await axios.post(`${domain}/api/application/servers`, {
      name: `${uname}-server`,
      description: "Created by Andri Store",
      user: user.id,
      egg,
      docker_image: eggData.docker_image,
      startup: eggData.startup,
      environment,
      limits: { memory: limits.ram, swap: 0, disk: limits.disk, io: 500, cpu: limits.cpu },
      feature_limits: { databases: 5, backups: 5, allocations: 5 },
      deploy: { locations: [loc], dedicated_ip: false, port_range: [] },
    }, { headers, timeout: 30000 });

    const server = serverRes.data.attributes;
    return {
      success: true,
      data: {
        username: user.username,
        password: customPassword,
        serverId: server.id,
        identifier: server.identifier,
        serverName: server.name,
        panelUrl: domain,
      },
    };
  } catch (err) {
    const pteroError = err.response?.data?.errors;
    const errorMsg = pteroError ? pteroError.map(e => e.detail || e.code).join(". ") : err.message;
    console.error("PTERO ERROR:", JSON.stringify(pteroError || err.message));
    return { success: false, message: errorMsg };
  }
}

export async function createAdmin(username, customPassword) {
  const uname = sanitizeUsername(username);
  if (uname.length < 3) return { success: false, message: "Username tidak valid" };
  try {
    const user = await createUser(uname, customPassword, { rootAdmin: true, lastName: "Admin" });
    return { success: true, data: { username: user.username, password: customPassword, serverId: "N/A (Admin)", serverName: "Admin Privileges", panelUrl: process.env.PTERO_DOMAIN } };
  } catch (err) {
    const pteroError = err.response?.data?.errors;
    return { success: false, message: pteroError ? pteroError.map(e => e.detail).join(". ") : err.message };
  }
}

// Opsional: nyalakan server pakai CLIENT API key (ptlc_)
export async function powerOnServer(identifier) {
  const capikey = process.env.PTERO_CLIENT_API_KEY;
  const domain = process.env.PTERO_DOMAIN;
  if (!capikey) return;
  try {
    await axios.post(`${domain}/api/client/servers/${identifier}/power`, { signal: "start" },
      { headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${capikey}` }, timeout: 10000 });
  } catch { /* server mungkin masih installing — abaikan */ }
}
