import * as THREE from 'three';

// The 21,600-pixel source is split into small textures to stay within GPU limits.
export function createEarthDetail(scene,renderer,baseMaterial){
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
