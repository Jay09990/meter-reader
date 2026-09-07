async function simulate() {
  const payload = {
    deviceSerialNo: "DEMO-1805",
    meterSerialNo: "DM-1805",
    readingDate: "2026-09-07",
    volume: {
      correctedVb: 939780.67,    // Delta = +500.00 Sm³
      uncorrectedVm: 925691.96,  // Delta = +500.50 m³ (divergence = 0.50 >= 0.1)
    },
    pressure: {
      value: 2.55,
      max: 2.65,
      min: 2.45,
    },
    temperature: {
      value: 31.0,
      max: 33.0,
      min: 29.0,
    },
    batteryLevel: 92,
    currentFlowRate: 60.5,
  };

  console.log("Sending ingest payload for DEMO-1805:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-secret": "dev_ingestion_secret_key_12345",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("Ingest Response HTTP Status:", res.status);
    console.log("Ingest Response Body:", data);
  } catch (err) {
    console.error("Failed to connect to dev server:", err);
  }
}

simulate();
