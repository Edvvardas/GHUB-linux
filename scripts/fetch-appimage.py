"""Fetch official packaging runtimes; checksum-verify Node and Electron archives."""
import hashlib,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
cache=root/'build'/'downloads';cache.mkdir(parents=True,exist_ok=True)
node='v24.22.3';electron='v45.3.3'
def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GHub-Linux-build'}),timeout=90)
def download(url,name):
 target=cache/name
 if not target.exists():
  print('Downloading '+name,flush=True)
  with get(url) as src,target.with_suffix(target.suffix+'.partial').open('wb') as dst:
   while block:=src.read(1024*1024):dst.write(block)
  target.with_suffix(target.suffix+'.partial').replace(target)
 return target
def verified(base,name,checks):
 target=download(base+'/'+name,name)
 sums=get(base+'/'+checks).read().decode()
 expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*')==name)
 actual=hashlib.sha256(target.read_bytes()).hexdigest()
 if actual!=expected:raise RuntimeError('Checksum mismatch: '+name)
 print('Verified '+name,flush=True)
 return {'file':name,'sha256':actual,'url':base+'/'+name}
records=[verified('https://nodejs.org/dist/'+node,'node-'+node+'-linux-x64.tar.xz','SHASUMS256.txt'),verified('https://github.com/electron/electron/releases/download/'+electron,'electron-'+electron+'-linux-x64.zip','SHASUMS256.txt')]
data=json.load(get('https://api.github.com/repos/AppImage/appimagetool/releases/latest'))
a=next(x for x in data['assets'] if x['name']=='appimagetool-x86_64.AppImage')
tool=download(a['browser_download_url'],a['name']);digest=hashlib.sha256(tool.read_bytes()).hexdigest()
if a.get('digest') and a['digest']!='sha256:'+digest:raise RuntimeError('appimagetool digest mismatch')
tool.chmod(0o755);records.append({'file':tool.name,'sha256':digest,'url':a['browser_download_url']})
(cache/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
