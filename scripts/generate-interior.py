import os,json,subprocess,time,concurrent.futures
from pathlib import Path
os.environ.update(HTTPS_PROXY='http://127.0.0.1:7897',HTTP_PROXY='http://127.0.0.1:7897')
root=Path('public/models/interior'); manifest=root/'generation.json'
jobs={
'cabinet':'One empty square luxury collectible display niche, open front facing camera, no glass no objects, walnut veneer back and sides, thin champagne bronze frame, beveled joinery, recessed warm white LED channel hidden under top lip, flat shelf bottom. Architectural furniture module, photoreal PBR wood grain brushed metal micro roughness. Single isolated object.',
'wall-panel':'One rectangular luxury interior wall panel, vertical walnut fluted slats with champagne brass inlay and warm limestone center panel, fine realistic material grain, beveled edges, architectural modular panel, flat back, front facing camera, isolated object, photoreal PBR materials, no furniture.',
'floor-tile':'One square large luxury gallery floor tile, honed warm taupe travertine with delicate natural pores, subtle stone veins, finely beveled edges, very thin slab, top surface facing upward, isolated architectural modular tile, physically based realistic material, no objects no text.'}
data=json.loads(manifest.read_text()) if manifest.exists() else {}
for name,prompt in jobs.items():
 if name in data: continue
 r=subprocess.run(['tripo','make',prompt,'--model','tripo-p2','--param','face_limit=40000','--param','texture=true','--param','pbr=true','--no-wait','--no-download','--yes','--no-open','--json'],capture_output=True,text=True,timeout=120)
 d=json.loads(r.stdout); assert 'task_id' in d,d
 data[name]={'task_id':d['task_id'],'prompt':prompt}; manifest.write_text(json.dumps(data,indent=2)); print(name,d['task_id'],flush=True)
def download(item):
 name,info=item
 if (root/(name+'.glb')).exists(): return
 for _ in range(90):
  r=subprocess.run(['tripo','task','get',info['task_id'],'--json'],capture_output=True,text=True,timeout=90)
  d=json.loads(r.stdout); print(name,d.get('status'),d.get('progress'),flush=True)
  if d.get('status')=='success':
   subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','3','--max-time','120',d['output']['model_url'],'-o',str(root/(name+'.glb'))],check=True)
   return
  if d.get('status') in ['failed','cancelled']: raise RuntimeError(d)
  time.sleep(15)
 raise TimeoutError(name)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(download,data.items()))
