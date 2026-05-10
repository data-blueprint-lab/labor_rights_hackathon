const state = {
  raw: null,
  summaries: [],
  context: null,
  selectedCountry: null,
  ledgerCards: [],
  coreCountries: [],
  page: "portal",
  storyId: "access",
};

const svgNS = "http://www.w3.org/2000/svg";
const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

const CHAPTERS = [
  {
    id: "access",
    order: 1,
    title: "Access illusion",
    kicker: "Chapter 01 • Access",
    route: "access.html",
    scoreKey: "accessMirage",
    latestYearKey: "employment",
    summary:
      "Who gets into work is a sharper divide than how many hours people work once they are employed.",
    chartTitle: "Employment gap vs hours gap",
    chartNote: "The gate to work is more unequal than the shape of the workweek.",
    trendTitle: "Employment gap over time",
  },
  {
    id: "pay",
    order: 2,
    title: "Pay illusion",
    kicker: "Chapter 02 • Pay",
    route: "pay.html",
    scoreKey: "payMirage",
    latestYearKey: "payGap",
    summary:
      "Pay parity can look close on paper while women still carry more poverty pressure inside work.",
    chartTitle: "Pay gap vs female poverty",
    chartNote: "A small gap from parity does not guarantee economic security.",
    trendTitle: "Pay gap over time",
  },
  {
    id: "workload",
    order: 3,
    title: "Workload pressure",
    kicker: "Chapter 03 • Workload",
    route: "workload.html",
    scoreKey: "workloadMirage",
    latestYearKey: "hours",
    summary:
      "The week can be heavy for both sexes at once, which hides the real strain inside the average.",
    chartTitle: "Average hours vs hours gap",
    chartNote: "Big workload and small gap are not the same thing.",
    trendTitle: "Weekly hours over time",
  },
  {
    id: "security",
    order: 4,
    title: "Security mirage",
    kicker: "Chapter 04 • Security",
    route: "security.html",
    scoreKey: "securityMirage",
    latestYearKey: "tenure",
    summary:
      "Tenure looks more balanced than access, but short-tenure churn still tells a weaker security story.",
    chartTitle: "Tenure composition by sex",
    chartNote: "Long tenure is only part of labor security.",
    trendTitle: "Long-tenure share over time",
  },
];

window.addEventListener("error", function (event) {
  showFatal("Dashboard error: " + (event && event.message ? event.message : "unknown failure"));
});

window.addEventListener("unhandledrejection", function (event) {
  const reason = event && event.reason ? event.reason : "unknown failure";
  showFatal("Dashboard error: " + String(reason));
});

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  try {
    const raw = window.__LABOR_RIGHTS_DATA__;
    if (!raw) {
      showFatal("Data bundle missing. Run `scripts/build-data.ps1` first.");
      return;
    }

    state.raw = normalizeRawData(raw);
    state.summaries = buildCountrySummaries(state.raw);

    if (!state.summaries.length) {
      showFatal("No countries matched across all five datasets.");
      return;
    }

    state.coreCountries = state.summaries.map((item) => item.country);
    enrichSummariesWithRanks(state.summaries);
    state.context = buildGlobalContext(state.raw, state.summaries);
    state.page = String(document.body && document.body.dataset ? document.body.dataset.page : "portal");
    state.storyId = String(document.body && document.body.dataset ? document.body.dataset.story : "access");

    if (state.page === "story") {
      renderStoryPage(state.storyId);
      return;
    }

    renderPortalPage();
  } catch (error) {
    showFatal("Portal failed to render: " + (error && error.message ? error.message : String(error)));
  }
}

function showFatal(message) {
  const target =
    document.getElementById("app-status") ||
    document.getElementById("story-summary") ||
    document.getElementById("portal-summary");
  if (target) {
    target.textContent = message;
  }
}

function normalizeRawData(raw) {
  const normalized = {};
  for (const [key, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows)) {
      continue;
    }
    normalized[key] = rows.map((row) => {
      const next = { ...row };
      for (const [name, value] of Object.entries(next)) {
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed !== "" && isNumeric(trimmed)) {
            next[name] = Number(trimmed);
          }
        }
      }
      if ("year" in next) {
        next.year = Number(next.year);
      }
      if ("value" in next) {
        next.value = next.value === null || next.value === undefined ? null : Number(next.value);
      }
      return next;
    });
  }
  return normalized;
}

function isNumeric(value) {
  return /^-?\d+(\.\d+)?$/.test(String(value));
}

function buildCountrySummaries(raw) {
  const employmentByCountry = groupRows(raw.employment || [], (row) => row.country);
  const payByCountry = groupRows(raw.payGap || [], (row) => row.country);
  const povertyByCountry = groupRows(raw.poverty || [], (row) => row.country);
  const tenureByCountry = groupRows(raw.tenure || [], (row) => row.country);
  const hoursByCountry = groupRows(raw.hours || [], (row) => row.country);

  const countrySets = [
    new Set(employmentByCountry.keys()),
    new Set(payByCountry.keys()),
    new Set(povertyByCountry.keys()),
    new Set(tenureByCountry.keys()),
    new Set(hoursByCountry.keys()),
  ];

  const coreCountries = [...countrySets[0]].filter((country) =>
    countrySets.every((set) => set.has(country))
  );

  return coreCountries
    .sort((a, b) => a.localeCompare(b))
    .map((country) => {
      const employment = buildSexSeries(employmentByCountry.get(country) || [], "sex");
      const poverty = buildSexSeries(povertyByCountry.get(country) || [], "sex");
      const hours = buildSexSeries(hoursByCountry.get(country) || [], "sex");
      const payGap = buildSingleSeries(payByCountry.get(country) || []);
      const tenure = buildTenureSeries(tenureByCountry.get(country) || []);

      if (!employment.latest || !poverty.latest || !hours.latest || !payGap.latest || !tenure.latest) {
        return null;
      }

      return {
        country,
        employment,
        payGap,
        poverty,
        hours,
        tenure,
        metrics: {
          employmentGap: employment.latest.gap,
          employmentFemale: employment.latest.female,
          employmentMale: employment.latest.male,
          employmentAvg: employment.latest.avg,
          payGap: payGap.latest.value,
          payAbs: Math.abs(payGap.latest.value),
          povertyGap: poverty.latest.gap,
          povertyFemale: poverty.latest.female,
          povertyMale: poverty.latest.male,
          povertyAvg: poverty.latest.avg,
          hoursGap: hours.latest.gap,
          hoursFemale: hours.latest.female,
          hoursMale: hours.latest.male,
          hoursAvg: hours.latest.avg,
          tenureFemaleLong: tenure.latest.female.long,
          tenureMaleLong: tenure.latest.male.long,
          tenureFemaleShort: tenure.latest.female.short,
          tenureMaleShort: tenure.latest.male.short,
          tenureLongAvg: tenure.latest.longAvg,
          tenureShortAvg: tenure.latest.shortAvg,
          tenureLongGap: tenure.latest.longGap,
          tenureShortGap: tenure.latest.shortGap,
          latestYears: {
            employment: employment.latest.year,
            payGap: payGap.latest.year,
            poverty: poverty.latest.year,
            hours: hours.latest.year,
            tenure: tenure.latest.year,
          },
        },
      };
    })
    .filter(Boolean);
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }
  return map;
}

function normalizeSex(value) {
  return String(value || "").trim().toLowerCase();
}

function sexIsFemale(value) {
  const normalized = normalizeSex(value);
  return normalized === "female" || normalized === "females";
}

function sexIsMale(value) {
  const normalized = normalizeSex(value);
  return normalized === "male" || normalized === "males";
}

function buildSexSeries(rows, sexField) {
  const byYear = groupRows(rows, (row) => row.year);
  const series = [];

  [...byYear.keys()]
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((year) => {
      const yearRows = byYear.get(year) || [];
      const female = yearRows.find((row) => sexIsFemale(row[sexField]));
      const male = yearRows.find((row) => sexIsMale(row[sexField]));

      if (!female || !male) {
        return;
      }

      if (!isFiniteNumber(female.value) || !isFiniteNumber(male.value)) {
        return;
      }

      series.push({
        year,
        female: female.value,
        male: male.value,
        gap: male.value - female.value,
        avg: (male.value + female.value) / 2,
      });
    });

  return {
    series,
    latest: series[series.length - 1] || null,
  };
}

function buildSingleSeries(rows) {
  const series = rows
    .filter((row) => isFiniteNumber(row.year) && isFiniteNumber(row.value))
    .sort((a, b) => a.year - b.year)
    .map((row) => ({
      year: row.year,
      value: row.value,
    }));

  return {
    series,
    latest: series[series.length - 1] || null,
  };
}

function buildTenureSeries(rows) {
  const byYear = groupRows(rows, (row) => row.year);
  const series = [];
  const durationOrder = [
    "From 0 to 11 months",
    "From 12 to 23 months",
    "From 24 to 59 months",
    "60 months or over",
    "No response",
  ];

  [...byYear.keys()]
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((year) => {
      const yearRows = byYear.get(year) || [];
      const femaleRows = yearRows.filter((row) => sexIsFemale(row.sex));
      const maleRows = yearRows.filter((row) => sexIsMale(row.sex));

      if (!femaleRows.length || !maleRows.length) {
        return;
      }

      const female = {};
      const male = {};

      for (const duration of durationOrder) {
        female[duration] = extractDurationValue(femaleRows, duration);
        male[duration] = extractDurationValue(maleRows, duration);
      }

      const femaleLong = female["60 months or over"];
      const maleLong = male["60 months or over"];
      const femaleShort = female["From 0 to 11 months"];
      const maleShort = male["From 0 to 11 months"];

      if (!isFiniteNumber(femaleLong) || !isFiniteNumber(maleLong)) {
        return;
      }

      series.push({
        year,
        female,
        male,
        femaleLong,
        maleLong,
        femaleShort,
        maleShort,
        longAvg: (femaleLong + maleLong) / 2,
        shortAvg: averageIgnoreNull([femaleShort, maleShort]),
        longGap: maleLong - femaleLong,
        shortGap: maleShort - femaleShort,
      });
    });

  return {
    series,
    latest: series[series.length - 1] || null,
  };
}

function extractDurationValue(rows, duration) {
  const hit = rows.find((row) => row.duration === duration);
  return hit && isFiniteNumber(hit.value) ? hit.value : 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function averageIgnoreNull(values) {
  const filtered = values.filter(isFiniteNumber);
  if (!filtered.length) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function enrichSummariesWithRanks(summaries) {
  const payLow = rankBy(summaries, (item) => item.metrics.payAbs, false);
  const povertyHigh = rankBy(summaries, (item) => item.metrics.povertyFemale, true);
  const employmentHigh = rankBy(summaries, (item) => item.metrics.employmentGap, true);
  const hoursGapLow = rankBy(summaries, (item) => Math.abs(item.metrics.hoursGap), false);
  const hoursHigh = rankBy(summaries, (item) => item.metrics.hoursAvg, true);
  const shortTenureHigh = rankBy(summaries, (item) => item.metrics.tenureShortAvg, true);
  const tenureGapLow = rankBy(summaries, (item) => Math.abs(item.metrics.tenureLongGap), false);

  for (const item of summaries) {
    item.scores = {
      payMirage: payLow.get(item.country) + povertyHigh.get(item.country),
      accessMirage: employmentHigh.get(item.country) + hoursGapLow.get(item.country),
      workloadMirage: hoursHigh.get(item.country) + hoursGapLow.get(item.country),
      securityMirage: shortTenureHigh.get(item.country) + tenureGapLow.get(item.country),
    };
    item.scores.overall =
      (item.scores.payMirage +
        item.scores.accessMirage +
        item.scores.workloadMirage +
        item.scores.securityMirage) /
      4;

    const themeScores = [
      ["pay", item.scores.payMirage],
      ["access", item.scores.accessMirage],
      ["workload", item.scores.workloadMirage],
      ["security", item.scores.securityMirage],
    ].sort((a, b) => b[1] - a[1]);

    item.theme = themeScores[0][0];
  }
}

function rankBy(items, accessor, descending) {
  const filtered = items.filter((item) => isFiniteNumber(accessor(item)));
  const sorted = [...filtered].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    return descending ? bv - av : av - bv;
  });
  const map = new Map();
  const count = sorted.length;

  sorted.forEach((item, index) => {
    const score = count <= 1 ? 1 : 1 - index / (count - 1);
    map.set(item.country, score);
  });

  return map;
}

function buildLedgerCards(summaries) {
  const used = new Set();
  const cards = [];
  const themes = [
    {
      key: "payMirage",
      label: "Pay mirage",
      summary: (item) =>
        `The pay gap looks close to parity, but women still face more in-work poverty.`,
      detail: (item) =>
        `${item.country} has a pay gap of ${formatSignedPercent(item.metrics.payGap)} and a female poverty rate of ${formatPercent(
          item.metrics.povertyFemale
        )}.`,
      pills: (item) => [
        `${formatSignedPercent(item.metrics.payGap)} pay gap`,
        `${formatPercent(item.metrics.povertyFemale)} female poverty`,
        `${formatSignedPoints(item.metrics.povertyGap)} poverty gap`,
      ],
    },
    {
      key: "accessMirage",
      label: "Access mirage",
      summary: (item) =>
        `Employment is much more unequal than the hours worked once people are employed.`,
      detail: (item) =>
        `${item.country} shows a ${formatSignedPoints(item.metrics.employmentGap)} employment gap, but only a ${formatSignedHours(
          item.metrics.hoursGap
        )} hours gap.`,
      pills: (item) => [
        `${formatSignedPoints(item.metrics.employmentGap)} employment gap`,
        `${formatSignedHours(item.metrics.hoursGap)} hours gap`,
        `${formatHours(item.metrics.hoursAvg)} avg hours`,
      ],
    },
    {
      key: "workloadMirage",
      label: "Workload pressure",
      summary: (item) =>
        `Both sexes work long weeks, so the gap looks small even when the workload is heavy.`,
      detail: (item) =>
        `${item.country} averages ${formatHours(item.metrics.hoursAvg)} per week across employed women and men.`,
      pills: (item) => [
        `${formatHours(item.metrics.hoursAvg)} avg hours`,
        `${formatSignedHours(item.metrics.hoursGap)} hours gap`,
        `${formatHours(item.metrics.hoursFemale)} women`,
      ],
    },
    {
      key: "securityMirage",
      label: "Security mirage",
      summary: (item) =>
        `Tenure is not where the biggest gap lives; churn is high for both sexes.`,
      detail: (item) =>
        `${item.country} has ${formatPercent(item.metrics.tenureFemaleLong)} women and ${formatPercent(
          item.metrics.tenureMaleLong
        )} men in 60+ month tenure, with a short-tenure average of ${formatPercent(item.metrics.tenureShortAvg)}.`,
      pills: (item) => [
        `${formatPercent(item.metrics.tenureLongAvg)} long tenure`,
        `${formatSignedPoints(item.metrics.tenureLongGap)} long-tenure gap`,
        `${formatPercent(item.metrics.tenureShortAvg)} short tenure`,
      ],
    },
  ];

  for (const theme of themes) {
    const ranked = [...summaries].sort((a, b) => b.scores[theme.key] - a.scores[theme.key]);
    let chosen = ranked.find((item) => !used.has(item.country));
    if (!chosen) {
      chosen = ranked[0];
    }
    used.add(chosen.country);
    cards.push({
      type: theme.label,
      country: chosen.country,
      title: `${chosen.country} · ${theme.label}`,
      copy: theme.summary(chosen),
      detail: theme.detail(chosen),
      pills: theme.pills(chosen),
      theme: chosen.theme,
    });
  }

  return cards;
}

function renderHero() {
  const meta = window.__LABOR_RIGHTS_DATA__.meta || {};
  const rowCount = Object.values(meta.datasets || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const years = getOverallYearSpan(state.summaries);

  const heroStats = document.getElementById("hero-stats");
  heroStats.innerHTML = "";

  const statCards = [
    ["Datasets", "5", "Employment, pay, poverty, hours, tenure"],
    ["Shared countries", String(state.summaries.length), "Countries present across all five files"],
    ["Year span", years, "Latest values vary by metric"],
    ["Rows", formatInteger(rowCount), "All source rows in the local bundle"],
  ];

  for (const [label, value, note] of statCards) {
    heroStats.appendChild(createStatCard(label, value, note));
  }
}

function renderStoryBrief() {
  const summaries = state.summaries;
  const employmentGaps = summaries.map((item) => item.metrics.employmentGap);
  const hoursGaps = summaries.map((item) => Math.abs(item.metrics.hoursGap));
  const payAbs = summaries.map((item) => item.metrics.payAbs);
  const femalePoverty = summaries.map((item) => item.metrics.povertyFemale);
  const longTenure = summaries.map((item) => item.metrics.tenureLongAvg);

  const medianEmploymentGap = median(employmentGaps);
  const medianHoursGap = median(hoursGaps);
  const medianPayAbs = median(payAbs);
  const medianFemalePoverty = median(femalePoverty);
  const medianLongTenure = median(longTenure);

  const storyBrief = document.getElementById("story-brief");
  storyBrief.textContent =
    "The key signal in this dataset is not a single fairness metric. It is the mismatch between who gets into work, how work is distributed once people are employed, and how much security that work actually produces.";

  const stack = document.getElementById("insight-stack");
  stack.innerHTML = "";

  const insights = [
    {
      title: "Access is the sharper divide",
      body: `Across the shared countries, the median employment gap is ${formatSignedPoints(medianEmploymentGap)}, while the median hours gap is only ${formatHours(
        medianHoursGap
      )}.`,
    },
    {
      title: "Pay is not the whole story",
      body: `The median pay gap is ${formatPercent(medianPayAbs)} from parity, but the median female in-work poverty rate still sits at ${formatPercent(
        medianFemalePoverty
      )}.`,
    },
    {
      title: "Tenure often looks more even",
      body: `The median long-tenure share is ${formatPercent(medianLongTenure)}, which suggests the bigger bottleneck is entry into work rather than only staying in it.`,
    },
  ];

  for (const insight of insights) {
    const node = document.createElement("div");
    node.className = "insight";
    node.innerHTML = `<strong>${escapeHtml(insight.title)}.</strong> ${escapeHtml(insight.body)}`;
    stack.appendChild(node);
  }
}

function renderLedger() {
  const ledger = document.getElementById("ledger");
  ledger.innerHTML = "";

  for (const card of state.ledgerCards) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "ledger-card";
    node.dataset.country = card.country;
    if (card.country === state.selectedCountry) {
      node.classList.add("is-active");
    }
    node.innerHTML = `
      <div class="ledger-card__top">
        <div>
          <div class="panel-kicker">${escapeHtml(card.type)}</div>
          <h3>${escapeHtml(card.country)}</h3>
        </div>
        <span class="ledger-card__type">${escapeHtml(titleCase(card.theme))}</span>
      </div>
      <p class="ledger-card__copy">${escapeHtml(card.copy)}</p>
      <p class="ledger-card__copy">${escapeHtml(card.detail)}</p>
      <div class="ledger-card__meta">
        ${card.pills.map((pill) => `<span class="meta-pill">${escapeHtml(pill)}</span>`).join("")}
      </div>
    `;
    node.addEventListener("click", () => selectCountry(card.country));
    ledger.appendChild(node);
  }
}

function renderCountryChips() {
  const chipHost = document.getElementById("country-chips");
  chipHost.innerHTML = "";

  const priority = state.ledgerCards.map((card) => card.country);
  const remaining = state.summaries
    .map((item) => item.country)
    .filter((country) => !priority.includes(country))
    .sort((a, b) => a.localeCompare(b));
  const ordered = [...priority, ...remaining];

  for (const country of ordered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    if (country === state.selectedCountry) {
      button.classList.add("is-active");
    }
    button.textContent = country;
    button.addEventListener("click", () => selectCountry(country));
    chipHost.appendChild(button);
  }
}

function renderAllInteractive() {
  renderSelectedCountry();
  renderScatters();
}

function renderSelectedCountry() {
  const summary = state.summaries.find((item) => item.country === state.selectedCountry) || state.summaries[0];
  if (!summary) {
    return;
  }

  const themeLabel = titleCase(summary.theme) + " story";
  const title = document.getElementById("country-title");
  title.textContent = `${summary.country} · ${themeLabel}`;

  const summaryHost = document.getElementById("country-summary");
  summaryHost.innerHTML = "";
  for (const paragraph of buildCountryNarrative(summary)) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    summaryHost.appendChild(p);
  }

  const metricsHost = document.getElementById("metric-cards");
  metricsHost.innerHTML = "";
  for (const card of buildMetricCards(summary)) {
    metricsHost.appendChild(card);
  }

  const sparkHost = document.getElementById("sparkline-grid");
  sparkHost.innerHTML = "";
  for (const spark of buildSparkCards(summary)) {
    sparkHost.appendChild(spark);
  }

  renderTenurePlot(summary);
}

function buildCountryNarrative(summary) {
  const out = [];
  const m = summary.metrics;
  const employment = describeGap({
    metric: "employment",
    value: m.employmentGap,
  });
  const pay = describeGap({
    metric: "pay",
    value: m.payGap,
  });
  const poverty = describeGap({
    metric: "poverty",
    value: m.povertyGap,
  });
  const hours = describeGap({
    metric: "hours",
    value: m.hoursGap,
  });
  const tenure = describeTenure(summary);

  out.push(`${summary.country} is a ${titleCase(summary.theme)} case. ${employment}.`);
  if (summary.theme === "pay") {
    out.push(`${pay}. ${poverty}.`);
  } else if (summary.theme === "access") {
    out.push(`${hours}. ${pay}.`);
  } else if (summary.theme === "workload") {
    out.push(`${hours}. ${tenure}`);
  } else {
    out.push(`${tenure} ${pay}.`);
  }
  out.push(
    `The interesting part is the mismatch: a strong result in one measure does not automatically translate into better labor-rights security overall.`
  );
  return out;
}

function buildMetricCards(summary) {
  const m = summary.metrics;
  const defs = [
    {
      label: "Employment rate",
      value: `${formatPercent(m.employmentFemale)} / ${formatPercent(m.employmentMale)}`,
      note: `${summary.metrics.latestYears.employment} · ${describeGap({ metric: "employment", value: m.employmentGap })}`,
    },
    {
      label: "Unadjusted pay gap",
      value: formatSignedPercent(m.payGap),
      note: `${summary.metrics.latestYears.payGap} · distance from parity`,
    },
    {
      label: "In-work poverty",
      value: `${formatPercent(m.povertyFemale)} / ${formatPercent(m.povertyMale)}`,
      note: `${summary.metrics.latestYears.poverty} · ${describeGap({ metric: "poverty", value: m.povertyGap })}`,
    },
    {
      label: "Weekly hours",
      value: `${formatHours(m.hoursFemale)} / ${formatHours(m.hoursMale)}`,
      note: `${summary.metrics.latestYears.hours} · ${describeGap({ metric: "hours", value: m.hoursGap })}`,
    },
    {
      label: "Long tenure share",
      value: `${formatPercent(m.tenureFemaleLong)} / ${formatPercent(m.tenureMaleLong)}`,
      note: `${summary.metrics.latestYears.tenure} · ${describeTenure(summary)}`,
    },
  ];

  return defs.map((def, index) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `
      <div>
        <div class="metric-card__label">${escapeHtml(def.label)}</div>
        <div class="metric-card__value">${escapeHtml(def.value)}</div>
        <div class="metric-card__note">${escapeHtml(def.note)}</div>
      </div>
    `;
    return card;
  });
}

function buildSparkCards(summary) {
  const defs = [
    {
      label: "Employment gap",
      series: summary.employment.series.map((row) => ({ year: row.year, value: row.gap })),
      value: summary.metrics.employmentGap,
      format: (value) => formatSignedPoints(value),
    },
    {
      label: "Pay gap",
      series: summary.payGap.series,
      value: summary.metrics.payGap,
      format: (value) => formatSignedPercent(value),
    },
    {
      label: "Female poverty",
      series: summary.poverty.series.map((row) => ({ year: row.year, value: row.female })),
      value: summary.metrics.povertyFemale,
      format: (value) => formatPercent(value),
    },
    {
      label: "Average hours",
      series: summary.hours.series.map((row) => ({ year: row.year, value: row.avg })),
      value: summary.metrics.hoursAvg,
      format: (value) => formatHours(value),
    },
    {
      label: "Long tenure",
      series: summary.tenure.series.map((row) => ({ year: row.year, value: row.longAvg })),
      value: summary.metrics.tenureLongAvg,
      format: (value) => formatPercent(value),
    },
  ];

  return defs.map((def) => {
    const card = document.createElement("article");
    card.className = "spark-card";

    const first = def.series[0] ? def.series[0].value : null;
    const last = def.series[def.series.length - 1] ? def.series[def.series.length - 1].value : null;
    const delta = isFiniteNumber(first) && isFiniteNumber(last) ? last - first : null;

    card.innerHTML = `
      <div class="spark-card__top">
        <div class="spark-card__label">${escapeHtml(def.label)}</div>
        <div class="spark-card__value">${escapeHtml(def.format(def.value))}</div>
      </div>
      <svg viewBox="0 0 320 48" aria-hidden="true"></svg>
      <div class="spark-card__delta">${delta === null ? "No trend" : `${formatSignedNumber(delta)} since first year`}</div>
    `;

    const svg = card.querySelector("svg");
    drawSparkline(svg, def.series, {
      stroke: sparkColor(def.label),
      fill: sparkFill(def.label),
    });

    return card;
  });
}

function renderScatters() {
  const summary = state.summaries.find((item) => item.country === state.selectedCountry) || state.summaries[0];
  const selected = summary ? summary.country : null;

  drawScatter(document.getElementById("pay-plot"), state.summaries, {
    x: (item) => item.metrics.payAbs,
    y: (item) => item.metrics.povertyFemale,
    size: (item) => item.metrics.employmentGap,
    color: (item) => item.metrics.payGap,
    xLabel: "Pay gap from parity (%)",
    yLabel: "Female in-work poverty (%)",
    selected,
    labelCountries: topCountries(state.summaries, (item) => item.scores.payMirage, 5),
    tooltip: (item) =>
      `<strong>${escapeHtml(item.country)}</strong>
       <div>Pay gap: ${escapeHtml(formatSignedPercent(item.metrics.payGap))}</div>
       <div>Female poverty: ${escapeHtml(formatPercent(item.metrics.povertyFemale))}</div>
       <div>Employment gap: ${escapeHtml(formatSignedPoints(item.metrics.employmentGap))}</div>`,
  });

  drawScatter(document.getElementById("access-plot"), state.summaries, {
    x: (item) => item.metrics.employmentGap,
    y: (item) => item.metrics.hoursGap,
    size: (item) => item.metrics.hoursAvg,
    color: (item) => item.metrics.hoursAvg,
    xLabel: "Employment gap (men - women, pp)",
    yLabel: "Hours gap (men - women, hours)",
    selected,
    labelCountries: topCountries(state.summaries, (item) => item.scores.accessMirage, 5),
    tooltip: (item) =>
      `<strong>${escapeHtml(item.country)}</strong>
       <div>Employment gap: ${escapeHtml(formatSignedPoints(item.metrics.employmentGap))}</div>
       <div>Hours gap: ${escapeHtml(formatSignedHours(item.metrics.hoursGap))}</div>
       <div>Average hours: ${escapeHtml(formatHours(item.metrics.hoursAvg))}</div>`,
  });
}

function renderTenurePlot(summary, target) {
  const svg = target || document.getElementById("tenure-plot");
  clearElement(svg);

  if (!summary.tenure.latest) {
    svg.innerHTML = `<text x="20" y="40" class="axis-label">No tenure data available.</text>`;
    return;
  }

  const width = 760;
  const height = 260;
  const left = 150;
  const top = 36;
  const barWidth = 540;
  const barHeight = 24;
  const gap = 70;
  const legendY = 18;

  const legendItems = [
    ["0-11 months", "#ff8d72"],
    ["12-23 months", "#f7c948"],
    ["24-59 months", "#77d7e8"],
    ["60+ months", "#67e8a6"],
    ["No response", "#94a3b8"],
  ];

  const legend = legendItems
    .map(
      ([label, color], idx) =>
        `<g transform="translate(${20 + idx * 144}, ${legendY})"><rect width="12" height="12" rx="3" fill="${color}"></rect><text x="18" y="10" class="tick-label">${escapeXml(
          label
        )}</text></g>`
    )
    .join("");

  const female = summary.tenure.latest.female;
  const male = summary.tenure.latest.male;

  const femaleBar = stackedSegments(female);
  const maleBar = stackedSegments(male);

  const femaleY = top + 42;
  const maleY = top + 42 + gap;

  const femaleText = `Women · long tenure ${formatPercent(summary.metrics.tenureFemaleLong)}`;
  const maleText = `Men · long tenure ${formatPercent(summary.metrics.tenureMaleLong)}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="tenureGradient" x1="0" x2="1">
        <stop offset="0%" stop-color="#ff8d72" />
        <stop offset="40%" stop-color="#f7c948" />
        <stop offset="72%" stop-color="#77d7e8" />
        <stop offset="100%" stop-color="#67e8a6" />
      </linearGradient>
    </defs>
    ${legend}
    <line x1="${left}" y1="${femaleY - 8}" x2="${left + barWidth}" y2="${femaleY - 8}" class="grid-line"></line>
    <line x1="${left}" y1="${maleY - 8}" x2="${left + barWidth}" y2="${maleY - 8}" class="grid-line"></line>
    <text x="20" y="${femaleY + 7}" class="axis-label">Female</text>
    <text x="20" y="${maleY + 7}" class="axis-label">Male</text>
    ${renderStackedBar(left, femaleY - 12, barWidth, barHeight, femaleBar)}
    ${renderStackedBar(left, maleY - 12, barWidth, barHeight, maleBar)}
    <text x="${left + barWidth + 16}" y="${femaleY + 6}" class="tick-label">${escapeXml(femaleText)}</text>
    <text x="${left + barWidth + 16}" y="${maleY + 6}" class="tick-label">${escapeXml(maleText)}</text>
    <text x="${left}" y="${height - 20}" class="axis-label">The long-tenure share is often more balanced than access itself, which is why the story points upstream.</text>
  `;
}

function stackedSegments(values) {
  const order = [
    ["From 0 to 11 months", "#ff8d72"],
    ["From 12 to 23 months", "#f7c948"],
    ["From 24 to 59 months", "#77d7e8"],
    ["60 months or over", "#67e8a6"],
    ["No response", "#94a3b8"],
  ];
  const total = order.reduce((sum, [key]) => sum + (isFiniteNumber(values && values[key]) ? values[key] : 0), 0);
  let cursor = 0;
  return order.map(([key, color]) => {
    const value = isFiniteNumber(values && values[key]) ? values[key] : 0;
    const width = total > 0 ? (value / total) * 100 : 0;
    const segment = { key, color, value, start: cursor, width };
    cursor += width;
    return segment;
  });
}

function renderStackedBar(x, y, width, height, segments) {
  return segments
    .map((segment) => {
      const segmentWidth = Math.max(segment.width, 0.1);
      const px = x + (segment.start / 100) * width;
      const w = (segmentWidth / 100) * width;
      return `<rect x="${px}" y="${y}" width="${w}" height="${height}" rx="8" fill="${segment.color}" opacity="0.95"></rect>`;
    })
    .join("");
}

function drawScatter(svg, items, config) {
  clearElement(svg);

  const width = 760;
  const height = 420;
  const margin = { top: 28, right: 26, bottom: 54, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const points = items
    .map((item) => ({
      item,
      x: config.x(item),
      y: config.y(item),
      size: config.size(item),
      color: config.color(item),
    }))
    .filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y));

  if (!points.length) {
    svg.innerHTML = `<text x="20" y="40" class="axis-label">No data available.</text>`;
    return;
  }

  const xExtent = padExtent(points.map((point) => point.x));
  const yExtent = padExtent(points.map((point) => point.y));
  const xScale = scaleLinear(xExtent[0], xExtent[1], margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(yExtent[0], yExtent[1], margin.top + plotHeight, margin.top);

  const colorRange = metricColorRange(points.map((point) => point.color));
  const sizeRange = padExtent(points.map((point) => point.size), 0.1);
  const sizeScale = scaleLinear(sizeRange[0], sizeRange[1], 6, 18);

  const xTicks = niceTicks(xExtent[0], xExtent[1], 5);
  const yTicks = niceTicks(yExtent[0], yExtent[1], 5);

  const gridLines = [];
  for (const tick of xTicks) {
    const x = xScale(tick);
    gridLines.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotHeight}" class="grid-line"></line>`);
  }
  for (const tick of yTicks) {
    const y = yScale(tick);
    gridLines.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" class="grid-line"></line>`);
  }

  const zeroX = xExtent[0] <= 0 && xExtent[1] >= 0 ? xScale(0) : null;
  const zeroY = yExtent[0] <= 0 && yExtent[1] >= 0 ? yScale(0) : null;
  if (zeroX !== null) {
    gridLines.push(`<line x1="${zeroX}" y1="${margin.top}" x2="${zeroX}" y2="${margin.top + plotHeight}" class="axis-line"></line>`);
  }
  if (zeroY !== null) {
    gridLines.push(`<line x1="${margin.left}" y1="${zeroY}" x2="${margin.left + plotWidth}" y2="${zeroY}" class="axis-line"></line>`);
  }

  const labels = points
    .map((point) => {
      const selected = point.item.country === config.selected;
      const highlight = config.labelCountries.includes(point.item.country) || selected;
      const radius = sizeScale(point.size);
      const x = xScale(point.x);
      const y = yScale(point.y);
      const fill = scatterColor(point.color, colorRange);
      const labelOffset = selected ? 14 : 10;
      return `
        <circle
          cx="${x}"
          cy="${y}"
          r="${radius}"
          fill="${fill}"
          stroke="${selected ? "#ffffff" : "rgba(255,255,255,0.14)"}"
          class="point ${selected ? "is-selected" : ""} ${highlight ? "" : "is-dimmed"}"
          data-country="${escapeXml(point.item.country)}"
          opacity="${selected || highlight ? 0.98 : 0.6}"
        ></circle>
        ${highlight ? `<text x="${x + labelOffset}" y="${y - 10}" class="point-label">${escapeXml(point.item.country)}</text>` : ""}
      `;
    })
    .join("");

  const xLabel = `<text x="${margin.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle" class="axis-label">${escapeXml(
    config.xLabel
  )}</text>`;
  const yLabel = `<text x="20" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${margin.top + plotHeight / 2})" class="axis-label">${escapeXml(
    config.yLabel
  )}</text>`;

  const xTickLabels = xTicks
    .map((tick) => {
      const x = xScale(tick);
      return `<text x="${x}" y="${margin.top + plotHeight + 20}" text-anchor="middle" class="tick-label">${formatAxisNumber(
        tick
      )}</text>`;
    })
    .join("");

  const yTickLabels = yTicks
    .map((tick) => {
      const y = yScale(tick) + 4;
      return `<text x="${margin.left - 12}" y="${y}" text-anchor="end" class="tick-label">${formatAxisNumber(tick)}</text>`;
    })
    .join("");

  svg.innerHTML = `
    ${gridLines.join("")}
    ${xTickLabels}
    ${yTickLabels}
    ${xLabel}
    ${yLabel}
    ${labels}
  `;

  svg.querySelectorAll(".point").forEach((pointNode) => {
    const country = pointNode.getAttribute("data-country");
    const point = points.find((entry) => entry.item.country === country);
    if (!point) {
      return;
    }

    pointNode.addEventListener("mousemove", (event) => {
      showTooltip(event, config.tooltip(point.item));
    });
    pointNode.addEventListener("mouseleave", hideTooltip);
    pointNode.addEventListener("click", () => selectCountry(point.item.country));
  });
}

function drawSparkline(svg, series, options) {
  clearElement(svg);

  const width = 320;
  const height = 48;
  const padding = 4;
  const filtered = series.filter((item) => isFiniteNumber(item.value));

  if (filtered.length < 2) {
    svg.innerHTML = "";
    return;
  }

  const extent = padExtent(filtered.map((item) => item.value), 0.1);
  const xScale = scaleLinear(0, filtered.length - 1, padding, width - padding);
  const yScale = scaleLinear(extent[0], extent[1], height - padding, padding);

  const d = filtered
    .map((item, index) => `${index === 0 ? "M" : "L"} ${xScale(index).toFixed(2)} ${yScale(item.value).toFixed(2)}`)
    .join(" ");

  const area = `${d} L ${xScale(filtered.length - 1).toFixed(2)} ${height - padding} L ${xScale(0).toFixed(2)} ${height - padding} Z`;

  svg.innerHTML = `
    <path d="${area}" fill="${options.fill}" opacity="0.24"></path>
    <path d="${d}" fill="none" stroke="${options.stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
  `;
}

function topCountries(summaries, accessor, count) {
  return [...summaries]
    .sort((a, b) => accessor(b) - accessor(a))
    .slice(0, count)
    .map((item) => item.country);
}

function selectCountry(country) {
  state.selectedCountry = country;
  renderLedger();
  renderCountryChips();
  renderSelectedCountry();
  renderScatters();
}

function createStatCard(label, value, note) {
  const card = document.createElement("article");
  card.className = "stat-card";
  card.innerHTML = `
    <div class="stat-card__label">${escapeHtml(label)}</div>
    <div class="stat-card__value">${escapeHtml(String(value))}</div>
    <div class="stat-card__note">${escapeHtml(note)}</div>
  `;
  return card;
}

function renderLegend() {
  // Intentionally unused; kept as a hook if the charts need a legend later.
}

function padExtent(values, minPadding = 0) {
  const filtered = values.filter(isFiniteNumber);
  let min = Math.min(...filtered);
  let max = Math.max(...filtered);
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    return [0, 1];
  }
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [min - pad, max + pad];
  }
  const pad = Math.max((max - min) * 0.08, minPadding);
  return [min - pad, max + pad];
}

function niceTicks(min, max, count) {
  if (count <= 1 || min === max) {
    return [min];
  }
  const ticks = [];
  const step = (max - min) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    ticks.push(min + step * index);
  }
  return ticks;
}

function scaleLinear(domainStart, domainEnd, rangeStart, rangeEnd) {
  const domainSpan = domainEnd - domainStart || 1;
  const rangeSpan = rangeEnd - rangeStart;
  return (value) => rangeStart + ((value - domainStart) / domainSpan) * rangeSpan;
}

function metricColorRange(values) {
  const filtered = values.filter(isFiniteNumber);
  return {
    min: Math.min(...filtered),
    max: Math.max(...filtered),
  };
}

function scatterColor(value, range) {
  const min = range.min;
  const max = range.max;
  const t = clamp((value - min) / ((max - min) || 1), 0, 1);
  const hue = 190 - 120 * t;
  const lightness = 60 - 8 * Math.abs(t - 0.5);
  return `hsl(${hue}, 78%, ${lightness}%)`;
}

function sparkColor(label) {
  const map = {
    "Employment gap": "#77d7e8",
    "Pay gap": "#ff8d72",
    "Female poverty": "#ff6f91",
    "Average hours": "#d7c16e",
    "Long tenure": "#67e8a6",
  };
  return map[label] || "#77d7e8";
}

function sparkFill(label) {
  const map = {
    "Employment gap": "rgba(119, 215, 232, 1)",
    "Pay gap": "rgba(255, 141, 114, 1)",
    "Female poverty": "rgba(255, 111, 145, 1)",
    "Average hours": "rgba(215, 193, 110, 1)",
    "Long tenure": "rgba(103, 232, 166, 1)",
  };
  return map[label] || "rgba(119, 215, 232, 1)";
}

function describeGap({ metric, value }) {
  if (!isFiniteNumber(value)) {
    return "No data";
  }

  const abs = Math.abs(value);
  switch (metric) {
    case "employment":
      if (value > 0) return `women trail men by ${formatPlainNumber(abs)} pp in employment`;
      if (value < 0) return `women lead men by ${formatPlainNumber(abs)} pp in employment`;
      return "employment is perfectly even";
    case "hours":
      if (value > 0) return `men work ${formatPlainNumber(abs)} h more per week`;
      if (value < 0) return `women work ${formatPlainNumber(abs)} h more per week`;
      return "weekly hours are perfectly even";
    case "poverty":
      if (value > 0) return `women’s in-work poverty is ${formatPlainNumber(abs)} pp higher`;
      if (value < 0) return `men’s in-work poverty is ${formatPlainNumber(abs)} pp higher`;
      return "in-work poverty is even";
    case "pay":
      if (value > 0) return `men earn ${formatPlainNumber(abs)}% more in hourly pay`;
      if (value < 0) return `women earn ${formatPlainNumber(abs)}% more in hourly pay`;
      return "pay is at parity";
    default:
      return "";
  }
}

function describeTenure(summary) {
  const gap = summary.metrics.tenureLongGap;
  const female = summary.metrics.tenureFemaleLong;
  const male = summary.metrics.tenureMaleLong;
  const short = summary.metrics.tenureShortAvg;
  if (Math.abs(gap) < 2) {
    return `Long-tenure shares are almost identical (${formatPercent(female)} vs ${formatPercent(
      male
    )}), while the short-tenure average still sits at ${formatPercent(short)}.`;
  }
  if (gap > 0) {
    return `Men hold a slightly larger share of 60+ month tenure by ${formatPlainNumber(gap)} pp, but the overall split is still much flatter than the access gap.`;
  }
  return `Women hold a slightly larger share of 60+ month tenure by ${formatPlainNumber(Math.abs(gap))} pp, but the overall split is still much flatter than the access gap.`;
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${fmt1.format(value)}%`;
}

function formatHours(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${fmt1.format(value)} h`;
}

function formatSignedPercent(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt1.format(Math.abs(value))}%`;
}

function formatSignedPoints(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt1.format(Math.abs(value))} pp`;
}

function formatSignedHours(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt1.format(Math.abs(value))} h`;
}

function formatSignedNumber(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt2.format(Math.abs(value))}`;
}

function formatPlainNumber(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return fmt1.format(Math.abs(value));
}

function formatAxisNumber(value) {
  if (!isFiniteNumber(value)) return "";
  return fmt1.format(value);
}

function formatInteger(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function median(values) {
  const filtered = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const mid = Math.floor(filtered.length / 2);
  if (filtered.length % 2 === 1) {
    return filtered[mid];
  }
  return (filtered[mid - 1] + filtered[mid]) / 2;
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function getOverallYearSpan(summaries) {
  const years = [];
  for (const item of summaries) {
    for (const key of ["employment", "payGap", "poverty", "hours", "tenure"]) {
      const year = item.metrics.latestYears[key];
      if (isFiniteNumber(year)) {
        years.push(year);
      }
    }
  }
  const min = Math.min(...years);
  const max = Math.max(...years);
  return `${min}–${max}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function clearElement(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showTooltip(event, html) {
  const tooltip = document.getElementById("tooltip");
  tooltip.hidden = false;
  tooltip.innerHTML = html;
  tooltip.style.left = `${Math.min(event.clientX + 16, window.innerWidth - 280)}px`;
  tooltip.style.top = `${Math.min(event.clientY + 16, window.innerHeight - 120)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  tooltip.hidden = true;
}

function buildGlobalContext(raw, summaries) {
  const datasets = raw && raw.meta && raw.meta.datasets ? raw.meta.datasets : {};
  const rowCount = Object.values(datasets).reduce(function (sum, count) {
    return sum + Number(count || 0);
  }, 0);

  const stats = {
    medianEmploymentGap: median(summaries.map(function (item) {
      return item.metrics.employmentGap;
    })),
    medianHoursGap: median(
      summaries.map(function (item) {
        return Math.abs(item.metrics.hoursGap);
      })
    ),
    medianHoursAvg: median(
      summaries.map(function (item) {
        return item.metrics.hoursAvg;
      })
    ),
    medianPayAbs: median(
      summaries.map(function (item) {
        return item.metrics.payAbs;
      })
    ),
    medianFemalePoverty: median(
      summaries.map(function (item) {
        return item.metrics.povertyFemale;
      })
    ),
    medianLongTenure: median(
      summaries.map(function (item) {
        return item.metrics.tenureLongAvg;
      })
    ),
    medianShortTenure: median(
      summaries.map(function (item) {
        return item.metrics.tenureShortAvg;
      })
    ),
  };

  const focusByChapter = {};
  for (const chapter of CHAPTERS) {
    const ranked = [...summaries].sort(function (a, b) {
      return b.scores[chapter.scoreKey] - a.scores[chapter.scoreKey];
    });
    focusByChapter[chapter.id] = {
      focus: ranked[0] || null,
      topCountries: ranked.slice(0, 5),
    };
  }

  return {
    rowCount: rowCount,
    yearSpan: getOverallYearSpan(summaries),
    stats: stats,
    focusByChapter: focusByChapter,
  };
}

function getChapterById(chapterId) {
  return CHAPTERS.find(function (chapter) {
    return chapter.id === chapterId;
  }) || CHAPTERS[0];
}

function getChapterFocus(chapterId) {
  if (!state.context || !state.context.focusByChapter) {
    return { focus: null, topCountries: [] };
  }
  return state.context.focusByChapter[chapterId] || { focus: null, topCountries: [] };
}

function chapterPalette(chapterId) {
  switch (chapterId) {
    case "access":
      return { primary: "#77d7e8", secondary: "#67e8a6", accent: "#9ef0ff" };
    case "pay":
      return { primary: "#ff8d72", secondary: "#f7c948", accent: "#ffc1a6" };
    case "workload":
      return { primary: "#d7c16e", secondary: "#77d7e8", accent: "#f1d988" };
    case "security":
      return { primary: "#67e8a6", secondary: "#ff8d72", accent: "#9af3c1" };
    default:
      return { primary: "#77d7e8", secondary: "#ff8d72", accent: "#77d7e8" };
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value === undefined || value === null ? "" : String(value);
  }
}

function renderPortalPage() {
  document.title = "Labor Rights Story Portal";
  setText("page-title", "Labor Rights Story Portal");
  setText(
    "page-lede",
    "A master summary that turns five datasets into one narrative: who gets into work, who gets paid, how heavy the week feels, and how secure that work really is."
  );
  setText("story-kicker", "");

  renderChapterRail("portal");
  renderPortalStats();
  renderPortalSummary();
  renderChapterCards();
  renderPortalInsights();

  const status = document.getElementById("app-status");
  if (status) {
    status.textContent = "Start with the chapter tiles, then read the story pages in order.";
  }
}

function renderStoryPage(storyId) {
  const chapter = getChapterById(storyId);
  const focusBundle = getChapterFocus(chapter.id);
  const focus = focusBundle.focus || state.summaries[0] || null;

  if (!focus) {
    showFatal("No summary data available for " + chapter.title + ".");
    return;
  }

  document.title = chapter.title + " · Labor Rights Story Portal";
  setText("story-kicker", chapter.kicker);
  setText("page-title", chapter.title);
  setText("page-lede", chapter.summary);

  renderChapterRail(chapter.id);
  renderStoryStats(chapter, focus);
  renderStorySummary(chapter, focus);
  renderStoryNav(chapter);
  renderStoryMainChart(chapter, focus);
  renderStoryTrendChart(chapter, focus);
  renderStorySpotlights(chapter, focusBundle.topCountries || []);
  renderStorySparkCards(focus);

  const status = document.getElementById("app-status");
  if (status) {
    status.textContent = "Focus country: " + focus.country + " · " + state.summaries.length + " shared countries in the set.";
  }
}

function renderChapterRail(activeChapterId) {
  const rail = document.getElementById("chapter-rail");
  if (!rail) {
    return;
  }

  clearElement(rail);

  const items = [
    { id: "portal", title: "Portal", route: "index.html", order: 0 },
  ].concat(CHAPTERS);

  for (const chapter of items) {
    const link = document.createElement("a");
    link.className = "chapter-pill";
    link.href = chapter.route;
    link.dataset.chapter = chapter.id;
    if (chapter.id === activeChapterId) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }

    const orderLabel = chapter.id === "portal" ? "00" : String(chapter.order).padStart(2, "0");
    link.innerHTML =
      '<span class="chapter-pill__index">' +
      escapeHtml(orderLabel) +
      "</span><span class=\"chapter-pill__title\">" +
      escapeHtml(chapter.title) +
      "</span>";
    rail.appendChild(link);
  }
}

function renderPortalStats() {
  const host = document.getElementById("hero-stats");
  if (!host) {
    return;
  }

  clearElement(host);

  const cards = [
    ["Datasets", "5", "Employment, pay, poverty, hours, tenure"],
    ["Shared countries", String(state.summaries.length), "Countries present across all five files"],
    ["Year span", state.context ? state.context.yearSpan : "n/a", "Latest values vary by metric"],
    ["Rows", formatInteger(state.context ? state.context.rowCount : 0), "All source rows in the local bundle"],
  ];

  for (const card of cards) {
    host.appendChild(createStatCard(card[0], card[1], card[2]));
  }
}

function renderStoryStats(chapter, focus) {
  const host = document.getElementById("hero-stats");
  if (!host) {
    return;
  }

  clearElement(host);
  const latestYear = focus.metrics.latestYears[chapter.latestYearKey];

  const cards = [
    ["Focus country", focus.country, "Top ranked for this chapter"],
    ["Latest year", isFiniteNumber(latestYear) ? String(latestYear) : "n/a", chapter.title],
    ["Shared countries", String(state.summaries.length), "Countries available for comparison"],
    ["Rows", formatInteger(state.context ? state.context.rowCount : 0), "All source rows in the local bundle"],
  ];

  for (const card of cards) {
    host.appendChild(createStatCard(card[0], card[1], card[2]));
  }
}

function renderPortalSummary() {
  const host = document.getElementById("story-summary");
  if (!host || !state.context) {
    return;
  }

  const stats = state.context.stats;
  const paragraphs = [
    state.summaries.length +
      " countries are present across all five datasets, so the portal reads the gap between labor-market access and labor-market quality instead of five separate charts.",
    "The median employment gap is " +
      formatSignedPoints(stats.medianEmploymentGap) +
      ", while the median hours gap is only " +
      formatHours(stats.medianHoursGap) +
      ". That makes access the sharper divide.",
    "Pay does not close the story: the median pay gap sits " +
      formatSignedPercent(stats.medianPayAbs) +
      " from parity, but the median female in-work poverty rate still sits at " +
      formatPercent(stats.medianFemalePoverty) +
      ".",
    "Security looks flatter than access, but not harmless. The median long-tenure share is " +
      formatPercent(stats.medianLongTenure) +
      ", while the short-tenure average remains " +
      formatPercent(stats.medianShortTenure) +
      ".",
  ];

  host.innerHTML = paragraphs
    .map(function (paragraph) {
      return "<p>" + escapeHtml(paragraph) + "</p>";
    })
    .join("");
}

function renderPortalInsights() {
  const host = document.getElementById("portal-insights");
  if (!host || !state.context) {
    return;
  }

  clearElement(host);
  const stats = state.context.stats;
  const insights = [
    {
      chapter: getChapterById("access"),
      title: "Access is the sharper divide",
      body:
        "Median employment gap " +
        formatSignedPoints(stats.medianEmploymentGap) +
        " versus median hours gap " +
        formatHours(stats.medianHoursGap) +
        ".",
    },
    {
      chapter: getChapterById("pay"),
      title: "Pay is not the finish line",
      body:
        "Median pay gap " +
        formatSignedPercent(stats.medianPayAbs) +
        " from parity, but median female poverty still sits at " +
        formatPercent(stats.medianFemalePoverty) +
        ".",
    },
    {
      chapter: getChapterById("workload"),
      title: "Workload stays heavy",
      body:
        "Median average hours sit at " +
        formatHours(stats.medianHoursAvg) +
        ", while the median hours gap is only " +
        formatHours(stats.medianHoursGap) +
        ".",
    },
    {
      chapter: getChapterById("security"),
      title: "Security is flatter than access",
      body:
        "Median long-tenure share " +
        formatPercent(stats.medianLongTenure) +
        ", but the short-tenure average still sits at " +
        formatPercent(stats.medianShortTenure) +
        ".",
    },
  ];

  for (const insight of insights) {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.dataset.story = insight.chapter.id;
    card.style.setProperty("--story-accent", chapterPalette(insight.chapter.id).primary);
    card.innerHTML =
      '<div class="insight-card__eyebrow">' +
      escapeHtml(insight.chapter.kicker) +
      "</div><h3>" +
      escapeHtml(insight.title) +
      "</h3><p>" +
      escapeHtml(insight.body) +
      '</p><a class="text-link" href="' +
      escapeHtml(insight.chapter.route) +
      '">Read chapter</a>';
    host.appendChild(card);
  }
}

function renderChapterCards() {
  const host = document.getElementById("chapter-grid");
  if (!host || !state.context) {
    return;
  }

  clearElement(host);
  for (const chapter of CHAPTERS) {
    const focusBundle = getChapterFocus(chapter.id);
    const focus = focusBundle.focus || state.summaries[0];
    const card = document.createElement("article");
    card.className = "story-card";
    card.dataset.story = chapter.id;
    card.style.setProperty("--story-accent", chapterPalette(chapter.id).primary);

    const chips = buildChapterChips(chapter, focus);
    card.innerHTML =
      '<div class="story-card__top"><span class="story-card__index">' +
      escapeHtml(String(chapter.order).padStart(2, "0")) +
      '</span><span class="story-card__kicker">' +
      escapeHtml(chapter.kicker) +
      '</span></div><h3>' +
      escapeHtml(chapter.title) +
      "</h3><p class=\"story-card__summary\">" +
      escapeHtml(chapter.summary) +
      "</p><p class=\"story-card__focus\">Focus country: " +
      escapeHtml(focus.country) +
      "</p><div class=\"chip-row\">" +
      chips
        .map(function (chip) {
          return '<span class="chip">' + escapeHtml(chip) + "</span>";
        })
        .join("") +
      '</div><a class="story-card__link" href="' +
      escapeHtml(chapter.route) +
      '">Open chapter</a>';
    host.appendChild(card);
  }
}

function buildChapterChips(chapter, summary) {
  const metrics = summary.metrics;
  switch (chapter.id) {
    case "access":
      return [
        formatSignedPoints(metrics.employmentGap) + " employment gap",
        formatSignedHours(metrics.hoursGap) + " hours gap",
        formatHours(metrics.hoursAvg) + " avg hours",
      ];
    case "pay":
      return [
        formatSignedPercent(metrics.payGap) + " pay gap",
        formatPercent(metrics.povertyFemale) + " female poverty",
        formatSignedPoints(metrics.povertyGap) + " poverty gap",
      ];
    case "workload":
      return [
        formatHours(metrics.hoursAvg) + " avg hours",
        formatSignedHours(metrics.hoursGap) + " hours gap",
        formatHours(metrics.hoursFemale) + " women",
      ];
    case "security":
      return [
        formatPercent(metrics.tenureLongAvg) + " long tenure",
        formatSignedPoints(metrics.tenureLongGap) + " tenure gap",
        formatPercent(metrics.tenureShortAvg) + " short tenure",
      ];
    default:
      return [];
  }
}

function renderStorySummary(chapter, focus) {
  const host = document.getElementById("story-summary");
  if (!host || !state.context) {
    return;
  }

  host.innerHTML = buildStoryNarrative(chapter, focus)
    .map(function (paragraph) {
      return "<p>" + escapeHtml(paragraph) + "</p>";
    })
    .join("");
}

function buildStoryNarrative(chapter, focus) {
  const stats = state.context.stats;
  const metrics = focus.metrics;

  switch (chapter.id) {
    case "access":
      return [
        focus.country +
          " is the clearest access paradox in the set: " +
          describeGap({ metric: "employment", value: metrics.employmentGap }) +
          ", while " +
          describeGap({ metric: "hours", value: metrics.hoursGap }) +
          ".",
        "Across the shared countries, the median employment gap is " +
          formatSignedPoints(stats.medianEmploymentGap) +
          " and the median hours gap is " +
          formatHours(stats.medianHoursGap) +
          ".",
        "The point is upstream: who gets into work is more unequal than how long work lasts once people are employed.",
      ];
    case "pay":
      return [
        focus.country +
          " combines a pay gap of " +
          formatSignedPercent(metrics.payGap) +
          " with a female in-work poverty rate of " +
          formatPercent(metrics.povertyFemale) +
          ".",
        "Across the shared countries, the median pay gap sits " +
          formatSignedPercent(stats.medianPayAbs) +
          " from parity, but the median female poverty rate still sits at " +
          formatPercent(stats.medianFemalePoverty) +
          ".",
        "That is the illusion: a flatter wage line does not automatically translate into a safer life inside work.",
      ];
    case "workload":
      return [
        focus.country +
          " averages " +
          formatHours(metrics.hoursAvg) +
          " per week, while the hours gap is only " +
          formatSignedHours(metrics.hoursGap) +
          ".",
        "Across the shared countries, the median average week is " +
          formatHours(stats.medianHoursAvg) +
          ", so the strain is often in the baseline rather than the gap.",
        "This chapter is about workload pressure: the week can be heavy even when the difference between women and men looks modest.",
      ];
    case "security":
      return [
        focus.country +
          " has " +
          formatPercent(metrics.tenureFemaleLong) +
          " women and " +
          formatPercent(metrics.tenureMaleLong) +
          " men in 60+ month tenure.",
        "Across the shared countries, the median long-tenure share is " +
          formatPercent(stats.medianLongTenure) +
          ", while the short-tenure average remains " +
          formatPercent(stats.medianShortTenure) +
          ".",
        describeTenure(focus) +
          " That makes security look more balanced than access, but not actually resolved.",
      ];
    default:
      return [chapter.summary];
  }
}

function renderStoryNav(chapter) {
  const top = document.getElementById("story-nav-top");
  const bottom = document.getElementById("story-nav-bottom");
  const index = getChapterIndex(chapter.id);
  const prev = index > 0 ? CHAPTERS[index - 1] : null;
  const next = index < CHAPTERS.length - 1 ? CHAPTERS[index + 1] : null;
  const prevLabel = prev ? "Previous: " + prev.title : "Previous: Portal";
  const nextLabel = next ? "Next: " + next.title : "Next: Portal";

  const navHtml =
    '<a class="nav-pill" href="index.html">Back to portal</a>' +
    '<a class="nav-pill" href="' + escapeHtml((prev || { route: "index.html" }).route) + '">' +
    escapeHtml(prevLabel) +
    '</a><a class="nav-pill nav-pill--next" href="' +
    escapeHtml((next || { route: "index.html" }).route) +
    '">' +
    escapeHtml(nextLabel) +
    "</a>";

  for (const host of [top, bottom]) {
    if (host) {
      host.innerHTML = navHtml;
    }
  }
}

function getChapterIndex(chapterId) {
  for (let index = 0; index < CHAPTERS.length; index += 1) {
    if (CHAPTERS[index].id === chapterId) {
      return index;
    }
  }
  return 0;
}

function renderStoryMainChart(chapter, focus) {
  const titleHost = document.getElementById("main-chart-title");
  const noteHost = document.getElementById("main-chart-note");
  const svg = document.getElementById("main-chart");
  if (!svg) {
    return;
  }

  if (titleHost) {
    titleHost.textContent = chapter.chartTitle;
  }
  if (noteHost) {
    noteHost.textContent = chapter.chartNote;
  }

  if (chapter.id === "security") {
    renderTenurePlot(focus, svg);
    return;
  }

  const palette = chapterPalette(chapter.id);
  const config = getStoryScatterConfig(chapter.id, palette);
  drawScatter(svg, state.summaries, config);
}

function getStoryScatterConfig(chapterId, palette) {
  switch (chapterId) {
    case "access":
      return {
        x: function (item) {
          return item.metrics.employmentGap;
        },
        y: function (item) {
          return item.metrics.hoursGap;
        },
        size: function (item) {
          return item.metrics.hoursAvg;
        },
        color: function (item) {
          return item.metrics.employmentGap;
        },
        xLabel: "Employment gap (men - women, pp)",
        yLabel: "Hours gap (men - women, h)",
        selected: getChapterFocus("access").focus ? getChapterFocus("access").focus.country : null,
        labelCountries: topCountries(state.summaries, function (item) {
          return item.scores.accessMirage;
        }, 5),
        tooltip: function (item) {
          return (
            "<strong>" +
            escapeHtml(item.country) +
            "</strong><div>Employment gap: " +
            escapeHtml(formatSignedPoints(item.metrics.employmentGap)) +
            "</div><div>Hours gap: " +
            escapeHtml(formatSignedHours(item.metrics.hoursGap)) +
            "</div><div>Average hours: " +
            escapeHtml(formatHours(item.metrics.hoursAvg)) +
            "</div>"
          );
        },
      };
    case "pay":
      return {
        x: function (item) {
          return item.metrics.payAbs;
        },
        y: function (item) {
          return item.metrics.povertyFemale;
        },
        size: function (item) {
          return item.metrics.employmentGap;
        },
        color: function (item) {
          return item.metrics.payGap;
        },
        xLabel: "Pay gap from parity (%)",
        yLabel: "Female in-work poverty (%)",
        selected: getChapterFocus("pay").focus ? getChapterFocus("pay").focus.country : null,
        labelCountries: topCountries(state.summaries, function (item) {
          return item.scores.payMirage;
        }, 5),
        tooltip: function (item) {
          return (
            "<strong>" +
            escapeHtml(item.country) +
            "</strong><div>Pay gap: " +
            escapeHtml(formatSignedPercent(item.metrics.payGap)) +
            "</div><div>Female poverty: " +
            escapeHtml(formatPercent(item.metrics.povertyFemale)) +
            "</div><div>Employment gap: " +
            escapeHtml(formatSignedPoints(item.metrics.employmentGap)) +
            "</div>"
          );
        },
      };
    case "workload":
      return {
        x: function (item) {
          return item.metrics.hoursAvg;
        },
        y: function (item) {
          return item.metrics.hoursGap;
        },
        size: function (item) {
          return item.metrics.employmentGap;
        },
        color: function (item) {
          return item.metrics.hoursAvg;
        },
        xLabel: "Average weekly hours",
        yLabel: "Hours gap (men - women, h)",
        selected: getChapterFocus("workload").focus ? getChapterFocus("workload").focus.country : null,
        labelCountries: topCountries(state.summaries, function (item) {
          return item.scores.workloadMirage;
        }, 5),
        tooltip: function (item) {
          return (
            "<strong>" +
            escapeHtml(item.country) +
            "</strong><div>Average hours: " +
            escapeHtml(formatHours(item.metrics.hoursAvg)) +
            "</div><div>Hours gap: " +
            escapeHtml(formatSignedHours(item.metrics.hoursGap)) +
            "</div><div>Employment gap: " +
            escapeHtml(formatSignedPoints(item.metrics.employmentGap)) +
            "</div>"
          );
        },
      };
    default:
      return {
        x: function (item) {
          return item.metrics.hoursAvg;
        },
        y: function (item) {
          return item.metrics.hoursGap;
        },
        size: function (item) {
          return item.metrics.tenureLongAvg;
        },
        color: function (item) {
          return item.metrics.tenureLongAvg;
        },
        xLabel: "Average weekly hours",
        yLabel: "Hours gap (men - women, h)",
        selected: getChapterFocus("security").focus ? getChapterFocus("security").focus.country : null,
        labelCountries: topCountries(state.summaries, function (item) {
          return item.scores.securityMirage;
        }, 5),
        tooltip: function (item) {
          return (
            "<strong>" +
            escapeHtml(item.country) +
            "</strong><div>Long-tenure share: " +
            escapeHtml(formatPercent(item.metrics.tenureLongAvg)) +
            "</div><div>Short-tenure average: " +
            escapeHtml(formatPercent(item.metrics.tenureShortAvg)) +
            "</div><div>Hours gap: " +
            escapeHtml(formatSignedHours(item.metrics.hoursGap)) +
            "</div>"
          );
        },
      };
  }
}

function renderStoryTrendChart(chapter, focus) {
  const titleHost = document.getElementById("trend-chart-title");
  const noteHost = document.getElementById("trend-chart-note");
  const svg = document.getElementById("trend-chart");
  if (!svg) {
    return;
  }

  if (titleHost) {
    titleHost.textContent = chapter.trendTitle;
  }
  if (noteHost) {
    noteHost.textContent = chapter.id === "security" ? "Long-tenure share over time, split by sex." : "The same chapter, tracked across years.";
  }

  drawTrendChart(svg, buildTrendSeries(chapter, focus), {
    chapterId: chapter.id,
  });
}

function buildTrendSeries(chapter, focus) {
  const palette = chapterPalette(chapter.id);

  switch (chapter.id) {
    case "access":
      return [
        {
          label: "Employment gap",
          color: palette.primary,
          points: focus.employment.series.map(function (row) {
            return { year: row.year, value: row.gap };
          }),
        },
      ];
    case "pay":
      return [
        {
          label: "Pay gap",
          color: palette.primary,
          points: focus.payGap.series.map(function (row) {
            return { year: row.year, value: row.value };
          }),
        },
      ];
    case "workload":
      return [
        {
          label: "Women",
          color: palette.primary,
          points: focus.hours.series.map(function (row) {
            return { year: row.year, value: row.female };
          }),
        },
        {
          label: "Men",
          color: palette.secondary,
          points: focus.hours.series.map(function (row) {
            return { year: row.year, value: row.male };
          }),
        },
      ];
    default:
      return [
        {
          label: "Women",
          color: palette.primary,
          points: focus.tenure.series.map(function (row) {
            return { year: row.year, value: row.femaleLong };
          }),
        },
        {
          label: "Men",
          color: palette.secondary,
          points: focus.tenure.series.map(function (row) {
            return { year: row.year, value: row.maleLong };
          }),
        },
      ];
  }
}

function renderStorySpotlights(chapter, topCountrySummaries) {
  const host = document.getElementById("spotlight-list");
  if (!host) {
    return;
  }

  clearElement(host);
  const topItems = topCountrySummaries && topCountrySummaries.length ? topCountrySummaries : [];
  for (let index = 0; index < topItems.length; index += 1) {
    const item = topItems[index];
    const card = document.createElement("article");
    card.className = "rank-card";
    card.dataset.story = chapter.id;
    card.style.setProperty("--story-accent", chapterPalette(chapter.id).primary);
    card.innerHTML =
      '<div class="rank-card__top"><span class="rank-card__index">' +
      escapeHtml(String(index + 1).padStart(2, "0")) +
      '</span><h3>' +
      escapeHtml(item.country) +
      "</h3></div><p class=\"rank-card__copy\">" +
      escapeHtml(buildSpotlightCopy(chapter, item)) +
      "</p><div class=\"chip-row\">" +
      buildChapterChips(chapter, item)
        .map(function (chip) {
          return '<span class="chip">' + escapeHtml(chip) + "</span>";
        })
        .join("") +
      "</div>";
    host.appendChild(card);
  }
}

function buildSpotlightCopy(chapter, summary) {
  const metrics = summary.metrics;
  switch (chapter.id) {
    case "access":
      return (
        "Employment gap " +
        formatSignedPoints(metrics.employmentGap) +
        " and hours gap " +
        formatSignedHours(metrics.hoursGap) +
        "."
      );
    case "pay":
      return (
        "Pay gap " +
        formatSignedPercent(metrics.payGap) +
        " and female poverty " +
        formatPercent(metrics.povertyFemale) +
        "."
      );
    case "workload":
      return "Average hours " + formatHours(metrics.hoursAvg) + " with a " + formatSignedHours(metrics.hoursGap) + " gap.";
    default:
      return (
        "Long-tenure share " +
        formatPercent(metrics.tenureLongAvg) +
        " with a short-tenure average of " +
        formatPercent(metrics.tenureShortAvg) +
        "."
      );
  }
}

function renderStorySparkCards(summary) {
  const host = document.getElementById("sparkline-grid");
  if (!host) {
    return;
  }

  clearElement(host);
  for (const node of buildSparkCards(summary)) {
    host.appendChild(node);
  }
}

function drawTrendChart(svg, seriesDefs, options) {
  clearElement(svg);

  const width = 760;
  const height = 320;
  const margin = { top: 28, right: 26, bottom: 50, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const points = [];
  for (const seriesDef of seriesDefs) {
    const filtered = (seriesDef.points || []).filter(function (point) {
      return isFiniteNumber(point.year) && isFiniteNumber(point.value);
    });
    if (filtered.length) {
      points.push.apply(
        points,
        filtered.map(function (point) {
          return {
            year: point.year,
            value: point.value,
            label: seriesDef.label,
            color: seriesDef.color,
            points: filtered,
          };
        })
      );
    }
  }

  if (!points.length) {
    svg.innerHTML = '<text x="20" y="40" class="axis-label">No trend data available.</text>';
    return;
  }

  const xExtent = padExtent(
    points.map(function (point) {
      return point.year;
    }),
    0.5
  );
  const yExtent = padExtent(
    points.map(function (point) {
      return point.value;
    }),
    0.1
  );
  const xScale = scaleLinear(xExtent[0], xExtent[1], margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(yExtent[0], yExtent[1], margin.top + plotHeight, margin.top);

  const xTicks = niceTicks(xExtent[0], xExtent[1], 5);
  const yTicks = niceTicks(yExtent[0], yExtent[1], 5);

  const gridLines = [];
  for (const tick of xTicks) {
    const x = xScale(tick);
    gridLines.push('<line x1="' + x + '" y1="' + margin.top + '" x2="' + x + '" y2="' + (margin.top + plotHeight) + '" class="grid-line"></line>');
  }
  for (const tick of yTicks) {
    const y = yScale(tick);
    gridLines.push('<line x1="' + margin.left + '" y1="' + y + '" x2="' + (margin.left + plotWidth) + '" y2="' + y + '" class="grid-line"></line>');
  }

  const legend = seriesDefs
    .map(function (seriesDef, index) {
      return (
        '<g transform="translate(' +
        (20 + index * 160) +
        ', 12)"><circle cx="6" cy="6" r="5" fill="' +
        seriesDef.color +
        '"></circle><text x="18" y="10" class="tick-label">' +
        escapeXml(seriesDef.label) +
        "</text></g>"
      );
    })
    .join("");

  const paths = seriesDefs
    .map(function (seriesDef) {
      const filtered = (seriesDef.points || []).filter(function (point) {
        return isFiniteNumber(point.year) && isFiniteNumber(point.value);
      });
      if (filtered.length < 2) {
        return "";
      }

      const d = filtered
        .map(function (point, index) {
          return (
            (index === 0 ? "M" : "L") +
            " " +
            xScale(point.year).toFixed(2) +
            " " +
            yScale(point.value).toFixed(2)
          );
        })
        .join(" ");

      const lastPoint = filtered[filtered.length - 1];
      const lastX = xScale(lastPoint.year);
      const lastY = yScale(lastPoint.value);

      return (
        '<path d="' +
        d +
        '" fill="none" stroke="' +
        seriesDef.color +
        '" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<circle cx="' +
        lastX +
        '" cy="' +
        lastY +
        '" r="3.8" fill="' +
        seriesDef.color +
        '"></circle>' +
        '<text x="' +
        (lastX + 8) +
        '" y="' +
        (lastY - 8) +
        '" class="tick-label" fill="' +
        seriesDef.color +
        '">' +
        escapeXml(formatAxisNumber(lastPoint.value)) +
        "</text>"
      );
    })
    .join("");

  const xLabels = xTicks
    .map(function (tick) {
      const x = xScale(tick);
      return '<text x="' + x + '" y="' + (margin.top + plotHeight + 20) + '" text-anchor="middle" class="tick-label">' + escapeXml(String(Math.round(tick))) + "</text>";
    })
    .join("");

  const yLabels = yTicks
    .map(function (tick) {
      const y = yScale(tick) + 4;
      return '<text x="' + (margin.left - 12) + '" y="' + y + '" text-anchor="end" class="tick-label">' + escapeXml(formatAxisNumber(tick)) + "</text>";
    })
    .join("");

  svg.innerHTML =
    '<text x="20" y="18" class="mini-head">' +
    escapeXml(options && options.chapterId ? getChapterById(options.chapterId).trendTitle : "Trend") +
    '</text><g class="chart-legend">' +
    legend +
    '</g>' +
    gridLines.join("") +
    xLabels +
    yLabels +
    paths +
    '<text x="' +
    margin.left +
    '" y="' +
    (height - 12) +
    '" class="axis-label">Year</text>' +
    '<text x="18" y="' +
    (margin.top + plotHeight / 2) +
    '" class="axis-label" transform="rotate(-90 18 ' +
    (margin.top + plotHeight / 2) +
    ')">Value</text>';
}
