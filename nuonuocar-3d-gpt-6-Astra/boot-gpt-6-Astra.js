try {
  const { ParkingRenderer } = await import("./scene-gpt-6-Astra.js");
  await import("./motion-gpt-6-Astra.js");
  window.ParkingRenderer = ParkingRenderer;
  await import("./game-gpt-6-Astra.js");
} catch (error) {
  console.error("3D game startup failed", error);
  const el = document.getElementById("loading");
  el.hidden = false;
  el.innerHTML =
    '<b>3D 停车场暂时无法打开</b><small>请使用支持 WebGL 2 的浏览器，并开启硬件加速</small><button class="primary" style="width:180px" onclick="location.reload()">重新载入</button>';
}
