async function test() {
  const serial = "TEST-METER-4703";
  console.log(`Checking status for device: ${serial}`);
  
  const res = await fetch(`http://localhost:3000/api/devices?search=${serial}`);
  if (!res.ok) {
    console.error(`API request failed: ${res.status}`);
    return;
  }
  
  const data = await res.json() as { items?: Array<{ deviceSerialNo: string }> };
  const device = data.items?.find((d: { deviceSerialNo: string }) => d.deviceSerialNo === serial);
  
  if (device) {
    console.log("Device found in API:");
    console.log(JSON.stringify(device, null, 2));
  } else {
    console.log("Device not found in API response.");
  }
}

test();

export {};
