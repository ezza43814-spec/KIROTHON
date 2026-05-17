// gems.js — Floating gem background animation
(function () {
  const canvas = document.getElementById("gemsCanvas");
  const ctx    = canvas.getContext("2d");

  const GEM_COUNT = 28;
  const gems = [];

  const COLORS = [
    "rgba(196, 181, 253, ",
    "rgba(167, 139, 250, ",
    "rgba(221, 214, 254, ",
    "rgba(139, 92,  246, ",
  ];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function randomBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function createGem() {
    return {
      x:       randomBetween(0, canvas.width),
      y:       randomBetween(0, canvas.height),
      size:    randomBetween(5, 14),
      speedY:  randomBetween(0.15, 0.45),
      speedX:  randomBetween(-0.12, 0.12),
      opacity: randomBetween(0.04, 0.13),
      rotation: randomBetween(0, Math.PI),
      spin:    randomBetween(-0.004, 0.004),
      color:   COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  function drawGem(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -g.size);
    ctx.lineTo(g.size * 0.6, 0);
    ctx.lineTo(0, g.size);
    ctx.lineTo(-g.size * 0.6, 0);
    ctx.closePath();
    ctx.fillStyle = g.color + g.opacity + ")";
    ctx.fill();
    ctx.strokeStyle = g.color + (g.opacity * 0.6) + ")";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  function init() {
    resize();
    gems.length = 0;
    for (let i = 0; i < GEM_COUNT; i++) gems.push(createGem());
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gems.forEach(g => {
      g.y -= g.speedY;
      g.x += g.speedX;
      g.rotation += g.spin;
      if (g.y + g.size < 0) {
        g.y = canvas.height + g.size;
        g.x = randomBetween(0, canvas.width);
        g.size = randomBetween(5, 14);
      }
      if (g.x < -g.size) g.x = canvas.width + g.size;
      if (g.x > canvas.width + g.size) g.x = -g.size;
      drawGem(g);
    });
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  init();
  animate();
})();
