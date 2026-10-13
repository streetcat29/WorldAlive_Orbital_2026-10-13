/* World Alive runtime: offline-generated, content-addressed data; no external services.
   Build via build_runtime_data.py. Source records, nulls and population math are unchanged. */
(function (root) {
  'use strict';
  const CONFIG = {"schema":1,"world":{"path":"/data/runtime/world.65aa95da6b558f00cc82bb5595f54e91676e10e18a4183468be109ead60fcd66.json","sha256":"65aa95da6b558f00cc82bb5595f54e91676e10e18a4183468be109ead60fcd66","bytes":267206},"top":{"path":"/data/runtime/top.890e23a87fcda5042e2aba8870edff305874541a4ddf19535e692add7c566ea1.json","sha256":"890e23a87fcda5042e2aba8870edff305874541a4ddf19535e692add7c566ea1","bytes":392034},"index":{"path":"/data/runtime/index.624bac8f2e4cdc4daa6dc822e895b71b1041e9822273fde9a3d33c35ff8c3e07.json","sha256":"624bac8f2e4cdc4daa6dc822e895b71b1041e9822273fde9a3d33c35ff8c3e07","bytes":43913}};
  const requests = new Map(), countryPromises = new Map();
  const bases = Object.create(null), topKeys = new Set(), readyCountries = new Set();
  let topPromise = null, indexPromise = null;
  const LIMIT = 16 * 1024 * 1024, TIMEOUT = 15000;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const number = n => typeof n === 'number' && Number.isFinite(n);
  const nullable = n => n === null || number(n);
  const key = (ct, c) => [c.iso3, ct.n, ct.la, ct.lo].join('|');
  function requireShape(ok, message) { if (!ok) throw new Error('Runtime data: ' + message); }
  function reference(ref) {
    requireShape(object(ref) && /^[a-f0-9]{64}$/.test(ref.sha256) && Number.isInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= LIMIT &&
      /^\/data\/runtime\/(?:countries\/[A-Z]{3}|world|top|index)\.[a-f0-9]{64}\.json$/.test(ref.path) && ref.path.endsWith('.' + ref.sha256 + '.json'), 'invalid asset reference');
    const url = new URL(ref.path, root.location.href);
    requireShape(url.origin === root.location.origin && /^https?:$/.test(url.protocol), 'same-origin HTTP required');
    return url.href;
  }
  function request(ref, validate) {
    let url;
    try { url = reference(ref); } catch (e) { return Promise.reject(e); }
    if (requests.has(url)) return requests.get(url);
    // Finite manifest, at most world/top/index + 249 country files. No time-based stale cache.
    if (requests.size >= 256) return Promise.reject(new Error('Runtime data: asset cache limit'));
    const promise = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const response = await root.fetch(url, {cache: 'default', credentials: 'same-origin', redirect: 'error', signal: controller.signal});
        requireShape(response.ok, 'HTTP ' + response.status + ' for ' + ref.path);
        requireShape(/application\/json/i.test(response.headers.get('content-type') || ''), 'JSON content-type required');
        const declared = Number(response.headers.get('content-length'));
        requireShape(!declared || declared <= LIMIT, 'response too large');
        const chunks = []; let length = 0;
        const reader = response.body.getReader();
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > ref.bytes || length > LIMIT) { await reader.cancel(); throw new Error('Runtime data: response exceeds expected length'); }
          chunks.push(chunk.value);
        }
        requireShape(length === ref.bytes, 'asset length mismatch');
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        requireShape(root.crypto && root.crypto.subtle, 'secure context required for content verification');
        const hash = Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        requireShape(hash === ref.sha256, 'asset digest mismatch; rebuild/reinstall instead of mixing versions');
        let data;
        try { data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
        catch (e) { throw new Error('Runtime data: invalid JSON for ' + ref.path + ': ' + e.message); }
        validate(data); return data;
      } finally { clearTimeout(timer); }
    })();
    requests.set(url, promise);
    promise.catch(() => { if (requests.get(url) === promise) requests.delete(url); });
    return promise;
  }
  function envelope(data) {
    requireShape(object(data) && data.schema === CONFIG.schema && data.world === CONFIG.world.sha256, 'schema/world version mismatch');
  }
  function citiesShape(cities) {
    requireShape(Array.isArray(cities) && cities.length <= 100000, 'invalid city list');
    for (const ct of cities) requireShape(object(ct) && typeof ct.n === 'string' && number(ct.la) && number(ct.lo) && nullable(ct.p) &&
      (ct.pg === undefined || nullable(ct.pg)) && (ct.dz === undefined || Array.isArray(ct.dz)), 'invalid city record');
  }
  function basesShape(values, iso) {
    requireShape(object(values), 'invalid population bases');
    for (const [k, v] of Object.entries(values)) requireShape(/^[A-Z]{3}\|/.test(k) && (!iso || k.startsWith(iso + '|')) &&
      Array.isArray(v) && v.length === 2 && nullable(v[0]) && nullable(v[1]), 'invalid population basis');
  }
  function merge(values) {
    for (const [k,v] of Object.entries(values)) requireShape(!own(bases,k) || (bases[k][0] === v[0] && bases[k][1] === v[1]), 'conflicting population basis');
    for (const [k,v] of Object.entries(values)) bases[k] = Object.freeze(v);
  }
  function loadWorld() {
    return request(CONFIG.world, data => {
      requireShape(object(data) && object(data.world) && object(data.countries) && object(data.num2iso3), 'invalid world data');
      for (const [iso,c] of Object.entries(data.countries)) requireShape(/^[A-Z]{3}$/.test(iso) && c.iso3 === iso && nullable(c.pop) && Number.isInteger(c.popYear), 'invalid country record');
    });
  }
  function loadTop() {
    if (topPromise) return topPromise;
    topPromise = request(CONFIG.top, data => {
      envelope(data); basesShape(data.bases);
      requireShape(object(data.cidx) && Object.keys(data.cidx).length <= 249, 'invalid city index');
      for (const [iso,item] of Object.entries(data.cidx)) {
        requireShape(/^[A-Z]{3}$/.test(iso) && object(item) && Number.isInteger(item.n) && item.n >= 0, 'invalid index record');
        citiesShape(item.top);
      }
    }).then(data => {
      merge(data.bases);
      for (const [iso,item] of Object.entries(data.cidx)) for (const ct of item.top) topKeys.add(key(ct,{iso3:iso}));
      return data.cidx;
    }).catch(e => { topPromise = null; throw e; });
    return topPromise;
  }
  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = request(CONFIG.index, data => {
      envelope(data);
      requireShape(data.top === CONFIG.top.sha256 && object(data.countries) && Object.keys(data.countries).length <= 249, 'index/top version mismatch');
      for (const [iso,ref] of Object.entries(data.countries)) {
        requireShape(/^[A-Z]{3}$/.test(iso), 'invalid country key'); reference(ref);
        requireShape(ref.path.startsWith('/data/runtime/countries/' + iso + '.'), 'country reference mismatch');
      }
    }).catch(e => { indexPromise = null; throw e; });
    return indexPromise;
  }
  function loadCountry(iso) {
    if (!/^[A-Z]{3}$/.test(iso)) return Promise.reject(new Error('Runtime data: invalid country ISO'));
    if (countryPromises.has(iso)) return countryPromises.get(iso);
    if (countryPromises.size >= 249) return Promise.reject(new Error('Runtime data: country cache limit'));
    const promise = loadIndex().then(index => {
      requireShape(own(index.countries,iso), 'no generated city shard for ' + iso);
      return request(index.countries[iso], data => { envelope(data); requireShape(data.iso === iso,'country shard mismatch'); citiesShape(data.cities); basesShape(data.bases,iso); });
    }).then(data => { merge(data.bases); readyCountries.add(iso); return data.cities; });
    countryPromises.set(iso,promise);
    promise.catch(() => { if (countryPromises.get(iso) === promise) countryPromises.delete(iso); });
    return promise;
  }
  // Pure math, shared by both clients. Missing source values remain null, not zero.
  function populationBasis(ct, c, u) {
    const admin = !!ct.pa, urban = !admin && ct.un === 1 && !!u;
    const p = admin ? ct.p : urban ? u[0] : (ct.pg === undefined ? ct.p : ct.pg);
    const kind = admin ? (ct.pk || 'administrative unit') : urban ? 'UN urban centre' : 'GeoNames settlement';
    const source = urban ? 'UN DESA, World Urbanization Prospects 2025' : admin ? 'GeoNames administrative-unit record' : 'GeoNames settlement record';
    const anchor = urban ? '2025-01-01' : `${c.popYear}-07-01`;
    const hasUN = urban && u[1] != null;
    const growth = hasUN ? u[1] : (c.growth || 0);
    const reference = urban ? '2025 annual estimate' : 'Population reference date not supplied in local record' +
      (admin && ct.pdt ? `; GeoNames record modified ${ct.pdt} (not the population date)` : '');
    const method = hasUN ? 'UN 2025–2026 annual growth' : `World Bank national growth (${c.growthYear == null ? c.popYear : c.growthYear}); not measured local growth`;
    return {p, kind, source, reference, anchor, growth, method, urban, cohort: kind};
  }
  function cityBasis(ct,c) {
    const k = key(ct,c);
    requireShape(readyCountries.has(c.iso3) || topKeys.has(k), 'city basis not ready for ' + c.iso3 + '; await loadTop/loadCountry');
    return populationBasis(ct,c,bases[k]);
  }
  root.WPDataRuntime = Object.freeze({loadWorld, loadTop, loadCountry, cityBasis, populationBasis,
    version: CONFIG.index && CONFIG.index.sha256,
    status: () => ({topReady:topKeys.size > 0, countries:[...readyCountries], requests:requests.size, basisEntries:Object.keys(bases).length})});
})(window);
