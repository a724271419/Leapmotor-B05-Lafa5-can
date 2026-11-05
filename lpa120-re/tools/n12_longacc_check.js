// n12_longacc_check.js - compare IBC_LongitAcceAct (0x183) with dv/dt from wheel speeds
'use strict';
const fs = require('fs'), rl = require('readline');
function pearson(x, y) {
  const n = x.length; if (n < 50) return null;
  const mx = x.reduce((a,b)=>a+b,0)/n, my = y.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sxx=0,syy=0;
  for (let i=0;i<n;i++){const dx=x[i]-mx,dy=y[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
  return sxx&&syy ? sxy/Math.sqrt(sxx*syy) : null;
}
(async () => {
  const rows = [];
  for await (const ln of rl.createInterface({ input: fs.createReadStream(process.argv[2]) })) {
    if (!ln || ln.startsWith('t,')) continue;
    const c = ln.split(',');
    rows.push({ t: +c[0], v: c[1] === '' ? NaN : +c[1], a: c[25] === '' ? NaN : +c[25] });
  }
  const xs = [], ys = [];
  const win = 0.5;
  let j = 0;
  for (let i = 0; i < rows.length; i++) {
    while (j < rows.length && rows[j].t < rows[i].t - win) j++;
    if (j >= i) continue;
    const dt = rows[i].t - rows[j].t;
    if (Math.abs(dt - win) > 0.06) continue;
    const dv = rows[i].v - rows[j].v;
    if (!Number.isFinite(dv) || !Number.isFinite(rows[i].a)) continue;
    xs.push(dv / dt); ys.push(rows[i].a);
  }
  let se = 0; for (let i = 0; i < xs.length; i++) se += (xs[i] - ys[i]) ** 2;
  const rmse = xs.length ? Math.sqrt(se / xs.length) : NaN;
  const r = pearson(xs, ys);
  console.log(require('path').basename(process.argv[2]) + ' n=' + xs.length + ' r=' + (r === null ? 'n/a' : r.toFixed(3)) + ' rmse=' + rmse.toFixed(2) + ' m/s2');
})();