(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random()*(b-a);

  let scene, camera, renderer, clock, player, cockpit;
  let running=false, started=false, firstPerson=false;
  let deviceMode='auto', difficulty='normal', quality='medium';
  let shakeEnabled=true, shake=0, flash=0;
  let heading=0, pitch=0, roll=0, speed=420;
  let health=100, ammo=300, kills=0, time=0, spawnTimer=0, lastShot=0;
  let fireHeld=false, toastTimer;
  const keys={}, touch={left:false,right:false,up:false,down:false};
  const enemies=[], bullets=[], hostileBullets=[], particles=[], clouds=[];
  const mobile=matchMedia('(pointer:coarse)').matches;

  let jetGeometry, wingGeometry, bulletGeometry, particleGeometry;
  let playerMaterials, enemyMaterials;
  let enemyLimit=5, maxParticles=100;

  function init(){
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x87b7d0);
    scene.fog=new THREE.Fog(0x87b7d0,350,1800);

    camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,2200);
    renderer=new THREE.WebGLRenderer({
      antialias:!mobile,
      powerPreference:'high-performance',
      alpha:false
    });
    renderer.setSize(innerWidth,innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1:1.35));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    $('viewport').appendChild(renderer.domElement);

    clock=new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xe4f6ff,0x475363,2.0));

    const sun=new THREE.DirectionalLight(0xffffff,2);
    sun.position.set(-100,200,100);
    scene.add(sun);

    createSharedGeometry();
    createWorld();

    player=makeJet(true);
    player.position.set(0,50,0);
    scene.add(player);

    cockpit=makeCockpit();
    bindEvents();
    applyQuality();
    updateDevice();

    // 게임 시작 전에도 배경을 렌더링
    animate();
  }

  function createSharedGeometry(){
    // 기체 앞쪽은 -Z, 날개는 좌우 X 방향
    jetGeometry=new THREE.ConeGeometry(.65,10,8);
    jetGeometry.rotateX(-Math.PI/2);

    wingGeometry=new THREE.BufferGeometry();
    wingGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
      -.5,0,0, -8,0,2, -6.5,0,-2,
      .5,0,0, 8,0,2, 6.5,0,-2
    ],3));
    wingGeometry.setIndex([0,1,2,3,5,4]);
    wingGeometry.computeVertexNormals();

    bulletGeometry=new THREE.CylinderGeometry(.12,.12,1,5);
    particleGeometry=new THREE.BoxGeometry(1,1,1);

    playerMaterials={
      body:new THREE.MeshStandardMaterial({
        color:0x354b5c,metalness:.55,roughness:.42
      }),
      wing:new THREE.MeshStandardMaterial({
        color:0x243746,metalness:.4,roughness:.48,
        side:THREE.DoubleSide
      }),
      accent:new THREE.MeshBasicMaterial({color:0x6df5ff}),
      glass:new THREE.MeshBasicMaterial({
        color:0x58d9ff,transparent:true,opacity:.68
      })
    };

    enemyMaterials={
      body:new THREE.MeshStandardMaterial({
        color:0x733f43,metalness:.35,roughness:.55
      }),
      wing:new THREE.MeshStandardMaterial({
        color:0x49353d,metalness:.3,roughness:.6,
        side:THREE.DoubleSide
      }),
      accent:new THREE.MeshBasicMaterial({color:0xff6548}),
      glass:new THREE.MeshBasicMaterial({color:0x253e4b})
    };
  }

  function createWorld(){
    // 제한된 수의 구름으로 성능 유지
    const cloudMat=new THREE.MeshBasicMaterial({
      color:0xffffff,transparent:true,opacity:.55,
      depthWrite:false
    });

    const cloudGeo=new THREE.SphereGeometry(1,7,5);

    for(let i=0;i<38;i++){
      const g=new THREE.Group();
      const count=3+Math.floor(Math.random()*3);

      for(let j=0;j<count;j++){
        const p=new THREE.Mesh(cloudGeo,cloudMat);
        const s=rand(8,18);
        p.scale.set(s*1.8,s*.42,s);
        p.position.set(j*rand(8,14),rand(-2,2),rand(-5,5));
        g.add(p);
      }

      g.position.set(rand(-900,900),rand(-20,180),rand(-1400,600));
      scene.add(g);
      clouds.push(g);
    }

    const grid=new THREE.GridHelper(2000,50,0x5792a9,0x47798e);
    grid.position.y=-90;
    grid.material.transparent=true;
    grid.material.opacity=.18;
    scene.add(grid);

    // 간단한 먼 배경 능선
    const ridgeMat=new THREE.MeshBasicMaterial({color:0x597d8c});
    for(let i=0;i<22;i++){
      const m=new THREE.Mesh(
        new THREE.ConeGeometry(rand(25,80),rand(70,190),5),
        ridgeMat
      );
      m.position.set(rand(-900,900),-30,rand(-1200,-400));
      scene.add(m);
    }
  }

  function makeJet(isPlayer=false){
    const g=new THREE.Group();
    const mats=isPlayer?playerMaterials:enemyMaterials;

    const body=new THREE.Mesh(jetGeometry,mats.body);
    body.scale.set(1,1,1);
    body.position.z=-1;
    g.add(body);

    const wings=new THREE.Mesh(wingGeometry,mats.wing);
    wings.scale.set(1,.7,1);
    g.add(wings);

    const tail=new THREE.Mesh(
      new THREE.BoxGeometry(.2,1.4,2),
      mats.accent
    );
    tail.position.set(0,.7,3.2);
    g.add(tail);

    const canopy=new THREE.Mesh(
      new THREE.SphereGeometry(.65,8,6),
      mats.glass
    );
    canopy.scale.set(.8,.6,1.8);
    canopy.position.set(0,.55,-2.1);
    g.add(canopy);

    // 엔진 불꽃은 작은 발광 원뿔로 표현
    const engineMat=new THREE.MeshBasicMaterial({
      color:isPlayer?0x56dfff:0xff633d
    });

    for(const x of [-.35,.35]){
      const flame=new THREE.Mesh(
        new THREE.ConeGeometry(.19,1.8,5),
        engineMat
      );
      flame.rotation.x=Math.PI/2;
      flame.position.set(x,-.15,5.4);
      g.add(flame);
    }

    g.userData.isPlayer=isPlayer;
    g.userData.hp=1;
    return g;
  }

  function makeCockpit(){
    const g=new THREE.Group();

    const frame=new THREE.MeshStandardMaterial({
      color:0x172632,metalness:.6,roughness:.5
    });

    const dashboard=new THREE.Mesh(
      new THREE.BoxGeometry(3.8,.4,1.2),frame
    );
    dashboard.position.set(0,-1,-2.8);
    g.add(dashboard);

    const rim=new THREE.Mesh(
      new THREE.TorusGeometry(2,.08,5,24),
      frame
    );
    rim.position.set(0,-.1,-4);
    g.add(rim);

    const glass=new THREE.Mesh(
      new THREE.SphereGeometry(2,12,8,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshBasicMaterial({
        color:0x6deaff,transparent:true,opacity:.12,
        side:THREE.DoubleSide
      })
    );
    glass.position.set(0,-.1,-4);
    g.add(glass);

    return g;
  }

  function spawnEnemy(initial=false){
    if(enemies.length>=enemyLimit) return;

    const jet=makeJet(false);
    const angle=rand(0,Math.PI*2);
    const distance=initial?rand(320,520):rand(400,650);

    jet.position.set(
      player.position.x+Math.sin(angle)*distance,
      clamp(player.position.y+rand(-100,100),-10,220),
      player.position.z-Math.cos(angle)*distance
    );

    jet.userData.hp=difficulty==='hard'?3:1;
    jet.userData.fireClock=rand(2,5);
    jet.userData.turnRate=difficulty==='hard'?.55:.3;
    jet.userData.speed=difficulty==='hard'?42:30;

    scene.add(jet);
    enemies.push(jet);
  }

  function fireBullet(origin,direction,hostile=false){
    const color=hostile?0xff4e37:0xafffff;
    const material=new THREE.MeshBasicMaterial({color});

    const mesh=new THREE.Mesh(bulletGeometry,material);
    mesh.position.copy(origin);

    // 긴 발광 탄환: 앞쪽 방향으로 정렬
    mesh.quaternion.setFromUnitVectors(
      V(0,1,0),direction.clone().normalize()
    );
    mesh.scale.set(1,hostile?5:8,1);
    scene.add(mesh);

    // 밝은 점광원 대신 간단한 발광 탄환 사용
    const trailMat=new THREE.MeshBasicMaterial({
      color:hostile?0xff9a55:0x53eaff
    });

    const trail=new THREE.Mesh(
      new THREE.BoxGeometry(.12,.12,hostile?2.5:4),
      trailMat
    );
    trail.position.copy(origin);
    trail.quaternion.copy(mesh.quaternion);
    scene.add(trail);

    const arr=hostile?hostileBullets:bullets;
    arr.push({
      mesh,trail,
      velocity:direction.clone().normalize().multiplyScalar(hostile?155:390),
      life:hostile?3:2.2
    });
  }

  function shoot(){
    if(!running||ammo<=0) return;

    const now=performance.now();
    if(now-lastShot<115) return;
    lastShot=now;
    ammo--;

    const dir=V(0,0,-1).applyQuaternion(player.quaternion).normalize();
    const origin=player.position.clone()
      .add(dir.clone().multiplyScalar(8))
      .add(V(0,-.15,0));

    fireBullet(origin,dir,false);
    $('ammo').textContent=ammo;
  }

  function explode(pos,big=true){
    const count=big?24:3;
    const palette=big?
      [0xffd477,0xff693e,0xe63e2e]:
      [0xb9fbff,0x64cfff];

    for(let i=0;i<count;i++){
      if(particles.length>=maxParticles){
        const old=particles.shift();
        scene.remove(old.mesh);
      }

      const mat=new THREE.MeshBasicMaterial({
        color:palette[i%palette.length],
        transparent:true
      });

      const mesh=new THREE.Mesh(particleGeometry,mat);
      mesh.position.copy(pos);
      const size=rand(.5,big?2:1);
      mesh.scale.setScalar(size);
      scene.add(mesh);

      particles.push({
        mesh,
        velocity:V(rand(-1,1),rand(-.7,1),rand(-1,1))
          .normalize().multiplyScalar(rand(10,big?65:25)),
        life:rand(.25,big?.85:.35),
        max:big?.85:.35
      });
    }

    if(big){
      if(shakeEnabled) shake=.5;
      toast('KILL CONFIRMED','ENEMY AIRCRAFT DESTROYED');
    }
  }

  function toast(title,message){
    $('toast-title').textContent=title;
    $('toast-message').textContent=message;
    $('toast').classList.add('show');

    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800);
  }

  function updatePlayer(dt){
    const left=keys.ArrowLeft||keys.KeyA||touch.left;
    const right=keys.ArrowRight||keys.KeyD||touch.right;
    const up=keys.ArrowUp||keys.KeyW||touch.up;
    const down=keys.ArrowDown||keys.KeyS||touch.down;

    const turn=(left?1:0)-(right?1:0);
    const climb=(up?1:0)-(down?1:0);

    heading+=turn*dt*.7;

    pitch=THREE.MathUtils.lerp(
      pitch,clamp(climb*.35,-.4,.4),Math.min(1,dt*2)
    );

    // 선회 방향으로 기체가 기울어짐
    roll=THREE.MathUtils.lerp(
      roll,-turn*.7,Math.min(1,dt*2.5)
    );

    player.rotation.order='YXZ';
    player.rotation.y=heading;
    player.rotation.x=pitch;
    player.rotation.z=roll;

    const forward=V(0,0,-1).applyQuaternion(player.quaternion);
    player.position.addScaledVector(forward,dt*60);
    player.position.y=clamp(player.position.y,-10,220);
    player.position.x=clamp(player.position.x,-700,700);

    speed=420+Math.abs(turn)*18;

    if(fireHeld||keys.Space||keys.Mouse0) shoot();
  }

  function updateEnemies(dt){
    spawnTimer+=dt;

    if(spawnTimer>7&&enemies.length<enemyLimit){
      spawnTimer=0;
      spawnEnemy();
    }

    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      const toPlayer=player.position.clone().sub(e.position);
      const distance=toPlayer.length();

      // 적기가 플레이어에게 지나치게 붙지 않도록 거리 유지
      const desired=Math.atan2(-toPlayer.x,-toPlayer.z);
      let diff=desired-e.rotation.y;

      while(diff>Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;

      const turnRate=e.userData.turnRate;
      e.rotation.y+=clamp(diff,-turnRate*dt,turnRate*dt);
      e.rotation.z=THREE.MathUtils.lerp(
        e.rotation.z,clamp(-diff,-.55,.55),dt*1.5
      );

      const forward=V(0,0,-1).applyQuaternion(e.quaternion);

      // 가까워지면 속도를 낮추어 사격하기 쉬운 거리 유지
      const velocity=distance<180?12:e.userData.speed;
      e.position.addScaledVector(forward,velocity*dt);

      // 서로 다른 고도와 경로를 유지
      e.position.y+=Math.sin(time*.8+i*2)*dt*4;

      // 적기끼리 간단한 공간 분리
      for(let j=0;j<enemies.length;j++){
        if(i===j) continue;
        const other=enemies[j];
        const separation=e.position.clone().sub(other.position);
        const d=separation.length();

        if(d>0&&d<65){
          separation.normalize();
          e.position.addScaledVector(separation,dt*22);
        }
      }

      e.userData.fireClock-=dt;

      if(e.userData.fireClock<=0&&distance<420){
        const aim=player.position.clone().sub(e.position).normalize();
        fireBullet(
          e.position.clone().add(aim.clone().multiplyScalar(7)),
          aim,true
        );

        e.userData.fireClock=rand(
          difficulty==='hard'?1.4:2.5,
          difficulty==='hard'?2.6:4
        );
      }

      // 멀리 떨어진 적기는 제거하고 새 적기가 생성되도록 함
      if(distance>1050){
        scene.remove(e);
        enemies.splice(i,1);
      }
    }
  }

  function updateBullets(dt){
    const groups=[
      {arr:bullets,hostile:false},
      {arr:hostileBullets,hostile:true}
    ];

    for(const group of groups){
      const arr=group.arr;

      for(let i=arr.length-1;i>=0;i--){
        const b=arr[i];
        b.mesh.position.addScaledVector(b.velocity,dt);
        b.trail.position.copy(b.mesh.position);
        b.life-=dt;

        let remove=b.life<=0;

        if(!group.hostile){
          for(let j=enemies.length-1;j>=0;j--){
            const e=enemies[j];

            // 충돌 범위를 모델 크기에 맞춰 조정
            if(b.mesh.position.distanceTo(e.position)<9){
              e.userData.hp--;
              explode(b.mesh.position,false);
              remove=true;

              if(e.userData.hp<=0){
                explode(e.position,true);
                scene.remove(e);
                enemies.splice(j,1);
                kills++;
                $('kills').textContent=kills;
              }
              break;
            }
          }
        }else if(b.mesh.position.distanceTo(player.position)<8){
          remove=true;
          health-=difficulty==='hard'?12:difficulty==='easy'?4:7;
          health=Math.max(0,health);

          flash=.2;
          if(shakeEnabled) shake=.22;

          $('health').textContent=health+'%';
          $('health-bar').style.width=health+'%';
          $('health-bar').style.background=
            health<35?'#ff5945':'#7df6ae';

          if(health<=0) endGame();
        }

        if(remove){
          scene.remove(b.mesh);
          scene.remove(b.trail);
          b.mesh.material.dispose();
          b.trail.material.dispose();
          arr.splice(i,1);
        }
      }
    }
  }

  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.life-=dt;
      p.mesh.position.addScaledVector(p.velocity,dt);
      p.mesh.scale.multiplyScalar(.96);
      p.mesh.material.opacity=Math.max(0,p.life/p.max);

      if(p.life<=0){
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        particles.splice(i,1);
      }
    }
  }

  function updateCamera(dt){
    const forward=V(0,0,-1).applyQuaternion(player.quaternion);
    let desired,look;

    if(firstPerson){
      desired=player.position.clone()
        .add(V(0,.6,0))
        .add(forward.clone().multiplyScalar(2));

      look=desired.clone().add(forward.clone().multiplyScalar(100));

      cockpit.position.copy(player.position);
      cockpit.quaternion.copy(player.quaternion);

      if(!cockpit.parent) scene.add(cockpit);
    }else{
      if(cockpit.parent) scene.remove(cockpit);

      // 3인칭: 비행기 뒤쪽 + 높은 위치
      // 전방과 고도를 함께 보도록 시선을 아래로 조정
      desired=player.position.clone()
        .add(forward.clone().multiplyScalar(-30))
        .add(V(0,26,0));

      look=player.position.clone()
        .add(forward.clone().multiplyScalar(18))
        .add(V(0,-3,0));
    }

    camera.position.lerp(desired,Math.min(1,dt*3));
    camera.up.set(0,1,0);
    camera.lookAt(look);

    // 카메라의 회전은 기체의 롤을 과하게 따라가지 않도록 제한
    camera.rotation.z+=roll*(firstPerson?.04:.012);

    if(shake>0){
      camera.position.x+=rand(-shake,shake);
      camera.position.y+=rand(-shake,shake);
      shake=Math.max(0,shake-dt*1.5);
    }
  }

  function updateHUD(){
    $('alt').textContent=Math.round(
      (player.position.y+80)*18+1200
    ).toLocaleString('en-US');

    $('speed').textContent=Math.round(speed);
    $('heading').textContent=String(
      Math.round(((heading*180/Math.PI)%360+360)%360)
    ).padStart(3,'0');

    let nearest=null;
    let nearestDist=Infinity;

    for(const e of enemies){
      const d=e.position.distanceTo(player.position);
      if(d<nearestDist){
        nearest=e;
        nearestDist=d;
      }
    }

    $('target-status').textContent=nearest
      ?'TARGET · '+Math.round(nearestDist)+' M'
      :'NO TARGET';

    $('target-bar').style.width=nearest
      ?clamp(100-nearestDist/7,5,100)+'%'
      :'0%';

    $('view-label').textContent=firstPerson
      ?'1ST PERSON · F3':'3RD PERSON · F3';
  }

  function applyQuality(){
    quality=$('quality').value;

    const pixelRatio=quality==='low'?.75:
      quality==='high'?Math.min(devicePixelRatio,1.5):
      Math.min(devicePixelRatio,1.1);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth,innerHeight);

    enemyLimit=quality==='low'?3:quality==='high'?7:5;
    maxParticles=quality==='low'?30:quality==='high'?120:65;

    // 저사양에서는 안티앨리어싱 없이 렌더링
    if(quality==='low'){
      renderer.shadowMap.enabled=false;
    }else{
      renderer.shadowMap.enabled=false;
    }
  }

  function updateDevice(){
    const useMobile=deviceMode==='mobile'||
      (deviceMode==='auto'&&mobile);

    $('mobile-controls').classList.toggle(
      'active',useMobile&&started
    );

    $('control-label').textContent=useMobile
      ?'TOUCH CONTROLS':'KEYBOARD / MOUSE';
  }

  function startGame(){
    running=true;
    started=true;
    heading=0;
    pitch=0;
    roll=0;
    health=100;
    ammo=300;
    kills=0;
    time=0;
    spawnTimer=0;
    shake=0;

    player.position.set(0,50,0);
    player.rotation.set(0,0,0);

    for(const arr of [bullets,hostileBullets]){
      for(const b of arr){
        scene.remove(b.mesh);
        scene.remove(b.trail);
        b.mesh.material.dispose();
        b.trail.material.dispose();
      }
      arr.length=0;
    }

    for(const p of particles){
      scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    particles.length=0;

    for(const e of enemies) scene.remove(e);
    enemies.length=0;

    for(let i=0;i<Math.min(4,enemyLimit);i++)
      spawnEnemy(true);

    $('ammo').textContent=ammo;
    $('kills').textContent='0';
    $('health').textContent='100%';
    $('health-bar').style.width='100%';
    $('health-bar').style.background='#7df6ae';

    $('start-screen').classList.add('hidden');
    $('game-over').classList.add('hidden');

    updateDevice();
    toast('MISSION 01','ENEMY AIRCRAFT DETECTED');
  }

  function endGame(){
    running=false;

    $('report').textContent=
      `격추 ${kills}기 · 남은 탄약 ${ammo}발 · 최종 내구도 ${health}%`;

    $('game-over').classList.remove('hidden');
  }

  function bindEvents(){
    $('start').onclick=startGame;
    $('restart').onclick=startGame;

    $('open-settings').onclick=()=>
      $('settings').classList.add('open');

    $('close-settings').onclick=()=>
      $('settings').classList.remove('open');

    $('apply').onclick=()=>{
      deviceMode=$('device').value;
      firstPerson=$('camera-mode').value==='first';
      difficulty=$('difficulty').value;
      shakeEnabled=$('shake').value==='on';

      applyQuality();
      updateDevice();
      $('settings').classList.remove('open');
      toast('SETTINGS UPDATED','CONFIGURATION APPLIED');
    };

    $('mobile-view').onclick=()=>{
      firstPerson=!firstPerson;
      $('camera-mode').value=firstPerson?'first':'third';
    };

    $('mobile-fire').addEventListener('pointerdown',e=>{
      e.preventDefault();
      fireHeld=true;
    });

    ['pointerup','pointercancel','pointerleave'].forEach(ev=>{
      $('mobile-fire').addEventListener(ev,()=>fireHeld=false);
    });

    document.querySelectorAll('[data-key]').forEach(btn=>{
      const k=btn.dataset.key;

      btn.addEventListener('pointerdown',e=>{
        e.preventDefault();
        touch[k]=true;
        if(btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      });

      ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>{
        btn.addEventListener(ev,()=>touch[k]=false);
      });
    });

    window.addEventListener('keydown',e=>{
      keys[e.code]=true;

      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
        e.preventDefault();

      if(e.code==='F3'){
        firstPerson=!firstPerson;
        $('camera-mode').value=firstPerson?'first':'third';
      }

      if(e.code==='Escape')
        $('settings').classList.toggle('open');
    });

    window.addEventListener('keyup',e=>keys[e.code]=false);

    renderer.domElement.addEventListener('pointerdown',e=>{
      if(e.button===0&&started){
        fireHeld=true;
        keys.Mouse0=true;
      }
    });

    window.addEventListener('pointerup',()=>{
      fireHeld=false;
      keys.Mouse0=false;
    });

    window.addEventListener('blur',()=>{
      fireHeld=false;
      Object.keys(keys).forEach(k=>keys[k]=false);
      Object.keys(touch).forEach(k=>touch[k]=false);
    });

    window.addEventListener('resize',()=>{
      camera.aspect=innerWidth/innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth,innerHeight);
      renderer.setPixelRatio(
        Math.min(devicePixelRatio,quality==='low'?.75:1.1)
      );
    });
  }

  function animate(){
    requestAnimationFrame(animate);

    // 탭이 비활성화되거나 프레임이 떨어져도 물리가 폭주하지 않도록 제한
    const dt=Math.min(clock.getDelta(),.035);

    if(running){
      time+=dt;
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateParticles(dt);
      updateHUD();

      if(flash>0){
        flash-=dt;
        $('damage-flash').style.opacity=String(
          Math.max(0,flash*1.8)
        );
      }
    }

    updateCamera(dt);
    renderer.render(scene,camera);
  }

  init();
})();
