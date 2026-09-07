import pathlib,zipfile,json,hashlib
R=pathlib.Path(__file__).resolve().parents[1];D=R/'delivery';out=D/'Gulangyu_Game_Kit.zip'
required=['Gulangyu_Showcase_1080p.mp4','Gulangyu_World.blend','VALIDATION.json','Poster.jpg','Contact_Sheet.jpg']
for name in required:assert (D/name).exists(),name
assert json.loads((D/'VALIDATION.json').read_text())['status']=='passed'
files=[R/'README.md',R/'AGENTS.md',R/'requirements.txt']+list((R/'scripts').glob('*.py'))+[p for p in (R/'data').glob('*') if p.is_file()]+[p for p in D.rglob('*') if p.is_file() and p!=out and p.name!='package_manifest.json' and not p.name.endswith('.blend1')]
files=sorted(set(files));total=0
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
 for p in files:
  method=zipfile.ZIP_STORED if p.suffix.lower() in ['.blend','.mp4','.png','.jpg','.npz'] else zipfile.ZIP_DEFLATED
  z.write(p,'Gulangyu_Game_Kit/'+str(p.relative_to(R)),compress_type=method);total+=p.stat().st_size
with zipfile.ZipFile(out) as z:assert z.testzip() is None
sha=hashlib.sha256()
with out.open('rb') as f:
 for b in iter(lambda:f.read(2**20),b''):sha.update(b)
r={'archive':out.name,'files':len(files),'uncompressed_bytes':total,'archive_bytes':out.stat().st_size,'sha256':sha.hexdigest(),'zip_integrity':'passed'}
(D/'package_manifest.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
