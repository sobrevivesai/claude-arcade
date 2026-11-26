import {WEAPONS,PASS,CHARS,SHOP,QUINI} from './data.js';
import {UI2} from './ui2.js';
import {input} from './input.js';
import {audio} from './audio.js';
const $=s=>document.querySelector(s),pick=a=>a[Math.random()*a.length|0];
const el=(h)=>{const d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild;};
const UPN={dmg:'daño',area:'área',n:'cantidad',cd:'recarga',pierce:'perforación',dur:'duración',spd:'velocidad'};
const TRUCO=['Ancho de espadas','Ancho de bastos','Siete de espadas','Siete de oro','Un tres','Un dos','Ancho falso','Un rey','Un caballo','Una sota','Siete falso','Un seis','Un cinco','Un cuatro'];
export class UI{
  constructor(o){Object.assign(this,o);this.root=$('#ui');this.scr=null;this.slots=[null,null,null,null];this.last={};
    addEventListener('pointerdown',()=>audio.init(),{capture:true});addEventListener('keydown',()=>audio.init(),{capture:true});this.touchInit();}
  icon(k){return this.icons[k]||'';}
  store(){try{localStorage.setItem('salamanca',JSON.stringify({save:this.save,cfg:this.cfg}));}catch(e){}}
  show(name,html){this.root.innerHTML='';this.scr=name;const mt=document.getElementById('mts');if(mt)mt.hidden=name==='end';if(!html)return null;const d=el(html);this.root.appendChild(d);this.sel=0;return d;}
  // navegación de menú con teclado / joystick
  nav(list,onBack){const devs=['k1','k2',...input.pads()];let up=0,dn=0,ok=0,bk=input.esc;for(const d of devs){const s=input.st[d];if(!s)continue;up|=s.pU;dn|=s.pD;ok|=s.pd;bk|=s.pb;}
    if(list.length){if(up||dn){this.sel=(this.sel+(dn?1:-1)+list.length)%list.length;audio.play('move');}list.forEach((b,i)=>b.classList.toggle('on',i===this.sel));if(ok&&document.activeElement?.tagName!=='INPUT'){audio.play('ok');list[this.sel].click();return;}}
    if(bk&&onBack){audio.play('back');onBack();}}
  // ------- portada -------
  // ------- lobby -------
  unlocked(ch){return !CHARS[ch].lock||this.save.un[ch];}
  // ------- configuración -------
  config(from){const c=this.cfg;const rg=(k,n)=>`<div class="row"><label for="cf_${k}">${n}</label><input type="range" id="cf_${k}" min="0" max="1" step=".05" value="${c[k]}"></div>`;const sg=(k,n,o)=>`<div class="row"><label>${n}</label><div class="seg" data-k="${k}">${o.map(([v,t])=>`<button data-v="${v}">${t}</button>`).join('')}</div></div>`;
    const d=this.show('config',`<div class="scr center"><div class="panel"><h2>Configuración</h2>${rg('mus','Música')}${rg('sfx','Efectos')}${rg('shake','Temblor de cámara')}${sg('nums','Números de daño',[[1,'Sí'],[0,'No']])}${sg('q','Calidad gráfica',[['baja','Baja'],['media','Media'],['alta','Alta']])}
     <div class="keys"><div><b>Teclado 1</b><br><kbd>WASD</kbd> mover <kbd>Espacio</kbd> esquivar <kbd>Q</kbd> destreza <kbd>E</kbd> sapucay</div><div><b>Teclado 2</b><br><kbd>Flechas</kbd> mover <kbd>Enter</kbd> esquivar <kbd>Shift der.</kbd> destreza <kbd>Retroceso</kbd> sapucay</div><div><b>Joystick</b><br>Stick mover, <kbd>A</kbd> esquivar, <kbd>Y</kbd> destreza, <kbd>X</kbd> sapucay, <kbd>Start</kbd> pausa</div><div><b>Pausa</b><br><kbd>Esc</kbd> o <kbd>P</kbd></div></div><p class="tip" id="qn" hidden style="margin-top:10px">El cambio de calidad se aplica al recargar la página.</p><div class="btns"><button class="btn" id="cb">Listo</button><button class="btn sec" id="cfs">Pantalla completa</button></div></div></div>`);
    for(const k of['mus','sfx','shake'])$('#cf_'+k).oninput=e=>{c[k]=+e.target.value;audio.vol.m=c.mus;audio.vol.s=c.sfx;audio.setVol();this.store();};
    const dr=()=>d.querySelectorAll('.seg').forEach(s=>s.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(c[s.dataset.k])===b.dataset.v)));d.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{const k=b.parentElement.dataset.k;c[k]=k==='nums'?+b.dataset.v:b.dataset.v;if(k==='q')$('#qn').hidden=false;audio.play('move');this.store();dr();});dr();
    $('#cfs').onclick=()=>{try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{});}catch(e){}};this.cback=()=>from==='pause'?this.pause():this.title();$('#cb').onclick=()=>{audio.play('back');this.cback();};}
  // ------- pulpería permanente -------
  shop(){const s=this.save;const d=this.show('shop',`<div class="scr center"><div class="panel"><h2>Pulpería</h2><p class="tip">Lo que compres acá queda para siempre. Tenés <b style="color:var(--sol)">$${s.gold}</b> patacones.</p><div class="shop">${Object.entries(SHOP).map(([k,o])=>{const l=s.shop[k]||0,c=Math.round(o.c*(1+l*.8));return`<button data-k="${k}" ${l>=o.m||s.gold<c?'disabled':''}><img alt="" src="${this.icon(o.i)}"><span><b>${o.n}</b><small>${o.d}</small><span class="c">${l>=o.m?'Completo':'$'+c}</span><span class="pips">${Array.from({length:o.m},(_,i)=>`<i class="${i<l?'f':''}"></i>`).join('')}</span></span></button>`;}).join('')}</div><div class="btns"><button class="btn" id="cb">Volver</button></div></div></div>`);
    d.querySelectorAll('.shop button').forEach(b=>b.onclick=()=>{const k=b.dataset.k,l=s.shop[k]||0,c=Math.round(SHOP[k].c*(1+l*.8));if(s.gold<c||l>=SHOP[k].m)return;s.gold-=c;s.shop[k]=l+1;audio.play('coin');this.store();this.shop();});this.cback=()=>this.title();$('#cb').onclick=()=>{audio.play('back');this.title();};}
  // ------- bestiario -------
  // ------- pausa -------
  pause(){const g=this.game;g.state='pause';const d=this.show('pause',`<div class="scr center"><div class="panel" style="width:min(420px,100%)"><h2>Descanso</h2><div class="menu"><button data-a="r">Seguir</button><button data-a="c">Configuración</button><button data-a="q">Abandonar</button></div></div></div>`);const[a,b,c]=d.querySelectorAll('.menu button');a.onclick=()=>this.resume();b.onclick=()=>this.config('pause');c.onclick=()=>{g.save.gold+=Math.round(g.gold*.6);g.stat('bajas',g.kills);this.missions();this.store();this.title();g.reset();};}
  resume(){this.show(null);this.game.state='play';}
  // ------- por frame -------
  tick(){const g=this.game;
    if(this.scr==='title')this.nav([...this.root.querySelectorAll('.menu button')]);
    else if(this.scr==='lobby')this.lobbyTick();
    else if(this.scr==='mapa')this.mapTick();
    else if(this.scr==='misiones'){const l=$('#mlist');for(const d of['k1','k2',...input.pads()]){const q=input.st[d];if(!q)continue;if(q.pR)this.mstep(1);if(q.pL)this.mstep(-1);if(Math.abs(q.z)>.4&&l)l.scrollTop+=q.z*14;}this.nav([],()=>this.cback());}
    else if(this.scr==='pause')this.nav([...this.root.querySelectorAll('.menu button')],()=>this.resume());
    else if(this.scr==='config'||this.scr==='shop')this.nav([],()=>this.cback());
    else if(this.scr==='best'){const s=['k1','k2',...input.pads()].map(d=>input.st[d]).filter(Boolean);if(s.some(q=>q.pR))this.bstep(1);if(s.some(q=>q.pL))this.bstep(-1);if(s.some(q=>q.pD))this.bstep(4);if(s.some(q=>q.pU))this.bstep(-4);this.nav([],()=>this.cback());}
    else if(this.scr==='end')this.nav([...this.root.querySelectorAll('.btn')]);
    else if(g.state==='play'){if(input.esc||g.players.some(p=>input.st[p.dev]?.ps))this.pause();}
    if(g.state==='levelup')this.luTick();}
  // ------- HUD -------
  set(k,v,fn){if(this.last[k]!==v){this.last[k]=v;fn(v);}}
  banner(t,s,c=''){const b=$('#ban');b.className=c;b.children[0].textContent=t;b.children[1].textContent=s||'';void b.offsetWidth;b.classList.add('go');}
  toast(t,ic){const T=$('#toasts');if(T.children.length>3)T.firstChild.remove();const d=el(`<div class="toast">${ic?`<img alt="" src="${this.icon(ic)}">`:''}<span></span></div>`);d.lastChild.textContent=t;T.appendChild(d);setTimeout(()=>d.remove(),2800);}
  loot(p,got){document.querySelectorAll('.loot').forEach(l=>{if(l.dataset.p===String(p.i))l.remove();});const n=document.querySelectorAll('.loot').length;const d=el(`<div class="loot" data-p="${p.i}" style="top:${58+n*9}%"></div>`);got.forEach(([k,t],i)=>{const c=el(`<div style="animation-delay:${i*.12}s;border-left:6px solid ${p.css}"><img alt="" src="${this.icon(k)}"><span></span></div>`);c.lastChild.textContent=t;d.appendChild(c);});document.body.appendChild(d);setTimeout(()=>d.remove(),3500);}
  bossIntro(n,s){const b=$('#bi');document.body.classList.toggle('cine',!!n);if(!n){b.classList.remove('on');return;}b.querySelector('h2').textContent=n;b.querySelector('p').textContent=s;b.classList.add('on');}
  sapucay(p,t){const s=$('#sap');s.className='';s.style.setProperty('--pc',p.css);s.children[0].src=this.icon('h_'+p.ch);s.children[1].textContent='¡'+t+'!';void s.offsetWidth;s.classList.add('go');}
  taba(r,p){const t=$('#taba');if(r==='end'){t.hidden=true;return;}t.hidden=false;const M={start:['¡Va la taba!',p?.name+' la revolea',''],suerte:['¡Suerte!','Cayó de carne','var(--sol)'],clavada:['¡Clavada!','De punta en la tierra: jackpot de mejoras','#ffe27a'],lado:['De costado','No hay juego. La casa devuelve patacones','var(--cielo)'],culo:['¡Culo!','Mala suerte, se viene la malaria','#ff6a4a']}[r];t.style.color=M[2];t.innerHTML=`${M[0]}<small>${M[1]}</small>`;}
  quiniela(res,cb){const q=$('#quini');q.hidden=false;q.className='';q.innerHTML=`<h3>¡La Quiniela!</h3><div class="rs">${'<div class="rl"></div>'.repeat(3)}</div>`;const rl=[...q.querySelectorAll('.rl')];const a=pick(QUINI);let f;if(res==='jackpot')f=[a,a,a];else if(res==='par'){const b=pick(QUINI.filter(x=>x!==a));f=[a,a,b];f.sort(()=>Math.random()-.5);}else{const s=[...QUINI].sort(()=>Math.random()-.5);f=s.slice(0,3);}
    const put=(e,x)=>e.innerHTML=`${x[0]}<small>${x[1]}</small>`;let n=0;const iv=setInterval(()=>{n++;rl.forEach((e,i)=>{if(n<14+i*(res==='jackpot'&&i===2?13:8))put(e,pick(QUINI));else if(!e.ok){e.ok=1;put(e,f[i]);audio.play('reelstop');}});audio.play('reel');if(rl.every(e=>e.ok)){clearInterval(iv);if(res==='jackpot')q.classList.add('win');cb();setTimeout(()=>q.hidden=true,res==='jackpot'?2600:1300);}},70);}
  // ------- subir de nivel -------
  upText(o){if(o.ty==='x'||o.ty==='evo')return o.d;if(o.ty==='p')return PASS[o.id].d;const d=WEAPONS[o.id];if(o.lv===1)return d.d;const u=d.u[o.lv-2];return Object.entries(u).map(([k,v])=>k==='n'?`+${v} ${UPN.n}`:k==='cd'?`Recarga más rápida`:k==='area'||k==='spd'||k==='dur'?`Más ${UPN[k]}`:`+${v} ${UPN[k]}`).join(', ');}
  levelUp(g,cb){this.luCb=cb;const L=$('#lu');L.hidden=false;L.querySelector('h2').textContent='¡Nivel '+(g.level-g.luN+1)+'!';const R=$('#lup');R.innerHTML='';const hum=g.players.filter(p=>!p.cpu).length;const cw=innerWidth<760?148:hum===1?212:hum===2?Math.min(178,innerWidth/8.4):Math.min(140,innerWidth/8);
    this.lps=[];for(const p of g.players){if(p.cpu){const of=g.offers(p);const ev=of.find(o=>o.ty==='evo'),own=of.find(o=>o.ty==='w'&&o.lv>1);g.apply(p,ev||(Math.random()<.6&&own)||pick(of));continue;}
      const st={p,offers:g.offers(p),sel:0,row:0,done:false,truco:false,lock:.28};st.el=el(`<div class="lp" style="--pc:${p.css};--cw:${cw}px"><div class="nm"></div><div class="cards"></div><div class="lb"></div></div>`);R.appendChild(st.el);this.lps.push(st);this.luDraw(st);}
    if(!this.lps.length){L.hidden=true;setTimeout(cb,0);}}
  luDraw(st){const p=st.p,e=st.el;e.classList.toggle('done',st.done);e.querySelector('.nm').textContent=`J${p.i+1} · ${p.name}`;const C=e.querySelector('.cards');C.innerHTML='';st.offers.forEach((o,i)=>{const d=o.ty==='w'||o.ty==='evo'?WEAPONS[o.id]:o.ty==='p'?PASS[o.id]:o;const ev=o.ty==='evo';const syn=o.ty==='w'&&!p.pas[d.ev]?`Evoluciona con ${PASS[d.ev].n}`:o.ty==='p'&&p.w.some(w=>WEAPONS[w.id].ev===o.id&&!w.evo)?`Evoluciona ${WEAPONS[p.w.find(w=>WEAPONS[w.id].ev===o.id).id].n}`:'';
      const c=el(`<button class="naipe ${st.ban?'ban':''} ${o.gold?'gold':''} ${st.row===0&&i===st.sel?'sel':''}"><span class="nx">${ev?'★':o.lv||'·'}</span><span class="nx b">${ev?'★':o.lv||'·'}</span><span class="in"><img alt="" src="${this.icon(o.icon||(o.id==='vino'?'corazon':o.id))}"><h3>${o.n||d.n}</h3><p>${this.upText(o)}</p><span class="tg">${ev?'<span class="nv">¡Evolución!</span>':o.gold?'<span class="nv">Dorada: vale doble</span>':o.lv===1?'<span class="nv">Nuevo</span>':''}</span><span class="tg">${ev?'':syn}</span></span></button>`);c.onclick=()=>{if(st.done)return;st.sel=i;st.row=0;this.luOk(st);};c.onmouseenter=()=>{if(!st.done&&(st.sel!==i||st.row)){st.sel=i;st.row=0;[...C.children].forEach((q,j)=>q.classList.toggle('sel',j===i));e.querySelectorAll('.lb button').forEach(q=>q.classList.remove('sel'));}};C.appendChild(c);});
    const B=e.querySelector('.lb');B.innerHTML='';if(st.done){if(st.res)B.appendChild(el(`<div class="tres ${st.win?'w':'l'}">${st.res}</div>`));return;}
    const r=el(`<button class="${st.row===1&&st.sel===0?'sel':''}" ${p.rer<=0?'disabled':''}>Mezclar (${p.rer})</button>`),t=el(`<button class="tr ${st.truco?'on':''} ${st.row===1&&st.sel===1?'sel':''}">${st.truco?'¡Truco cantado!':'Cantar truco: doble o nada'}</button>`);const z=el(`<button class="${st.ban?'on ':''}${st.row===1&&st.sel===2?'sel':''}" ${p.ban<=0?'disabled':''}>${st.ban?'Elegí cuál tirar':`Descartar (${p.ban})`}</button>`);r.onclick=()=>this.luReroll(st);t.onclick=()=>this.luTruco(st);z.onclick=()=>this.luBan(st);B.append(r,t,z);}
  luBan(st){if(st.done||st.p.ban<=0)return;st.ban=!st.ban;audio.play('move');this.luDraw(st);}
  luReroll(st){if(st.p.rer<=0||st.done)return;st.p.rer--;st.offers=this.game.offers(st.p);audio.play('throw');this.luDraw(st);}
  luTruco(st){if(st.done)return;st.truco=!st.truco;audio.play(st.truco?'truco':'back');this.luDraw(st);}
  luOk(st){if(st.done||st.lock>0)return;if(st.row===1){st.sel===0?this.luReroll(st):st.sel===1?this.luTruco(st):this.luBan(st);return;}const o=st.offers[st.sel];if(!o)return;if(st.ban&&(o.ty==='w'||o.ty==='p')){const own=o.ty==='w'?st.p.w.some(w=>w.id===o.id):st.p.pas[o.id];st.ban=false;if(own){audio.play('back');this.luDraw(st);return;}st.p.ban--;st.p.banned.add(o.id);const nw=this.game.offers(st.p).find(q=>!st.offers.some(x=>x.id===q.id));nw?st.offers[st.sel]=nw:st.offers=this.game.offers(st.p);audio.play('crit');this.luDraw(st);return;}st.done=true;const g=this.game,p=st.p;
    if(st.truco){const w=Math.random()<.5+Math.min(.15,(p.s.luck-1)*.15);let a=Math.random()*13|0,b=a+1+(Math.random()*(13-a)|0);st.win=w;st.res=w?`¡Quiero y gano!<small>${TRUCO[a]} mata ${TRUCO[b].toLowerCase()} de Mandinga. Vale doble</small>`:`Te mataron la carta<small>${TRUCO[a]} de Mandinga contra ${TRUCO[b].toLowerCase()}. Consuelo: 15 patacones</small>`;if(w){g.stat('truco_g');g.apply(p,o,(o.gold?2:1)*(o.ty==='evo'?1:2));if(o.ty==='evo')g.give(p,1);audio.play('win');}else{g.gold+=15;audio.play('lose');}st.hold=1.6;}
    else{g.apply(p,o);audio.play('pick');st.hold=.18;}this.luDraw(st);}
  luTick(){if(!this.lps)return;const dt=.0166;let all=true;for(const st of this.lps){if(st.lock>0)st.lock-=dt;if(st.done){st.hold-=dt;if(st.hold>0)all=false;continue;}all=false;const s=input.st[st.p.dev];if(!s)continue;const n=st.row===0?st.offers.length:3;let ch=false;if(s.pL){st.sel=(st.sel+n-1)%n;ch=1;}if(s.pR){st.sel=(st.sel+1)%n;ch=1;}if(s.pD&&st.row===0){st.row=1;st.sel=1;ch=1;}if(s.pU&&st.row===1){st.row=0;st.sel=0;ch=1;}if(ch){audio.play('move');this.luDraw(st);}if(s.pd)this.luOk(st);}
    if(all){this.lps=null;$('#lu').hidden=true;this.luCb();}}
  // ------- fin -------
  // ------- táctil -------
  // Celular o tablet con pantalla táctil. No se usa (any-pointer:fine): muchos Samsung y Xiaomi lo reportan por el lápiz o el lector de huella.
  touchInit(){this.isTouch=navigator.maxTouchPoints>0&&(matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    // Si igual se equivoca: al tocar la pantalla el jugador de teclado pasa a táctil, y al mover con el teclado vuelve.
    addEventListener('pointerdown',e=>{if(e.pointerType==='touch')this.useDev('touch');},{capture:true});
    addEventListener('keydown',e=>{const t=e.target&&e.target.tagName;if(e.isTrusted&&t!=='INPUT'&&t!=='TEXTAREA'&&/^(Key[WASD]|Arrow)/.test(e.code))this.useDev('k1');},{capture:true});
    const T=input.touch,st=$('#stick'),c=$('#c');let id=null,ox=0,oy=0;const mv=e=>{if(e.pointerId!==id)return;let dx=(e.clientX-ox)/52,dy=(e.clientY-oy)/52;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}T.x=dx;T.z=dy;st.firstChild.style.transform=`translate(calc(-50% + ${dx*42}px),calc(-50% + ${dy*42}px))`;};
    c.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||id!==null)return;id=e.pointerId;ox=e.clientX;oy=e.clientY;st.style.display='block';st.style.left=ox+'px';st.style.top=oy+'px';try{c.setPointerCapture(id);}catch(_){}});c.addEventListener('pointermove',mv);const up=e=>{if(e.pointerId!==id)return;id=null;T.x=T.z=0;st.style.display='none';};c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
    const bt=(q,k)=>{const b=$(q);b.addEventListener('pointerdown',()=>T[k]=true);for(const n of['pointerup','pointerleave','pointercancel'])b.addEventListener(n,()=>T[k]=false);};bt('#tdash','dash');bt('#tult','ult');bt('#tsk','sk');$('#pbtn').onclick=()=>{if(this.game.state==='play')this.pause();};}
  // Cambia el control del único jugador local de teclado/táctil (en la sala y en la partida en curso)
  useDev(d){const o=d==='touch'?'k1':'touch';if(d==='touch')this.isTouch=true;const ok=l=>l.some(s=>s&&(s.dev===d||s.dev==='k2'))?-1:l.findIndex(s=>s&&s.dev===o);
    const i=ok(this.slots);if(i>=0){this.slots[i].dev=d;if(this.scr==='lobby')this.drawSlots();}
    const ps=this.game&&this.game.players||[],j=ok(ps);if(j>=0){ps[j].dev=d;if(!$('#hud').hidden)$('#touch').hidden=d!=='touch';const b=this.pe&&this.pe[j]&&this.pe[j].sk.querySelector('b');if(b)b.textContent=d==='k1'?'Q':'';}}
}
for(const k in UI2)UI.prototype[k]=UI2[k];
