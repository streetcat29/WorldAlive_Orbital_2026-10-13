/* Offline editorial authored by the Orcha language model during implementation.
 * No model, fetch, telemetry or user-data training. Plain text: escape once at rendering.
 */
(function (root) {
  'use strict';
  const provenance = Object.freeze({
    pack: 'world-story-editorial-v1',
    authorship: 'Prewritten AI-assisted narration authored by the Orcha language model at build time.',
    selection: 'Deterministic on-device selection by verified fact predicates, selected interest and stable fact ID. No live generation.',
    privacy: 'No model is called on user data. Profile and numerical calculations stay on this device.',
    review: 'Templates constrained to fact bindings and covered by predicate, placeholder and escaping regression tests; no claim of independent human review.',
    liveAI: false
  });
  const rows = [
    ['opening', 'available', 'A planet-sized opening frame.', 'In {year}, the world population was {value}. Your starting point, {country}, belongs inside that wider picture: one place in a world far larger than any single life.'],
    ['opening', 'available', 'Before the next chapter, the wide shot.', 'The local record puts world population at {value} in {year}. Begin with that scale, then bring {country} into focus. This is the world around your birth year, not a tally of people born before you.'],
    ['opening', 'missing', 'Every story can begin without a complete record.', 'Your chosen starting year is {birthYear}. The local world series has no exact-year population value for that opening frame. We can name the gap without filling it with a guess.'],
    ['opening', 'missing', 'An opening frame with a space in it.', 'There is no verified world population value for {birthYear} in this local file. {country} still anchors the story; the missing count remains missing.'],
    ['country', 'positive', '{country}: the later value is higher.', '{metric} moves from {firstValue} in {firstYear} to {lastValue} in {lastYear}. Between those reference years, the recorded increase is {absoluteChange}. The endpoints show a change, not the path or its causes.'],
    ['country', 'positive', 'A larger value in the second frame.', 'Put {firstYear} beside {lastYear}: {country} records {firstValue}, then {lastValue}, for {metric}. The increase of {absoluteChange} is a country-level comparison, not a statement about your own experience.'],
    ['country', 'negative', '{country}: a different direction.', 'For {metric}, the later record is lower: {lastValue} in {lastYear}, compared with {firstValue} in {firstYear}. That is a decrease of {absoluteChange}; these endpoints alone cannot explain why.'],
    ['country', 'negative', 'Change does not always point upward.', '{country} records {firstValue} in {firstYear} and {lastValue} in {lastYear} for {metric}. The decrease is {absoluteChange}. A national measure can shift without describing any one person’s life.'],
    ['country', 'flat', 'Two reference points, the same recorded value.', '{country} has the same recorded {metric} value at these endpoints: {firstValue} in {firstYear} and {lastValue} in {lastYear}. Equal endpoints do not prove that nothing changed between them; the reference years may also coincide.'],
    ['country', 'flat', 'A pause in the endpoint comparison.', 'The available {metric} records for {country} are equal: {firstValue} at {firstYear} and {lastValue} at {lastYear}. This is equality in the stored data, not a claim that the country stood still.'],
    ['country', 'missing', 'The missing chapter stays visible.', 'An exact endpoint is missing for {metric} in {country}. The fact cards retain any available observation, but a then-and-since claim would need both values. No replacement year has been slipped in.'],
    ['country', 'missing', 'Not every change can be measured here.', 'The local {metric} series for {country} cannot complete this comparison. A blank is a limit of this record, not zero and not evidence that the country did not change.'],
    ['milestones', 'marker', 'A calendar year becomes a window.', 'The year you turned {age} was {year}. In that year, {country} recorded {value} for {metric}. The milestone supplies a time marker; it does not tell us where you were living or what your life was like.'],
    ['milestones', 'marker', 'Your timeline, the country’s reference points.', 'Pause at {year}, the calendar year you turned {age}: {metric} in {country} was {value}. A personal age and a national record can share a year without sharing a story of cause and effect.'],
    ['milestones', 'latest', 'Start with the snapshot we can verify.', 'The latest available {metric} record for {country} is {value}, dated {year}. This frame uses an available reference year rather than inventing an earlier milestone or a live count.'],
    ['milestones', 'latest', 'A dated snapshot, not a live clock.', '{country} records {value} for {metric} in {year}, the latest available observation here. Your timeline keeps that date attached, even when the calendar has moved on.'],
    ['milestones', 'missing', 'The calendar is clearer than the record.', 'The timeline can locate your age markers, but this frame has no verified {metric} value for {country}. Empty observations stay visible rather than turning into an invented memory.'],
    ['milestones', 'missing', 'Some windows have no observation behind them.', 'A milestone year is not a guarantee of data coverage. The local record cannot supply this {metric} snapshot for {country}; nothing is inferred about your life from that absence.'],
    ['comparison', 'positive', 'A shared year, an upward gap.', 'In {firstYear}, {other} has the higher {metric} value: {lastValue}, beside {country}’s {firstValue}. The gap is {absoluteChange}. This compares the same measure in the same year, not the quality of anyone’s life.'],
    ['comparison', 'positive', 'The second frame carries the higher value.', 'For {metric} in {firstYear}, the record places {country} at {firstValue} and {other} at {lastValue}. {other} is higher by {absoluteChange}; the figures alone do not explain the difference.'],
    ['comparison', 'negative', 'A shared year, a downward gap.', 'In {firstYear}, {other} has the lower {metric} value: {lastValue}, beside {country}’s {firstValue}. The gap is {absoluteChange}. Different national values are not a ranking of personal futures.'],
    ['comparison', 'negative', 'The first frame carries the higher value.', 'For {metric} in {firstYear}, {country} records {firstValue} and {other} records {lastValue}. {other} is lower by {absoluteChange}. No cause, journey or personal outcome follows from that comparison alone.'],
    ['comparison', 'flat', 'The comparison meets on level ground.', 'The stored {metric} values match in {firstYear}: {firstValue} for {country} and {lastValue} for {other}. Matching this measure does not make every aspect of these places the same.'],
    ['comparison', 'flat', 'A shared year and an equal measure.', 'At the common reference year {firstYear}, {country} and {other} both record {firstValue} for {metric}. That equality belongs to this indicator, not to a broader claim about life there.'],
    ['comparison', 'missing', 'No shared year, no forced comparison.', 'There is no usable common-year pair for {metric} between {country} and {other}. Comparing mismatched years could tell the wrong story, so this frame leaves the gap explicit.'],
    ['comparison', 'missing', 'Side by side requires common ground.', 'A fair time-aligned {metric} comparison needs observations for both {country} and {other} in one year. The local series cannot supply that pair; we do not borrow another year to make it work.'],
    ['projection', 'positive', 'One possible horizon holds more people.', 'The UN medium scenario for {country} rises from {firstValue} in {firstYear} to {lastValue} in {lastYear}, an increase of {absoluteChange}. Both endpoints are scenario values, not observations or promises.'],
    ['projection', 'positive', 'The scenario points upward, not to certainty.', 'Within the UN medium scenario, {country} has {firstValue} people at {firstYear} and {lastValue} at {lastYear}. The increase of {absoluteChange} describes that scenario only.'],
    ['projection', 'negative', 'One possible horizon holds fewer people.', 'The UN medium scenario for {country} falls from {firstValue} in {firstYear} to {lastValue} in {lastYear}, a decrease of {absoluteChange}. A scenario can point downward without forecasting any individual’s life.'],
    ['projection', 'negative', 'A smaller population in this scenario’s later frame.', 'The UN medium scenario places {country} at {firstValue} in {firstYear} and {lastValue} in {lastYear}. Its decrease of {absoluteChange} is conditional, not an observed trend extending inevitably forward.'],
    ['projection', 'flat', 'A level pair of scenario endpoints.', 'The UN medium scenario gives {country} equal endpoint populations: {firstValue} in {firstYear} and {lastValue} in {lastYear}. Equal endpoints say nothing about the path between them.'],
    ['projection', 'flat', 'This scenario ends where its count begins.', 'At {firstYear} and {lastYear}, the UN medium scenario records the same population for {country}: {firstValue}. It remains a conditional demographic scenario, not a prediction of your life.'],
    ['projection', 'missing', 'A horizon without a complete pair of values.', 'The local UN medium series for {country} is missing a usable baseline or horizon. Any available scenario value remains labeled below, but no direction or amount of change can be claimed.'],
    ['projection', 'missing', 'The scenario has a gap, not an implied direction.', 'A verified scenario comparison for {country} needs both endpoints. This local file cannot provide them, so the narration offers no increase, decrease or invented forecast.'],
    ['context', 'available', 'Another way to look at home.', 'The available urban share for {country} is {value}, dated {year}. It describes where a population lives in aggregate, not whether you lived in a city or where you might live next.'],
    ['context', 'available', 'When the horizon is unavailable, widen the present view.', 'In {year}, {value} of {country}’s population lived in urban areas according to this local record. It is a dated context measure, not a substitute population projection.'],
    ['context', 'missing', 'A wider view, with its limits intact.', 'The local urban-share record is also unavailable for {country}. The global fact card below keeps whatever historical evidence is available; neither gap becomes a forecast.'],
    ['context', 'missing', 'An honest ending can leave a question open.', 'This local file supplies no usable urban-share observation for {country}. Any world comparison below is historical context only. Missing context is not a reason to invent a future.']
  ];
  const templates = Object.freeze(rows.map(([topic, state, title, text], index) => Object.freeze({ id: 'editorial.' + index, topic, state, title, text })));
  const lenses = Object.freeze({
    opening: { population: 'Your population lens begins with the size of the whole, before looking at change in your birthplace.', longevity: 'Your life-expectancy lens will turn next to a different measure; this opening headcount is context, not a lifespan statistic.', connection: 'Your places lens starts wide, then places your selected geographies beside each other without assuming a journey between them.' },
    country: { population: 'The population lens leads with headcount change; it does not separate births, deaths and migration.', longevity: 'The life-expectancy lens leads with the period measure at birth, never your remaining years or a personal health prediction.', connection: 'The places lens first looks at your birthplace over time, so the later same-year comparison is not mistaken for a record of migration.' },
    milestones: { population: 'These timeline windows use population counts, not the number of people born alongside you.', longevity: 'These timeline windows use life expectancy at birth in each reference year, not your expected lifespan at each age.', connection: 'These windows stay anchored to your birth country; choosing a current country does not tell us when or whether you moved.' },
    comparison: { population: 'The population lens puts headcounts first. A larger population does not imply greater wellbeing.', longevity: 'The life-expectancy lens puts a population-level period measure first, not a forecast of either person’s longevity.', connection: 'The places lens is about geographic context: a common year makes the comparison legible without inventing a connection between your life events and the data.' },
    projection: { population: 'The population lens ends with a conditional count, not a guaranteed growth path.', longevity: 'This horizon is a population scenario, not a life-expectancy projection; your lens does not turn it into a prediction of how long you will live.', connection: 'This horizon belongs to your birth country. It does not predict where you will live or how places will shape your life.' },
    context: { population: 'Urban share and global headcounts offer different population perspectives; neither replaces a missing national forecast.', longevity: 'This context is not life-expectancy data. A missing projection cannot be repurposed into a lifespan estimate.', connection: 'Urban share adds geographic context without assuming your address, lifestyle or next destination.' }
  });
  const safeguards = Object.freeze({
    opening: 'This is the world around your birth year, not the number of people born before you.',
    country: 'Life expectancy at birth is a population-level period measure, never a prediction of your lifespan.',
    milestones: 'Age markers refer to calendar years, not exact birthdays. Only milestones in completed calendar years appear. “Now” is the latest available reference year, not a live count.',
    comparison: 'Each metric uses its own latest year available for both places.',
    projection: 'Actual outcomes depend on future fertility, mortality and migration. This is not your personal future.',
    context: 'No usable future population scenario is available for your birth country in the local file. The final frame uses factual context, not an invented forecast.'
  });
  const scopes = Object.freeze({
    same: 'You selected the same birth and current country. Identical observations are intentional, not evidence of a move.',
    two: 'You selected two countries. Nothing here assumes when or whether you moved between them.',
    world: 'No current country was selected, so the comparison uses the world. Your birth country is part of that world total, not a separate population to add to it.'
  });
  function interpolate(template, bindings) {
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, key) => {
      if (!Object.prototype.hasOwnProperty.call(bindings, key) || bindings[key] === null || bindings[key] === undefined || (typeof bindings[key] === 'number' && !Number.isFinite(bindings[key]))) throw new Error('Unverified editorial placeholder: ' + key);
      return String(bindings[key]); // Single pass: placeholder-looking country names are never reinterpreted.
    });
  }
  function predicate(topic, fact) {
    if (!fact || !fact.complete || !fact.points.length || !fact.points.every(p => Number.isFinite(p.value) && Number.isInteger(p.year))) return 'missing';
    if (['country', 'comparison', 'projection'].includes(topic)) {
      if (fact.points.length !== 2 || !Number.isFinite(fact.delta) || fact.delta !== fact.points[1].value - fact.points[0].value) return 'missing';
      if (topic === 'comparison' && fact.points[0].year !== fact.points[1].year) return 'missing';
      if (topic === 'projection' && (fact.scenario !== 'medium' || !Number.isInteger(fact.projectionFrom) || fact.points.some(p => p.year < fact.projectionFrom))) return 'missing';
      return fact.delta > 0 ? 'positive' : fact.delta < 0 ? 'negative' : 'flat';
    }
    if (topic === 'milestones') return Number.isInteger(fact.age) ? 'marker' : 'latest';
    return 'available';
  }
  function select(topic, state, interest, stableKey) {
    if (!Object.prototype.hasOwnProperty.call(lenses, topic) || !Object.prototype.hasOwnProperty.call(lenses[topic], interest)) throw new Error('Unknown editorial lens');
    const candidates = templates.filter(t => t.topic === topic && t.state === state);
    if (!candidates.length) throw new Error('Unknown editorial predicate');
    let hash = 2166136261;
    for (const char of provenance.pack + '|' + stableKey + '|' + interest) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return candidates[hash % candidates.length];
  }
  function narrate(topic, fact, profile, country, bindings) {
    const state = predicate(topic, fact);
    const template = select(topic, state, profile.interest, fact.id);
    const scope = topic === 'comparison' ? (!profile.current ? 'world' : profile.birth === profile.current ? 'same' : 'two') : null;
    const values = { ...bindings, country, birthYear: profile.year };
    return {
      title: interpolate(template.title, values),
      text: [interpolate(template.text, values), lenses[topic][profile.interest], scope ? scopes[scope] : '', safeguards[topic]].filter(Boolean).join(' '),
      editorial: { pack: provenance.pack, templateId: template.id, predicate: state, interest: profile.interest, factIds: [fact.id], scope, bindings: Object.fromEntries([...new Set(((template.title + ' ' + template.text).match(/\{[A-Za-z][A-Za-z0-9]*\}/g) || []).map(s => s.slice(1, -1)))].map(key => [key, values[key]])) }
    };
  }
  const api = { provenance, templates, lenses, safeguards, scopes, interpolate, predicate, select, narrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorldStoryEditorial = api;
})(typeof window !== 'undefined' ? window : globalThis);
