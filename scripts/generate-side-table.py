import os,json,subprocess,time
from pathlib import Path
os.environ.update(HTTPS_PROXY='http://127.0.0.1:7897',HTTP_PROXY='http://127.0.0.1:7897')
r=Path('public/models/interior'); record=r/'side-table-generation.json'
if record.exists(): info=json.loads(record.read_text())
else:
 prompt='One elegant small round side table, smoked bronze circular top with gently raised rim, sculptural walnut pedestal and circular bronze foot, precise bevels refined luxury gallery lounge furniture, isolated single object no room no accessories, photoreal PBR wood and brushed metal, efficient low polygon geometry, upright Y.'
 result=subprocess.run(['tripo','make',prompt,'--model','tripo-p2','--param','face_limit=4500','--param','texture=true','--param','pbr=true','--no-wait','--no-download','--yes','--no-open','--json'],capture_output=True,text=True,timeout=120)
 info=json.loads(result.stdout);assert 'task_id' in info,info;info['prompt']=prompt;record.write_text(json.dumps(info,indent=2))
print(info['task_id'],flush=True)
for _ in range(80):
 d=json.loads(subprocess.check_output(['tripo','task','get',info['task_id'],'--json'],timeout=90));print(d.get('status'),d.get('progress'),flush=True)
 if d.get('status')=='success':
  for key,suffix in [('model_url','.glb'),('rendered_image_url','.webp')]:
   subprocess.run(['curl','-fsSL','--retry','3','--max-time','120',d['output'][key],'-o',str(r/('side-table'+suffix))],check=True)
  break
 if d.get('status') in ['failed','cancelled']: raise RuntimeError(d)
 time.sleep(15)
else: raise TimeoutError('side-table')
