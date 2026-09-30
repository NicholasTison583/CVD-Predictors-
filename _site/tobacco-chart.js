(() => {
  const svg = document.getElementById('cvdScatter');
  if (!svg) return;

  const yearSelect = document.getElementById('yearSelect');
  const predictorSelect = document.getElementById('predictorSelect');
  const regionSelect = document.getElementById('regionSelect');
  const countrySelect = document.getElementById('countrySelect');
  const tooltip = document.getElementById('scatterTooltip');
  const statN = document.getElementById('statN');
  const statR = document.getElementById('statR');
  const statR2 = document.getElementById('statR2');
  const statEquation = document.getElementById('statEquation');
  const regionColors = {
    Africa: '#1d4e89',
    Americas: '#2a9d8f',
    'Eastern Mediterranean': '#e76f51',
    Europe: '#f4a261',
    'South-East Asia': '#6a4c93',
    'Western Pacific': '#168aad'
  };
  const predictorConfig = {
    Tobacco: { label: 'Tobacco use (%)', method: 'TobaccoMethod' },
    PhysicalInactivity: { label: 'Physical inactivity (%)', method: 'PhysicalInactivityMethod' }
  };
  let data = [];

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted && character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (!quoted && character === ',') {
        row.push(field);
        field = '';
      } else if (!quoted && character === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }

    const header = rows.shift() || [];
    return rows.filter((values) => values.length === header.length).map((values) => {
      const record = Object.fromEntries(header.map((key, index) => [key.trim(), values[index]?.trim()]));
      const numeric = (value) => value === '' || value === undefined ? NaN : Number(value);
      return {
        Country: record.Country,
        Year: Number(record.Year),
        Region: record.WHORegion,
        Tobacco: numeric(record.Tobacco),
        PhysicalInactivity: numeric(record.PhysicalInactivity),
        CVDMortality: Number(record.CVDMortality),
        TobaccoMethod: record.TobaccoMethod,
        PhysicalInactivityMethod: record.PhysicalInactivityMethod
      };
    });
  }

  function populate(select, values, defaultValue) {
    select.replaceChildren();
    for (const value of [defaultValue, ...values]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = defaultValue;
  }

  function updateControls() {
    populate(yearSelect, [...new Set(data.map((row) => row.Year))].sort((a, b) => a - b).map(String), 'All years');
    populate(regionSelect, [...new Set(data.map((row) => row.Region))].sort(), 'All WHO regions');
    populate(countrySelect, [...new Set(data.map((row) => row.Country))].sort(), 'All countries');
  }

  function filteredRows(predictor) {
    return data.filter((row) =>
      (yearSelect.value === 'All years' || row.Year === Number(yearSelect.value)) &&
      (regionSelect.value === 'All WHO regions' || row.Region === regionSelect.value) &&
      (countrySelect.value === 'All countries' || row.Country === countrySelect.value) &&
      Number.isFinite(row[predictor]) && Number.isFinite(row.CVDMortality)
    );
  }

  function regression(rows, predictor) {
    if (rows.length < 2) return null;
    const meanX = rows.reduce((sum, row) => sum + row[predictor], 0) / rows.length;
    const meanY = rows.reduce((sum, row) => sum + row.CVDMortality, 0) / rows.length;
    const sxx = rows.reduce((sum, row) => sum + (row[predictor] - meanX) ** 2, 0);
    const syy = rows.reduce((sum, row) => sum + (row.CVDMortality - meanY) ** 2, 0);
    const sxy = rows.reduce((sum, row) => sum + (row[predictor] - meanX) * (row.CVDMortality - meanY), 0);
    if (!sxx || !syy) return null;
    const slope = sxy / sxx;
    return { slope, intercept: meanY - slope * meanX, r: sxy / Math.sqrt(sxx * syy) };
  }

  function render() {
    const predictor = predictorSelect.value;
    const predictorLabel = predictorConfig[predictor].label;
    const rows = filteredRows(predictor);
    const model = regression(rows, predictor);
    statN.textContent = rows.length.toLocaleString();
    statR.textContent = model ? model.r.toFixed(3) : '-';
    statR2.textContent = model ? (model.r ** 2).toFixed(3) : '-';
    statEquation.textContent = model ? `CVD = ${model.intercept.toFixed(2)} + ${model.slope.toFixed(2)}x` : '-';
    svg.replaceChildren();
    if (!rows.length) return;

    const width = 900;
    const height = 500;
    const margin = { top: 20, right: 25, bottom: 60, left: 75 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xMin = Math.min(...rows.map((row) => row[predictor]));
    const xMax = Math.max(...rows.map((row) => row[predictor]));
    const predicted = model ? [model.intercept + model.slope * xMin, model.intercept + model.slope * xMax] : [];
    const yMin = Math.min(0, ...predicted);
    const yMax = Math.max(...rows.map((row) => row.CVDMortality), ...predicted, 1) * 1.08;
    const xScale = (value) => margin.left + ((value - xMin) / Math.max(xMax - xMin, 1e-6)) * plotWidth;
    const yScale = (value) => height - margin.bottom - ((value - yMin) / Math.max(yMax - yMin, 1e-6)) * plotHeight;
    const make = (tag, attributes = {}) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      svg.appendChild(element);
      return element;
    };

    make('line', { class: 'scatter-axis', x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom });
    make('line', { class: 'scatter-axis', x1: margin.left, x2: margin.left, y1: margin.top, y2: height - margin.bottom });
    for (let tick = 0; tick <= 5; tick += 1) {
      const y = yMin + ((yMax - yMin) / 5) * tick;
      make('line', { class: 'scatter-grid', x1: margin.left, x2: width - margin.right, y1: yScale(y), y2: yScale(y) });
      const label = make('text', { class: 'scatter-label', x: margin.left - 12, y: yScale(y) + 4, 'text-anchor': 'end' });
      label.textContent = String(Math.round(y));
      const x = xMin + ((xMax - xMin) / 5) * tick;
      make('line', { class: 'scatter-grid', x1: xScale(x), x2: xScale(x), y1: margin.top, y2: height - margin.bottom });
      const xLabel = make('text', { class: 'scatter-label', x: xScale(x), y: height - margin.bottom + 20, 'text-anchor': 'middle' });
      xLabel.textContent = x.toFixed(0);
    }

    const xTitle = make('text', { class: 'scatter-label', x: width / 2, y: height - 10, 'text-anchor': 'middle' });
    xTitle.textContent = predictorLabel;
    const yTitle = make('text', { class: 'scatter-label', x: -height / 2, y: 18, 'text-anchor': 'middle', transform: 'rotate(-90)' });
    yTitle.textContent = 'CVD mortality rate (per 100,000)';

    if (model) make('line', {
      class: 'scatter-trendline',
      x1: xScale(xMin), x2: xScale(xMax),
      y1: yScale(model.intercept + model.slope * xMin),
      y2: yScale(model.intercept + model.slope * xMax)
    });

    for (const row of rows) {
      const dot = make('circle', {
        class: 'scatter-dot', cx: xScale(row[predictor]), cy: yScale(row.CVDMortality), r: 4.8,
        fill: regionColors[row.Region] || '#3d8ad6', tabindex: '0',
        'aria-label': `${row.Country}, ${row.Year}: ${predictorLabel} ${row[predictor].toFixed(2)}; CVD mortality ${row.CVDMortality.toFixed(1)} per 100,000; ${row[predictorConfig[predictor].method]}`
      });
      const showTooltip = (event) => {
        const value = row[predictor];
        const method = row[predictorConfig[predictor].method];
        tooltip.innerHTML = `<strong>${row.Country}</strong>${row.Region}<br>Year: ${row.Year}<br>${predictorLabel}: ${value.toFixed(2)}%<br>CVD mortality: ${row.CVDMortality.toFixed(1)} per 100,000<br>Data: ${method}`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${(event.clientX ?? 0) + 14}px`;
        tooltip.style.top = `${(event.clientY ?? 0) + 14}px`;
      };
      dot.addEventListener('mousemove', showTooltip);
      dot.addEventListener('focus', showTooltip);
      dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      dot.addEventListener('blur', () => { tooltip.style.display = 'none'; });
    }
  }

  [predictorSelect, yearSelect, regionSelect, countrySelect].forEach((select) => select.addEventListener('change', render));
  fetch('data/cvd_country_year_data.csv')
    .then((response) => response.text())
    .then((text) => { data = parseCSV(text); updateControls(); render(); })
    .catch((error) => {
      console.error('Tobacco graph data could not be loaded:', error);
      svg.innerHTML = '<text x="450" y="250" text-anchor="middle">Data failed to load.</text>';
    });
})();
