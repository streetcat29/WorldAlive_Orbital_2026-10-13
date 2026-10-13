/* AI-authored offline editorial, deterministic local facts. No live model. */
(function (root) {
  'use strict';
  const editorial = typeof module !== 'undefined' && module.exports ? require('./editorial.js') : root.WorldStoryEditorial;
  const valid = v => typeof v === 'number' && Number.isFinite(v);
  const number = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });
  const escape = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WB = 'World Bank Indicators · born.json · CC BY 4.0';
  function at(years, series, year) {
    const index = years.indexOf(year);
    return index >= 0 && series && valid(series[index]) ? series[index] : null;
  }
  function last(years, series, ceiling) {
    for (let i = years.length - 1; i >= 0; i--) if (years[i] <= ceiling && valid(series && series[i])) return { year: years[i], value: series[i] };
    return { year: null, value: null };
  }
  function commonYear(years, a, b, ceiling) {
    for (let i = years.length - 1; i >= 0; i--) if (years[i] <= ceiling && valid(a && a[i]) && valid(b && b[i])) return years[i];
    return null;
  }
  function format(value, unit) {
    if (!valid(value)) return 'Not available';
    return unit === 'people' ? number.format(value) : decimal.format(value) + (unit === '%' ? '%' : ' years');
  }
  function validateProfile(p, data, currentYear) {
    if (!Number.isInteger(p.year) || p.year < 1960 || p.year > currentYear) throw new Error('Enter a whole birth year from 1960 to ' + currentYear + '.');
    if (!Object.prototype.hasOwnProperty.call(data.world.countries, p.birth)) throw new Error('Choose a birth country.');
    if (p.current && !Object.prototype.hasOwnProperty.call(data.world.countries, p.current)) throw new Error('Choose a valid current country or leave it blank.');
    if (!['population', 'longevity', 'connection'].includes(p.interest)) throw new Error('Choose one of the available story lenses.');
  }
  function buildStory(data, profile, currentYear) {
    if (!editorial) throw new Error('The local AI-assisted editorial pack is unavailable. Reload the local files; no live AI or substitute narration is used.');
    validateProfile(profile, data, currentYear);
    const { born, world, timeline } = data, p = profile;
    const names = iso => iso === 'WLD' ? 'World' : (world.countries[iso]?.common || world.countries[iso]?.name || iso);
    const country = born.countries[p.birth] || {}, here = born.countries[p.current] || {};
    const facts = [];
    function fact(id, metric, label, unit, points, options = {}) {
      const complete = points.length > 0 && points.every(q => valid(q.value));
      const comparable = complete && points.length === 2;
      const delta = comparable ? points[1].value - points[0].value : null;
      const pct = comparable && points[0].value !== 0 ? delta / points[0].value * 100 : null;
      const preferred = (p.interest === 'longevity' && metric === 'le') || (p.interest === 'population' && metric === 'pop') || (p.interest === 'connection' && options.comparison);
      const magnitude = comparable ? Math.min(50, metric === 'le' ? Math.abs(delta) * 2 : Math.abs(pct || 0)) : 0;
      const f = { id, metric, label, unit, points, source: options.source || WB, kind: options.kind || 'historical indicator', complete, delta, percentChange: pct, significance: Math.round((complete ? 20 : 0) + (preferred ? 20 : 0) + magnitude), missing: complete ? null : 'An exact-year value is absent in the local dataset. No substitute year or estimate was used.', ...options };
      f.display = points.map(q => ({ label: q.label, year: q.year, value: format(q.value, unit) }));
      f.changeText = comparable ? (delta > 0 ? '+' : delta < 0 ? '−' : '') + (metric === 'le' ? decimal.format(Math.abs(delta)) + ' years' : decimal.format(Math.abs(pct || 0)) + '%') : null;
      facts.push(f); return f;
    }
    const point = (label, year, value) => ({ label, year, value });
    const birthWorld = fact('world.pop.birth.' + p.year, 'pop', 'The world you arrived in', 'people', [point('World population', p.year, at(born.years, born.world.pop, p.year))]);
    const worldLatest = last(born.years, born.world.pop, currentYear);
    const worldChange = fact('world.pop.change.' + p.year, 'pop', 'A changing global population', 'people', [point('Birth year', p.year, birthWorld.points[0].value), point('Latest available', worldLatest.year, worldLatest.value)]);
    const countryFacts = ['pop', 'le'].map(metric => {
      const latest = last(born.years, country[metric], currentYear);
      return fact(p.birth + '.' + metric + '.change.' + p.year, metric, metric === 'pop' ? 'Population across your years' : 'Life expectancy at birth', metric === 'pop' ? 'people' : 'years', [point(names(p.birth) + ' · birth year', p.year, at(born.years, country[metric], p.year)), point(names(p.birth) + ' · latest', latest.year, latest.value)]);
    });
    const milestoneMetric = p.interest === 'longevity' ? 'le' : 'pop';
    const milestoneUnit = milestoneMetric === 'le' ? 'years' : 'people';
    const milestones = [10, 18].filter(age => p.year + age < currentYear).map(age => fact('milestone.' + age + '.' + p.birth + '.' + p.year, milestoneMetric, 'The year you turned ' + age, milestoneUnit, [point(names(p.birth), p.year + age, at(born.years, country[milestoneMetric], p.year + age))], { age, calendarYear: p.year + age }));
    const now = last(born.years, country[milestoneMetric], currentYear);
    milestones.push(fact('milestone.now.' + p.birth, milestoneMetric, 'Now · latest available snapshot', milestoneUnit, [point(names(p.birth), now.year, now.value)], { calendarYear: currentYear, approximateAge: currentYear - p.year }));
    const other = p.current || 'WLD', otherSeries = p.current ? here : born.world;
    const comparisons = ['pop', 'le'].map(metric => {
      const year = commonYear(born.years, country[metric], otherSeries[metric], currentYear);
      return fact('compare.' + p.birth + '.' + other + '.' + metric, metric, metric === 'pop' ? 'Population · same-year comparison' : 'Life expectancy · same-year comparison', metric === 'pop' ? 'people' : 'years', [point(names(p.birth), year, at(born.years, country[metric], year)), point(names(other), year, at(born.years, otherSeries[metric], year))], { comparison: true });
    });
    const futureYear = currentYear < 2050 ? 2050 : Math.ceil((currentYear + 1) / 10) * 10;
    const future = timeline && Number.isInteger(timeline.proj_from) && futureYear >= timeline.proj_from ? at(timeline.years, timeline.countries?.[p.birth], futureYear) : null;
    let finalFacts, futureAvailable = valid(future);
    if (futureAvailable) {
      // Both endpoints remain in the UN series: never splice WB estimates into a UN scenario.
      const baseYear = Math.max(currentYear, timeline.proj_from);
      finalFacts = [fact('scenario.' + p.birth + '.' + futureYear, 'pop', 'One possible demographic future', 'people', [point('UN medium scenario · baseline', baseYear, at(timeline.years, timeline.countries[p.birth], baseYear)), point('UN medium scenario · horizon', futureYear, future)], { kind: 'projection scenario, not an observation', source: (timeline.sources?.['2024-2100'] || 'UN WPP medium projection') + ' · timeline.json', scenario: 'medium', projectionFrom: timeline.proj_from })];
    } else {
      const urban = world.countries[p.birth];
      const urbanValid = valid(urban.urbanPct) && Number.isInteger(urban.urbanPctYear) && urban.urbanPctYear <= currentYear;
      finalFacts = [fact('context.' + p.birth + '.urban', 'urban', 'Another perspective on home', '%', [point('Share living in urban areas', urbanValid ? urban.urbanPctYear : null, urbanValid ? urban.urbanPct : null)], { source: 'World Bank · world.json' }), worldChange];
    }
    // A chosen metric leads even when absent; unrelated magnitude cannot override interest.
    const preferredMetric = p.interest === 'longevity' ? 'le' : 'pop';
    const curate = fs => fs.slice().sort((a, b) => Number(b.metric === preferredMetric) - Number(a.metric === preferredMetric) || b.significance - a.significance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const scenes = [
      { kicker: '01 / THE OPENING FRAME', facts: [birthWorld, worldChange], type: 'opening' },
      { kicker: '02 / A PLACE TRANSFORMED', facts: curate(countryFacts), type: 'country' },
      { kicker: '03 / YOUR TIMELINE', facts: milestones, type: 'milestones' },
      { kicker: '04 / CONNECTED PLACES', facts: curate(comparisons), type: 'comparison' },
      { kicker: '05 / THE HORIZON', facts: finalFacts, type: futureAvailable ? 'projection' : 'context' }
    ];
    for (const scene of scenes) {
      const lead = scene.type === 'milestones' ? (scene.facts.find(f => f.complete && f.age) || scene.facts.find(f => f.complete) || scene.facts[0]) : scene.facts[0];
      Object.assign(scene, editorial.narrate(scene.type, lead, p, names(p.birth), editorialBindings(lead)));
    }
    return { version: 2, label: 'AI-assisted storytelling \u00b7 private local calculations', liveAI: false, editorialProvenance: editorial.provenance, asOfCalendarYear: currentYear, profile: { ...profile }, countryName: names(p.birth), facts, scenes, curation: { rule: 'Selected metric leads country and comparison (longevity: life expectancy; otherwise population), even if missing. Longevity also changes timeline observations. Within metric: completeness/relevance/magnitude significance, stable ID tie-break. Editorial predicate from unrounded facts; stable variant by pack, fact ID and interest.', selectedIds: scenes.map(s => s.facts.map(f => f.id)) } };
  }
  function editorialBindings(f) {
    const first = f.points[0], second = f.points[1];
    // Do not round a tiny nonzero difference to zero in directional prose.
    const exact = new Intl.NumberFormat('en', { maximumSignificantDigits: 15 });
    return { metric: f.metric === 'le' ? 'life expectancy at birth' : f.metric === 'urban' ? 'urban share' : 'population',
      value: f.display[0]?.value, year: first?.year, age: f.age,
      firstValue: f.display[0]?.value, firstYear: first?.year,
      lastValue: f.display[1]?.value, lastYear: second?.year, other: second?.label,
      absoluteChange: valid(f.delta) ? exact.format(Math.abs(f.delta)) + (f.unit === 'years' ? ' years' : ' people') : null };
  }

  const API = { buildStory, at, last, commonYear, validateProfile, format, editorialBindings, escape, sceneHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;
  root.WorldStory = API;
  const $ = id => document.getElementById(id);
  const KEYS = { profile: 'worldalive.story.profile.v1', counts: 'worldalive.story.counts.v1' };
  let data, story, sceneIndex = 0, timer = null, mapObject = null;
  const currentYear = new Date().getFullYear();
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
  $('birth-year').max = currentYear;
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { $('status').textContent = 'Browser storage is unavailable. Your story still works without remembering.'; return false; } }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) { $('status').textContent = 'Browser storage could not be cleared; use browser site settings to clear it.'; } }
  function count(event) {
    if (!$('analytics').checked) return;
    const allowed = ['build', 'scene', 'play', 'svg', 'png', 'print', 'share', 'facts'];
    if (!allowed.includes(event)) return;
    const saved = read(KEYS.counts), counts = {};
    for (const key of allowed) if (Number.isSafeInteger(saved?.[key]) && saved[key] >= 0) counts[key] = saved[key];
    counts[event] = Math.min((counts[event] || 0) + 1, 1000000000); store(KEYS.counts, counts);
  }
  function selectedProfile() { return { year: Number($('birth-year').value), birth: $('birth-country').value, current: $('current-country').value, interest: $('interest').value }; }
  function persist() {
    if (!$('remember').checked) { remove(KEYS.profile); return; }
    const p = selectedProfile();
    try { validateProfile(p, data, currentYear); store(KEYS.profile, p); } catch (_) { remove(KEYS.profile); }
  }
  function chart(f) {
    const pts = f.points.filter(p => valid(p.value));
    if (!pts.length) return '';
    const max = Math.max(...pts.map(p => p.value), 1);
    const height = pts.length * 72 + 26;
    return '<svg class="bar-chart" viewBox="0 0 540 ' + height + '" role="img" aria-label="' + escape(f.label + '. ' + f.display.map(p => p.label + ', ' + (p.year || 'no year') + ': ' + p.value).join('; ')) + '"><title>' + escape(f.label) + '</title>' + pts.map((p, i) => '<text x="0" y="' + (i * 72 + 18) + '">' + escape((p.year || 'No year') + ' · ' + compact.format(p.value) + (f.unit === 'years' ? ' years' : f.unit === '%' ? '%' : ' people')) + '</text><rect class="bar-track" x="0" y="' + (i * 72 + 30) + '" width="540" height="20" rx="5"/><rect class="bar-fill bar-' + i + '" x="0" y="' + (i * 72 + 30) + '" width="' + (p.value / max * 540).toFixed(2) + '" height="20" rx="5"/>').join('') + '<text class="axis-label" x="0" y="' + (height - 2) + '">Scale starts at zero · ' + escape(f.unit) + '</text></svg>';
  }
  function factHTML(f) {
    return '<section class="fact" data-fact-id="' + escape(f.id) + '"><div class="fact-heading"><h3>' + escape(f.label) + '</h3>' + (f.scenario ? '<span class="scenario-tag">UN medium scenario</span>' : '') + '</div><dl class="metrics">' + f.display.map(p => '<div><dt>' + escape(p.label) + ' <span class="year">' + (p.year === null ? 'No common / available year' : escape(p.year)) + '</span></dt><dd class="' + (p.value === 'Not available' ? 'missing' : '') + '">' + escape(p.value) + '</dd></div>').join('') + '</dl>' + (f.changeText ? '<p class="delta">' + escape(f.changeText) + '<span>' + (f.comparison ? ' second place relative to first' : f.scenario ? ' within the medium scenario' : ' between the reference years') + '</span></p>' : '') + (!f.complete ? '<p class="data-gap">' + escape(f.missing) + '</p>' : '') + chart(f) + '<p class="source">' + escape(f.source) + ' · ' + escape(f.kind) + '</p></section>';
  }
  function sceneHTML(s) {
    return '<p class="eyebrow">' + escape(s.kicker) + '</p><h2 id="scene-title">' + escape(s.title) + '</h2><p class="narrative">' + escape(s.text) + '</p><div class="scene-facts ' + (s.type === 'milestones' ? 'timeline' : '') + '">' + s.facts.map(factHTML).join('') + '</div>';
  }
  function pause() { if (timer) clearInterval(timer); timer = null; $('play').textContent = 'Play story'; $('play').setAttribute('aria-pressed', 'false'); }
  function render(index, focus = false) {
    sceneIndex = Math.max(0, Math.min(4, index));
    $('scene').innerHTML = sceneHTML(story.scenes[sceneIndex]);
    $('position').textContent = 'Scene ' + (sceneIndex + 1) + ' of 5';
    $('back').disabled = sceneIndex === 0; $('next').disabled = sceneIndex === 4;
    [...$('scene-nav').children].forEach((button, i) => { button.setAttribute('aria-current', i === sceneIndex ? 'step' : 'false'); });
    if (sceneIndex === 4) pause();
    if (focus) $('scene').focus({ preventScroll: true });
    count('scene');
  }
  function go(index) { if (!story) return; pause(); render(index, true); }
  function play() {
    if (!story) return;
    if (timer) { pause(); return; }
    if (sceneIndex === 4) render(0);
    $('play').textContent = 'Pause story'; $('play').setAttribute('aria-pressed', 'true');
    count('play'); timer = setInterval(() => { if (sceneIndex < 4) render(sceneIndex + 1); else pause(); }, 12000);
  }
  function mapSetup() {
    const d3 = root.d3, topo = root.topojson;
    if (!d3?.geoNaturalEarth1 || !topo || !data.geometry) { $('map').textContent = 'The local geographic map is unavailable. Country facts and story remain available.'; return; }
    const feature = topo.feature(data.geometry, data.geometry.objects.countries);
    const projection = d3.geoNaturalEarth1().fitExtent([[12, 12], [688, 388]], { type: 'Sphere' });
    const path = d3.geoPath(projection);
    $('map').replaceChildren();
    const svg = d3.select($('map')).append('svg').attr('viewBox', '0 0 700 400').attr('role', 'group').attr('aria-label', 'Interactive world map. Use country selector and zoom buttons for keyboard access.');
    svg.append('title').text('World map with selected country-capital markers');
    svg.append('path').datum({ type: 'Sphere' }).attr('d', path).attr('class', 'ocean');
    const group = svg.append('g');
    group.append('path').datum(d3.geoGraticule10()).attr('d', path).attr('class', 'graticule');
    group.selectAll('.land').data(feature.features).join('path').attr('class', 'land').attr('d', path).on('click', (_, f) => { $('map-detail').textContent = f.properties.name + ' · geographic outline from the local World Atlas.'; }).append('title').text(f => f.properties.name);
    const zoom = d3.zoom().scaleExtent([1, 5]).extent([[0, 0], [700, 400]]).translateExtent([[0, 0], [700, 400]]).filter(event => !event.ctrlKey && event.type !== 'wheel' && !event.button).on('zoom', event => group.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    mapObject = { svg, group, projection, zoom };
    $('map-in').onclick = () => svg.call(zoom.scaleBy, 1.5);
    $('map-out').onclick = () => svg.call(zoom.scaleBy, 1 / 1.5);
    $('map-reset').onclick = () => svg.call(zoom.transform, d3.zoomIdentity);
    $('map-country').onchange = () => mapFocus($('map-country').value);
  }
  function mapFocus(iso) {
    const c = data.world.countries[iso];
    if (!c) return;
    $('map-detail').textContent = (c.common || c.name) + (c.capital ? ' · capital marker: ' + c.capital : '') + '. Geographic context only; not a personal location.';
    if (!mapObject || !valid(c.lon) || !valid(c.lat)) { $('map-detail').textContent += ' No mapped coordinate is available.'; return; }
    const m = mapObject, [x, y] = m.projection([c.lon, c.lat]);
    m.group.selectAll('.explore-marker').remove();
    m.group.append('circle').attr('class', 'explore-marker').attr('cx', x).attr('cy', y).attr('r', 5).append('title').text(c.common || c.name);
    const k = 2.2, tx = Math.min(0, Math.max(700 * (1 - k), 350 - k * x)), ty = Math.min(0, Math.max(400 * (1 - k), 200 - k * y));
    m.svg.call(m.zoom.transform, root.d3.zoomIdentity.translate(tx, ty).scale(k));
  }
  function mapProfile() {
    if (!mapObject) return;
    const m = mapObject;
    m.group.selectAll('.profile-marker,.explore-marker').remove();
    m.svg.call(m.zoom.transform, root.d3.zoomIdentity);
    [story.profile.birth, story.profile.current].filter(Boolean).forEach((iso, i) => {
      const c = data.world.countries[iso]; if (!valid(c.lon) || !valid(c.lat)) return;
      const [x, y] = m.projection([c.lon, c.lat]);
      m.group.append('circle').attr('class', 'profile-marker marker-' + i).attr('cx', x).attr('cy', y).attr('r', i ? 5 : 8).attr('tabindex', 0).attr('role', 'button').attr('aria-label', (i ? 'Current country: ' : 'Birth country: ') + (c.common || c.name)).on('click', () => mapFocus(iso)).on('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); mapFocus(iso); } }).append('title').text((i ? 'Current: ' : 'Birth: ') + (c.common || c.name));
    });
    $('map-country').value = story.profile.birth;
    $('map-detail').textContent = 'Coral ring: birthplace. Teal dot: current country, if selected. Select a marker or explore any country below.';
  }
  function start(event) {
    if (event) event.preventDefault();
    try {
      story = buildStory(data, selectedProfile(), currentYear); pause(); persist(); count('build');
      $('experience').hidden = false; $('setup').hidden = true;
      $('profile-line').textContent = story.profile.year + ' · ' + story.countryName + ' · ' + $('interest').selectedOptions[0].textContent;
      $('scene-nav').innerHTML = ['Birth', 'Country', 'Milestones', 'Connections', 'Horizon'].map((label, i) => '<button type="button" data-scene="' + i + '"><span>0' + (i + 1) + '</span>' + label + '</button>').join('');
      $('scene-nav').querySelectorAll('button').forEach((button, i) => button.onclick = () => go(i));
      $('fact-ledger').textContent = JSON.stringify(story.facts, null, 2);
      $('data-vintage').textContent = 'Local file generation: born.json ' + (data.born.generated || 'not recorded') + '; world.json ' + (data.world.generated || 'not recorded') + '. Generation dates are not observation years.';
      $('share-box').hidden = true; $('share-link').value = ''; $('export-status').textContent = '';
      $('print-story').innerHTML = '<h1>Your World Story</h1><p>AI-assisted storytelling · private local calculations · ' + escape(story.countryName) + '</p><p>Birth year is omitted from this heading; the historical reference years in the scenes can reveal it. Print only if you are comfortable including these details.</p>' + story.scenes.map(s => '<article>' + sceneHTML(s).replace('id="scene-title"', '') + '</article>').join('') + '<p>Sources: World Bank Indicators (CC BY 4.0), world.json; UN WPP 2024 medium scenario via Our World in Data, timeline.json. Country-level context is not a prediction of individual lifespan.</p>';
      mapProfile(); render(0, true);
      $('experience').scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch (error) { $('status').textContent = error.message; }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function cardSVG() {
    // Latest-country snapshot only: no profile birth year, milestone age, current country or DOB.
    const f = story.facts.find(f => f.id === story.profile.birth + '.pop.change.' + story.profile.year), p = f.points[1];
    const name = story.countryName;
    const words = name.split(' '), lines = [''];
    for (const word of words) { if ((lines[lines.length - 1] + ' ' + word).trim().length > 29 && lines[lines.length - 1]) lines.push(word); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + word).trim(); }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#101e2b"/><circle cx="1060" cy="165" r="220" fill="none" stroke="#315761" stroke-width="2"/><circle cx="1060" cy="165" r="150" fill="none" stroke="#315761" stroke-width="2"/><text x="76" y="92" fill="#79d8ca" font-size="22" font-family="sans-serif" letter-spacing="4">WORLDALIVE / YOUR WORLD STORY</text><text x="76" y="200" fill="#f5eedf" font-size="58" font-family="Georgia,serif">A place in a changing world.</text>' + lines.slice(0, 3).map((line, i) => '<text x="76" y="' + (280 + i * 55) + '" fill="#f5eedf" font-size="46" font-family="sans-serif">' + escape(line) + '</text>').join('') + '<text x="76" y="495" fill="#f8ac8f" font-size="76" font-family="sans-serif">' + escape(format(p.value, 'people')) + '</text><text x="76" y="546" fill="#c4d0d6" font-size="24" font-family="sans-serif">Population · ' + escape(p.year === null ? 'reference year unavailable' : 'reference year ' + p.year) + '</text><text x="76" y="643" fill="#c4d0d6" font-size="22" font-family="sans-serif">World Bank Indicators · born.json · CC BY 4.0</text><text x="76" y="689" fill="#79d8ca" font-size="20" font-family="sans-serif">AI-assisted story. Prewritten narration, not live AI. Private local facts.</text></svg>';
  }
  $('story-form').addEventListener('submit', start);
  $('back').onclick = () => go(sceneIndex - 1); $('next').onclick = () => go(sceneIndex + 1); $('play').onclick = play;
  $('edit').onclick = () => { pause(); $('setup').hidden = false; $('birth-year').focus(); };
  $('remember').onchange = persist;
  $('story-form').addEventListener('change', event => { if (!['analytics', 'remember'].includes(event.target.id) && data) persist(); });
  $('analytics').onchange = () => { if ($('analytics').checked) store(KEYS.counts, {}); else remove(KEYS.counts); };
  $('reset').onclick = () => {
    pause(); remove(KEYS.profile); remove(KEYS.counts); story = null;
    HTMLFormElement.prototype.reset.call($('story-form')); $('birth-year').value = ''; $('birth-country').value = ''; $('current-country').value = '';
    $('experience').hidden = true; $('setup').hidden = false; $('scene').replaceChildren(); $('fact-ledger').textContent = ''; $('print-story').replaceChildren(); $('profile-line').textContent = ''; $('share-link').value = ''; $('share-box').hidden = true;
    if (mapObject) { mapObject.group.selectAll('.profile-marker,.explore-marker').remove(); mapObject.svg.call(mapObject.zoom.transform, root.d3.zoomIdentity); }
    if (location.hash.startsWith('#story?')) history.replaceState(null, '', location.pathname + location.search);
    $('status').textContent = 'Story choices and local analytics have been cleared from this page and browser storage.'; $('birth-year').focus();
  };
  $('svg-download').onclick = () => { if (!story) return; download(new Blob([cardSVG()], { type: 'image/svg+xml' }), 'worldalive-story.svg'); count('svg'); $('export-status').textContent = 'SVG card prepared — no birth year or exact birth date included.'; };
  $('png-download').onclick = async () => {
    if (!story) return;
    const button = $('png-download'); button.disabled = true;
    const url = URL.createObjectURL(new Blob([cardSVG()], { type: 'image/svg+xml' }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 760;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable'); ctx.drawImage(img, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('PNG unavailable');
      download(blob, 'worldalive-story.png'); count('png'); $('export-status').textContent = 'PNG card prepared — no birth year or exact birth date included.';
    } catch (_) { $('export-status').textContent = 'PNG export is unavailable in this browser. Use the SVG download or print instead.'; }
    finally { URL.revokeObjectURL(url); button.disabled = false; }
  };
  $('print').onclick = () => { if (!story) return; pause(); count('print'); root.print(); };
  $('facts-download').onclick = () => { if (!story) return; download(new Blob([JSON.stringify({ label: story.label, liveAI: false, editorialProvenance: story.editorialProvenance, narration: story.scenes.map(s => ({ type: s.type, title: s.title, text: s.text, ...s.editorial })), facts: story.facts, curation: story.curation }, null, 2)], { type: 'application/json' }), 'worldalive-facts.json'); count('facts'); $('export-status').textContent = 'Facts include your selected historical reference years and country. Share this JSON only if comfortable with those details.'; };
  $('share').onclick = () => {
    if (!story) return; pause();
    const url = new URL(location.pathname, location.origin); url.hash = 'story?' + new URLSearchParams({ year: story.profile.year, country: story.profile.birth }).toString();
    $('share-link').value = url.href; $('share-box').hidden = false; $('share-link').focus(); $('share-link').select(); count('share');
    $('export-status').textContent = 'Link created locally. Only birth year and birth country are included. Nothing has been posted or copied automatically.';
  };
  document.addEventListener('keydown', event => {
    if (!story || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,select,textarea,button,a,summary,[contenteditable="true"],[role="button"]')) return;
    if (event.key === 'ArrowRight') go(sceneIndex + 1); else if (event.key === 'ArrowLeft') go(sceneIndex - 1); else if (event.key === 'Home') go(0); else if (event.key === 'End') go(4); else if (event.key === ' ') play(); else return;
    event.preventDefault();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  root.addEventListener('beforeprint', pause); reduced.addEventListener('change', pause);
  async function jsonFile(path) { const response = await fetch(path, { credentials: 'same-origin' }); if (!response.ok) throw new Error(path + ' (' + response.status + ')'); return response.json(); }
  async function init() {
    try {
      if (!editorial) throw new Error('Local AI-assisted editorial pack unavailable (editorial.js)');
      const [born, world, timeline, geometry] = await Promise.all([jsonFile('../data/born.json'), jsonFile('../data/world.json'), jsonFile('../data/timeline.json').catch(() => null), jsonFile('../data/countries-110m.json').catch(() => null)]);
      if (!Array.isArray(born.years) || !born.world || !born.countries || !world.countries) throw new Error('Unexpected local data format');
      data = { born, world, timeline, geometry };
      const options = Object.entries(world.countries).sort((a, b) => (a[1].common || a[1].name).localeCompare(b[1].common || b[1].name)).map(([iso, c]) => '<option value="' + escape(iso) + '">' + escape(c.common || c.name) + '</option>').join('');
      $('birth-country').innerHTML = '<option value="">Choose a country</option>' + options; $('current-country').innerHTML = '<option value="">Not specified</option>' + options; $('map-country').innerHTML = options;
      const saved = read(KEYS.profile);
      if (saved) { try { validateProfile(saved, data, currentYear); $('birth-year').value = saved.year; $('birth-country').value = saved.birth; $('current-country').value = saved.current || ''; $('interest').value = saved.interest; $('remember').checked = true; } catch (_) { remove(KEYS.profile); } }
      $('analytics').checked = read(KEYS.counts) !== null;
      let imported = false;
      if (location.hash.startsWith('#story?')) {
        const params = new URLSearchParams(location.hash.slice(7)), shared = { year: Number(params.get('year')), birth: params.get('country'), current: '', interest: 'population' };
        try { if (!Number.isInteger(shared.year) || shared.year < 1960 || shared.year > currentYear) throw new Error('Invalid year'); if (shared.birth) validateProfile(shared, data, currentYear); $('birth-year').value = shared.year; $('birth-country').value = shared.birth || ''; $('current-country').value = ''; $('interest').value = 'population'; $('remember').checked = false; imported = true; } catch (_) { /* Invalid links never create a profile. */ }
      }
      $('build').disabled = false;
      $('status').textContent = imported ? 'Shared choices loaded. Select or review your birth country, then create your story. Nothing is saved automatically.' : 'Ready. Historical coverage: ' + born.years[0] + '–' + born.years[born.years.length - 1] + '. Newer or missing years are explicitly marked unavailable.';
      if (!timeline) $('status').textContent += ' Timeline file unavailable: the final scene will use factual context, not a projection.';
      mapSetup();
    } catch (error) { $('status').textContent = 'Could not load the local story data: ' + error.message + '. Serve the site through its local HTTP server (not file://), then reload. No substitute data has been generated.'; }
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
