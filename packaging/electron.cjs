const {app,BrowserWindow}=require('electron');
const url=process.argv[2];
if(!url||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw new Error('Invalid local application URL');
app.setName('G HUB Linux');
app.whenReady().then(()=>{
 const win=new BrowserWindow({width:1280,height:900,minWidth:850,minHeight:650,backgroundColor:'#202124',autoHideMenuBar:true,icon:__dirname+'/ghub-linux.svg',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,target)=>{if(new URL(target).origin!==url)event.preventDefault();});
 win.loadURL(url);
 const smoke=Number(process.env.LGHUB_PACKAGED_SMOKE_MS||0);
 if(smoke>0){
  win.webContents.once('did-finish-load',()=>setTimeout(async()=>{
   try{
    const ready=await win.webContents.executeJavaScript('!!document.querySelector("[data-page=assignments]")');
    if(!ready)throw new Error('Renderer did not initialize');
    if(process.env.LGHUB_PACKAGED_SCREENSHOT_PATH)require('node:fs').writeFileSync(process.env.LGHUB_PACKAGED_SCREENSHOT_PATH,(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({packagedRendererReady:ready,nodeBundled:true,electronBundled:true}));
   }catch(error){console.error(error);app.exit(1);}
  },700));
  setTimeout(()=>app.quit(),smoke);
 }
});
app.on('window-all-closed',()=>app.quit());
