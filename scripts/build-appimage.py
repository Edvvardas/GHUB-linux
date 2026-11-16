"""Assemble a Linux x86_64 AppDir using previously verified runtime archives."""
import json,os,shutil,subprocess,tarfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];cache=root/'build/downloads';app=root/'build/GHubLinux.AppDir'
subprocess.run(['bash',str(root/'native/build.sh')],check=True)
if app.exists():shutil.rmtree(app)
(app/'usr/bin').mkdir(parents=True)
(app/'usr/app').mkdir(parents=True)
node='node-v24.22.3-linux-x64'
with tarfile.open(cache/(node+'.tar.xz')) as archive:
 for name in (node+'/bin/node',node+'/LICENSE'):
  source=archive.extractfile(name);target=app/('usr/bin/node' if name.endswith('/node') else 'usr/NODE-LICENSE')
  target.write_bytes(source.read())
(app/'usr/bin/node').chmod(0o755)
with zipfile.ZipFile(cache/'electron-v45.3.3-linux-x64.zip') as archive:
 for entry in archive.infolist():
  target=app/'usr/electron'/entry.filename
  if not target.resolve().is_relative_to((app/'usr/electron').resolve()):raise ValueError('Invalid archive path')
  if entry.is_dir():target.mkdir(parents=True,exist_ok=True);continue
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(entry))
  mode=(entry.external_attr>>16)&0o777
  target.chmod(mode or 0o644)
for name in ['src','public','tools','packaging']:
 shutil.copytree(root/name,app/'usr/app'/name,ignore=shutil.ignore_patterns('assets') if name=='public' else None)
(app/'usr/app/native').mkdir();shutil.copy2(root/'native/linux_input.node',app/'usr/app/native/linux_input.node')
(app/'usr/app/scripts').mkdir();shutil.copy2(root/'scripts/desktop.ts',app/'usr/app/scripts/desktop.ts')
for name in ['package.json','README.md']:shutil.copy2(root/name,app/'usr/app'/name)
for name in ['AppRun','ghub-linux.desktop','ghub-linux.svg']:shutil.copy2(root/'packaging'/name,app/name)
(app/'AppRun').chmod(0o755);subprocess.run(['rsvg-convert','-w','256','-h','256',str(root/'packaging/ghub-linux.svg'),'-o',str(app/'ghub-linux.png')],check=True)
(app/'.DirIcon').symlink_to('ghub-linux.png')
icons=app/'usr/share/icons/hicolor/256x256/apps';icons.mkdir(parents=True)
shutil.copy2(app/'ghub-linux.png',icons/'ghub-linux.png')
shutil.copy2(cache/'manifest.json',app/'usr/runtime-manifest.json')
(root/'dist').mkdir(exist_ok=True)
env={**os.environ,'ARCH':'x86_64','APPIMAGE_EXTRACT_AND_RUN':'1'}
subprocess.run([str(cache/'appimagetool-x86_64.AppImage'),'--no-appstream','--mksquashfs-opt','-processors','--mksquashfs-opt','2',str(app),str(root/'dist/GHub-Linux-0.1.0-x86_64.AppImage')],env=env,check=True)
