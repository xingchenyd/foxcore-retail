"""Create a self-contained staff Mini Program handover HTML from repository evidence.
Usage: python scripts/build-mini-handbook.py <output-directory>
No accounts, sessions, logs or databases are read by this script.
"""
from pathlib import Path
import sys,re,html,base64,json
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/miniprogram'
OUT=Path(sys.argv[1]).resolve();OUT.mkdir(parents=True,exist_ok=True)

def inline(text):
    text=html.escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',text)

def markdown(text):
    lines=text.splitlines();out=[];i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre>'+html.escape('\n'.join(code))+'</pre>');i+=1;continue
        if line.startswith('|') and i+1<len(lines) and re.match(r'\|[ :|-]+\|',lines[i+1]):
            rows=[[x.strip() for x in line.strip('|').split('|')]];i+=2
            while i<len(lines) and lines[i].strip().startswith('|'):
                rows.append([x.strip() for x in lines[i].strip().strip('|').split('|')]);i+=1
            out.append('<div class="table"><table>'+''.join('<tr>'+''.join('<'+('th' if n==0 else 'td')+'>'+inline(c)+'</'+('th' if n==0 else 'td')+'>' for c in row)+'</tr>' for n,row in enumerate(rows))+'</table></div>');continue
        heading=re.match(r'^(#{1,6}) (.*)',line)
        if heading:out.append(f'<h{len(heading[1])}>{inline(heading[2])}</h{len(heading[1])}>');i+=1;continue
        out.append('<p>'+inline(line)+'</p>');i+=1
    return '\n'.join(out)

def data_image(path):
    return 'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()

shots=[]
for name,label in [('home','工作台'),('sale-edit','销售录入与金额预估'),('inventory','库存与备货'),('returns','退货与核对'),('commissions','佣金与结算')]:
    path=DOC/'ui-preview'/(name+'.png')
    if path.exists():shots.append('<figure><div class="phone"><img src="'+data_image(path)+'" alt="'+label+'开发适配预览"></div><figcaption>'+label+'</figcaption></figure>')
diagrams=''.join('<figure class="diagram"><img src="'+data_image(path)+'"><figcaption>'+path.stem+'</figcaption></figure>' for path in (DOC/'diagrams').glob('*.png'))
verification=json.loads((DOC/'verification.json').read_text(encoding='utf-8'))
page='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Foxcore 工作人员小程序 · 交付与导入</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f7f0;color:#203d34;font:16px/1.8 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}header{background:#214e42;color:white;padding:65px max(5vw,24px)}header small{letter-spacing:4px;color:#dbe8bd}header h1{font-size:clamp(30px,4vw,54px);line-height:1.3}header p{max-width:850px;color:#d8e3cd}main{max-width:1220px;margin:auto;padding:35px 24px}a{color:#668642}h2{margin-top:45px}h3{margin-top:30px}.notice{padding:22px 28px;background:#fff2d9;border:1px solid #e8dcb8;border-radius:18px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px}figure{margin:0}figcaption{text-align:center;font-size:14px;color:#7f8f74;margin:10px 0 30px}.phone{aspect-ratio:430/720;overflow:hidden;border-radius:24px;border:1px solid #d5dfcb;box-shadow:0 10px 25px #203d3410}.phone img{width:100%;height:100%;object-fit:cover;object-position:center}.diagram{background:white;border:1px solid #dce4d2;border-radius:20px;padding:20px;margin:22px 0}.diagram img{max-width:100%;max-height:850px;display:block;margin:auto}code{background:#e8eede;padding:2px 5px;border-radius:4px;font-size:.9em;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#203d34;color:#eef4de;padding:24px;border-radius:16px;font:14px/1.8 Consolas,monospace;overflow-wrap:anywhere}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;background:white}td,th{padding:13px 16px;border:1px solid #e2e8d9;text-align:left;vertical-align:top}th{background:#e8eede}p{overflow-wrap:anywhere}.meta{display:flex;flex-wrap:wrap;gap:14px}.meta span{background:#ffffff18;padding:9px 18px;border:1px solid #ffffff30;border-radius:100px}footer{text-align:center;padding:40px;color:#85917b;font-size:13px}
</style></head><body><header><small>FOXCORE / STAFF MINI PROGRAM</small><h1>让现场经营，走进微信。</h1><p>工作人员原生小程序 · 复用现有业务后端与数据库。销售、库存、退货和佣金以同一份事务记录为准。</p><div class="meta"><span>13 个原生页面</span><span>73 单元 + 94 纯逻辑通过</span><span>3 集成场景 + 14 原验收通过</span></div></header><main>
<p class="notice"><strong>交付状态：</strong>本地代码、接口与页面控制器验证通过。微信开发者工具编译、iOS/Android 真机、体验版上传及公网环境尚待 AppID 和用户账号操作。本页界面截图来自真实 WXML/控制器的开发适配器，数据为合成测试数据，不能作为微信真机验收证据。</p>
<p><a href="https://github.com/xingchenyd/foxcore-retail/tree/codex/staff-miniprogram-20261026">小程序独立分支</a> · <a href="https://github.com/xingchenyd/foxcore-retail/tree/backup/main-before-web-review-20261026">网页合并前的旧版备份</a></p>
<h2>界面与任务</h2><div class="gallery">'''+''.join(shots)+'''</div><section>'''+markdown((DOC/'README.md').read_text(encoding='utf-8'))+'''</section><h2>架构与操作恢复</h2>'''+diagrams+'''<h2>本次验证记录</h2><pre>'''+html.escape(json.dumps(verification,ensure_ascii=False,indent=2))+'''</pre></main><footer>2026-10-26 · FOXCORE RETAIL · 工作人员小程序交付</footer></body></html>'''
(DOC/'index.html').write_text(page,encoding='utf-8')
(OUT/'Foxcore-工作人员小程序-交付说明.html').write_text(page,encoding='utf-8')
(OUT/'Foxcore-小程序开发与导入说明.md').write_text((DOC/'README.md').read_text(encoding='utf-8'),encoding='utf-8')
print('Mini Program handover HTML generated from public repository evidence.')
