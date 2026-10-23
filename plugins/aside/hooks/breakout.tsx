import type { ClientModule } from 'claude-code'

// Surface module: a tiny breakout drawn in the top of the aside pane.
// Row 0 is the HUD, the ceiling is row 1, the paddle sits on the last row.
// Mouse over the game moves the paddle; a click launches the ball.
// Arrow keys / a d work once the game has been clicked (that gives it focus).

type Game = {
  w: number
  h: number
  bricks: boolean[][]
  px: number
  bx: number
  by: number
  vx: number
  vy: number
  isLive: boolean
  score: number
  lives: number
  over: 'won' | 'lost' | null
}

const BRICK_W = 4
const PADDLE_W = 9
const TICK_MS = 40
// Two tints per row so neighbouring bricks read as separate.
const ROW_COLORS = [
  ['#E95420', '#C7451A'],
  ['#E9AD0C', '#C58F08'],
  ['#38B44A', '#2C913B'],
  ['#33C7DE', '#27A0B3'],
]

function fresh(w: number, h: number): Game {
  const cols = Math.max(1, Math.floor(w / BRICK_W))
  const rows = Math.max(1, Math.min(ROW_COLORS.length, Math.floor((h - 4) / 3)))
  const px = Math.floor((w - PADDLE_W) / 2)

  return {
    w,
    h,
    bricks: Array.from({ length: rows }, () => Array.from({ length: cols }, () => true)),
    px,
    bx: px + PADDLE_W / 2,
    by: h - 2,
    vx: 0,
    vy: -0.5,
    isLive: false,
    score: 0,
    lives: 3,
    over: null,
  }
}

function clampPaddle(g: Game, px: number): number {
  return Math.max(0, Math.min(g.w - PADDLE_W, px))
}

function movePaddle(g: Game, px: number): Game {
  const next = clampPaddle(g, px)
  if (next === g.px) return g
  // A ball that has not launched rides the paddle.
  return g.isLive ? { ...g, px: next } : { ...g, px: next, bx: next + PADDLE_W / 2 }
}

function launch(g: Game): Game {
  if (g.over) return fresh(g.w, g.h)
  if (g.isLive) return g
  return { ...g, isLive: true, vx: 0.6, vy: -0.5 }
}

function step(g: Game): Game {
  if (!g.isLive || g.over) return g

  let { bx, by, vx, vy } = g
  let nx = bx + vx
  let ny = by + vy

  if (nx < 0) {
    nx = -nx
    vx = -vx
  } else if (nx > g.w - 1) {
    nx = 2 * (g.w - 1) - nx
    vx = -vx
  }
  if (ny < 1) {
    ny = 2 - ny
    vy = -vy
  }

  // Bricks start at row 2.
  const row = Math.floor(ny) - 2
  const col = Math.floor(nx / BRICK_W)
  let bricks = g.bricks
  let score = g.score
  if (row >= 0 && row < bricks.length && bricks[row][col]) {
    bricks = bricks.map((r, i) => (i === row ? r.map((b, j) => (j === col ? false : b)) : r))
    score += 1
    vy = -vy
    ny = by
  }

  if (bricks.every(r => r.every(b => !b))) {
    return { ...g, bricks, score, bx: nx, by: ny, vx, vy, over: 'won' }
  }

  // Paddle on the last row: the hit spot sets the angle.
  if (vy > 0 && ny >= g.h - 1) {
    if (nx >= g.px - 0.5 && nx <= g.px + PADDLE_W - 0.5) {
      const hit = (nx - g.px) / (PADDLE_W - 1)
      vx = (hit - 0.5) * 2.4
      vy = -Math.abs(vy)
      ny = g.h - 2
    } else if (ny >= g.h) {
      const lives = g.lives - 1
      const reset = { ...g, bricks, score, lives, isLive: false, bx: g.px + PADDLE_W / 2, by: g.h - 2, vx: 0, vy: -0.5 }

      return lives <= 0 ? { ...reset, over: 'lost' } : reset
    }
  }

  return { ...g, bricks, score, bx: nx, by: ny, vx, vy }
}

function hud(g: Game): string {
  if (g.over === 'won') return `You win! score ${g.score}. Click to play again`
  if (g.over === 'lost') return `Game over, score ${g.score}. Click to play again`
  const hearts = '♥'.repeat(g.lives)
  if (!g.isLive) return `${hearts} score ${g.score}  click to launch`
  return `${hearts} score ${g.score}`
}

type Run = { s: string; color: string }

function rowRuns(g: Game, y: number): Run[] {
  const cells: Run[] = Array.from({ length: g.w }, () => ({ s: ' ', color: '#AEA79F' }))
  const brickRow = g.bricks[y - 2]
  if (brickRow) {
    brickRow.forEach((alive, c) => {
      if (!alive) return
      for (let i = 0; i < BRICK_W; i++) {
        const x = c * BRICK_W + i
        if (x < g.w) cells[x] = { s: '█', color: ROW_COLORS[y - 2][c % 2] }
      }
    })
  }
  if (y === g.h - 1) {
    for (let i = 0; i < PADDLE_W; i++) cells[g.px + i] = { s: '▀', color: '#EEEEEC' }
  }
  if (Math.round(g.by) === y) {
    const x = Math.max(0, Math.min(g.w - 1, Math.round(g.bx)))
    cells[x] = { s: '●', color: '#FFFFFF' }
  }

  const runs: Run[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.color === c.color) last.s += c.s
    else runs.push({ ...c })
  }

  return runs
}

const Breakout: ClientModule<null, Game> = (_props, surface) => {
  const { Box, Text } = surface.elements
  const gridW = surface.columns || 40
  const gridH = surface.rows || 12

  if (surface.state === undefined) {
    // `cur` mirrors the state for the callbacks below, which outlive this call.
    let cur = fresh(gridW, gridH)
    const commit = (next: Game) => {
      if (next === cur) return
      cur = next
      surface.setState(cur)
    }

    surface.every(TICK_MS, () => {
      const cw = surface.columns
      const ch = surface.rows
      if (cw > 0 && ch > 0 && (cw !== cur.w || ch !== cur.h)) {
        commit(fresh(cw, ch))
        return
      }
      commit(step(cur))
    })
    surface.onPointer(e => {
      if (e.type === 'move') commit(movePaddle(cur, Math.round(e.x - PADDLE_W / 2)))
      else if (e.type === 'down') commit(launch(cur))
    })
    surface.onKey(e => {
      if (e.key === 'left' || e.key === 'a') commit(movePaddle(cur, cur.px - 3))
      else if (e.key === 'right' || e.key === 'd') commit(movePaddle(cur, cur.px + 3))
    })
    surface.setState(cur)
  }

  const g = surface.state ?? fresh(gridW, gridH)

  return (
    <Box flexDirection="column">
      <Text color="#33C7DE">{hud(g)}</Text>
      {Array.from({ length: g.h - 1 }, (_, i) => (
        <Text>
          {rowRuns(g, i + 1).map(r => (
            <Text color={r.color}>{r.s}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Breakout
