(() => {
  const scatterSvg = d3.select('#stateScatter');
  if (scatterSvg.empty()) return;

  const scatterNode = scatterSvg.node();
  const mapSvg = d3.select('#usStateMap');
  const relationshipSelect = document.getElementById('relationshipSelect');
  const mapMetricSelect = document.getElementById('mapMetricSelect');
  const stateSelect = document.getElementById('stateSelect');
  const tooltip = d3.select('body').append('div').attr('class', 'state-tooltip').attr('role', 'status');
  const stateRows = new Map();
  let rows = [];
  let features = [];
  let selectedState = '';

  const measures = {
    PhysicalActivity2023: { label: 'Meets aerobic activity guideline', year: '2023', unit: '%', source: 'CDC BRFSS' },
    PhysicalInactivity2022: { label: 'No leisure-time physical activity', year: '2022', unit: '%', source: 'CDC BRFSS' },
    Smoking2022: { label: 'Current smoking', year: '2022', unit: '%', source: 'CDC BRFSS' },
    CvdMortality2022: { label: 'Heart-disease mortality', year: '2022', unit: ' deaths per 100,000', source: 'CDC NCHS, age-adjusted 3-year average' }
  };

  const relationships = {
    activitySmoking: {
      xKey: 'PhysicalActivity2023', yKey: 'Smoking2023',
      xLabel: 'Adults meeting aerobic activity guidelines (2023, %)', yLabel: 'Current smokers (2023, %)',
      missingLabel: '2023 activity/smoking comparison'
    },
    inactivitySmoking: {
      xKey: 'PhysicalInactivity2022', yKey: 'Smoking2022',
      xLabel: 'Adults with no leisure-time physical activity (2022, %)', yLabel: 'Current smokers (2022, %)',
      missingLabel: '2022 inactivity/smoking comparison'
    },
    activityCvd: {
      xKey: 'PhysicalActivity2023', yKey: 'CvdMortality2022',
      xLabel: 'Adults meeting aerobic activity guidelines (2023, %)', yLabel: 'Heart-disease mortality (2021–2023 age-adjusted average, per 100,000)',
      missingLabel: 'activity/mortality comparison'
    }
  };

  function keyName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function numeric(value) {
    return value === '' || value === null || value === undefined ? NaN : Number(value);
  }

  function formatValue(value, unit) {
    return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : 'Not available';
  }

  function readRows(csvRows) {
    rows = csvRows.map((row) => ({
      State: row.State,
      Abbreviation: row.Abbreviation,
      PhysicalActivity2023: numeric(row.PhysicalActivity2023),
      PhysicalInactivity2022: numeric(row.PhysicalInactivity2022),
      Smoking2022: numeric(row.Smoking2022),
      Smoking2023: numeric(row.Smoking2023),
      CvdMortality2022: numeric(row.CvdMortality2022),
      CvdRateType: row.CvdRateType
    }));
    rows.forEach((row) => stateRows.set(keyName(row.State), row));
  }

  function selectedRows(config) {
    return rows.filter((row) => Number.isFinite(row[config.xKey]) && Number.isFinite(row[config.yKey]));
  }

  function fitLine(data, xKey, yKey) {
    if (data.length < 2) return null;
    const meanX = d3.mean(data, (row) => row[xKey]);
    const meanY = d3.mean(data, (row) => row[yKey]);
    const sxx = d3.sum(data, (row) => (row[xKey] - meanX) ** 2);
    const syy = d3.sum(data, (row) => (row[yKey] - meanY) ** 2);
    const sxy = d3.sum(data, (row) => (row[xKey] - meanX) * (row[yKey] - meanY));
    if (!sxx || !syy) return null;
    const slope = sxy / sxx;
    return { slope, intercept: meanY - slope * meanX, r: sxy / Math.sqrt(sxx * syy) };
  }

  function showTooltip(event, lines) {
    tooltip.selectAll('*').remove();
    tooltip.append('strong').text(lines[0]);
    lines.slice(1).forEach((line) => tooltip.append('div').text(line));
    tooltip.style('display', 'block')
      .style('left', `${Math.min(event.clientX + 14, window.innerWidth - 300)}px`)
      .style('top', `${Math.min(event.clientY + 14, window.innerHeight - 130)}px`);
  }

  function hideTooltip() {
    tooltip.style('display', 'none');
  }

  function selectState(abbreviation) {
    selectedState = abbreviation;
    stateSelect.value = abbreviation;
    renderScatter();
    renderMap();
    renderStateDetails();
  }

  function renderScatter() {
    const config = relationships[relationshipSelect.value];
    const data = selectedRows(config);
    const model = fitLine(data, config.xKey, config.yKey);
    const missing = 51 - data.length;
    document.getElementById('relationshipSummary').textContent = `${config.xLabel} compared with ${config.yLabel}.`;
    document.getElementById('stateN').textContent = `${data.length} / 51`;
    document.getElementById('stateR').textContent = model ? model.r.toFixed(3) : 'Not available';
    document.getElementById('stateR2').textContent = model ? (model.r ** 2).toFixed(3) : 'Not available';
    document.getElementById('scatterCoverageNote').textContent = missing
      ? `${missing} jurisdictions do not have both values for this comparison and are omitted from the scatterplot.`
      : 'All 50 states and Washington, D.C. have values for this comparison.';

    scatterSvg.selectAll('*').remove();
    if (!data.length) return;

    const width = 900;
    const height = 520;
    const margin = { top: 24, right: 24, bottom: 76, left: 88 };
    const xExtent = d3.extent(data, (row) => row[config.xKey]);
    const yExtent = d3.extent(data, (row) => row[config.yKey]);
    const xPad = Math.max((xExtent[1] - xExtent[0]) * 0.08, 1);
    const yPad = Math.max((yExtent[1] - yExtent[0]) * 0.08, 1);
    const x = d3.scaleLinear().domain([xExtent[0] - xPad, xExtent[1] + xPad]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([Math.min(0, yExtent[0] - yPad), yExtent[1] + yPad]).nice().range([height - margin.bottom, margin.top]);
    const xAxis = d3.axisBottom(x).ticks(7).tickFormat((value) => `${value}%`);
    const yAxis = d3.axisLeft(y).ticks(6).tickFormat((value) => config.yKey === 'CvdMortality2022' ? value : `${value}%`);

    scatterSvg.append('g').attr('class', 'state-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(xAxis);
    scatterSvg.append('g').attr('class', 'state-axis').attr('transform', `translate(${margin.left},0)`).call(yAxis);
    scatterSvg.append('g').attr('class', 'state-grid')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(''));

    scatterSvg.append('text').attr('class', 'state-axis-title')
      .attr('x', (margin.left + width - margin.right) / 2).attr('y', height - 20).attr('text-anchor', 'middle').text(config.xLabel);
    scatterSvg.append('text').attr('class', 'state-axis-title')
      .attr('transform', 'rotate(-90)').attr('x', -(margin.top + height - margin.bottom) / 2).attr('y', 24).attr('text-anchor', 'middle').text(config.yLabel);

    if (model) {
      const x1 = xExtent[0];
      const x2 = xExtent[1];
      scatterSvg.append('line').attr('class', 'state-trendline')
        .attr('x1', x(x1)).attr('x2', x(x2))
        .attr('y1', y(model.intercept + model.slope * x1)).attr('y2', y(model.intercept + model.slope * x2));
    }

    scatterSvg.selectAll('.state-point').data(data, (row) => row.Abbreviation).join('circle')
      .attr('class', (row) => `state-point${row.Abbreviation === selectedState ? ' selected' : ''}`)
      .attr('cx', (row) => x(row[config.xKey])).attr('cy', (row) => y(row[config.yKey]))
      .attr('r', (row) => row.Abbreviation === selectedState ? 7 : 5.2)
      .attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (row) => `${row.State}: ${config.xLabel} ${formatValue(row[config.xKey], '%')}; ${config.yLabel} ${formatValue(row[config.yKey], config.yKey === 'CvdMortality2022' ? ' per 100,000' : '%')}`)
      .on('pointerenter focus', (event, row) => showTooltip(event, [row.State, `${config.xLabel}: ${formatValue(row[config.xKey], '%')}`, `${config.yLabel}: ${formatValue(row[config.yKey], config.yKey === 'CvdMortality2022' ? ' per 100,000' : '%')}`, 'Click to highlight']))
      .on('pointermove', (event) => tooltip.style('left', `${Math.min(event.clientX + 14, window.innerWidth - 300)}px`).style('top', `${Math.min(event.clientY + 14, window.innerHeight - 130)}px`))
      .on('pointerleave blur', hideTooltip)
      .on('click keydown', (event, row) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        selectState(row.Abbreviation);
      });
  }

  function renderLegend(scale, domain, unit) {
    const legend = d3.select('#mapLegend');
    legend.selectAll('*').remove();
    const colors = scale.range();
    const bandWidth = (domain[1] - domain[0]) / colors.length;
    colors.forEach((color, index) => {
      const start = domain[0] + bandWidth * index;
      const end = index === colors.length - 1 ? domain[1] : start + bandWidth;
      const item = legend.append('span').attr('class', 'state-map-legend-item');
      item.append('i').style('background-color', color);
      item.append('span').text(`${start.toFixed(0)}–${end.toFixed(0)}${unit}`);
    });
    const missing = legend.append('span').attr('class', 'state-map-legend-item');
    missing.append('i').attr('class', 'state-map-missing-swatch');
    missing.append('span').text('No estimate');
  }

  function mapTooltipLines(row, key) {
    const measure = measures[key];
    return [row.State, `${measure.label} (${measure.year}): ${formatValue(row[key], measure.unit)}`];
  }

  function renderMap() {
    const key = mapMetricSelect.value;
    const measure = measures[key];
    const dataValues = rows.map((row) => row[key]).filter(Number.isFinite);
    mapSvg.selectAll('*').remove();
    if (!features.length || !dataValues.length) return;

    const domain = d3.extent(dataValues);
    if (domain[0] === domain[1]) domain[1] = domain[0] + 1;
    const colors = d3.quantize(d3.interpolateYlGnBu, 6);
    const color = d3.scaleQuantize().domain(domain).range(colors);
    const collection = { type: 'FeatureCollection', features };
    const projection = d3.geoAlbersUsa().fitSize([950, 590], collection);
    const path = d3.geoPath(projection);
    const stateMap = new Map(rows.map((row) => [keyName(row.State), row]));

    mapSvg.selectAll('.state-shape').data(features, (feature) => feature.properties.name).join('path')
      .attr('class', (feature) => {
        const row = stateMap.get(keyName(feature.properties.name));
        return `state-shape${row && row.Abbreviation === selectedState ? ' selected' : ''}`;
      })
      .attr('d', path)
      .attr('fill', (feature) => {
        const row = stateMap.get(keyName(feature.properties.name));
        return row && Number.isFinite(row[key]) ? color(row[key]) : '#d9dee5';
      })
      .attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (feature) => {
        const row = stateMap.get(keyName(feature.properties.name));
        return row ? `${row.State}: ${formatValue(row[key], measure.unit)}` : feature.properties.name;
      })
      .on('pointerenter focus', (event, feature) => {
        const row = stateMap.get(keyName(feature.properties.name));
        if (row) showTooltip(event, mapTooltipLines(row, key));
      })
      .on('pointermove', (event) => tooltip.style('left', `${Math.min(event.clientX + 14, window.innerWidth - 300)}px`).style('top', `${Math.min(event.clientY + 14, window.innerHeight - 100)}px`))
      .on('pointerleave blur', hideTooltip)
      .on('click keydown', (event, feature) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        const row = stateMap.get(keyName(feature.properties.name));
        if (row) selectState(row.Abbreviation);
      });

    renderLegend(color, domain, measure.unit);
    const missingStates = rows.filter((row) => !Number.isFinite(row[key])).map((row) => row.State);
    document.getElementById('mapCoverageNote').textContent = missingStates.length
      ? `No ${measure.year} estimate is available for ${missingStates.join(' and ')}.`
      : `All 50 states and Washington, D.C. have ${measure.year} estimates.`;
  }

  function renderStateDetails() {
    const selected = rows.find((row) => row.Abbreviation === selectedState);
    const heading = document.getElementById('state-detail-heading');
    const details = d3.select('#stateDetails');
    details.selectAll('*').remove();
    if (!selected) {
      heading.textContent = 'Select a state';
      details.append('div').attr('class', 'state-detail-empty').text('Choose a state on the map or from the selector to see its values.');
      return;
    }
    heading.textContent = selected.State;
    const values = [
      ['Meets aerobic activity guideline (2023)', selected.PhysicalActivity2023, '%'],
      ['No leisure-time activity (2022)', selected.PhysicalInactivity2022, '%'],
      ['Current smoking (2022)', selected.Smoking2022, '%'],
      ['Heart-disease mortality (2021–2023 avg.)', selected.CvdMortality2022, ' per 100,000']
    ];
    values.forEach(([label, value, unit]) => {
      const item = details.append('div').attr('class', 'state-detail-item');
      item.append('dt').text(label);
      item.append('dd').text(formatValue(value, unit));
    });
  }

  function populateStates() {
    rows.slice().sort((a, b) => a.State.localeCompare(b.State)).forEach((row) => {
      const option = document.createElement('option');
      option.value = row.Abbreviation;
      option.textContent = row.State;
      stateSelect.appendChild(option);
    });
  }

  relationshipSelect.addEventListener('change', renderScatter);
  mapMetricSelect.addEventListener('change', renderMap);
  stateSelect.addEventListener('change', () => {
    selectedState = stateSelect.value;
    renderScatter();
    renderMap();
    renderStateDetails();
  });

  Promise.all([d3.csv('data/us_state_health_data.csv'), d3.json('data/us-states-geojson.json')])
    .then(([csvRows, geojson]) => {
      readRows(csvRows);
      features = geojson.features.filter((feature) => stateRows.has(keyName(feature.properties.name)));
      populateStates();
      renderScatter();
      renderMap();
      renderStateDetails();
    })
    .catch((error) => {
      console.error('State visualization data could not be loaded:', error);
      scatterSvg.append('text').attr('x', 450).attr('y', 250).attr('text-anchor', 'middle').text('State data failed to load.');
    });
})();
