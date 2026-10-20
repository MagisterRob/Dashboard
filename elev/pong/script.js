const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const scoreText = document.getElementById("score");
const message = document.getElementById("message");

let running = false;
let playerScore = 0;
let computerScore = 0;

const player = { x: 10, y: 160, dy: 0 };
const computer = { x: 578, y: 160 };
const ball = { x: 300, y: 200, dx: 4, dy: 3 };

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !running) startGame();
  if (e.key === "ArrowUp") player.dy = -5;
  if (e.key === "ArrowDown") player.dy = 5;
});

document.addEventListener("keyup", () => { player.dy = 0; });

function startGame() {
  running = true;
  message.textContent = "Pil upp / pil ner för att styra";
  gameLoop();
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function update() {
  player.y += player.dy;
  player.y = Math.max(0, Math.min(320, player.y));

  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.y <= 0 || ball.y >= 388) ball.dy *= -1;

  if (ball.x <= 22 && ball.y >= player.y && ball.y <= player.y + 80) ball.dx = 4;
  if (ball.x >= 578 && ball.y >= computer.y && ball.y <= computer.y + 80) ball.dx = -4;

  if (computer.y + 40 < ball.y) computer.y += 3;
  else computer.y -= 3;
  computer.y = Math.max(0, Math.min(320, computer.y));

  if (ball.x < 0) { computerScore++; resetBall(); }
  if (ball.x > 600) { playerScore++; resetBall(); }

  scoreText.textContent = `Spelare: ${playerScore} — Dator: ${computerScore}`;
}

function resetBall() {
  ball.x = 300;
  ball.y = 200;
  ball.dx = Math.random() > 0.5 ? 4 : -4;
  ball.dy = Math.random() > 0.5 ? 3 : -3;
}

function draw() {
  ctx.clearRect(0, 0, 600, 400);
  ctx.fillStyle = "#fff";
  for (let y = 0; y < 400; y += 30) ctx.fillRect(298, y, 4, 18);
  ctx.fillRect(player.x, player.y, 12, 80);
  ctx.fillRect(computer.x, computer.y, 12, 80);
  ctx.fillRect(ball.x, ball.y, 12, 12);
}