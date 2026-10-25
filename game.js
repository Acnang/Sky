(()=>{"use strict";
const $=id=>document.getElementById(id), keys={},touch={up:false,down:false,left:false,right:false,fire:false,boost:false};
let scene,camera,renderer,clock,player,yaw=0,pitch=0,speed=0,boostEnergy=100,started=false,third=true,score=0,fireTimer=0,spawnTimer=1;
const enemies=[],bullets=[],effects=[],banners=[],images=[1,2,3,4],MAX_DT=.035;
const mat=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.6});
const playerMat=mat(0x367fbe),enemyMat=mat(0xd94b43),dark=mat(0x243746);
init();
function init(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x8bc8ed);scene.fog=new THREE.Fog(0x8bc8ed,500,1800);
 camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,3000);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;$("game").prepend(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xeaf8ff,0x536879,2));let sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-200,400,150);scene.add(sun);
 let ground=new THREE.Mesh(new THREE.PlaneGeometry(5000,5000),mat(0x6aa65e));ground.rotation.x=-Math.PI/2;ground.position.y=-5;scene.add(ground);
 for(let i=0;i<32;i++){let g=new THREE.Group();for(let j=0;j<3;j++){let p=new THREE.Mesh(new THREE.SphereGeometry(15+Math.random()*10,8,6),mat(0xffffff));p.position.set((j-1)*17,Math.random()*4,Math.random()*8);g.add(p)}g.position.set((Math.random()-.5)*2200,200+Math.random()*220,(Math.random()-.5)*2200);scene.add(g)}
 player=plane(playerMat);player.position.set(0,80,0);scene.add(player);loadBanners();
 clock=new THREE.Clock();controls();addEventListener("resize",resize);$("start").onclick=()=>{started=true;$("overlay").style.display="none";$("message").textContent=""};animate();
}
function plane(material){let g=new THREE.Group(),f=new THREE.Mesh(new THREE.CapsuleGeometry(1.25,8,4,8),material);f.rotation.x=Math.PI/2;g.add(f);
 let w=new THREE.Mesh(new THREE.BoxGeometry(13,.35,2.5),material);w.position.z=.4;g.add(w);let tw=new THREE.Mesh(new THREE.BoxGeometry(5,.25,1.3),material);tw.position.set(0,.2,4.2);g.add(tw);let fin=new THREE.Mesh(new THREE.BoxGeometry(.35,2,1.5),material);fin.position.set(0,1,4.1);g.add(fin);
 let nose=new THREE.Mesh(new THREE.ConeGeometry(.8,2.6,8),dark);nose.rotation.x=-Math.PI/2;nose.position.z=-5.3;g.add(nose);let glass=new THREE.Mesh(new THREE.SphereGeometry(1,9,7),new THREE.MeshStandardMaterial({color:0x173b53,metalness:.4,roughness:.2}));glass.scale.set(.7,.55,1.2);glass.position.set(0,.8,-1.4);g.add(glass);return g}
function line(parent,a,b,color=0x51463b){let p1=new THREE.Vector3(...a),p2=new THREE.Vector3(...b),d=p2.clone().sub(p1),m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,d.length(),5),mat(color));m.position.copy(p1).add(p2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(m)}
function loadBanners(){let loader=new THREE.TextureLoader(),loaded=[],done=0;images.forEach(n=>loader.load("./"+n+".jpg",t=>{t.colorSpace=THREE.SRGBColorSpace;loaded.push({n,t});check()},undefined,()=>{console.warn("이미지 누락: "+n+".jpg");check()}));
 function check(){if(++done!==images.length)return;if(!loaded.length){$("message").textContent="1.jpg~4.jpg 광고 이미지를 저장소에 올려주세요";return}
 loaded.forEach((v,i)=>{let a=i/loaded.length*Math.PI*2;banner(v,Math.cos(a)*260,110+i%2*20,Math.sin(a)*260,a)});
 for(let i=0;i<5;i++){let v=loaded[i%loaded.length],a=Math.random()*Math.PI*2,r=350+Math.random()*400;banner(v,Math.cos(a)*r,100+Math.random()*130,Math.sin(a)*r,a)}
 }}
function banner(item,x,y,z,a){let root=new THREE.Group();root.position.set(x,y,z);root.rotation.y=a+Math.PI/2;
 let bm=mat([0xf4bd50,0x74d9ed,0xff8b8b,0x9b91f2][item.n%4]);
 for(let s of [-1,1]){let b=new THREE.Mesh(new THREE.SphereGeometry(2.1,12,9),bm);b.scale.set(.9,1.1,.9);b.position.set(s*7.7,4,0);root.add(b);line(root,[s*7.7,2,0],[s*6.5,-2,0])}
 let aspect=item.t.image?.width&&item.t.image?.height?item.t.image.width/item.t.image.height:2.5,w=18,h=Math.max(5,Math.min(8,w/aspect)),board=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:item.t,side:THREE.DoubleSide}));board.position.y=-3.3;root.add(board);
 let frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,h)),new THREE.LineBasicMaterial({color:0xffffff}));frame.position.copy(board.position);root.add(frame);line(root,[-w/2,-3.3+h/2,0],[w/2,-3.3+h/2,0]);line(root,[-w/2,-3.3-h/2,0],[w/2,-3.3-h/2,0]);
 root.userData={y,phase:Math.random()*6,speed:.2+Math.random()*.2};banners.push(root);scene.add(root)}
function forward(obj=player){return new THREE.Vector3(0,0,-1).applyQuaternion(obj.quaternion).normalize()}
function shoot(obj,isPlayer){let d=isPlayer?forward():player.position.clone().sub(obj.position).normalize(),b=new THREE.Mesh(new THREE.SphereGeometry(isPlayer?.42:.36,6,5),new THREE.MeshBasicMaterial({color:isPlayer?0xfff0a0:0xff674f}));b.position.copy(obj.position).addScaledVector(d,7);b.userData={v:d.multiplyScalar(isPlayer?230:82),life:isPlayer?2.4:4,player:isPlayer};scene.add(b);bullets.push(b)}
function spawnEnemy(){let e=plane(enemyMat),f=forward(),right=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize();if(right.length()<.1)right.set(1,0,0);e.position.copy(player.position).addScaledVector(f,300+Math.random()*100).addScaledVector(right,(Math.random()<.5?-1:1)*(120+Math.random()*170));e.position.y+=(Math.random()-.5)*90;e.lookAt(player.position);e.userData={hp:3,speed:20+Math.random()*5,phase:Math.random()*6,fire:2+Math.random()*2,offset:new THREE.Vector3((Math.random()-.5)*65,(Math.random()-.5)*35,(Math.random()-.5)*65)};scene.add(e);enemies.push(e)}
function updatePlayer(dt){let up=keys.ArrowUp||keys.KeyW||touch.up,down=keys.ArrowDown||keys.KeyS||touch.down,left=keys.ArrowLeft||keys.KeyA||touch.left,right=keys.ArrowRight||keys.KeyD||touch.right;
 let boosting=(keys.ShiftLeft||keys.ShiftRight||touch.boost)&&boostEnergy>0.5;boostEnergy=THREE.MathUtils.clamp(boostEnergy+(boosting?-34:17)*dt,0,100);
 yaw+=(left?1:0)*1.15*dt-(right?1:0)*1.15*dt;pitch=THREE.MathUtils.clamp(pitch+((up?1:0)-(down?1:0))*.72*dt,-.9,.9);
 let target=boosting?190:105;speed+=(target-speed)*Math.min(1,dt*1.8);let f=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));player.position.addScaledVector(f,speed*dt);player.position.y=THREE.MathUtils.clamp(player.position.y,18,380);
 player.rotation.order="YXZ";player.rotation.y=yaw;player.rotation.x=-pitch;player.rotation.z=(right?-.22:0)+(left?.22:0);
 if(keys.Space||touch.fire){fireTimer-=dt;if(fireTimer<=0){shoot(player,true);fireTimer=.16}}else fireTimer=0;
 $("speed").textContent=Math.round(speed);$("boostText").textContent=Math.round(boostEnergy)+"%";$("boostFill").style.width=boostEnergy+"%";$("boostFill").classList.toggle("low",boostEnergy<25)}
function updateEnemies(dt){spawnTimer-=dt;if(spawnTimer<=0&&enemies.length<6){spawnEnemy();spawnTimer=4+Math.random()*2}
 for(let i=enemies.length-1;i>=0;i--){let e=enemies[i],d=e.userData;d.phase+=dt;let target=player.position.clone().add(d.offset),delta=target.sub(e.position),dist=delta.length();if(dist>.01)e.lookAt(e.position.clone().add(delta.normalize().multiplyScalar(80)));
 let f=forward(e);e.position.addScaledVector(f,Math.min(d.speed*dt,1.1));e.position.y+=Math.sin(d.phase)*2.5*dt;d.fire-=dt;if(d.fire<=0&&dist<420){shoot(e,false);d.fire=3+Math.random()*1.5}if(e.position.distanceTo(player.position)>1250){scene.remove(e);enemies.splice(i,1)}}}
function updateBullets(dt){for(let i=bullets.length-1;i>=0;i--){let b=bullets[i];b.position.addScaledVector(b.userData.v,dt);b.userData.life-=dt;let remove=b.userData.life<=0;
 if(!remove&&b.userData.player){for(let j=enemies.length-1;j>=0;j--){let e=enemies[j];if(b.position.distanceTo(e.position)<7){e.userData.hp--;remove=true;if(e.userData.hp<=0){scene.remove(e);enemies.splice(j,1);score++;$("score").textContent=score;$("message").textContent="격추 성공!";setTimeout(()=>$("message").textContent="",700)}break}}}
 if(!remove&&!b.userData.player&&b.position.distanceTo(player.position)<5){remove=true;$("message").textContent="피격!";setTimeout(()=>$("message").textContent="",500)}
 if(remove){scene.remove(b);b.geometry.dispose();b.material.dispose();bullets.splice(i,1)}}}
function cameraUpdate(dt){let f=forward(),dest;if(third){dest=player.position.clone().addScaledVector(f,-34).add(new THREE.Vector3(0,19,0));camera.position.lerp(dest,1-Math.exp(-3*dt));camera.lookAt(player.position.clone().addScaledVector(f,30).add(new THREE.Vector3(0,-13,0)));$("view").textContent="3인칭"}else{dest=player.position.clone().addScaledVector(f,3).add(new THREE.Vector3(0,2.5,0));camera.position.lerp(dest,1-Math.exp(-7*dt));camera.lookAt(player.position.clone().addScaledVector(f,100));$("view").textContent="1인칭"}}
function controls(){addEventListener("keydown",e=>{keys[e.code]=true;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();if(e.code==="KeyV"&&!e.repeat)third=!third});addEventListener("keyup",e=>keys[e.code]=false);
 const bind=(id,k)=>{let el=$(id),on=e=>{e.preventDefault();touch[k]=true;el.classList.add("pressed")},off=e=>{if(e)e.preventDefault();touch[k]=false;el.classList.remove("pressed")};el.addEventListener("pointerdown",on);["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,off))};
 [["up","up"],["down","down"],["left","left"],["right","right"],["fire","fire"],["boost","boost"]].forEach(x=>bind(...x));$("viewBtn").onclick=()=>third=!third}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight)}
function animate(){requestAnimationFrame(animate);let dt=Math.min(clock.getDelta(),MAX_DT),time=clock.elapsedTime;if(started){updatePlayer(dt);updateEnemies(dt);updateBullets(dt)}banners.forEach(b=>{b.position.y=b.userData.y+Math.sin(time*b.userData.speed+b.userData.phase)*2;b.rotation.z=Math.sin(time*.4+b.userData.phase)*.02});cameraUpdate(dt);renderer.render(scene,camera)}
})();