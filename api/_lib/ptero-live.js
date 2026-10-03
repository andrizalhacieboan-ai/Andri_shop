// Snapshot real-time dari panel Pterodactyl (Application API + Client API bila PTERO_CLIENT_API_KEY ada)
import axios from 'axios';

let cache = null, cacheAt = 0;
const hdr = k => ({ Accept: 'application/json', Authorization: `Bearer ${k}` });

export async function getPteroSnapshot() {
  if (cache && Date.now() - cacheAt < 8000) return cache;
  const domain = String(process.env.PTERO_DOMAIN || '').replace(/\/$/, ''), key = process.env.PTERO_API_KEY, ckey = process.env.PTERO_CLIENT_API_KEY;
  if (!domain || !key) return { ok: false, error: 'PTERO_DOMAIN / PTERO_API_KEY belum diisi' };
  const get = (path, k, params) => axios.get(domain + path, { headers: hdr(k), params, timeout: 8000 }).then(r => r.data);
  try {
    const [sv, nd, us] = await Promise.all([
      get('/api/application/servers', key, { per_page: 100 }),
      get('/api/application/nodes', key, { per_page: 100 }),
      get('/api/application/users', key, { per_page: 1 }),
    ]);
    const servers = (sv.data || []).map(s => s.attributes);
    const nodes = (nd.data || []).map(n => n.attributes);
    const suspended = servers.filter(s => s.suspended || s.status === 'suspended').length;
    const installing = servers.filter(s => s.status === 'installing' || s.status === 'install_failed').length;
    const total = sv.meta?.pagination?.total ?? servers.length;

    let online = 0, checked = 0, ramUsedMb = 0, cpuSum = 0, approx = !ckey;
    if (ckey) {
      const live = servers.filter(s => !s.suspended && s.status == null).slice(0, 60);
      const rs = await Promise.allSettled(live.map(s =>
        get(`/api/client/servers/${s.identifier}/resources`, ckey).then(d => d.attributes)));
      rs.forEach(r => {
        if (r.status !== 'fulfilled') return;
        checked++;
        if (r.value.current_state === 'running') {
          online++; ramUsedMb += (r.value.resources?.memory_bytes || 0) / 1048576; cpuSum += r.value.resources?.cpu_absolute || 0;
        }
      });
      if (checked < live.length) approx = true; // sebagian server tak terbaca oleh client key
      if (checked === 0) { online = live.length; approx = true; }
    } else {
      online = total - suspended - installing;
    }
    const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    const snap = {
      ok: true, approx, serversTotal: total, online, offline: Math.max(total - online, 0), suspended, installing,
      nodes: nodes.length, pteroUsers: us.meta?.pagination?.total ?? 0,
      nodeMemoryMb: sum(nodes, n => n.memory), nodeAllocMemMb: sum(nodes, n => n.allocated_resources?.memory),
      nodeDiskMb: sum(nodes, n => n.disk), nodeAllocDiskMb: sum(nodes, n => n.allocated_resources?.disk),
      ramUsedMb: Math.round(ramUsedMb), cpuAvg: online ? Math.round(cpuSum / online) : 0,
    };
    cache = snap; cacheAt = Date.now();
    return snap;
  } catch (e) {
    const msg = e.response ? `Pterodactyl HTTP ${e.response.status}` : e.message;
    return { ok: false, error: msg };
  }
}
