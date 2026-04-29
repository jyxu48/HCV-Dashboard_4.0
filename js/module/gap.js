function renderGapChart() {

  const gaps = sampleData.map(d => d.rent - d.subsidy);

  new Chart(document.getElementById('gapChart'), {
    type: 'bar',
    data: {
      labels: sampleData.map(d => d.zip),
      datasets: [{
        label: 'Affordability Gap',
        data: gaps
      }]
    }
  });
}

renderGapChart();