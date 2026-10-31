"""Build the offline reader and optional PDF from current, inspectable sources.
Requires Python/reportlab/Pillow for --pdf. PlantUML SVG/PNG are retained artifacts.
"""
from pathlib import Path
import json,re,html,base64,argparse
root=Path(__file__).resolve().parents[1];doc=root/'docs/retail-operations'
def inline(s):
 s=html.escape(s)
 s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
 s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',s)
 return s
def blocks(text):
 lines=text.splitlines();out=[];i=0
 while i<len(lines):
  line=lines[i];i+=1
  if not line.strip():continue
  if line.startswith('```'):
   chunk=[]
   while i<len(lines) and not lines[i].startswith('```'):chunk.append(lines[i]);i+=1
   i+=1;out.append(('code','\n'.join(chunk)));continue
  if line.startswith('|'):
   rows=[line];
   while i<len(lines) and lines[i].startswith('|'):rows.append(lines[i]);i+=1
   values=[[v.strip() for v in row.strip('|').split('|')] for row in rows if not re.match(r'^\|[\s:|\-]+\|$',row)]
   out.append(('table',values));continue
  if line.startswith('#'):out.append(('h'+str(len(line)-len(line.lstrip('#'))),line.lstrip('#').strip()));continue
  if re.match(r'^(- |\d+\. )',line):out.append(('li',re.sub(r'^(- |\d+\. )','',line)));continue
  if line.startswith('> '):out.append(('p',line[2:]));continue
  chunk=[line]
  while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )',lines[i]):chunk.append(lines[i]);i+=1
  out.append(('p',' '.join(chunk)))
 return out
def render_html(text):
 out=[]
 for kind,value in blocks(text):
  if kind=='table':out.append('<div class="table-scroll"><table>'+''.join('<tr>'+''.join('<'+('th' if i==0 else 'td')+'>'+inline(c)+'</'+('th' if i==0 else 'td')+'>' for c in row)+'</tr>' for i,row in enumerate(value))+'</table></div>')
  elif kind=='code':out.append('<pre>'+html.escape(value)+'</pre>')
  elif kind=='li':out.append('<p class="bullet">• '+inline(value)+'</p>')
  else:out.append('<'+kind+'>'+inline(value)+'</'+kind+'>')
 return '\n'.join(out)
def data_uri(path,mime):return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
def build_html():
 v=json.loads((doc/'verification.json').read_text(encoding='utf-8'));capacity=json.loads((doc/'evidence/capacity.json').read_text(encoding='utf-8'));diagrams=json.loads((doc/'diagram-index.json').read_text(encoding='utf-8'))
 sections=[('overview','经营流程与权限',doc/'README.md'),('requirements','确认后的需求规格',root/'specs/002-retail-operations/spec.md'),('course','课程方法与图纸映射',doc/'course-mapping.md'),('deployment','新手部署步骤',doc/'deployment.md')]
 nav=''.join(f'<a href="#{sid}">{title}</a>' for sid,title,_ in sections)+'<a href="#diagrams">13张当前设计图</a><a href="#verification">验收与边界</a><a href="#ui">双端界面</a>'
 text=''.join(f'<section id="{sid}">{render_html(path.read_text(encoding="utf-8"))}</section>' for sid,_,path in sections)
 figures=''.join(f'<article class="figure" data-title="{html.escape(d["title"])}"><p class="eyebrow">DESIGN / {i+1:02d}</p><h3>{html.escape(d["title"])}</h3><div class="figure-links"><button data-image="{data_uri(doc/d["svg"],"image/svg+xml")}">放大查看</button><a href="{d["svg"]}">SVG原图</a><a href="{d["source"]}">可编辑源文件</a></div><img loading="lazy" src="{data_uri(doc/d["svg"],"image/svg+xml")}" alt="{html.escape(d["title"])}"/></article>' for i,d in enumerate(diagrams))
 screens=''.join(f'<figure><img src="{data_uri(p,"image/png")}" alt="{p.stem}"/><figcaption>{"员工端：本机WXML适配器，非微信真机" if p.name.startswith("mini") else "管理员Web：真实隔离API与数据库"}</figcaption></figure>' for p in (doc/'ui').glob('*.png'))
 verification=f'''<section id="verification"><p class="eyebrow">VERIFIED / WITH BOUNDARIES</p><h2>执行结果与未执行项</h2><div class="stat-grid"><div><strong>{v['unit']['passed']}</strong>单元测试</div><div><strong>{v['pure']['passed']}</strong>纯逻辑检查</div><div><strong>{v['regression']['passed']}</strong>真实API与控制器场景组</div><div><strong>31 / 0</strong>数据不变量 / 异常数</div></div><p>本机合成负载：100名员工、30个独立员工会话、500个商品、10个活动、3000笔成交单；{capacity['elapsedSeconds']}秒完成负载阶段，{capacity['requests']}个请求，无失败。单请求P95为{capacity['requestLatencyMs']['p95']}ms，完整销售流程P95为{capacity['saleWorkflowLatencyMs']['p95']}ms。它不是未购买云机的容量承诺。</p><p>001基线升级、重复迁移、受限授权、受控OWNER恢复、34张表停写备份恢复和逐表摘要比对通过。真实微信编译/真机、目标云部署、Docker运行和生产恢复均未执行。</p><div class="pending">需要你以后办理：微信账号/AppID与扫码、适用主体和类目、云服务器和域名、备案、真机、体验版与审核。当前无需先注册账号即可查看代码和本说明。</div><p><a href="verification.json">结构化验证结果</a> · <a href="evidence/capacity.json">容量数据</a> · <a href="evidence/database.json">数据库与恢复证据</a> · <a href="openapi-extension.json">当前API合同</a></p></section>'''
 page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Foxcore · 经营流程与系统设计 v2</title><style>
:root{--forest:#213c32;--ink:#2c3b33;--muted:#718174;--paper:#f5f5ee;--lime:#e1e9bf}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.8 "Segoe UI","Microsoft YaHei",sans-serif;background:var(--paper);color:var(--ink)}a{color:#286752;text-underline-offset:4px}aside{position:fixed;inset:0 auto 0 0;width:252px;background:var(--forest);padding:34px 25px;color:white;overflow:auto}aside strong{display:block;font-size:22px;letter-spacing:2px}aside small{color:#b9cab3}aside nav{display:grid;gap:8px;margin-top:35px}aside a{color:#e7eee1;text-decoration:none;padding:10px;border-radius:7px;font-size:14px}aside a:hover{background:#3d594b}main{margin-left:252px;max-width:1600px;padding:48px 5vw}header{padding:42px;background:var(--forest);color:#fff;border-radius:24px;margin-bottom:30px}h1{font-size:30px;line-height:1.45}header h1{font-size:44px;max-width:800px;margin:16px 0}header p{color:#d1ddcb;max-width:760px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:2px;color:#7c8c6e}.pill{display:inline-block;padding:5px 14px;border-radius:30px;background:var(--lime);color:var(--forest);font-size:13px}section{background:#fff;border:1px solid #e0e6d9;border-radius:18px;margin:24px 0;padding:34px;scroll-margin-top:24px}h2{font-size:25px;border-top:1px solid #e1e7db;padding-top:24px;margin-top:32px}h3{font-size:19px}p{max-width:1000px}code,pre{font:13px/1.7 Consolas,monospace;background:#edf2e8;border-radius:5px;overflow-wrap:anywhere}code{padding:2px 5px}pre{padding:20px;overflow:auto}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:20px 0}td,th{border-bottom:1px solid #e1e7da;padding:13px;vertical-align:top;text-align:left}th{background:#eef3e7;color:#34533f}.bullet{padding-left:14px}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stat-grid div{border-radius:14px;padding:20px;background:#eff3e7;font-size:13px}.stat-grid strong{display:block;font-size:36px;color:var(--forest)}.pending{padding:20px;border-left:4px solid #c7a452;background:#fff8df;border-radius:8px}.figure{margin:22px 0;padding:22px;border:1px solid #dce5d5;border-radius:14px}.figure img{width:100%;max-height:680px;object-fit:contain;background:white;margin-top:20px}.figure-links{display:flex;gap:20px;align-items:center}button{background:var(--forest);color:white;border:0;border-radius:8px;padding:11px 18px;cursor:pointer;font:inherit;font-size:13px}#diagramSearch{width:100%;padding:14px;border:1px solid #d4dfcc;border-radius:8px;font:inherit}.screen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.screen-grid figure{margin:0;padding:15px;background:#f0f4e9;border-radius:13px}.screen-grid img{width:100%;max-height:720px;object-fit:contain;object-position:top}figcaption{font-size:12px;color:var(--muted);margin-top:10px}dialog{width:95vw;height:94vh;border:0;border-radius:14px;padding:20px}dialog img{width:100%;height:85%;object-fit:contain}dialog::backdrop{background:#12261fd9}footer{font-size:13px;color:var(--muted);padding:30px}@media(max-width:900px){aside{position:relative;width:auto;padding:18px}aside nav{display:flex;overflow:auto;white-space:nowrap;margin-top:15px}main{margin:0;padding:15px}header,section{padding:24px}header h1{font-size:30px}.stat-grid{grid-template-columns:repeat(2,1fr)}}@media print{aside,button,#diagramSearch{display:none}main{margin:0;padding:0}section{break-inside:auto}header{color:#213c32;background:white}a{color:inherit}.figure{break-inside:avoid}}
</style><aside><strong>FOXCORE<span style="color:#c7d7a5">.</span></strong><small>RETAIL / DESIGN V2<br>2026-10-28 独立分支交付</small><nav>'''+nav+'''</nav></aside><main><header><span class="pill">代码与本机验收 / 外部门禁待办</span><h1>从现场销售，<br>到可核对的完整经营流程。</h1><p>管理员Web · 员工微信小程序 · 同一后端与数据库。规格、图纸、代码与真实测试相互对应；旧版本和失败证据保留。</p><p>14个原生页面 / 33业务表+1迁移表 / 13张当前设计图</p></header>'''+text+'''<section id="diagrams"><p class="eyebrow">SYSTEM MODELS</p><h2>当前设计图纸</h2><p>完整ERD适合放大查看，打印可使用三个分模块ERD。概念类图描述业务职责，实际后端采用事务函数模块。</p><input id="diagramSearch" placeholder="搜索图纸：数据库、换货、状态、草稿…" aria-label="搜索图纸">'''+figures+'''</section>'''+verification+'''<section id="ui"><h2>双端实际界面</h2><p>使用隔离库与虚拟员工/商品记录验证；员工端截图来自实际WXML与控制器的本机适配器。</p><div class="screen-grid">'''+screens+'''</div></section><footer>本报告是2026-10-28增量版本。历史课程图和报告见上级course-review目录；本机证据不能替代微信、云机和容器上线验收。</footer></main><dialog id="zoom"><button id="close">关闭放大图</button><img alt="放大的系统图纸"></dialog><script>document.getElementById('diagramSearch').addEventListener('input',e=>{const q=e.target.value.trim();document.querySelectorAll('.figure').forEach(x=>x.hidden=!x.dataset.title.includes(q));});document.querySelectorAll('[data-image]').forEach(b=>b.addEventListener('click',()=>{const d=document.getElementById('zoom');d.querySelector('img').src=b.dataset.image;d.showModal();}));document.getElementById('close').onclick=()=>document.getElementById('zoom').close();</script></html>'''
 (doc/'index.html').write_text(page,encoding='utf-8')
 print('Offline report generated with embedded diagrams and UI images')
def build_pdf():
 from reportlab.pdfgen import canvas
 from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,PageBreak,NextPageTemplate,Table,TableStyle,Image,KeepTogether
 from reportlab.lib import colors
 from reportlab.lib.styles import ParagraphStyle
 from reportlab.pdfbase import pdfmetrics
 from reportlab.pdfbase.ttfonts import TTFont
 from reportlab.pdfbase.cidfonts import UnicodeCIDFont
 from reportlab.lib.pagesizes import A4,A2,landscape
 from PIL import Image as PILImage
 font_path=Path('C:/Windows/Fonts/simsun.ttc')
 if font_path.exists():pdfmetrics.registerFont(TTFont('CN',str(font_path),subfontIndex=0))
 else:pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'));pdfmetrics.registerFontFamily('STSong-Light',normal='STSong-Light',bold='STSong-Light');
 font='CN' if font_path.exists() else 'STSong-Light';pdfmetrics.registerFontFamily(font,normal=font,bold=font,italic=font,boldItalic=font)
 green=colors.HexColor('#213c32');body=ParagraphStyle('Body',fontName=font,fontSize=10,leading=17,spaceAfter=8,wordWrap='CJK',textColor=green)
 small=ParagraphStyle('Small',parent=body,fontSize=8.2,leading=12)
 heads={k:ParagraphStyle(k,parent=body,fontSize=v,leading=v*1.5,spaceBefore=16,spaceAfter=10,keepWithNext=True) for k,v in [('h1',22),('h2',16),('h3',12.5),('h4',11)]}
 def clean(s):return re.sub(r'<code>(.*?)</code>',r'\1',inline(s)).replace('<strong>','<b>').replace('</strong>','</b>').replace('<a href=', '<link href=').replace('</a>','</link>')
 def source(text,flow):
  for kind,value in blocks(text):
   if kind=='table':
    n=max(map(len,value));width=docu.width/n;rows=[[Paragraph(clean(c),small) for c in row]+['']*(n-len(row)) for row in value];t=Table(rows,colWidths=[width]*n,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7eedc')),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d6dfce')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));flow.extend([t,Spacer(1,10)])
   elif kind=='code':flow.append(Paragraph(html.escape(value).replace('\n','<br/>'),small))
   else:flow.append(Paragraph(('• ' if kind=='li' else '')+clean(value),heads.get(kind,body)))
 def furniture(c,docu):
  c.saveState();w,h=c._pagesize;c.setStrokeColor(colors.HexColor('#c7d4bd'));c.line(40,34,w-40,34);c.setFont(font,8);c.setFillColor(green);c.drawString(40,21,'FOXCORE RETAIL / 系统设计与经营流程 v2');c.drawRightString(w-40,21,str(docu.page));c.restoreState()
 target=doc/'Foxcore-系统设计与经营流程-v2.pdf';docu=BaseDocTemplate(str(target),pagesize=A4,leftMargin=42,rightMargin=42,topMargin=42,bottomMargin=46,title='Foxcore 系统设计与经营流程 v2',author='Foxcore Project')
 pw,ph=A4;lw,lh=landscape(A4);bw,bh=A2;docu.addPageTemplates([PageTemplate(id='portrait',frames=[Frame(42,46,pw-84,ph-88,id='p')],onPage=furniture,pagesize=A4),PageTemplate(id='landscape',frames=[Frame(40,46,lw-80,lh-88,id='l')],onPage=furniture,pagesize=landscape(A4)),PageTemplate(id='large',frames=[Frame(40,46,bw-80,bh-88,id='b')],onPage=furniture,pagesize=A2)])
 flow=[Spacer(1,68),Paragraph('FOXCORE RETAIL',heads['h1']),Spacer(1,16),Paragraph('系统设计与经营流程 v2',heads['h1']),Paragraph('管理员 Web / 员工微信小程序 / 同一 API 与数据库',heads['h2']),Spacer(1,26),Paragraph('2026-10-28 · 独立分支代码交付',body),Paragraph('基于用户直接确认的经营规则；保留历史案例基线和复核证据。',body),Paragraph('14页原生小程序 · 33张业务表+1张迁移表 · 13张当前设计图',body),Spacer(1,24),Paragraph('已执行：本机类型与构建、真实数据库与控制器、并发、容量、升级和停写恢复。<br/>待执行：微信引擎与真机、目标云机和Docker运行、备案/类目/审核与正式发布。',body),PageBreak()]
 for name in ['README.md','course-mapping.md','deployment.md']:
  text=(doc/name).read_text(encoding='utf-8')
  if name=='README.md':text=text.split('## 复现入口')[0]
  source(text,flow);flow.append(PageBreak())
 source((root/'specs/002-retail-operations/spec.md').read_text(encoding='utf-8'),flow)
 flow.extend([NextPageTemplate('landscape'),PageBreak()])
 diagrams=json.loads((doc/'diagram-index.json').read_text(encoding='utf-8'))
 for i,d in enumerate(diagrams):
  large='03a' in d['id']
  if i:flow.extend([NextPageTemplate('large' if large else 'landscape'),PageBreak()])
  flow.append(Paragraph(f'图 {i+1:02d}　'+d['title'],heads['h2']));p=doc/d['png'];im=PILImage.open(p);maxw=(bw if large else lw)-110;maxh=(bh if large else lh)-220;ratio=min(maxw/im.width,maxh/im.height);flow.append(Image(str(p),width=im.width*ratio,height=im.height*ratio,hAlign='CENTER'));flow.append(Spacer(1,6));flow.append(Paragraph('源文件：'+d['source']+'。本页为A2物理ERD；可在HTML中放大SVG查看，或使用后续分模块ERD打印。' if large else '当前实现模型；PlantUML可编辑源和SVG矢量图保存在diagrams目录。',small))
 docu.build(flow);print('PDF generated:',target.name)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--pdf',action='store_true');args=a.parse_args();build_html()
 if args.pdf:build_pdf()
