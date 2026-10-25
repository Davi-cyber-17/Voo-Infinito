(()=>{
const W=540,H=800,R=26,PW=84,GAP=210,SPACE=310,GRAV=1500,FLAP=-500;
const COLORS=['#00e5ff','#39ff88','#ffd400','#ff3d6e'];
const NAMES=['Ciano','Verde','Amarelo','Magenta'];
const FONT='"Orbitron","Rajdhani","Segoe UI",system-ui,sans-serif';
const FINE=matchMedia('(hover:hover) and (pointer:fine)').matches;
const $=s=>document.querySelector(s);
const keys=[...document.querySelectorAll('.key')];
const chips=[...document.querySelectorAll('.chip')];
const pillEls=chips.map(c=>c.querySelector('b'));
const dock=$('#dock'),hud=$('#hud');
const cv=$('#cv'),ctx=cv.getContext('2d');

/* Servidores STUN/TURN: ajudam a conectar celular <-> computador em redes diferentes */
const PEER_OPTS={config:{iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:global.stun.twilio.com:3478'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}
]}};

let mode='menu';          // menu | local | host | guest
let inGame=false,me=-1,net={},G=newState(),bgx=0;

function newState(){
  return {phase:'idle',count:3,over:0,t:0,speed:170,msg:'',win:-1,solo:false,best:0,pipes:[],
    balls:[0,1,2,3].map(i=>({x:130+i*52,y:H/2,vy:0,alive:false,active:false,score:0,wins:0,t:0}))};
}

/* ---------- Telas ---------- */
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  $('#game').classList.remove('on');
  if(id==='game'){$('#game').classList.add('on');resize();}
  else $('#'+id).classList.add('on');
}
const setMsg=s=>{$('#omsg').textContent=s;};
function copy(t,el){
  const ok=()=>{if(el){const o=el.textContent;el.textContent='Copiado!';setTimeout(()=>el.textContent=o,1200);}};
  try{navigator.clipboard.writeText(t).then(ok,()=>{});}catch(_){}
}
const roomLink=()=>location.origin+location.pathname+'?sala='+net.code;

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  const [a,v]=el.dataset.a.split(':');
  if(a==='go'){setMsg('');$('#note').textContent='';show(v);}
  else if(a==='local')startLocal(+v);
  else if(a==='create')createRoom();
  else if(a==='join')joinRoom($('#codeIn').value);
  else if(a==='start')hostStart();
  else if(a==='copy')copy(net.code,el);
  else if(a==='share'){
    if(navigator.share)navigator.share({title:'Flappy Jump',text:'Entre na minha sala! Código: '+net.code,url:roomLink()}).catch(()=>{});
    else copy(roomLink(),el);
  }
  else if(a==='leave')leave();
});
document.addEventListener('contextmenu',e=>{if(inGame)e.preventDefault();});

function leave(msg){
  inGame=false;
  try{net.peer&&net.peer.destroy();}catch(_){}
  net={};mode='menu';me=-1;G=newState();
  $('#note').textContent=msg||'';
  show('main');
}

/* ---------- Partida ---------- */
function startMatch(mask){
  G=newState();
  mask.forEach((m,i)=>{G.balls[i].active=!!m;});
  const n=mask.filter(Boolean).length;
  G.solo=n===1;
  try{G.best=+localStorage.getItem('fj-best')||0;}catch(_){}
  const vis=[];
  keys.forEach((k,i)=>{
    const on=mode==='local'?!!mask[i]:i===me;   // online: só o seu botão aparece
    k.hidden=!on;k.classList.remove('span','down');
    if(on)vis.push(k);
    k.querySelector('.nm').textContent=(mode==='local'&&n>1)?NAMES[i]:'Pular';
  });
  dock.className='n'+vis.length;
  if(vis.length===3)vis[2].classList.add('span');
  hud.classList.toggle('solo',G.solo);
  trail=[];inGame=true;show('game');
  if(mode!=='guest')startRound();
}
function startLocal(n){
  mode='local';me=-1;
  startMatch({1:[0,0,0,1],2:[1,0,0,1],3:[1,1,0,1],4:[1,1,1,1]}[n]);
}
function startRound(){
  G.phase='count';G.count=3;G.t=0;G.speed=170;G.pipes=[];
  G.balls.forEach(b=>{b.alive=b.active;b.y=H/2;b.vy=0;b.score=0;b.t=0;});
}
function flap(i){
  const b=G.balls[i];
  if(G.phase==='play'&&b&&b.alive)b.vy=FLAP;
}
function press(i){
  if(mode==='guest'){if(net.conn&&net.conn.open)net.conn.send({t:'f'});}
  else if(G.balls[i]&&G.balls[i].active)flap(i);
}
const soloIdx=()=>G.balls.findIndex(b=>b.active);

function phys(b,dt){
  b.vy+=GRAV*dt;b.y+=b.vy*dt;
  if(b.y<R){b.y=R;b.vy=0;}
  if(b.y>H-R){b.y=H-R;b.vy=0;}
}
function step(dt){
  if(G.phase==='count'){G.count-=dt;if(G.count<=0){G.phase='play';G.count=0;}return;}
  if(G.phase==='over'){
    G.balls.forEach(b=>{if(b.active&&b.y<H-R)phys(b,dt);});
    G.over-=dt;if(G.over<=0)startRound();return;
  }
  if(G.phase!=='play')return;
  G.t+=dt;G.speed=170+Math.min(G.t*4,110);
  const L=G.pipes[G.pipes.length-1];
  if(!L||L.x<W-SPACE)G.pipes.push({x:W+PW,y:175+Math.random()*450,m:0});
  G.pipes.forEach(p=>p.x-=G.speed*dt);
  while(G.pipes.length&&G.pipes[0].x<-PW-30)G.pipes.shift();
  G.balls.forEach((b,i)=>{
    if(!b.active)return;
    if(!b.alive){if(b.y<H-R)phys(b,dt);return;}
    b.vy+=GRAV*dt;b.y+=b.vy*dt;
    if(b.y<R){b.y=R;b.vy=0;}
    let dead=b.y>H-R;
    for(const p of G.pipes){
      if(b.x+R*.85>p.x&&b.x-R*.85<p.x+PW&&(b.y-R*.85<p.y-GAP/2||b.y+R*.85>p.y+GAP/2))dead=true;
      if(p.x+PW<b.x&&!((p.m>>i)&1)){p.m|=1<<i;b.score++;}
    }
    if(dead){b.alive=false;b.t=G.t;if(b.y>H-R){b.y=H-R;b.vy=0;}}
  });
  if(!G.balls.some(b=>b.alive))endRound();
}
function endRound(){
  G.phase='over';G.over=3;
  const act=G.balls.map((b,i)=>({b,i})).filter(o=>o.b.active);
  if(!act.length){G.win=-1;G.msg='';return;}
  act.sort((a,c)=>c.b.score-a.b.score||c.b.t-a.b.t);
  if(G.solo){
    const s=act[0].b.score;
    if(s>G.best){G.best=s;try{localStorage.setItem('fj-best',s);}catch(_){}}
    G.win=-1;G.msg='Pontos: '+s;
  }else{
    G.win=act[0].i;act[0].b.wins++;G.msg=NAMES[G.win]+' venceu!';
  }
}
/* Convidado: só extrapola entre os snapshots enviados pelo anfitrião */
function extrap(dt){
  if(G.phase==='count')G.count-=dt;
  else if(G.phase==='over')G.over-=dt;
  if(G.phase==='play')G.pipes.forEach(p=>p.x-=G.speed*dt);
  if(G.phase==='play'||G.phase==='over')G.balls.forEach(b=>{if(b.active&&(b.alive||b.y<H-R))phys(b,dt);});
}

/* ---------- Rede (PeerJS, salas por código; funciona entre aparelhos diferentes) ---------- */
const randCode=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ';let s='';for(let i=0;i<4;i++)s+=a[Math.random()*a.length|0];return s;};
const hasPeer=()=>{if(typeof Peer==='undefined'){setMsg('Não foi possível carregar a biblioteca online. Verifique a internet.');show('online');return false;}return true;};
const broadcast=m=>net.conns&&net.conns.forEach((c,i)=>{if(i>0&&c&&c.open)c.send(m);});

function createRoom(){
  if(!hasPeer())return;
  setMsg('Criando sala...');
  const code=randCode(),peer=new Peer('fj-'+code,PEER_OPTS);
  net={peer,code,conns:[null,null,null,null],started:false};
  peer.on('open',()=>{mode='host';me=0;net.conns[0]='host';showLobby();});
  peer.on('connection',onGuest);
  peer.on('disconnected',()=>{try{peer.reconnect();}catch(_){}});
  peer.on('error',e=>{
    if(e.type==='unavailable-id'){try{peer.destroy();}catch(_){}createRoom();}
    else setMsg('Erro de conexão ('+e.type+')');
  });
}
function onGuest(conn){
  conn.slot=-1;
  conn.on('open',()=>{
    const s=net.started?-1:net.conns.findIndex(c=>!c);
    if(s<0){conn.send({t:'full'});setTimeout(()=>conn.close(),400);return;}
    conn.slot=s;net.conns[s]=conn;
    conn.send({t:'welcome',slot:s});
    sendRoster();showLobby();
  });
  conn.on('data',d=>{if(d&&d.t==='f'&&conn.slot>=0)flap(conn.slot);});
  conn.on('close',()=>{
    if(conn.slot>=0&&net.conns&&net.conns[conn.slot]===conn){
      net.conns[conn.slot]=null;
      if(inGame){const b=G.balls[conn.slot];b.active=false;b.alive=false;}
      sendRoster();showLobby();
    }
  });
}
const sendRoster=()=>broadcast({t:'r',r:net.conns.map(c=>!!c)});

function showLobby(){
  if(inGame)return;
  show('lobby');
  $('#code').textContent=net.code;
  const roster=mode==='host'?net.conns.map(c=>!!c):(net.roster||[]);
  $('#slots').innerHTML=[0,1,2,3].map(i=>
    `<div class="slot" style="--c:${COLORS[i]}"><i></i><span>${NAMES[i]}</span><em>${roster[i]?(i===me?'Você':'Conectado'):'Aguardando...'}</em></div>`).join('');
  $('#startBtn').style.display=mode==='host'?'':'none';
  $('#wait').style.display=mode==='host'?'none':'block';
}
function hostStart(){
  if(mode!=='host')return;
  net.started=true;
  const mask=net.conns.map(c=>c?1:0);
  broadcast({t:'st',a:mask});
  startMatch(mask);
}
function joinRoom(code){
  code=(code||'').trim().toUpperCase();
  if(code.length!==4){setMsg('Digite o código de 4 letras.');return;}
  if(!hasPeer())return;
  setMsg('Conectando...');
  const peer=new Peer(undefined,PEER_OPTS);
  net={peer,code,roster:[]};
  const timer=setTimeout(()=>{setMsg('Não foi possível entrar. Verifique o código e a internet.');try{peer.destroy();}catch(_){}},12000);
  peer.on('error',e=>{
    clearTimeout(timer);
    setMsg(e.type==='peer-unavailable'?'Sala não encontrada.':'Erro de conexão ('+e.type+')');
  });
  peer.on('open',()=>{
    const conn=peer.connect('fj-'+code);
    net.conn=conn;
    conn.on('data',d=>{
      if(!d)return;
      if(d.t==='welcome'){clearTimeout(timer);me=d.slot;mode='guest';showLobby();}
      else if(d.t==='r'){net.roster=d.r;showLobby();}
      else if(d.t==='st'){startMatch(d.a);}
      else if(d.t==='s'&&inGame){apply(d);}
      else if(d.t==='full'){clearTimeout(timer);setMsg('Sala cheia ou partida já iniciada.');}
    });
    conn.on('close',()=>{if(mode==='guest')leave('A sala foi encerrada.');});
  });
}
function snap(){
  return {t:'s',p:G.phase,c:+G.count.toFixed(2),o:+G.over.toFixed(2),sp:G.speed|0,m:G.msg,w:G.win,so:G.solo?1:0,
    b:G.balls.map(b=>[b.y|0,b.vy|0,b.alive?1:0,b.score,b.wins,b.active?1:0]),
    pp:G.pipes.map(p=>[p.x|0,p.y|0])};
}
function apply(d){
  G.phase=d.p;G.count=d.c;G.over=d.o;G.speed=d.sp;G.msg=d.m;G.win=d.w;G.solo=!!d.so;
  d.b.forEach((a,i)=>{const b=G.balls[i];b.y=a[0];b.vy=a[1];b.alive=!!a[2];b.score=a[3];b.wins=a[4];b.active=!!a[5];});
  G.pipes=d.pp.map(a=>({x:a[0],y:a[1]}));
}

/* ---------- Controles (toque, mouse e teclado) ---------- */
const flash=i=>{const el=keys[i];if(!el||el.hidden)return;el.classList.add('down');setTimeout(()=>el.classList.remove('down'),110);};
const go=i=>{flash(i);press(i);};
keys.forEach((k,i)=>{
  const idx=()=>mode==='local'?i:me;
  k.addEventListener('pointerdown',e=>{e.preventDefault();k.classList.add('down');press(idx());});
  const up=()=>k.classList.remove('down');
  ['pointerup','pointercancel','pointerleave'].forEach(t=>k.addEventListener(t,up));
  k.addEventListener('contextmenu',e=>e.preventDefault());
});
cv.addEventListener('pointerdown',e=>{
  e.preventDefault();
  if(mode==='local'){if(G.solo)go(soloIdx());}
  else go(me);
});
const KEYS={q:0,p:1,z:2,m:3};
addEventListener('keydown',e=>{
  if(!inGame||e.repeat)return;
  const k=e.key.toLowerCase();
  if(k===' ')e.preventDefault();
  if(mode==='local'){
    if(k in KEYS)go(KEYS[k]);
    else if(k===' '&&G.solo)go(soloIdx());
  }else if(k in KEYS||k===' ')go(me);
});

/* ---------- Desenho ---------- */
let cw=0,ch=0,dpr=1;
function setAppH(){document.documentElement.style.setProperty('--app-h',(window.innerHeight||document.documentElement.clientHeight)+'px');}
setAppH();
addEventListener('resize',setAppH);
addEventListener('orientationchange',()=>{setAppH();setTimeout(()=>{setAppH();if(inGame)resize();},250);});
if(window.visualViewport)visualViewport.addEventListener('resize',setAppH);
function resize(){
  const r=$('#stage').getBoundingClientRect();
  dpr=Math.min(devicePixelRatio||1,2);cw=r.width;ch=r.height;
  cv.width=Math.max(1,cw*dpr);cv.height=Math.max(1,ch*dpr);
}
if(window.ResizeObserver)new ResizeObserver(()=>{if(inGame)resize();}).observe($('#stage'));
addEventListener('resize',()=>{if(inGame)resize();});

const STARS=Array.from({length:46},()=>({x:Math.random()*W,y:Math.random()*H,r:.6+Math.random()*1.6,s:.15+Math.random()*.7}));
const CL=[[0,120],[300,330],[560,60],[820,520],[1060,250],[180,650],[700,700]];
let trail=[],tAcc=0;
function updTrail(dt){
  if(G.phase==='count'){trail.length=0;return;}
  tAcc+=dt;
  if(G.phase==='play'&&tAcc>.03){
    tAcc=0;
    G.balls.forEach((b,i)=>{if(b.active&&b.alive)trail.push({x:b.x-R*.6,y:b.y,l:1,i});});
  }
  for(const p of trail){p.x-=G.speed*dt;p.l-=dt*2.4;}
  trail=trail.filter(p=>p.l>0);
}
function txt(s,x,y,sz,fill){
  ctx.save();
  ctx.font=`900 ${sz}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=fill||'#00e5ff';ctx.shadowBlur=sz*.35;
  ctx.lineJoin='round';ctx.lineWidth=sz*.12;ctx.strokeStyle='rgba(0,0,0,.65)';
  ctx.strokeText(s,x,y,W-40);ctx.fillStyle=fill||'#e8fbff';ctx.fillText(s,x,y,W-40);
  ctx.restore();
}
function background(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0b1430');g.addColorStop(1,'#080d1d');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // estrelas
  ctx.fillStyle='rgba(180,230,255,.45)';
  STARS.forEach(s=>{
    const x=(((s.x-bgx*s.s)%W)+W)%W;
    ctx.beginPath();ctx.arc(x,s.y,s.r,0,7);ctx.fill();
  });
  // blocos de dados ao fundo
  ctx.strokeStyle='rgba(124,77,255,.16)';ctx.lineWidth=2;
  const span=W+400;
  CL.forEach(([cx,cy])=>{
    const x=(((cx-bgx*.6)%span)+span)%span-200;
    [[34,0],[0,42],[108,42]].forEach(([dx,dy])=>{
      ctx.beginPath();ctx.roundRect(x+dx,cy+dy,96,33,8);ctx.stroke();
    });
  });
  // grade
  ctx.strokeStyle='rgba(0,229,255,.07)';ctx.lineWidth=1;
  ctx.beginPath();
  const gx=-(bgx%54);
  for(let x=gx;x<W;x+=54){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  for(let y=0;y<H;y+=54){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();
  // limites
  ctx.lineWidth=3;
  ctx.save();ctx.shadowBlur=14;
  ctx.strokeStyle='rgba(0,229,255,.5)';ctx.shadowColor='#00e5ff';
  ctx.beginPath();ctx.moveTo(0,1.5);ctx.lineTo(W,1.5);ctx.stroke();
  ctx.strokeStyle='#ff3d6e';ctx.shadowColor='#ff3d6e';
  ctx.beginPath();ctx.moveTo(0,H-1.5);ctx.lineTo(W,H-1.5);ctx.stroke();
  ctx.restore();
}
function pipe(p){
  const top=p.y-GAP/2,bot=p.y+GAP/2;
  ctx.fillStyle='rgba(16,22,56,.96)';
  ctx.beginPath();ctx.rect(p.x,-20,PW,top+20);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.rect(p.x,bot,PW,H-bot+20);ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(124,77,255,.4)';
  ctx.beginPath();ctx.rect(p.x-8,top-30,PW+16,30);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.rect(p.x-8,bot,PW+16,30);ctx.fill();ctx.stroke();
}
function pipes(){
  ctx.save();
  ctx.lineWidth=3;ctx.lineJoin='round';
  ctx.strokeStyle='#9d7bff';ctx.shadowColor='#7c4dff';ctx.shadowBlur=14;
  G.pipes.forEach(pipe);
  ctx.restore();
}
function ball(i,b,y){
  const col=COLORS[i];
  ctx.save();
  ctx.translate(b.x,y);
  ctx.globalAlpha=(b.alive||G.phase==='count')?1:.4;
  ctx.rotate(Math.max(-.5,Math.min(.9,b.vy/800)));
  // asa de energia
  ctx.save();
  ctx.translate(-R*.55,-R*.2);ctx.rotate(b.vy<-120?-.9:.35);
  ctx.shadowColor=col;ctx.shadowBlur=14;ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(-24,-16);ctx.lineTo(-18,-4);ctx.lineTo(-34,0);ctx.lineTo(-18,6);ctx.lineTo(-26,16);ctx.closePath();ctx.fill();
  ctx.restore();
  // orbe
  const g=ctx.createRadialGradient(-R*.3,-R*.35,2,0,0,R);
  g.addColorStop(0,'#fff');g.addColorStop(.3,col);g.addColorStop(1,col);
  ctx.shadowColor=col;ctx.shadowBlur=20;
  ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fillStyle=g;ctx.fill();
  ctx.shadowBlur=0;
  ctx.save();ctx.clip();
  ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(-R,0);ctx.lineTo(R,0);ctx.moveTo(0,-R);ctx.lineTo(0,R);ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,R*.55,0,7);ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.stroke();
  ctx.restore();
}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#070b17';ctx.fillRect(0,0,cv.width,cv.height);
  const s=Math.min(cw/W,ch/H),ox=(cw-W*s)/2,oy=(ch-H*s)/2;
  ctx.setTransform(dpr*s,0,0,dpr*s,dpr*ox,dpr*oy);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  background();
  pipes();
  trail.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.l)*.45;ctx.fillStyle=COLORS[p.i];
    ctx.beginPath();ctx.arc(p.x,p.y,R*.5*p.l,0,7);ctx.fill();
  });
  ctx.globalAlpha=1;
  const now=performance.now();
  G.balls.forEach((b,i)=>{
    if(!b.active)return;
    const y=G.phase==='count'?H/2+Math.sin(now/200+i)*10:b.y;
    ball(i,b,y);
    if(mode!=='local'&&i===me&&G.phase!=='over'){
      ctx.save();
      ctx.fillStyle='#fff';ctx.shadowColor=COLORS[i];ctx.shadowBlur=10;
      ctx.beginPath();ctx.moveTo(b.x-9,y-R-24);ctx.lineTo(b.x+9,y-R-24);ctx.lineTo(b.x,y-R-10);ctx.closePath();ctx.fill();
      ctx.restore();
    }
  });
  if(G.phase==='play'){
    const m=Math.max(0,...G.balls.filter(b=>b.active).map(b=>b.score));
    ctx.globalAlpha=.9;txt(m,W/2,90,72);ctx.globalAlpha=1;
  }else if(G.phase==='count'){
    txt(Math.max(1,Math.ceil(G.count)),W/2,H/2-150,120);
    txt(mode==='local'&&!G.solo?'Cada um toca no seu botão!':(FINE?'Clique ou ESPAÇO para pular!':'Toque na tela para pular!'),W/2,H/2+120,22);
  }else if(G.phase==='over'){
    txt(G.msg,W/2,H/2-60,40,G.win>=0?COLORS[G.win]:'#e8fbff');
    txt('Próxima rodada em '+Math.max(1,Math.ceil(G.over)),W/2,H/2+10,20);
  }
  ctx.restore();
}
function pills(){
  G.balls.forEach((b,i)=>{
    const v=G.solo?G.best:b.wins;
    if(pillEls[i].textContent!=v)pillEls[i].textContent=v;
    const off=!b.active;
    if(chips[i].classList.contains('off')!==off)chips[i].classList.toggle('off',off);
  });
}

/* ---------- Loop ---------- */
let last=performance.now(),acc=0;
function loop(now){
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(inGame){
    if(mode==='guest')extrap(dt);
    else{
      step(dt);
      if(mode==='host'){acc+=dt;if(acc>=1/30){acc=0;broadcast(snap());}}
    }
    bgx+=(G.phase==='play'?G.speed:50)*.25*dt;
    updTrail(dt);
    draw();pills();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* Link de convite: ?sala=ABCD entra direto na sala */
const q=new URLSearchParams(location.search).get('sala');
if(q){
  show('online');
  $('#codeIn').value=q.toUpperCase().slice(0,4);
  try{history.replaceState(null,'',location.pathname);}catch(_){}
  joinRoom(q);
}
})();
