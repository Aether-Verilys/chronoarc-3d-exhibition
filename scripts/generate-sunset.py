import os,json,subprocess,time,concurrent.futures
from pathlib import Path
os.environ.update(HTTPS_PROXY='http://127.0.0.1:7897',HTTP_PROXY='http://127.0.0.1:7897')
r=Path('public/models/sunset');manifest=r/'generation.json';data=json.loads(manifest.read_text()) if manifest.exists() else {}
for name in ['platform','window','glass','plant']:
 if name in data:continue
 cmd=['tripo','generate','image-to-model','references/sunset/'+name+'.png','--model','tripo-p2','--param','face_limit=8500','--param','texture=true','--param','pbr=true','--no-wait','--no-download','--yes','--no-open','--json']
 p=subprocess.run(cmd,capture_output=True,text=True,timeout=150);d=json.loads(p.stdout);assert 'task_id' in d,d
 data[name]={'task_id':d['task_id'],'reference':'references/sunset/'+name+'.png','face_limit':8500};manifest.write_text(json.dumps(data,indent=2));print(name,d['task_id'],flush=True)
def fetch(item):
 name,info=item
 if (r/(name+'.glb')).exists():return
 for _ in range(80):
  d=json.loads(subprocess.check_output(['tripo','task','get',info['task_id'],'--json'],timeout=90));print(name,d.get('status'),d.get('progress'),flush=True)
  if d.get('status')=='success':
   for key,suffix in [('model_url','.glb'),('rendered_image_url','.webp')]:
    if key in d['output']:subprocess.run(['curl','-fsSL','--retry','3','--max-time','150',d['output'][key],'-o',str(r/(name+suffix))],check=True)
   return
  if d.get('status') in ['failed','cancelled']:raise RuntimeError(d)
  time.sleep(15)
 raise TimeoutError(name)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,data.items()))
