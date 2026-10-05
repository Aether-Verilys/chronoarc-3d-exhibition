import os,json,subprocess,time,concurrent.futures
from pathlib import Path
os.environ.update(HTTPS_PROXY='http://127.0.0.1:7897',HTTP_PROXY='http://127.0.0.1:7897')
r=Path('public/models/interior'); m=r/'decor-generation.json'; data=json.loads(m.read_text()) if m.exists() else {}
jobs={'sofa':'Elegant three-seat sofa with a full upholstered backrest and two rounded armrests, warm ivory boucle cushions, walnut base and short legs, refined quiet luxury gallery lounge furniture, single isolated object, photoreal PBR woven fabric and wood, no room no people', 'olive-planter':'A refined indoor olive tree in a large ivory ceramic planter, sculpted trunk, sparse elegant foliage, luxury warm minimalist gallery decor, isolated full object, realistic PBR materials', 'lounge-bench':'Luxury gallery bench, cream boucle upholstered long seat, rounded ends, dark walnut legs and bronze details, elegant quiet minimalist furniture, isolated full object, realistic PBR materials', 'sculpture':'Elegant abstract bronze looping ribbon sculpture on a dark travertine pedestal, art gallery collectible display room decor, sophisticated minimal silhouette, isolated full object, realistic PBR materials'}
for name,prompt in jobs.items():
 if name in data: continue
 result=subprocess.run(['tripo','make',prompt,'--model','tripo-p2','--param','face_limit=18000','--param','texture=true','--param','pbr=true','--no-wait','--no-download','--yes','--no-open','--json'],capture_output=True,text=True,timeout=120)
 d=json.loads(result.stdout); assert 'task_id' in d,d
 data[name]={'task_id':d['task_id'],'prompt':prompt};m.write_text(json.dumps(data,indent=2));print(name,d['task_id'],flush=True)
def fetch(item):
 name,info=item
 if (r/(name+'.glb')).exists(): return
 for _ in range(80):
  d=json.loads(subprocess.check_output(['tripo','task','get',info['task_id'],'--json'],timeout=90));print(name,d.get('status'),d.get('progress'),flush=True)
  if d.get('status')=='success':
   for key,suffix in [('model_url','.glb'),('rendered_image_url','.webp')]:
    subprocess.run(['curl','-fsSL','--retry','3','--max-time','120',d['output'][key],'-o',str(r/(name+suffix))],check=True)
   return
  if d.get('status') in ['failed','cancelled']: raise RuntimeError(d)
  time.sleep(15)
 raise TimeoutError(name)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(fetch,data.items()))
