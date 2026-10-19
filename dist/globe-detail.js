import * as THREE from 'three';

// The 21,600-pixel source is split into small textures to stay within GPU limits.
export function createEarthDetail(scene,renderer,baseMaterial){
 const local=createLocalDetail(scene,renderer,baseMaterial),deep=createDeepDetail(scene,renderer,baseMaterial);
 return (camera,time,delta)=>{local(camera,time,delta);deep(camera,time,delta);};
}

function createLocalDetail(scene,renderer,baseMaterial){
 const tiles=[],loader=new THREE.TextureLoader(),direction=new THREE.Vector3();
 const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
 const limit=innerWidth<=650?20:32;let inflight=0,lastCheck=0,wanted=new Set();
 for(let y=0;y<8;y++)for(let x=0;x<16;x++){
  const phi=x*Math.PI/8,theta=y*Math.PI/8;
  const center=new THREE.Vector3(-Math.cos(phi+Math.PI/16)*Math.sin(theta+Math.PI/16),Math.cos(theta+Math.PI/16),Math.sin(phi+Math.PI/16)*Math.sin(theta+Math.PI/16));
  tiles.push({x,y,center,bounds:new THREE.Sphere(center,.29),mesh:null,loading:false,failed:0,lastUsed:0});
 }
 function discard(tile){if(!tile.mesh)return;scene.remove(tile.mesh);tile.mesh.geometry.dispose();tile.mesh.material.map.dispose();tile.mesh.material.dispose();tile.mesh=null;}
 function load(tile){
  tile.loading=true;inflight++;
  loader.load(`assets/earth-detail/${tile.y}-${tile.x}.jpg`,texture=>{
   inflight--;tile.loading=false;
   if(!wanted.has(tile)){texture.dispose();return;}
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   const material=baseMaterial.clone();material.map=texture;material.transparent=true;material.opacity=0;material.depthWrite=false;
   tile.mesh=new THREE.Mesh(new THREE.SphereGeometry(1.0006,32,32,tile.x*Math.PI/8,Math.PI/8,tile.y*Math.PI/8,Math.PI/8),material);
   tile.mesh.renderOrder=1;scene.add(tile.mesh);
  },undefined,()=>{inflight--;tile.loading=false;tile.failed=performance.now();});
 }
 return function update(camera,time,delta){
  const near=camera.position.length()<3;
  if(time-lastCheck>160){
   lastCheck=time;direction.copy(camera.position).normalize();
   matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
   const horizon=Math.acos(1/camera.position.length())+.29;
   const candidates=near?tiles.filter(t=>t.center.dot(direction)>Math.cos(horizon)&&frustum.intersectsSphere(t.bounds)).sort((a,b)=>b.center.dot(direction)-a.center.dot(direction)).slice(0,limit):[];
   wanted=new Set(candidates);for(const t of candidates)t.lastUsed=time;
   for(const tile of tiles)if(tile.mesh&&!wanted.has(tile)&&time-tile.lastUsed>1500)discard(tile);
   // Bound resident textures, including those awaiting disposal after a camera move.
   const resident=tiles.filter(t=>t.mesh);for(const tile of resident.filter(t=>!wanted.has(t)).sort((a,b)=>a.lastUsed-b.lastUsed).slice(0,Math.max(0,resident.length+inflight-limit)))discard(tile);
   for(const tile of candidates){if(inflight>=3)break;if(!tile.mesh&&!tile.loading&&(!tile.failed||time-tile.failed>30000))load(tile);}
  }
  for(const tile of tiles)if(tile.mesh){tile.mesh.visible=wanted.has(tile);if(tile.mesh.visible)tile.mesh.material.opacity=Math.min(1,tile.mesh.material.opacity+delta*4);}
 };
}

// Closer in, NASA GIBS serves the same Blue Marble at 500 m: 4.5 and 2.25 degree tiles of 512 pixels.
// It needs the network, so offline the local tiles above stay in place.
const GIBS='https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/default/500m';
const LEVELS=[{z:6,span:4.5,radius:1.0008},{z:7,span:2.25,radius:1.001}];
const LOCAL_TEXELS=21600/(2*Math.PI);

function createDeepDetail(scene,renderer,baseMaterial){
 const tiles=new Map(),loader=new THREE.TextureLoader(),direction=new THREE.Vector3();
 const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),deg=Math.PI/180;
 const limit=innerWidth<=650?24:40;let inflight=0,lastCheck=0,wanted=new Set();
 loader.setCrossOrigin('anonymous');
 function tile(level,row,col){
  const key=`${level.z}/${row}/${col}`;let t=tiles.get(key);if(t)return t;
  const lat=90-(row+.5)*level.span,lng=-180+(col+.5)*level.span,center=new THREE.Vector3(-Math.cos((lng+180)*deg)*Math.cos(lat*deg),Math.sin(lat*deg),Math.sin((lng+180)*deg)*Math.cos(lat*deg));
  t={key,level,row,col,center,bounds:new THREE.Sphere(center,level.span*deg*.75),mesh:null,loading:false,failed:0,lastUsed:0};tiles.set(key,t);return t;
 }
 function discard(t){if(!t.mesh)return;scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.map.dispose();t.mesh.material.dispose();t.mesh=null;}
 function load(t){
  t.loading=true;inflight++;
  loader.load(`${GIBS}/${t.level.z}/${t.row}/${t.col}.jpeg`,texture=>{
   inflight--;t.loading=false;
   if(!wanted.has(t)){texture.dispose();return;}
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   const material=baseMaterial.clone(),span=t.level.span*deg;material.map=texture;material.transparent=true;material.opacity=0;material.depthWrite=false;
   t.mesh=new THREE.Mesh(new THREE.SphereGeometry(t.level.radius,8,8,t.col*span,span,t.row*span,span),material);
   t.mesh.renderOrder=1+t.level.z;scene.add(t.mesh);
  },undefined,()=>{inflight--;t.loading=false;t.failed=performance.now();});
 }
 // Tiles of one level that face the camera and sit in view, nearest to the center first.
 function visible(level,camera){
  const distance=camera.position.length(),lat=Math.asin(direction.y)/deg,lng=Math.atan2(-direction.z,direction.x)/deg;
  const reach=Math.min(60,(distance-1)*Math.tan(camera.fov*deg/2)*Math.max(camera.aspect,1)*1.6/deg)+level.span;
  const rows=180/level.span,cols=360/level.span,horizon=Math.cos(Math.acos(1/distance)+level.span*deg),found=[];
  const widen=Math.min(180,reach/Math.max(.05,Math.cos(Math.min(89,Math.abs(lat)+reach)*deg)));
  const r0=Math.max(0,Math.floor((90-lat-reach)/level.span)),r1=Math.min(rows-1,Math.floor((90-lat+reach)/level.span));
  const c0=Math.floor((lng+180-widen)/level.span),c1=Math.floor((lng+180+widen)/level.span);
  for(let row=r0;row<=r1;row++)for(let c=c0;c<=Math.min(c1,c0+cols-1);c++){
   const t=tile(level,row,((c%cols)+cols)%cols);
   if(t.center.dot(direction)>horizon&&frustum.intersectsSphere(t.bounds))found.push(t);
  }
  return found.sort((a,b)=>b.center.dot(direction)-a.center.dot(direction));
 }
 return function update(camera,time,delta){
  if(time-lastCheck>160){
   lastCheck=time;direction.copy(camera.position).normalize();
   matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
   // Screen pixels per radian of ground at the view center, against texels per radian of each level.
   const need=renderer.domElement.height/(2*Math.tan(camera.fov*deg/2)*(camera.position.length()-1));
   const levels=LEVELS.filter((level,i)=>need>(i?512/(LEVELS[i-1].span*deg):LOCAL_TEXELS)*1.3);
   // The coarser level stays underneath, so the view never drops back to the local tiles while finer ones load.
   const candidates=levels.flatMap(level=>visible(level,camera).slice(0,limit));
   wanted=new Set(candidates);for(const t of candidates)t.lastUsed=time;
   for(const t of tiles.values())if(t.mesh&&!wanted.has(t)&&time-t.lastUsed>1500)discard(t);
   const resident=[...tiles.values()].filter(t=>t.mesh);for(const t of resident.filter(t=>!wanted.has(t)).sort((a,b)=>a.lastUsed-b.lastUsed).slice(0,Math.max(0,resident.length+inflight-limit*2)))discard(t);
   const queue=[...candidates].sort((a,b)=>a.level.z-b.level.z||b.center.dot(direction)-a.center.dot(direction));
   for(const t of queue){if(inflight>=4)break;if(!t.mesh&&!t.loading&&(!t.failed||time-t.failed>30000))load(t);}
  }
  for(const t of tiles.values())if(t.mesh){t.mesh.visible=wanted.has(t);if(t.mesh.visible)t.mesh.material.opacity=Math.min(1,t.mesh.material.opacity+delta*4);}
 };
}
