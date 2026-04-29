const slider = document.getElementById("subsidySlider");

slider.addEventListener("input", () => {
  const increase = slider.value;

  const updated = sampleData.map(d =>
    d.subsidy * (1 + increase / 100)
  );

  new Chart(document.getElementById('simulationChart'), {
    type: 'bar',
    data: {
      labels: sampleData.map(d => d.zip),
      datasets: [{
        label: 'Adjusted Subsidy',
        data: updated
      }]
    }
  });
});