"""Build the self-contained HTML handbook, report PDF and UML/ERD atlas.
Requirements: Python 3.12+, reportlab, Pillow. No remote services are used.
Run after generate-course-diagrams.py and PlantUML SVG/PNG rendering.
Usage: python scripts/build-course-artifacts.py <output-directory>
"""
from pathlib import Path
import sys,re,json,html,base64,hashlib
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/course-review'
OUT=Path(sys.argv[1]).resolve(); OUT.mkdir(parents=True,exist_ok=True)
FONT=Path('C:/Windows/Fonts/simhei.ttf')
if not FONT.exists():
    raise RuntimeError('Set FONT to a local CJK TrueType font before generating PDFs.')
pdfmetrics.registerFont(TTFont('CJK',str(FONT)))
pdfmetrics.registerFontFamily('CJK',normal='CJK',bold='CJK',italic='CJK',boldItalic='CJK')
styles=getSampleStyleSheet()
for name in ('Normal','BodyText','Title','Heading1','Heading2','Heading3'):
    styles[name].fontName='CJK';styles[name].wordWrap='CJK';styles[name].textColor=colors.HexColor('#243B37')
styles['BodyText'].fontSize=9.2;styles['BodyText'].leading=15
styles['Heading1'].fontSize=18;styles['Heading1'].leading=25
styles['Heading2'].fontSize=13;styles['Heading2'].leading=20
styles['Heading3'].fontSize=10.5;styles['Heading3'].leading=17
styles.add(ParagraphStyle('CellCJK',fontName='CJK',fontSize=7.7,leading=11.5,wordWrap='CJK',textColor=colors.HexColor('#263E39')))
styles.add(ParagraphStyle('CodeCJK',fontName='CJK',fontSize=7.5,leading=11,wordWrap='CJK',backColor=colors.HexColor('#EFF5F2'),borderPadding=7))

def inline(s,pdf=False):
    s=escape(s) if pdf else html.escape(s)
    s=re.sub(r'`([^`]+)`',r'<b>\1</b>' if pdf else r'<code>\1</code>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'\1' if pdf else r'<span class="ref">\1</span>',s)
    return s

def blocks(md):
    lines=md.splitlines();i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('```'):
            content=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):content.append(lines[i]);i+=1
            yield 'code','\n'.join(content);i+=1;continue
        if line.startswith('|') and i+1<len(lines) and re.match(r'\|[ :|-]+\|',lines[i+1]):
            table=[[x.strip() for x in line.strip('|').split('|')]];i+=2
            while i<len(lines) and lines[i].strip().startswith('|'):
                table.append([x.strip() for x in lines[i].strip().strip('|').split('|')]);i+=1
            yield 'table',table;continue
        h=re.match(r'^(#{1,6}) (.*)',line)
        if h:yield 'h'+str(len(h[1])),h[2];i+=1;continue
        m=re.match(r'^(?:- |\d+\. )(.*)',line)
        if m:yield 'li',m[1];i+=1;continue
        if line=='---':i+=1;continue
        para=[line.lstrip('> ')];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(?:#|\||-|\d+\. |```)',lines[i].strip()):
            para.append(lines[i].strip().lstrip('> '));i+=1
        yield 'p',' '.join(para)

def html_md(md):
    out=[]
    for kind,val in blocks(md):
        if kind=='table':
            out.append('<div class="table-wrap"><table>')
            for n,row in enumerate(val):
                tag='th' if n==0 else 'td';out.append('<tr>'+''.join('<'+tag+'>'+inline(c)+'</'+tag+'>' for c in row)+'</tr>')
            out.append('</table></div>')
        elif kind=='code':out.append('<pre>'+html.escape(val)+'</pre>')
        elif kind=='li':out.append('<p class="item">• '+inline(val)+'</p>')
        else:out.append('<'+kind+'>'+inline(val)+'</'+kind+'>')
    return '\n'.join(out)

def pdf_md(md):
    out=[]
    for kind,val in blocks(md):
        if kind=='table':
            n=max(map(len,val));val=[r+['']*(n-len(r)) for r in val]
            widths=[1/n]*n
            if n==4:widths=[.20,.28,.16,.36]
            if n==3:widths=[.20,.40,.40]
            if n==2:widths=[.24,.76]
            data=[[Paragraph(inline(c,True),styles['CellCJK']) for c in row] for row in val]
            tab=Table(data,colWidths=[(A4[0]-88)*w for w in widths],repeatRows=1,hAlign='LEFT')
            tab.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#DCECE5')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F6F9F7')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#8AA69A')),('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#DFE9E3'))]))
            out.extend([tab,Spacer(1,10)])
        elif kind=='code':out.extend([Paragraph(escape(val).replace('\n','<br/>'),styles['CodeCJK']),Spacer(1,8)])
        elif kind.startswith('h'):
            level=min(int(kind[1:]),3);out.append(Paragraph(inline(val,True),styles['Heading'+str(level)]))
        else:out.append(Paragraph(('- ' if kind=='li' else '')+inline(val,True),styles['BodyText']))
    return out

index=json.loads((DOC/'diagram-index.json').read_text(encoding='utf-8'))
sections=[('review','审查结论与改动',DOC/'README.md'),('course','课程知识与用例规约',DOC/'课程知识与项目映射.md'),('trace','需求与验证追踪',DOC/'追踪矩阵.md'),('dictionary','完整数据字典',DOC/'数据字典.md'),('verification','本次验证证据',DOC/'验证记录.md')]
for _,_,path in sections:
    if not path.exists():raise FileNotFoundError(path)
diagrams=[]
for d in index:
    svg=(DOC/'diagrams'/(d['id']+'.svg')).read_text(encoding='utf-8')
    if 'Syntax Error' in svg or 'An error has occurred' in svg:raise ValueError('Broken diagram '+d['id'])
    # Unique SVG ids prevent gradient/filter collisions when all 34 SVGs share the DOM.
    encoded=base64.b64encode(svg.encode()).decode()
    diagrams.append('<article class="diagram-card" data-title="'+html.escape(d['title'])+'"><div class="figure-header"><small>'+d['id']+'</small><h3>'+html.escape(d['title'])+'</h3><p>'+html.escape(d['description'])+'</p></div><button class="diagram-button" aria-label="放大'+html.escape(d['title'])+'"><img loading="lazy" src="data:image/svg+xml;base64,'+encoded+'" alt="'+html.escape(d['title'])+'"></button><p class="source">依据：'+html.escape(d['source'])+'</p></article>')
css='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f6f2;color:#263e37;font:15px/1.85 "Microsoft YaHei",system-ui,sans-serif}a{color:#287359}aside{position:fixed;width:240px;inset:0 auto 0 0;background:#183b32;color:#dcebe3;padding:34px 25px;overflow:auto}aside strong{font-size:23px;letter-spacing:2px}aside small{display:block;font-size:10px;letter-spacing:3px;color:#a9c3b3}nav{display:grid;gap:9px;margin:42px 0}nav a{color:#dcebe3;text-decoration:none;padding:8px;border-radius:7px}nav a:hover{background:#2b5143}main{margin-left:240px;max-width:1420px;padding:45px 50px}.hero{background:#e3eadd;padding:45px;border-radius:18px;border:1px solid #d3dfd0;margin-bottom:30px}.hero .tag{color:#697d52;font-size:12px;letter-spacing:3px}h1{font-size:30px;line-height:1.5}h2{font-size:23px;margin-top:34px;border-bottom:1px solid #d5dfd4;padding-bottom:10px}h3{font-size:18px}section{background:white;border:1px solid #e0e6dc;border-radius:14px;padding:32px;margin:28px 0;scroll-margin-top:20px}p{margin:13px 0}code{background:#edf2ec;padding:2px 5px;border-radius:4px;font-size:12px;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#edf2ec;padding:16px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:11px 13px;border:1px solid #dfe6db;vertical-align:top;overflow-wrap:anywhere}th{background:#e9f0e5;text-align:left}tr:nth-child(even){background:#f8faf6}.table-wrap{overflow:auto}.item{padding-left:16px}.diagram-card{margin:24px 0;border:1px solid #dae3d5;border-radius:10px;overflow:hidden;break-inside:avoid}.figure-header{padding:16px 22px;background:#f2f6ee}.figure-header small{color:#6b7d5d;letter-spacing:1px}.figure-header h3{margin:5px 0}.figure-header p{font-size:13px}.diagram-button{border:0;background:white;display:block;width:100%;cursor:zoom-in;padding:20px}.diagram-button img{width:100%;max-height:850px;object-fit:contain}.source{font-size:12px;color:#75816e;padding:0 22px}.stats{display:flex;gap:30px;margin-top:24px}.stats b{font-size:29px;display:block}.stats small{color:#69775f}.filter{padding:12px;border:1px solid #aabda4;border-radius:8px;width:100%;font:inherit}.hint{font-size:12px;color:#64755b}.preview img{width:100%;border:1px solid #dae3d5;border-radius:8px}.overlay{position:fixed;inset:0;z-index:10;background:#17291fef;color:white;display:none;grid-template-rows:auto 1fr}.overlay.open{display:grid}.overlay header{display:flex;align-items:center;gap:16px;padding:15px;background:#15271e}.overlay header button{padding:10px 18px;cursor:pointer}.zoom-surface{overflow:auto;padding:30px}.zoom-surface img{display:block;background:white;max-width:none}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #d79a41;outline-offset:3px}@media(max-width:900px){aside{position:static;width:100%;padding:20px}nav{display:flex;flex-wrap:wrap;margin:15px 0}main{margin:0;padding:16px}.hero,section{padding:22px}.stats{gap:20px}h1{font-size:24px}}@media print{aside,.filter,.hint,.overlay{display:none!important}main{margin:0;padding:0}section{break-before:page;border:0}.hero{background:white}body{background:white}table{font-size:10px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'''
nav=''.join('<a href="#'+a+'">'+b+'</a>' for a,b,_ in sections[:3])+'<a href="#diagrams">34 张规范设计图</a>'+''.join('<a href="#'+a+'">'+b+'</a>' for a,b,_ in sections[3:])
body='<div class="hero"><p class="tag">FOXCORE RETAIL / COURSE & SYSTEM REVIEW</p><h1>让每一笔现场销售<br>都有完整、可核对的业务链。</h1><p>系统审查 · 课程知识映射 · 可编辑 UML / ERD · 真实验证证据</p><div class="stats"><div><b>34</b><small>规范设计图</small></div><div><b>25 + 1</b><small>业务表与迁移表</small></div><div><b>13</b><small>系统用例</small></div></div><p class="hint">2026-10-24 ｜ 当前实现与建议目标分别标记 ｜ 可离线阅读</p></div>'
for a,b,path in sections[:3]:body+='<section id="'+a+'">'+html_md(path.read_text(encoding='utf-8'))+'</section>'
body+='<section id="diagrams"><h1>规范设计图册</h1><p>点击任一图片可打开全屏视图；用滑杆放大后滚动阅读。物理总图配合六张分域图使用。</p><label>查找图纸<input class="filter" id="diagram-search" type="search" placeholder="输入用例、类图、库存、ERD…"></label><p id="figure-count" class="hint">显示 '+str(len(index))+' 张图纸</p>'+''.join(diagrams)+'</section>'
for a,b,path in sections[3:]:body+='<section id="'+a+'">'+html_md(path.read_text(encoding='utf-8'))+'</section>'
shots=[]
for name in ['dashboard-desktop.png','sales-desktop.png','dashboard-mobile.png']:
    p=OUT/'ui-preview'/name
    if p.exists():shots.append('<figure><img loading="lazy" alt="真实系统：'+name+'" src="data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()+'"><figcaption>'+name+' · 本轮独立实例的合成演示数据</figcaption></figure>')
if shots:body+='<section class="preview" id="ui-preview"><h1>界面实测预览</h1>'+''.join(shots)+'</section>'
script='''let oldFocus;const layer=document.querySelector('.overlay'),pic=layer.querySelector('img'),slider=document.querySelector('#zoom');document.querySelectorAll('.diagram-button').forEach(b=>b.addEventListener('click',()=>{oldFocus=b;pic.src=b.querySelector('img').src;pic.alt=b.querySelector('img').alt;layer.querySelector('strong').textContent=pic.alt;layer.classList.add('open');document.body.style.overflow='hidden';slider.value='100';pic.onload=()=>{pic.style.width=Math.min(pic.naturalWidth,innerWidth-90)+'px';pic.dataset.base=Math.min(pic.naturalWidth,innerWidth-90)};document.querySelector('#close').focus()}));function close(){layer.classList.remove('open');document.body.style.overflow='';oldFocus?.focus()}document.querySelector('#close').onclick=close;slider.oninput=()=>pic.style.width=Number(pic.dataset.base)*Number(slider.value)/100+'px';document.addEventListener('keydown',e=>{if(layer.classList.contains('open')){if(e.key==='Escape')close();if(e.key==='Tab'){const items=[document.querySelector('#close'),slider];if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items[1].focus()}else if(!e.shiftKey&&document.activeElement===items[1]){e.preventDefault();items[0].focus()}}}});document.querySelector('#diagram-search').oninput=e=>{let n=0;document.querySelectorAll('.diagram-card').forEach(c=>{c.hidden=!c.textContent.toLowerCase().includes(e.target.value.trim().toLowerCase());if(!c.hidden)n++});document.querySelector('#figure-count').textContent='显示 '+n+' 张图纸'};'''
page='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Foxcore Retail · 系统审查与课程设计</title><style>'+css+'</style></head><body><aside><strong>FOXCORE.</strong><small>RETAIL / DESIGN REVIEW</small><nav>'+nav+'</nav><p class="hint">本地交付 · 2026-10-24<br>报告、图纸与代码对应阅读</p></aside><main>'+body+'</main><div class="overlay" role="dialog" aria-modal="true" aria-label="设计图放大阅读"><header><button id="close">关闭 / Esc</button><strong></strong><label>缩放 <input id="zoom" type="range" min="50" max="1000" value="100"></label></header><div class="zoom-surface"><img alt=""></div></div><script>'+script+'</script></body></html>'
(OUT/'Foxcore-系统审查与课程设计.html').write_text(page,encoding='utf-8')
(DOC/'index.html').write_text(page,encoding='utf-8')

def footer(canv,doc):
    canv.saveState();w,h=A4;canv.setStrokeColor(colors.HexColor('#CAD8CB'));canv.line(44,35,w-44,35);canv.setFont('CJK',8);canv.setFillColor(colors.HexColor('#6A7F70'));canv.drawString(44,23,'FOXCORE RETAIL  /  系统审查与课程设计  /  2026-10-24');canv.drawRightString(w-44,23,str(doc.page));canv.restoreState()
story=[]
story.extend([Spacer(1,70),Paragraph('FOXCORE RETAIL',styles['Title']),Spacer(1,24),Paragraph('系统审查与课程设计报告',styles['Heading1']),Spacer(1,14),Paragraph('从业务建模、需求规约到分析模型、物理数据库与界面验证。',styles['BodyText']),Spacer(1,24),Paragraph('基于 3393bc3a4989 的本地修订版本<br/>2026-10-24<br/>独立教学项目 · 事实、目标、未验证范围分开说明',styles['BodyText']),Spacer(1,35),Paragraph('配套文件：34 张设计图册（独立 PDF）、可离线交互式 HTML、完整源码与图源。总览与六张分域 ERD 联合使用。',styles['BodyText']),PageBreak()])
for a,b,path in sections:
    story.extend(pdf_md(path.read_text(encoding='utf-8')));story.append(PageBreak())
SimpleDocTemplate(str(OUT/'Foxcore-系统审查与课程设计报告.pdf'),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=42,bottomMargin=49,title='Foxcore Retail 系统审查与课程设计报告',author='Foxcore project review').build(story,onFirstPage=footer,onLaterPages=footer)

atlas=canvas.Canvas(str(OUT/'Foxcore-规范设计图册.pdf'),pagesize=(842,595));atlas.setTitle('Foxcore Retail UML / ERD 规范设计图册');atlas.setAuthor('Foxcore project review')
atlas.setFillColor(colors.HexColor('#183B32'));atlas.rect(0,0,842,595,fill=1,stroke=0);atlas.setFillColor(colors.HexColor('#E8F0E3'));atlas.setFont('CJK',16);atlas.drawString(55,510,'FOXCORE RETAIL  /  UML + ERD');atlas.setFont('CJK',32);atlas.drawString(55,421,'系统设计图册');atlas.setFont('CJK',17);atlas.drawString(55,377,'34 张模型 · 13 个系统用例 · 25 张业务表');atlas.setFont('CJK',12)
for y,line in zip([309,278,247,216,145,116],['业务与系统用例 / 现状与改进业务序列 / 领域分析类图','状态与经营流程 / 架构与部署 / 系统上下文 / 导航','13 个用例序列 / 九实体概念 ERD / 物理总览 + 6 个分域','每张配套 PlantUML、SVG、PNG；图纸引用当前代码与迁移。','2026-10-24  ·  基线 3393bc3a4989 的本地修订','页面按图幅设置，避免把大表缩成不可读的小字；阅读时可放大。']):atlas.drawString(55,y,line)
atlas.showPage()
for i,d in enumerate(index,1):
    p=DOC/'diagrams'/(d['id']+'.png');iw,ih=Image.open(p).size
    scale=.72;w=max(620,iw*scale+72);h=max(500,ih*scale+132)
    atlas.setPageSize((w,h));atlas.setFillColor(colors.HexColor('#183B32'));atlas.rect(0,h-64,w,64,fill=1,stroke=0);atlas.setFillColor(colors.white);atlas.setFont('CJK',14);atlas.drawString(36,h-29,f'{i:02d}  {d["title"]}');atlas.setFont('CJK',9);atlas.drawString(36,h-48,d['id'])
    atlas.drawImage(str(p),(w-iw*scale)/2,56,width=iw*scale,height=ih*scale,mask='auto');atlas.setFillColor(colors.HexColor('#536B5B'));atlas.setFont('CJK',9);atlas.drawString(36,35,'依据：'+d['source']);atlas.setFont('CJK',8);atlas.drawString(36,20,'当前实现与分析职责见图注。完整字段/约束见配套数据字典。');atlas.drawRightString(w-36,20,f'{i}/{len(index)}');atlas.showPage()
atlas.save()
print(json.dumps({'diagrams':len(index),'outputs':[p.name for p in OUT.glob('Foxcore-*') if p.suffix in ['.html','.pdf']]},ensure_ascii=False))
