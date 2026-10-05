import json,struct
from pathlib import Path
p=Path('public/models/interior/cabinet-light.glb');b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);triangles=sum(d['accessors'][q['indices']]['count']//3 for m in d['meshes'] for q in m['primitives']);assert triangles<=5000,triangles
assert all('baseColorTexture' in m['pbrMetallicRoughness'] and 'metallicRoughnessTexture' in m['pbrMetallicRoughness'] and 'normalTexture' in m for m in d['materials'])
print('triangles',triangles,'nodes',d['nodes'])
a=d['accessors'][d['meshes'][0]['primitives'][0]['attributes']['POSITION']];v=d['bufferViews'][a['bufferView']];off=28+n+v.get('byteOffset',0)+a.get('byteOffset',0);pts=[struct.unpack_from('<fff',b,off+i*v.get('byteStride',12)) for i in range(a['count'])]
for axis in range(3):
 ranges=[(min(p[j] for p in pts),max(p[j] for p in pts)) for j in range(3)]
 mid=[p[axis] for p in pts if all(abs(p[j]-(ranges[j][0]+ranges[j][1])/2)<(ranges[j][1]-ranges[j][0])*0.22 for j in range(3) if j!=axis)]
 print('central surface axis',axis,len(mid),min(mid,default=0),max(mid,default=0))
Path('public/models/interior/cabinet-light-validation.json').write_text(json.dumps({'triangles':triangles,'pbr':True,'bytes':len(b)},indent=2))
