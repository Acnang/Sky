(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  let scene, camera, renderer, clock, player, cockpit;
  let running = false, started = false;
  let firstPerson = false, shakeEnabled = true;
  let deviceMode = 'auto', difficulty = 'normal';
  let heading = 0, pitch = 0, roll = 0, speed = 420;
  let health = 100, ammo = 240, kills = 0;
  let time = 0, spawnTimer = 0, lastShot = 0;
  let shake = 0, hitFlash = 0, fireHeld = false;

  const keys = {};
  const touch = {left:false,right:false,up:false,down:false};
  const enemies = [], bullets = [], enemyBullets = [], particles = [];
  const isTouch = matchMedia('(pointer: coarse)').matches;

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x82b6d3);
    scene.fog = new THREE.Fog(0x82b6d3, 180, 1500);

    camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .1, 3000);
    camera.position.set(0,40,35);

    renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
    renderer.setSize(innerWidth,innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('viewport').appendChild(renderer.domElement);

    clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xc8edff,0x344354,2.0));
    const sun = new THREE.DirectionalLight(0xffffff,2.6);
    sun.position.set(-100,200,80);
    sun.castShadow = true;
    scene.add(sun);

    createEnvironment();
    player = makeJet(0x263e52,0x6df5ff,true);
    player.position.set(0,30,0);
    scene.add(player);
    cockpit = makeCockpit();
    bindUI();
    updateDeviceUI();
    animate();
  }

  function createEnvironment() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color:0xffffff, transparent:true, opacity:.72,
      roughness:1, depthWrite:false
    });

    for(let i=0;i<110;i++) {
      const cloud = new THREE.Group();
      const x=rand(-1100,1100), y=rand(-30,90), z=rand(-1500,400);
      for(let j=0;j<4;j++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(rand(12,30),8,6),cloudMat
        );
        puff.scale.set(1.8,.45,1);
        puff.position.set(j*rand(8,17),rand(-3,3),rand(-5,5));
        cloud.add(puff);
      }
      cloud.position.set(x,y,z);
      scene.add(cloud);
    }

    const starGeometry = new THREE.BufferGeometry();
    const stars = [];
    for(let i=0;i<1800;i++)
      stars.push(rand(-1800,1800),rand(-100,900),rand(-2200,500));
    starGeometry.setAttribute(
      'position',new THREE.Float32BufferAttribute(stars,3)
    );
    const starField = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({color:0xffffff,size:1.8,transparent:true,opacity:.65})
    );
    scene.add(starField);

    // 구름 아래의 넓은 지형 격자
    const grid = new THREE.GridHelper(2200,80,0x4b859d,0x47758b);
    grid.position.y = -100;
    grid.material.transparent = true;
    grid.material.opacity = .24;
    scene.add(grid);
  }

  function makeJet(bodyColor=0x263e52,accentColor=0x6df5ff,isPlayer=false) {
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color:bodyColor, metalness:.65, roughness:.34
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color:accentColor, metalness:.35, roughness:.3,
      emissive:accentColor, emissiveIntensity:.16
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color:0x2c9bbd, metalness:.7, roughness:.12,
      transparent:true, opacity:.8
    });

    function box(w,h,d,mat,x,y,z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      m.position.set(x,y,z);
      m.castShadow=true;
      m.receiveShadow=true;
      g.add(m);
      return m;
    }

    function wing(points,mat,y=0) {
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0],points[0][1]);
      for(let i=1;i<points.length;i++)
        shape.lineTo(points[i][0],points[i][1]);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI/2);
      const mesh = new THREE.Mesh(geo,mat);
      mesh.position.y=y;
      mesh.castShadow=true;
      g.add(mesh);
      return mesh;
    }

    // 모델의 앞쪽은 -Z 방향
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(.7,.95,10,10),
      bodyMat
    );
    fuselage.rotation.x=Math.PI/2;
    fuselage.position.z=-1;
    fuselage.scale.set(1,1,1);
    fuselage.castShadow=true;
    g.add(fuselage);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(.68,4,10),
      bodyMat
    );
    nose.rotation.x=-Math.PI/2;
    nose.position.set(0,0,-7);
    g.add(nose);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1,12,8),
      glassMat
    );
    canopy.scale.set(.58,.46,1.8);
    canopy.position.set(0,.75,-2.1);
    g.add(canopy);

    wing([[-.5,0],[-9,1.4],[-7.2,3.5],[-1,2.1]],bodyMat,.05);
    wing([[.5,0],[9,1.4],[7.2,3.5],[1,2.1]],bodyMat,.05);

    // 꼬리날개
    wing([[-.35,5],[-3,7],[-2.5,8],[0,6.5]],accentMat,.2);
    wing([[.35,5],[3,7],[2.5,8],[0,6.5]],accentMat,.2);

    // 수직 꼬리날개
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(.22,1.7,2.4),accentMat
    );
    fin.position.set(0,1.1,3.7);
    fin.rotation.x=-.15;
    g.add(fin);

    // 엔진 노즐
    for(const side of [-.48,.48]) {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(.25,.38,1.4,10),
        new THREE.MeshStandardMaterial({
          color:0x161d27,metalness:.8,roughness:.25
        })
      );
      nozzle.rotation.x=Math.PI/2;
      nozzle.position.set(side,-.15,4.4);
      g.add(nozzle);

      const glow = new THREE.Mesh(
        new THREE.ConeGeometry(.24,2.3,8),
        new THREE.MeshBasicMaterial({
          color:isPlayer?0x63dcff:0xff663d,
          transparent:true,opacity:.58
        })
      );
      glow.rotation.x=Math.PI/2;
      glow.position.set(side,-.15,5.9);
      g.add(glow);
    }

    g.userData.health = isPlayer ? 100 : 1;
    return g;
  }

  function makeCockpit() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      color:0x111d27,metalness:.7,roughness:.3
    });
    const glassMat = new THREE.MeshBasicMaterial({
      color:0x65e7ff,transparent:true,opacity:.12,
      side:THREE.DoubleSide
    });

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.2,.09,8,40),
      frameMat
    );
    rim.position.set(0,-.3,-5);
    g.add(rim);

    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(2.15,20,12,0,Math.PI*2,0,Math.PI/2),
      glassMat
    );
    glass.position.set(0,-.3,-5);
    g.add(glass);

    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(3.6,.35,.6),frameMat
    );
    dash.position.set(0,-1.1,-3.4);
    g.add(dash);

    return g;
  }

  function spawnEnemy(initial=false) {
    if(enemies.length>=8) return;

    const color = Math.random()<.5 ? 0x693e47 : 0x4c5367;
    const jet = makeJet(color,0xff6548,false);
    const angle=rand(-Math.PI,Math.PI);
    const distance=initial?rand(100,240):rand(180,340);

    jet.position.set(
      player.position.x+Math.sin(angle)*distance,
      player.position.y+rand(-45,45),
      player.position.z-Math.cos(angle)*distance
    );

    jet.rotation.y=rand(-Math.PI,Math.PI);
    jet.userData.health=difficulty==='hard'?3:1;
    jet.userData.fireClock=rand(1.5,4);
    jet.userData.turnSpeed=difficulty==='hard'?.9:.58;
    scene.add(jet);
    enemies.push(jet);
  }

  function makeBullet(pos,dir,enemy=false) {
    const color=enemy?0xff543b:0x9cfbff;
    const mesh=new THREE.Mesh(
      new THREE.SphereGeometry(enemy?.65:.38,7,6),
      new THREE.MeshBasicMaterial({color})
    );
    mesh.position.copy(pos);
    scene.add(mesh);

    const glow=new THREE.PointLight(color,enemy?2:1.5,12);
    mesh.add(glow);

    (enemy?enemyBullets:bullets).push({
      mesh,
      vel:dir.clone().multiplyScalar(enemy?190:440),
      life:enemy?3:2.3,
      enemy
    });
  }

  function explode(pos,big=true) {
    const count=big?65:12;

    for(let i=0;i<count;i++) {
      const mesh=new THREE.Mesh(
        new THREE.SphereGeometry(rand(.2,.8),5,4),
        new THREE.MeshBasicMaterial({
          color:[0xffd27b,0xff6a31,0xd93b25,0xfff2d2][Math.floor(Math.random()*4)]
        })
      );
      mesh.position.copy(pos);
      scene.add(mesh);

      particles.push({
        mesh,
        vel:v3(rand(-1,1),rand(-.7,1),rand(-1,1))
          .normalize().multiplyScalar(rand(12,85)),
        life:rand(.35,1.1),
        max:1.1
      });
    }

    const flash=new THREE.PointLight(0xff792f,big?20:5,big?110:30);
    flash.position.copy(pos);
    scene.add(flash);
    particles.push({mesh:flash,vel:v3(),life:.22,max:.22,light:true});

    if(big) {
      if(shakeEnabled) shake=.8;
      toast('TARGET DESTROYED','ENEMY AIRCRAFT ELIMINATED');
    }
  }

  function toast(title,message) {
    $('mission-toast').innerHTML=`<b>${title}</b><span>${message}</span>`;
    $('mission-toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(
      ()=>$('mission-toast').classList.remove('show'),2100
    );
  }

  function shoot() {
    if(!running||ammo<=0) return;

    const now=performance.now();
    if(now-lastShot<105) return;
    lastShot=now;
    ammo--;

    const dir=v3(0,0,-1).applyQuaternion(player.quaternion).normalize();
    const origin=player.position.clone()
      .add(dir.clone().multiplyScalar(9))
      .add(v3(0,-.15,0));

    makeBullet(origin,dir,false);
    $('ammo').textContent=ammo;
  }

  function updatePlayer(dt) {
    const turn=
      ((keys.ArrowLeft||keys.KeyA||touch.left)?1:0)-
      ((keys.ArrowRight||keys.KeyD||touch.right)?1:0);

    const climb=
      ((keys.ArrowUp||keys.KeyW||touch.up)?1:0)-
      ((keys.ArrowDown||keys.KeyS||touch.down)?1:0);

    heading += turn*dt*.82;

    pitch=THREE.MathUtils.lerp(
      pitch,clamp(climb*.36,-.42,.42),Math.min(1,dt*2.6)
    );

    // 핵심: 좌우 입력에 따라 기체가 자연스럽게 롤링
    roll=THREE.MathUtils.lerp(
      roll,-turn*.72,Math.min(1,dt*2.8)
    );

    player.rotation.order='YXZ';
    player.rotation.y=heading;
    player.rotation.x=pitch;
    player.rotation.z=roll;

    const forward=v3(0,0,-1).applyQuaternion(player.quaternion);
    player.position.addScaledVector(forward,dt*62);
    player.position.y=clamp(player.position.y,-20,170);
    player.position.x=clamp(player.position.x,-500,500);

    speed=420+Math.round(Math.abs(turn)*18);

    if(fireHeld||keys.Space||keys.Mouse0) shoot();
  }

  function updateEnemies(dt) {
    spawnTimer+=dt;

    if(spawnTimer>5.5&&enemies.length<7) {
      spawnTimer=0;
      spawnEnemy();
    }

    for(let i=enemies.length-1;i>=0;i--) {
      const e=enemies[i];
      const toPlayer=player.position.clone().sub(e.position);
      const desired=Math.atan2(-toPlayer.x,-toPlayer.z);
      let diff=desired-e.rotation.y;

      while(diff>Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;

      e.rotation.y+=clamp(
        diff,-e.userData.turnSpeed*dt,e.userData.turnSpeed*dt
      );

      // 적기도 선회할 때 날개를 기울임
      e.rotation.z=THREE.MathUtils.lerp(
        e.rotation.z,clamp(-diff,-.65,.65),dt*1.6
      );

      e.rotation.x=THREE.MathUtils.lerp(
        e.rotation.x,
        clamp((player.position.y-e.position.y)*.003,-.3,.3),
        dt
      );

      const forward=v3(0,0,-1).applyQuaternion(e.quaternion);
      e.position.addScaledVector(
        forward,dt*(difficulty==='hard'?48:34)
      );
      e.position.y+=Math.sin(time*1.3+i)*dt*5;

      e.userData.fireClock-=dt;

      if(e.userData.fireClock<=0&&e.position.distanceTo(player.position)<330) {
        const aim=player.position.clone().sub(e.position).normalize();
        makeBullet(
          e.position.clone().add(aim.clone().multiplyScalar(8)),
          aim,true
        );

        e.userData.fireClock=rand(
          difficulty==='hard'?.8:1.6,
          difficulty==='hard'?1.8:3.2
        );
      }

      if(e.position.distanceTo(player.position)>850) {
        scene.remove(e);
        enemies.splice(i,1);
      }
    }
  }

  function updateBullets(dt) {
    for(const arr of [bullets,enemyBullets]) {
      for(let i=arr.length-1;i>=0;i--) {
        const b=arr[i];
        b.mesh.position.addScaledVector(b.vel,dt);
        b.life-=dt;
        let remove=b.life<=0;

        if(!b.enemy) {
          for(let j=enemies.length-1;j>=0;j--) {
            const e=enemies[j];

            if(b.mesh.position.distanceTo(e.position)<8) {
              e.userData.health--;
              explode(b.mesh.position,false);
              remove=true;

              if(e.userData.health<=0) {
                explode(e.position,true);
                scene.remove(e);
                enemies.splice(j,1);
                kills++;
                toast('KILL CONFIRMED',`TOTAL DESTROYED: ${kills}`);
              }
              break;
            }
          }
        } else if(b.mesh.position.distanceTo(player.position)<7) {
          remove=true;
          health-=difficulty==='hard'?12:difficulty==='easy'?4:7;
          hitFlash=.23;
          if(shakeEnabled) shake=.25;

          $('health-bar').style.width=Math.max(0,health)+'%';
          $('health-text').textContent=Math.max(0,health)+'%';
          $('health-bar').style.background=health<35?'#ff5c43':'#7df6ae';

          if(health<=0) endGame();
        }

        if(remove) {
          scene.remove(b.mesh);
          arr.splice(i,1);
        }
      }
    }
  }

  function updateParticles(dt) {
    for(let i=particles.length-1;i>=0;i--) {
      const p=particles[i];
      p.life-=dt;

      if(p.light) {
        p.mesh.intensity=Math.max(0,p.life/p.max*20);
      } else {
        p.mesh.position.addScaledVector(p.vel,dt);
        p.mesh.scale.multiplyScalar(.97);
        p.mesh.material.transparent=true;
        p.mesh.material.opacity=Math.max(0,p.life/p.max);
      }

      if(p.life<=0) {
        scene.remove(p.mesh);
        particles.splice(i,1);
      }
    }
  }

  function updateCamera(dt) {
    const forward=v3(0,0,-1).applyQuaternion(player.quaternion);
    let desired,look;

    if(firstPerson) {
      desired=player.position.clone()
        .add(v3(0,.7,0))
        .add(forward.clone().multiplyScalar(2));

      look=desired.clone().add(forward.clone().multiplyScalar(100));

      cockpit.position.copy(player.position);
      cockpit.quaternion.copy(player.quaternion);
      if(!cockpit.parent) scene.add(cockpit);
    } else {
      if(cockpit.parent) scene.remove(cockpit);

      desired=player.position.clone()
        .add(v3(0,8,0))
        .add(forward.clone().multiplyScalar(23));

      look=player.position.clone().add(forward.clone().multiplyScalar(70));
    }

    camera.position.lerp(desired,Math.min(1,dt*3.5));
    camera.up.set(0,1,0);
    camera.lookAt(look);
    camera.rotation.z+=roll*(firstPerson?.08:.04);

    if(shake>0) {
      camera.position.x+=rand(-shake,shake);
      camera.position.y+=rand(-shake,shake);
      shake=Math.max(0,shake-dt*1.4);
    }
  }

  function updateHUD() {
    $('altitude').textContent=Math.round(
      (player.position.y+70)*18+1200
    ).toLocaleString('en-US');

    $('speed').textContent=speed;

    $('heading').textContent=String(
      Math.round(((heading*180/Math.PI)%360+360)%360)
    ).padStart(3,'0');

    const nearest=enemies.reduce(
      (best,e)=>
        !best||e.position.distanceTo(player.position)<
        best.position.distanceTo(player.position)?e:best,
      null
    );

    $('target-status').textContent=nearest
      ?'LOCK · '+Math.round(nearest.position.distanceTo(player.position))+'M'
      :'NO TARGET';

    $('target-progress').style.width=nearest
      ?Math.max(12,100-nearest.position.distanceTo(player.position)/5)+'%'
      :'0%';

    $('view-label').textContent=firstPerson
      ?'COCKPIT VIEW · F3':'EXTERNAL VIEW · F3';
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),.04);

    if(running) {
      time+=dt;
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateParticles(dt);
      updateCamera(dt);
      updateHUD();

      if(hitFlash>0) {
        hitFlash-=dt;
        $('hit-flash').style.opacity=String(Math.max(0,hitFlash*1.6));
      }
    } else if(player) {
      updateCamera(dt*.4);
    }

    renderer.render(scene,camera);
  }

  function startGame() {
    started=true;
    running=true;
    ammo=240;
    kills=0;
    health=100;
    heading=0;
    pitch=roll=0;
    time=0;
    spawnTimer=0;
    player.position.set(0,30,0);
    player.rotation.set(0,0,0);

    for(const arr of [bullets,enemyBullets,particles]) {
      arr.forEach(o=>scene.remove(o.mesh));
      arr.length=0;
    }

    enemies.forEach(e=>scene.remove(e));
    enemies.length=0;

    for(let i=0;i<5;i++) spawnEnemy(true);

    $('ammo').textContent=ammo;
    $('health-bar').style.width='100%';
    $('health-text').textContent='100%';
    $('game-over').classList.add('hidden');
    $('start-screen').classList.add('hidden');

    toast('MISSION 01','ENEMY AIRCRAFT DETECTED');
    updateDeviceUI();
  }

  function endGame() {
    running=false;
    $('report-title').textContent='AIRCRAFT DESTROYED';
    $('report-stats').textContent=
      `격추 ${kills}기 · 남은 탄약 ${ammo} · 기체 내구도 ${Math.max(0,health)}%`;
    $('game-over').classList.remove('hidden');
  }

  function updateDeviceUI() {
    const mobile=deviceMode==='mobile'||(deviceMode==='auto'&&isTouch);
    $('mobile-controls').classList.toggle('active',mobile&&started);
    $('control-label').textContent=mobile?'TOUCH CONTROLS':'KEYBOARD / MOUSE';
  }

  function bindUI() {
    $('start-btn').onclick=startGame;
    $('restart-btn').onclick=startGame;

    $('settings-open').onclick=()=>$('settings-overlay').classList.add('open');
    $('settings-close').onclick=()=>$('settings-overlay').classList.remove('open');

    $('apply-settings').onclick=()=>{
      deviceMode=$('device-mode').value;
      firstPerson=$('camera-mode').value==='first';
      difficulty=$('difficulty').value;
      shakeEnabled=$('shake-mode').value==='on';

      $('settings-overlay').classList.remove('open');
      updateDeviceUI();
      toast('SETTINGS UPDATED','FLIGHT SYSTEMS CONFIGURED');
    };

    $('mobile-view').onclick=()=>{
      firstPerson=!firstPerson;
      $('camera-mode').value=firstPerson?'first':'third';
    };

    $('mobile-fire').addEventListener('pointerdown',e=>{
      e.preventDefault();
      fireHeld=true;
    });

    ['pointerup','pointercancel','pointerleave'].forEach(ev=>
      $('mobile-fire').addEventListener(ev,()=>fireHeld=false)
    );

    document.querySelectorAll('[data-move]').forEach(btn=>{
      const k=btn.dataset.move;

      btn.addEventListener('pointerdown',e=>{
        e.preventDefault();
        touch[k]=true;
        if(btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      });

      ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>
        btn.addEventListener(ev,()=>touch[k]=false)
      );
    });

    window.addEventListener('keydown',e=>{
      keys[e.code]=true;

      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
        e.preventDefault();

      if(e.code==='F3') {
        firstPerson=!firstPerson;
        $('camera-mode').value=firstPerson?'first':'third';
      }

      if(e.code==='Escape')
        $('settings-overlay').classList.toggle('open');
    });

    window.addEventListener('keyup',e=>keys[e.code]=false);

    renderer.domElement.addEventListener('pointerdown',e=>{
      if(e.button===0&&started) {
        fireHeld=true;
        keys.Mouse0=true;
      }
    });

    window.addEventListener('pointerup',()=>{
      fireHeld=false;
      keys.Mouse0=false;
    });

    window.addEventListener('resize',()=>{
      camera.aspect=innerWidth/innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth,innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    });

    $('device-mode').value='auto';
  }

  init();
})();
