(() => {
'use strict';
const $=id=>document.getElementById(id);
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let scene,camera,renderer,clock,player,cockpit;
let running=false,started=false,firstPerson=false;
let difficulty='normal',quality='medium',deviceMode='auto';
let health=100,ammo=300,kills=0,heading=0,pitch=0,roll=0;
let speed=420,time=0,spawnTimer=0,lastShot=0,shake=0,flash=0;
let fireHeld=false,boostHeld=false,shakeEnabled=true,toastTimer;
let boost=100,enemyLimit=5,maxParticles=65;
const keys={},touch={left:false,right:false,up:false,down:false};
const enemies=[],bullets=[],hostileBullets=[],particles=[],clouds=[],bannerRigs=[];
const imageFiles=['1.jpg','2.jpg','3.jpg','4.jpg'];
const bodyGeo=new THREE.ConeGeometry(.65,10,8);
bodyGeo.rotateX(-Math.PI/2);
const wingGeo=new THREE.BufferGeometry();
wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,-8,0,2,-6.5,0,-2,.5,0,0,8,0,2,6.5,0,-2],3));
wingGeo.setIndex([0,1,2,3,5,4]);wingGeo.computeVertexNormals();
let playerMats,enemyMats;

function init(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x87b7d0);scene.fog=new THREE.Fog(0x87b7d0,600,2600);
 camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,3500);
 renderer=new THREE.WebGLRenderer({antialias:!matchMedia('(pointer:coarse)').matches,powerPreference:'high-performance'});
 renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.2));renderer.outputColorSpace=THREE.SRGBColorSpace;$('viewport').appendChild(renderer.domElement);
 clock=new THREE.Clock();scene.add(new THREE.HemisphereLight(0xe8f7ff,0x475363,2));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-100,200,100);scene.add(sun);
 playerMats={body:new THREE.MeshStandardMaterial({color:0x354b5c,metalness:.4,roughness:.5}),wing:new THREE.MeshStandardMaterial({color:0x243746,side:THREE.DoubleSide}),glass:new THREE.MeshBasicMaterial({color:0x58d9ff,transparent:true,opacity:.7})};
 enemyMats={body:new THREE.MeshStandardMaterial({color:0x733f43,metalness:.3,roughness:.6}),wing:new THREE.MeshStandardMaterial({color:0x49353d,side:THREE.DoubleSide}),glass:new THREE.MeshBasicMaterial({color:0xff6548})};
 createWorld();createBannerRigs();
 player=makeJet(true);player.position.set(0,50,0);scene.add(player);cockpit=makeCockpit();
 bindEvents();applyQuality();updateDevice();animate();
}
function createWorld(){
 const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,depthWrite:false}),cloudGeo=new THREE.SphereGeometry(1,7,5);
 for(let i=0;i<35;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const m=new THREE.Mesh(cloudGeo,cloudMat);const s=rand(8,18);m.scale.set(s*1.7,s*.4,s);m.position.set(j*rand(8,14),rand(-2,2),rand(-5,5));g.add(m)}g.position.set(rand(-1000,1000),rand(-20,200),rand(-1800,700));scene.add(g);clouds.push(g)}
 const grid=new THREE.GridHelper(2200,55,0x5792a9,0x47798e);grid.position.y=-90;grid.material.transparent=true;grid.material.opacity=.13;scene.add(grid);
}
function makeJet(isPlayer=false){
 const g=new THREE.Group(),mats=isPlayer?playerMats:enemyMats;
 const body=new THREE.Mesh(bodyGeo,mats.body);body.position.z=-1;g.add(body);
 const wings=new THREE.Mesh(wingGeo,mats.wing);g.add(wings);
 const tail=new THREE.Mesh(new THREE.BoxGeometry(.2,1.4,2),new THREE.MeshBasicMaterial({color:isPlayer?0x6df5ff:0xff6548}));tail.position.set(0,.7,3.2);g.add(tail);
 const canopy=new THREE.Mesh(new THREE.SphereGeometry(.65,8,6),mats.glass);canopy.scale.set(.8,.6,1.8);canopy.position.set(0,.55,-2.1);g.add(canopy);
 g.userData.hp=1;g.userData.isPlayer=isPlayer;return g;
}
function makeBalloon(color=0xf5b94f){
 const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color,roughness:.75});
 const envelope=new THREE.Mesh(new THREE.SphereGeometry(5,18,14),mat);envelope.scale.set(1,1.2,1);g.add(envelope);
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,1.5,10),new THREE.MeshStandardMaterial({color:0x8e6749}));neck.position.y=-6;g.add(neck);
 const basket=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.3,1.6),new THREE.MeshStandardMaterial({color:0x765039}));basket.position.y=-8;g.add(basket);
 return g;
}
function makeBannerTexture(image){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f2eee1';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#263b4a';ctx.lineWidth=12;ctx.strokeRect(6,6,1012,244);
 if(image){const iw=image.width,ih=image.height,scale=Math.max(1024/iw,256/ih),w=iw*scale,h=ih*scale;ctx.save();ctx.beginPath();ctx.rect(12,12,1000,232);ctx.clip();ctx.drawImage(image,(1024-w)/2,(256-h)/2,w,h);ctx.restore();ctx.fillStyle='#ffffffa0';ctx.fillRect(20,20,984,36);ctx.fillStyle='#102438';ctx.font='bold 22px Arial';ctx.fillText('SKYSTRIKE  •  AIR SHOW',32,45)}
 else {ctx.fillStyle='#102438';ctx.font='bold 52px Arial';ctx.textAlign='center';ctx.fillText('SKYSTRIKE AIR SHOW',512,150);ctx.textAlign='left'}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function createBannerRigs(){
 const loader=new THREE.TextureLoader();let done=0;const images=[];
 imageFiles.forEach((file,i)=>loader.load('./'+file,t=>{images[i]=t.image;done++;if(done===imageFiles.length)buildBanners(images)},undefined,()=>{done++;if(done===imageFiles.length)buildBanners(images)}));
 // Always create fallback banners immediately; loaded images replace the banner textures when ready.
 buildBanners([]);
 function buildBanners(imgs){
  if(bannerRigs.length)return;
  for(let i=0;i<3;i++){
   const rig=new THREE.Group(),left=makeBalloon([0xf2b84b,0x63c9dc,0xe97868][i]),right=makeBalloon([0x63c9dc,0xe97868,0xf2b84b][i]);
   left.position.set(-19,4,0);right.position.set(19,4,0);rig.add(left,right);
   const tex=makeBannerTexture(imgs[i%Math.max(1,imgs.length)]||null);
   const banner=new THREE.Mesh(new THREE.PlaneGeometry(36,9),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
   banner.position.set(0,-1,0);rig.add(banner);
   const ropeMat=new THREE.LineBasicMaterial({color:0x493426});
   for(const x of [-17,17]){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x,0,0),V(x,-1,0)]),ropeMat);rig.add(line)}
   rig.position.set(rand(-650,650),rand(145,260),rand(-1200,250));rig.rotation.y=rand(-.3,.3);scene.add(rig);bannerRigs.push(rig);
  }
 }
}
function spawnEnemy(initial=false){
 if(enemies.length>=enemyLimit||!player)return;
 const jet=makeJet(false),angle=rand(0,Math.PI*2),distance=initial?rand(300,450):rand(430,650);
 jet.position.set(player.position.x+Math.sin(angle)*distance,clamp(player.position.y+rand(-85,85),-5,220),player.position.z-Math.cos(angle)*distance);
 jet.userData.hp=difficulty==='hard'?3:1;jet.userData.fireClock=rand(2,5);jet.userData.turnRate=difficulty==='hard'?.7:.42;jet.userData.speed=difficulty==='hard'?48:34;
 scene.add(jet);enemies.push(jet);
}
function fireBullet(origin,direction,hostile=false){
 const color=hostile?0xff4e37:0xafffff,dir=direction.clone().normalize();
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1,5),new THREE.MeshBasicMaterial({color}));mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(V(0,1,0),dir);mesh.scale.set(1,hostile?5:8,1);scene.add(mesh);
 const trail=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,hostile?2.5:4),new THREE.MeshBasicMaterial({color:hostile?0xff9a55:0x53eaff}));trail.position.copy(origin);trail.quaternion.copy(mesh.quaternion);scene.add(trail);
 (hostile?hostileBullets:bullets).push({mesh,trail,previous:origin.clone(),velocity:dir.multiplyScalar(hostile?155:390),life:hostile?3:2.2});
}
function shoot(){
 if(!running||ammo<=0)return;const now=performance.now();if(now-lastShot<115)return;lastShot=now;ammo--;
 const dir=V(0,0,-1).applyQuaternion(player.quaternion).normalize(),origin=player.position.clone().add(dir.clone().multiplyScalar(8));fireBullet(origin,dir,false);$('ammo').textContent=ammo;
 if(ammo===0)toast('AMMO DEPLETED','GUN SYSTEM EMPTY');
}
function explode(pos,big=true){
 const count=big?22:3;
 for(let i=0;i<count;i++){if(particles.length>=maxParticles){const old=particles.shift();scene.remove(old.mesh);old.mesh.geometry.dispose();old.mesh.material.dispose()}
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:big?[0xffd477,0xff693e,0xe63e2e][i%3]:0x9cffff,transparent:true}));mesh.position.copy(pos);scene.add(mesh);
 particles.push({mesh,velocity:V(rand(-1,1),rand(-.7,1),rand(-1,1)).normalize().multiplyScalar(rand(10,big?55:25)),life:big?.8:.3,max:big?.8:.3})}
 if(big){if(shakeEnabled)shake=.4;toast('KILL CONFIRMED','ENEMY AIRCRAFT DESTROYED')}
}
function toast(title,message){$('toast-title').textContent=title;$('toast-message').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800)}
function updatePlayer(dt){
 const left=keys.ArrowLeft||keys.KeyA||touch.left,right=keys.ArrowRight||keys.KeyD||touch.right,up=keys.ArrowUp||keys.KeyW||touch.up,down=keys.ArrowDown||keys.KeyS||touch.down;
 const turn=(left?1:0)-(right?1:0),climb=(up?1:0)-(down?1:0);
 heading+=turn*dt*.78;pitch=THREE.MathUtils.lerp(pitch,clamp(climb*.42,-.42,.42),dt*2.3);roll=THREE.MathUtils.lerp(roll,-turn*.78,dt*2.8);
 player.rotation.order='YXZ';player.rotation.y=heading;player.rotation.x=pitch;player.rotation.z=roll;
 const boosting=(keys.ShiftLeft||keys.ShiftRight||boostHeld)&&boost>0;
 if(boosting)boost=Math.max(0,boost-28*dt);else boost=Math.min(100,boost+12*dt);
 const forward=V(0,0,-1).applyQuaternion(player.quaternion);player.position.addScaledVector(forward,dt*(boosting?100:60));
 player.position.y=clamp(player.position.y,-10,220);player.position.x=clamp(player.position.x,-700,700);player.position.z=clamp(player.position.z,-2200,900);
 speed=boosting?680:420+Math.abs(turn)*18;
 $('boost-bar').style.width=boost+'%';$('boost-text').textContent=Math.round(boost)+'%';
 if(fireHeld||keys.Space||keys.Mouse0)shoot();
}
function updateEnemies(dt){
 spawnTimer+=dt;if(spawnTimer>6.5&&enemies.length<enemyLimit){spawnTimer=0;spawnEnemy()}
 for(let i=enemies.length-1;i>=0;i--){
  const e=enemies[i],toPlayer=player.position.clone().sub(e.position),distance=toPlayer.length();
  const desired=Math.atan2(-toPlayer.x,-toPlayer.z);let diff=desired-e.rotation.y;while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;
  e.rotation.y+=clamp(diff,-e.userData.turnRate*dt,e.userData.turnRate*dt);e.rotation.z=THREE.MathUtils.lerp(e.rotation.z,clamp(-diff,-.6,.6),dt*1.6);
  const forward=V(0,0,-1).applyQuaternion(e.quaternion);e.position.addScaledVector(forward,(distance<170?10:e.userData.speed)*dt);
  const targetY=clamp(player.position.y+Math.sin(time*.7+i)*35,-5,220);e.position.y=THREE.MathUtils.lerp(e.position.y,targetY,dt*.22);
  for(let j=0;j<enemies.length;j++){if(i===j)continue;const sep=e.position.clone().sub(enemies[j].position),d=sep.length();if(d>0&&d<75)e.position.addScaledVector(sep.normalize(),dt*28)}
  e.userData.fireClock-=dt;if(e.userData.fireClock<=0&&distance<430){const aim=player.position.clone().sub(e.position).normalize();fireBullet(e.position.clone().add(aim.clone().multiplyScalar(7)),aim,true);e.userData.fireClock=rand(difficulty==='hard'?1.3:2.4,difficulty==='hard'?2.4:3.8)}
  if(distance>1200){scene.remove(e);enemies.splice(i,1)}
 }
}
function segmentDistance(point,a,b){const ab=b.clone().sub(a),den=ab.lengthSq();if(!den)return point.distanceTo(a);const t=clamp(point.clone().sub(a).dot(ab)/den,0,1);return point.distanceTo(a.clone().addScaledVector(ab,t))}
function removeBullet(arr,i,b){scene.remove(b.mesh);scene.remove(b.trail);b.mesh.geometry.dispose();b.mesh.material.dispose();b.trail.geometry.dispose();b.trail.material.dispose();arr.splice(i,1)}
function updateBullets(dt){
 for(const group of [{arr:bullets,hostile:false},{arr:hostileBullets,hostile:true}]){
  for(let i=group.arr.length-1;i>=0;i--){
   const b=group.arr[i];b.previous.copy(b.mesh.position);b.mesh.position.addScaledVector(b.velocity,dt);b.trail.position.copy(b.mesh.position);b.life-=dt;let remove=b.life<=0;
   if(!group.hostile){
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(segmentDistance(e.position,b.previous,b.mesh.position)<10){e.userData.hp--;explode(b.mesh.position,false);remove=true;if(e.userData.hp<=0){explode(e.position,true);scene.remove(e);enemies.splice(j,1);kills++;$('kills').textContent=kills}break}}
   }else if(segmentDistance(player.position,b.previous,b.mesh.position)<9){
    remove=true;health=Math.max(0,health-(difficulty==='hard'?12:difficulty==='easy'?4:7));flash=.2;if(shakeEnabled)shake=.2;$('health').textContent=health+'%';$('health-bar').style.width=health+'%';if(health<=0)endGame();
   }
   if(remove)removeBullet(group.arr,i,b);
  }
 }
}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.multiplyScalar(.96);p.mesh.material.opacity=Math.max(0,p.life/p.max);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(i,1)}}}
function makeCockpit(){const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0x172632,metalness:.6});const dash=new THREE.Mesh(new THREE.BoxGeometry(3.8,.4,1.2),mat);dash.position.set(0,-1,-2.8);g.add(dash);return g}
function updateCamera(dt){
 const forward=V(0,0,-1).applyQuaternion(player.quaternion);let desired,look;
 if(firstPerson){desired=player.position.clone().add(V(0,.6,0)).add(forward.clone().multiplyScalar(2));look=desired.clone().add(forward.clone().multiplyScalar(100));cockpit.position.copy(player.position);cockpit.quaternion.copy(player.quaternion);if(!cockpit.parent)scene.add(cockpit)}
 else{if(cockpit.parent)scene.remove(cockpit);desired=player.position.clone().add(forward.clone().multiplyScalar(-32)).add(V(0,18,0));look=player.position.clone().add(forward.clone().multiplyScalar(22)).add(V(0,-8,0))}
 camera.position.lerp(desired,Math.min(1,dt*3.2));camera.up.set(0,1,0);camera.lookAt(look);
 if(shake>0){camera.position.x+=rand(-shake,shake);camera.position.y+=rand(-shake,shake);shake=Math.max(0,shake-dt*1.5)}
}
function updateHUD(){
 $('alt').textContent=Math.round((player.position.y+80)*18+1200).toLocaleString('en-US');$('speed').textContent=Math.round(speed);$('heading').textContent=String(Math.round(((heading*180/Math.PI)%360+360)%360)).padStart(3,'0');
 let nearest=Infinity;for(const e of enemies)nearest=Math.min(nearest,e.position.distanceTo(player.position));
 $('target-status').textContent=Number.isFinite(nearest)?'TARGET · '+Math.round(nearest)+' M':'NO TARGET';$('target-bar').style.width=Number.isFinite(nearest)?clamp(100-nearest/7,5,100)+'%':'0%';$('view-label').textContent=firstPerson?'1ST PERSON · F3':'3RD PERSON · F3';
}
function applyQuality(){quality=$('quality').value;renderer.setPixelRatio(quality==='low'?.7:quality==='high'?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,1.1));renderer.setSize(innerWidth,innerHeight);enemyLimit=quality==='low'?3:quality==='high'?7:5;maxParticles=quality==='low'?30:quality==='high'?120:65;renderer.shadowMap.enabled=false}
function updateDevice(){const mobile=deviceMode==='mobile'||(deviceMode==='auto'&&matchMedia('(pointer:coarse)').matches);$('mobile-controls').classList.toggle('active',mobile&&started);$('control-label').textContent=mobile?'TOUCH CONTROLS':'KEYBOARD / MOUSE'}
function clearCombatObjects(){
 for(const arr of [bullets,hostileBullets]){for(const b of arr){scene.remove(b.mesh,b.trail);b.mesh.geometry.dispose();b.mesh.material.dispose();b.trail.geometry.dispose();b.trail.material.dispose()}arr.length=0}
 for(const p of particles){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose()}particles.length=0;
 for(const e of enemies)scene.remove(e);enemies.length=0;
}
function startGame(){
 running=true;started=true;heading=pitch=roll=0;health=100;ammo=300;kills=0;boost=100;time=spawnTimer=0;shake=0;player.position.set(0,50,0);player.rotation.set(0,0,0);clearCombatObjects();
 for(let i=0;i<Math.min(4,enemyLimit);i++)spawnEnemy(true);
 $('ammo').textContent=ammo;$('kills').textContent='0';$('health').textContent='100%';$('health-bar').style.width='100%';$('boost-bar').style.width='100%';$('boost-text').textContent='100%';
 $('start-screen').classList.add('hidden');$('game-over').classList.add('hidden');updateDevice();toast('MISSION 01','ENEMY AIRCRAFT DETECTED');
}
function endGame(){running=false;$('report').textContent=`격추 ${kills}기 · 남은 탄약 ${ammo}발 · 내구도 ${health}%`;$('game-over').classList.remove('hidden')}
function bindEvents(){
 $('start').onclick=startGame;$('restart').onclick=startGame;$('open-settings').onclick=()=>$('settings').classList.add('open');$('close-settings').onclick=()=>$('settings').classList.remove('open');
 $('apply').onclick=()=>{deviceMode=$('device').value;firstPerson=$('camera-mode').value==='first';difficulty=$('difficulty').value;shakeEnabled=$('shake').value==='on';applyQuality();updateDevice();$('settings').classList.remove('open');toast('SETTINGS UPDATED','CONFIGURATION APPLIED')};
 $('mobile-view').onclick=()=>{firstPerson=!firstPerson;$('camera-mode').value=firstPerson?'first':'third'};
 const hold=(id,setter)=>{const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();setter(true);if(el.setPointerCapture)el.setPointerCapture(e.pointerId)});['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>el.addEventListener(ev,()=>setter(false)))};
 hold('mobile-fire',v=>fireHeld=v);hold('mobile-boost',v=>boostHeld=v);
 document.querySelectorAll('[data-key]').forEach(btn=>{const k=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();touch[k]=true;if(btn.setPointerCapture)btn.setPointerCapture(e.pointerId)});['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,()=>touch[k]=false))});
 window.addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='F3'){firstPerson=!firstPerson;$('camera-mode').value=firstPerson?'first':'third'}if(e.code==='Escape')$('settings').classList.toggle('open')});
 window.addEventListener('keyup',e=>keys[e.code]=false);
 renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0&&started){fireHeld=true;keys.Mouse0=true}});
 window.addEventListener('pointerup',()=>{fireHeld=false;keys.Mouse0=false});
 window.addEventListener('blur',()=>{fireHeld=false;boostHeld=false;Object.keys(keys).forEach(k=>keys[k]=false);Object.keys(touch).forEach(k=>touch[k]=false)});
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='low'?.7:quality==='high'?1.5:1.1))});
}
function animate(){
 requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.035);
 if(running){time+=dt;updatePlayer(dt);updateEnemies(dt);updateBullets(dt);updateParticles(dt);updateHUD();if(flash>0){flash-=dt;$('damage-flash').style.opacity=String(Math.max(0,flash*1.8))}}
 updateCamera(dt);renderer.render(scene,camera);
}
init();
})();