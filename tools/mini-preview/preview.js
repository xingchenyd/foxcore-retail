/* Development-only WXML/WeChat API adapter; executes the actual compiled page code. */
const pageRoot=document.getElementById('page'),cache={},historyStack=[];
let current=null,currentPath='',config,scheduled=false;
window.previewErrors=[];
const textFile=path=>{const x=new XMLHttpRequest();x.open('GET',path,false);x.send();if(x.status!==200)throw new Error('Missing preview file '+path);return x.responseText;};
function expression(value,context){try{return Function('ctx','with(ctx){return ('+value+')}')(context);}catch{return undefined;}}
function interpolate(value,context){return value.replace(/\{\{([\s\S]*?)\}\}/g,(_,code)=>{const r=expression(code,context);return r==null?'':String(r);});}
function evaluate(value,context){const m=value.match(/^\{\{([\s\S]*?)\}\}$/);return m?expression(m[1],context):interpolate(value,context);}
function call(name,event){try{const r=current[name]?.(event);if(r?.catch)r.catch(e=>{window.previewErrors.push(String(e));console.error(e);});}catch(e){window.previewErrors.push(String(e));console.error(e);}}
function eventFor(element,detail){return {detail,currentTarget:{dataset:{...element.dataset}},target:{dataset:{...element.dataset}}};}
function renderNodes(nodes,parent,ctx){let previousIf=false;for(const node of nodes){
  if(node.nodeType===3){parent.append(document.createTextNode(interpolate(node.textContent,ctx)));continue;}if(node.nodeType!==1)continue;
  const forExpr=node.getAttribute('wx:for');if(forExpr){const rows=evaluate(forExpr,ctx)||[];for(let i=0;i<rows.length;i++){const copy=node.cloneNode(true);copy.removeAttribute('wx:for');renderNodes([copy],parent,{...ctx,[node.getAttribute('wx:for-item')||'item']:rows[i],[node.getAttribute('wx:for-index')||'index']:i});}continue;}
  if(node.hasAttribute('wx:if')){previousIf=!!evaluate(node.getAttribute('wx:if'),ctx);if(!previousIf)continue;}else if(node.hasAttribute('wx:else')){if(previousIf)continue;previousIf=true;}else if(node.hasAttribute('wx:elif')){if(previousIf)continue;previousIf=!!evaluate(node.getAttribute('wx:elif'),ctx);if(!previousIf)continue;}
  const tag=node.tagName.toLowerCase();if(tag==='block'){renderNodes([...node.childNodes],parent,ctx);continue;}
  let el=document.createElement(tag==='view'||tag==='checkbox-group'||tag==='radio-group'?'div':tag==='text'?'span':tag==='picker'?'select':tag==='checkbox'||tag==='radio'?'input':tag);
  for(const a of node.attributes){if(a.name.startsWith('wx:')||/^(bind|catch)/.test(a.name)||['range','range-key'].includes(a.name))continue;const value=evaluate(a.value,ctx);if(a.name==='disabled'||a.name==='checked'||a.name==='password'){if(value!==false&&value!=null&&value!=='false'){if(a.name==='password')el.type='password';else el[a.name]=true;}continue;}if(a.name==='value'){el.value=value??'';el.setAttribute('value',value??'');}else el.setAttribute(a.name,String(value??''));}
  if(tag==='input'&&['digit','number'].includes(node.getAttribute('type'))){el.type='text';el.inputMode=node.getAttribute('type')==='digit'?'decimal':'numeric';}
  if(tag==='checkbox'||tag==='radio'){el.type=tag;el.value=evaluate(node.getAttribute('value')||'',ctx);}
  if(tag==='picker'){el.classList.add('picker');const rows=evaluate(node.getAttribute('range'),ctx)||[],key=node.getAttribute('range-key');const placeholder=document.createElement('option');placeholder.value='-1';placeholder.textContent=interpolate(node.textContent,ctx);el.append(placeholder);rows.forEach((row,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=key?row[key]:row;el.append(o);});el.value=String(evaluate(node.getAttribute('value')||'0',ctx));}
  else renderNodes([...node.childNodes],el,ctx);
  const tap=node.getAttribute('bindtap');if(tap)el.addEventListener('click',e=>{e.stopPropagation();call(tap,eventFor(el,{}));});
  const input=node.getAttribute('bindinput');if(input)el.addEventListener('input',()=>call(input,eventFor(el,{value:el.value})));
  const confirm=node.getAttribute('bindconfirm');if(confirm)el.addEventListener('keydown',e=>{if(e.key==='Enter')call(confirm,eventFor(el,{value:el.value}));});
  const change=node.getAttribute('bindchange');if(change)el.addEventListener('change',()=>call(change,eventFor(el,{value:tag==='checkbox-group'?[...el.querySelectorAll('input:checked')].map(x=>x.value):tag==='radio-group'?el.querySelector('input:checked')?.value:el.value})));
  if(['input','textarea','picker'].includes(tag))el.dataset.focus=tag+'-'+(el.id||el.dataset.field||'')+'-'+(el.dataset.index||'')+'-'+document.createTreeWalker(parent).currentNode.nodeName+'-'+(window.focusCounter++);
  parent.append(el);
}}
function render(){if(!current)return;const focus=document.activeElement,focusKey=focus?.dataset?.focus,position=focus?.selectionStart,scroll=window.scrollY;window.focusCounter=0;const xml=new DOMParser().parseFromString('<main>'+current.wxml+'</main>','text/html');pageRoot.replaceChildren();renderNodes([...xml.querySelector('main').childNodes],pageRoot,current.data);const next=[...pageRoot.querySelectorAll('[data-focus]')].find(x=>x.dataset.focus===focusKey);if(next){next.focus({preventScroll:true});try{next.setSelectionRange(position,position);}catch{}}window.scrollTo(0,scroll);}
function loadModule(path){path=new URL(path+'.js',location.origin).pathname;if(cache[path])return cache[path].exports;const module={exports:{}};cache[path]=module;const code=textFile(path);Function('require','module','exports','Page','App','wx',code)(name=>loadModule(new URL(name,new URL(path,location.origin)).pathname),module,module.exports,options=>{
  const instance={data:JSON.parse(JSON.stringify(options.data||{})),wxml:'',setData(values){for(const [key,value]of Object.entries(values)){const bits=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;for(let i=0;i<bits.length-1;i++)target=target[bits[i]];target[bits.at(-1)]=value;}if(this===current&&!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}}};
  for(const [key,value]of Object.entries(options))if(typeof value==='function')instance[key]=value.bind(instance);current=instance;
},()=>{},wx);return module.exports;}
function navigate(url,push=false){const parsed=new URL(url,location.origin),path=parsed.pathname;current?.onUnload?.();if(push&&currentPath)historyStack.push(currentPath);currentPath=url;delete cache['/mini'+path+'.js'];loadModule('/mini'+path);current.wxml=textFile('/mini'+path+'.wxml');current.onLoad?.(Object.fromEntries(parsed.searchParams));const old=document.getElementById('page-style');old?.remove();try{const css=textFile('/mini'+path+'.wxss');const style=document.createElement('style');style.id='page-style';style.textContent=adaptCss(css);document.head.append(style);}catch{}render();current.onShow?.();window.scrollTo(0,0);tabs(path);}
function adaptCss(css){return css.replace(/(\d*\.?\d+)rpx/g,(_,n)=>Number(n)/2+'px').replace(/(^|\})\s*page(?=\s*\{)/g,'$1 #page');}
function tabs(path){const tabs=document.getElementById('tabs');tabs.replaceChildren();const hidden=path==='/pages/login/index';tabs.style.display=hidden?'none':'flex';if(hidden)return;for(const item of config.tabBar.list){const button=document.createElement('button'),active='/'+item.pagePath===path;button.className=active?'active':'';const img=document.createElement('img');img.src='/mini/'+(active?item.selectedIconPath:item.iconPath);button.append(img,document.createTextNode(item.text));button.addEventListener('click',()=>wx.switchTab({url:'/'+item.pagePath}));tabs.append(button);}}
const wx={
 getStorageSync(key){try{return JSON.parse(localStorage.getItem(key));}catch{return undefined;}},setStorageSync(key,value){localStorage.setItem(key,JSON.stringify(value));},removeStorageSync(key){localStorage.removeItem(key);},getStorageInfoSync(){return {keys:Object.keys(localStorage)};},
 getRandomValues(o){const bytes=crypto.getRandomValues(new Uint8Array(o.length));o.success({randomValues:bytes.buffer});},
 request(o){fetch(new URL(o.url).pathname+new URL(o.url).search,{method:o.method,headers:o.header,credentials:'omit',body:o.method==='GET'?undefined:JSON.stringify(o.data||{}),signal:AbortSignal.timeout(o.timeout)}).then(async r=>{o.success({statusCode:r.status,data:await r.json()});}).catch(()=>o.fail({}));},
 navigateTo(o){navigate(o.url,true);},redirectTo(o){navigate(o.url);},reLaunch(o){historyStack.length=0;navigate(o.url);},switchTab(o){historyStack.length=0;navigate(o.url);},
 showModal(o){o.success({confirm:window.confirm(o.title+'\n\n'+o.content),cancel:false});},showToast(o){document.getElementById('toast')?.remove();const t=document.createElement('div');t.id='toast';t.textContent=o.title;document.body.append(t);setTimeout(()=>t.remove(),2500);},pageScrollTo(o){window.scrollTo({top:o.scrollTop,behavior:o.duration?'smooth':'auto'});},stopPullDownRefresh(){},setNavigationBarTitle(){}
};
config=JSON.parse(textFile('/mini/app.json'));const style=document.createElement('style');style.textContent=adaptCss(textFile('/mini/app.wxss'));document.head.append(style);
document.getElementById('back').onclick=()=>{const previous=historyStack.pop();if(previous)navigate(previous);else wx.switchTab({url:'/pages/home/index'});};
window.preview={navigate:url=>navigate(url),state:()=>({path:currentPath,data:current.data}),refresh:()=>current.onShow?.()};
navigate('/pages/login/index');
