"""Generate editable PlantUML and exact SQL-derived schema documentation.

Usage: python scripts/generate-course-diagrams.py
Render: java -Djava.awt.headless=true -jar plantuml.jar -charset UTF-8 -tsvg docs/course-review/diagrams/*.puml
PlantUML is a documentation tool only; it is not a runtime application dependency.
"""
from pathlib import Path
import re, json, hashlib

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/course-review/diagrams'
OUT.mkdir(parents=True, exist_ok=True)
COMMON = '''!pragma layout smetana
skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 13
skinparam roundcorner 10
skinparam ArrowColor #526A68
skinparam classBorderColor #476C68
skinparam classBackgroundColor #F1F7F5
skinparam classAttributeIconSize 0
skinparam packageBorderColor #AABCB7
skinparam packageBackgroundColor #FAFCFB
skinparam sequenceParticipantBackgroundColor #E9F3EF
skinparam sequenceParticipantBorderColor #476C68
skinparam sequenceLifeLineBorderColor #B8C7C2
skinparam actorBorderColor #476C68
skinparam usecaseBackgroundColor #EFF6F3
skinparam usecaseBorderColor #476C68
skinparam stateBackgroundColor #EFF6F3
skinparam stateBorderColor #476C68
skinparam noteBackgroundColor #FFF6E6
skinparam noteBorderColor #D6AF6E
'''
INDEX=[]
def diagram(name, title, text, desc, source):
    # Python multiline descriptions use real newlines; quoted UML labels need escaped ones.
    text=re.sub(r'"[^"]*"',lambda m:m[0].replace('\n',r'\n'),text)
    text=re.sub(r'(class [^\n{]+)\s*\{([^}]+)\}',lambda m:m[1]+' {\n'+m[2].strip()+'\n}',text)
    lines=[]
    for line in text.splitlines():
        if lines and (' -> ' in lines[-1] or ' --> ' in lines[-1]) and not re.match(r'\s*(?:[\w\u4e00-\u9fff]+\s+(?:->|-->)|\[\*\]|state |note |end |})',line) and not line.startswith((' ', 'skinparam', 'title')):
            lines[-1]+=r'\n'+line
        else: lines.append(line)
    text='\n'.join(lines)
    (OUT/(name+'.puml')).write_text('@startuml\n'+COMMON+'title '+title+'\n'+text+'\n@enduml\n',encoding='utf-8')
    INDEX.append(dict(id=name,title=title,description=desc,source=source))

diagram('01-business-usecases','业务用例图 · 组织对外创造的价值','''left to right direction
actor "顾客\n业务执行者" as Customer
actor "销售顾问\n佣金权益人" as Seller
actor "经营负责人\n经营决策涉众" as Owner
rectangle "Foxcore Retail 组织边界" {
 usecase "BU-01 购买现场商品" as Buy
 usecase "BU-02 办理售后退货" as Return
 usecase "BU-03 获得可核对的佣金结算" as Commission
 usecase "BU-04 获取经营业绩与责任信息" as Insight
}
Customer -- Buy
Customer -- Return
Seller -- Commission
Owner -- Insight
note bottom of Buy
销售员在售卖流程中是业务工人；
在领取佣金时是服务接受者。
end note''','按价值而非菜单划分组织业务。顾客不直接操作当前系统。','docs/01-vision-business.md；课程 A2；组织角色为分析建模')

diagram('02-system-usecases','系统用例图 · 13 个用例与权限边界','''left to right direction
actor "管理员\nOWNER" as Owner
actor "销售员\nSALESPERSON" as Seller
rectangle "Foxcore Retail 应用" {
 usecase "UC-01 管理活动与展位" as U1
 usecase "UC-02 维护商品、员工和账户" as U2
 usecase "UC-03 排班、开班和关班" as U3
 usecase "UC-04 收货、调拨和盘点" as U4
 usecase "UC-05 录入销售草稿" as U5
 usecase "UC-06 准备收款" as U6
 usecase "UC-07 确认成交" as U7
 usecase "UC-08 取消与核对待成交单" as U8
 usecase "UC-09 退货与更正" as U9
 usecase "UC-10 佣金结算" as U10
 usecase "UC-11 查询与导出报表" as U11
 usecase "UC-12 账户与审计" as U12
 usecase "UC-13 身份认证与会话管理" as U13
}
Owner -- U1
Owner -- U2
Owner -- U3
Owner -- U4
Owner -- U5
Owner -- U6
Owner -- U7
Owner -- U8
Owner -- U9
Owner -- U10
Owner -- U11
Owner -- U12
Owner -- U13
Seller -- U3
Seller -- U5
Seller -- U6
Seller -- U7
Seller -- U8
Seller -- U11
Seller -- U13
note bottom of U3
销售员仅可开关自己的班次；排班属管理员。
end note
note bottom of U11
销售员仅看本人报表；CSV 导出属管理员。
佣金只读查询是查询能力，支付操作属管理员。
end note
note bottom of U7
UC-05 → UC-06 → UC-07 是前置状态依赖，
不是 UML include；线下支付无网关接口。
end note''','完整用例与权限映射。用例编号沿用仓库登记表，不重排旧编号。','docs/use-cases.json；auth.ts；业务路由')

diagram('03-business-asis','现状业务序列图 · 文献重建，待实地确认','''actor 顾客
participant "销售顾问\n业务工人" as Seller
participant "纸质销售单\n业务实体" as Paper
participant "管理员\n业务工人" as Owner
participant "汇总表\n业务实体" as Sheet
顾客 -> Seller : 询价、议价、购买
Seller -> Paper : 手写商品、数量、成交价
顾客 -> Seller : 现金或线下终端支付
Seller -> Paper : 标记收款与销售归属
Seller -> Owner : 移交纸单与剩余商品
Owner -> Sheet : 转抄、汇总、核对佣金
Owner --> Seller : 告知佣金与差异
note over Seller,Sheet
来源为仓库对案例 A/B 的转述，未取得现场访谈记录。
这是 AS-IS 假设模型，不能称实地观察或甲方已签字。
end note''','现状描述保留业务执行者、工人与实体，并显式记录证据边界。','docs/01-vision-business.md 2.1；课程 A3')

diagram('04-business-tobe','改进业务序列图 · 系统承担校验与核算','''actor 顾客
participant 销售员
participant "Foxcore 系统" as System
participant 管理员
管理员 -> System : 活动、税率、班次、库存准备
顾客 -> 销售员 : 选品与议价
销售员 -> System : 草稿 / 商品、数量、价格
销售员 -> System : 准备收款
System -> System : 校验归属、底价、可售库存\n固化快照并占用库存
System --> 销售员 : 固定应收额
顾客 -> 销售员 : 线下付款（系统之外）
销售员 -> System : 登记收款方式、现金或终端凭证
System -> System : 同事务销售过账、扣库存\n计提佣金、写审计
System --> 销售员 : 成交单号
管理员 -> System : 查询净销售、退货及佣金
System --> 管理员 : 可追溯报表
note over 销售员,管理员
实物与资金仍在线下交接，系统保存已确认的事实。
本图是实现蓝图；没有业务方签署记录。
end note''','改进点是减少转抄、自动校验与领域规则集中执行；不虚构系统支付能力。','catalog.ts；inventory.ts；sales.ts；reports.ts')

diagram('05-domain-classes','分析类图 · 核心领域概念（不是现有 TypeScript 类）','''hide circle
class "活动类别" as Category { +id: Identifier\n+code: String }
class "场地" as Venue { +id: Identifier\n+address: Address }
class "活动" as Event { +id: Identifier\n+status: EventStatus\n+taxBps: Integer\n+open()\n+close() }
class "展位" as Booth { +id: Identifier\n+location: String }
class "销售顾问" as Person { +id: Identifier\n+commissionBps: Integer }
class "班次" as Shift { +id: Identifier\n+plannedStart: Instant\n+status: ShiftStatus\n+start()\n+close()\n+cancel() }
class "商品" as Product { +id: Identifier\n+sku: String\n+minPrice: Money }
class "销售单" as Sale { +id: Identifier\n+state: SaleState\n+total: Money\n+prepare()\n+post()\n+cancel() }
class "销售行" as Line { +lineNo: Integer\n+quantity: Integer\n+unitPrice: Money\n+taxBpsSnapshot: Integer\n+commissionBpsSnapshot: Integer }
class "Money" as Money <<value object>> { +cents: BigInt\n+currency: CAD\n+add()\n+halfUpBps() }
class "账号" as User { +id: Identifier\n+role: OWNER | SALESPERSON\n+active: Boolean }
Category "1" -- "0..*" Event
Venue "1" -- "0..*" Event
Event "1" -- "0..*" Booth
Booth "1" -- "0..*" Shift
Person "1" -- "0..*" Shift
Shift "1" -- "0..*" Sale
Event "1" -- "0..*" Sale : 归属一致
Sale "1" *-- "1..*" Line : 领域单据组成
Product "1" -- "0..*" Line
User "0..1" -- "0..1" Person : 角色条件关联
Sale ..> Money
Line ..> Money
note bottom of User
OWNER 不关联销售顾问；SALESPERSON 必须关联一人。
实际用 role 判别并用 CHECK 约束，无管理员继承职员表。
end note
note bottom of Sale
操作为分析职责：现由路由内事务脚本执行。
系统没有独立 Payment 类/表，付款信息保存在 sales。
概念类的组合关系不代表数据库 ON DELETE CASCADE。
end note''','把关键名词、属性、操作、基数和组合关系集中表达。Money 是分析值对象，代码当前使用 bigint 函数。','001_core.sql；sales.ts；amounts.ts；课程 C1')

diagram('06-domain-accounting','分析类图 · 库存、退货与佣金协作','''hide circle
class "销售行" as SaleLine { +saleId\n+lineNo\n+quantity }
class "库存占用" as Hold { +quantity\n+status\n+consume()\n+release() }
class "库位余额" as Balance { +onHand\n+reserved\n+available() }
class "库存流水" as Ledger { +delta\n+sourceKind\n+sourceId }
class "库存单" as StockDoc { +kind\n+reason }
class "退货单" as Return { +state\n+refundReference\n+authorize()\n+post()\n+cancel() }
class "退货行" as ReturnLine { +quantity\n+disposition\n+refund: Money }
class "佣金流水" as Entry { +amount: Money\n+sourceKind\n+sourceId }
class "结算单" as Settlement { +state\n+total: Money\n+pay()\n+cancel() }
class "结算行" as SettlementLine { +amount: Money }
class "结算占用" as Claim { +entryId\n+settlementId }
SaleLine "1" -- "0..1" Hold
Hold "0..*" -- "1" Balance
Ledger "0..*" -- "1" Balance : 汇总校验
StockDoc ..> Ledger : 生成
Return "1" *-- "1..*" ReturnLine
SaleLine "1" -- "0..*" ReturnLine : 累计可退量
ReturnLine ..> Ledger : RESTOCK 才回库
SaleLine ..> Entry : 正向计提
ReturnLine ..> Entry : 负向冲回
Settlement "1" *-- "1..*" SettlementLine
Entry "1" -- "0..*" SettlementLine : 保留取消历史
Entry "1" -- "0..1" Claim
Settlement "1" -- "0..*" Claim
note bottom of Balance
可售 = onHand - reserved；余额 = 库存流水累计。
图中汇总/生成线为领域关系，不是物理 FK。
end note''','解释占用与事实分离、退货冲回、结算历史和当前认领之间的区别。','inventory.ts；sales.ts；returns.ts；commissions.ts')

diagram('07-architecture','架构与部署图 · 当前模块化单体','''left to right direction
node "浏览器" {
 component "React SPA\n路由 / 表单 / 查询缓存" as Web
}
node "Node 24 / Fastify" {
 component "认证 / Cookie / CSRF" as Auth
 component "按业务模块组织的路由\ncatalog · inventory · sales\nreturns · commissions · reports" as API
 component "事务 / 幂等 / audit()\n精确金额 / 分页" as Infra
 artifact "前端静态产物" as Static
}
database "MariaDB 11.8\n25 业务表 + schema_migrations" as DB
Web --> Auth : 同源 /api/v1
Auth --> API : actor / owner / writable
API --> Infra : command + tx
API --> DB : 参数化 SQL
Infra --> DB : 连接池 / 行锁 / COMMIT
Web --> Static : HTML / JS / CSS
note bottom of API
当前为事务脚本；不是已实现的完整 DDD 分层。
可渐进抽出领域服务、仓储；保留事务边界。
end note
note bottom of DB
Compose：db + migrate + app。
本轮原生 Windows 数据库验证不等于容器部署验收。
end note''','实际架构与渐进设计分开叙述，数据库端口在生产 Compose 内网使用。','apps/server/src/index.ts；db.ts；compose.yaml')

diagram('08-sale-state','状态图 · 销售与库存占用','''state "销售单" as Sale {
 [*] --> DRAFT
 DRAFT --> CHECKOUT : prepare [校价/税率/佣金/库存成功]\n/ 固化快照 + ACTIVE hold
 DRAFT --> CANCELLED : cancel [有原因]
 CHECKOUT --> POSTED : post [线下收款依据已核对]\n/ 扣 onHand + reserved，hold=CONSUMED
 CHECKOUT --> CANCELLED : cancel [OWNER + 原因 + paymentReconciled\\n且 goodsRecovered=true]\n/ 释放 reserved，hold=RELEASED
 POSTED --> [*]
 CANCELLED --> [*]
}
note bottom of Sale
同键同体重试返回原响应；同键异体拒绝。
POSTED 单据不可编辑，纠正通过关联退货。
没有自动超时释放 CHECKOUT，需人工核对资金。
end note''','状态迁移包含触发、守卫和副作用，避免把 UI 提示当成业务控制。','sales.ts；stock_holds 表')

diagram('09-return-settlement-state','状态图 · 退货与佣金结算','''state "退货单" as R {
 [*] --> R_DRAFT
 state "DRAFT" as R_DRAFT
 state "AUTHORIZED" as R_AUTH
 state "POSTED" as R_POST
 state "CANCELLED" as R_CANCEL
 R_DRAFT --> R_AUTH : authorize [未超累计可退量]\n/ 固定退款分摊
 R_DRAFT --> R_CANCEL : cancel [原因]
 R_AUTH --> R_POST : post [退款凭证 + 目标有效]\n/ 良品回库 + 佣金冲回
 R_AUTH --> R_CANCEL : cancel [refundReconciled]
}
state "佣金结算" as S {
 [*] --> PREPARED : prepare [净未结金额 > 0]\n/ claim 占用
 PREPARED --> PAID : pay [线下付款凭证]
 PREPARED --> S_CANCEL : cancel [paymentReconciled + 原因]\n/ 释放 claim，保留结算行
 state "CANCELLED" as S_CANCEL
}
note bottom of S
零或负未结余额不生成可支付结算。
PAID 后退货产生后续负向流水，不改写已付历史。
end note''','退款与佣金支付均为线下事实登记；授权或准备不代表钱已付出。','returns.ts；commissions.ts')

diagram('10-event-shift-state','状态图 · 活动、班次与闭场守卫','''state "活动" as E {
 [*] --> E_DRAFT
 state "DRAFT" as E_DRAFT
 state "OPEN" as E_OPEN
 state "CLOSED" as E_CLOSED
 E_DRAFT --> E_OPEN : open [税率政策已确认 + 有展位]
 E_OPEN --> E_CLOSED : close [无 PLANNED/ACTIVE 班次\n无待处理销售、展位余额归零\\n无待入本活动展位的授权良品退货]
}
state "班次" as S {
 [*] --> PLANNED
 PLANNED --> ACTIVE : start [活动 OPEN、有效时间与本人归属\n员工无其他 ACTIVE 班次]
 PLANNED --> CANCELLED : cancel [管理员、版本一致\n未开班且无销售关联、原因]
 ACTIVE --> CLOSED : close [本人或管理员、无待成交单]
}
note bottom of E
events.status 的 ENUM 含 CANCELLED，
目前没有活动取消路由；不得把它画成已实现入口。
end note''','区分数据库允许值和应用实际可达状态；闭场检查以服务端代码为准。','catalog.ts；catalog-updates.ts')

diagram('11-close-activity','活动图 · 现场经营闭环与异常分支','''start
:管理员维护活动、展位、税率和商品;
:收货、确认实物交接并登记调拨;
:排班并开班;
:销售员保存草稿并准备收款;
if (校价、归属及库存通过?) then (通过)
 :显示锁定应收金额;
 if (顾客已线下付款?) then (已确认)
  :登记付款凭证并过账;
  :库存流水与佣金同事务保存;
 else (未支付或已撤销)
  :管理员填写原因，确认资金与商品已核对;
  :取消待成交单并释放占用;
 endif
else (未通过)
 :显示原因；修改草稿或补货后重试;
endif
:完成待处理单并关班;
:余货交回主仓；有差异则有据盘点;
:处理授权退货；核对库存为零;
if (闭场守卫通过?) then (通过)
 :关闭活动;
else (未通过)
 :按冲突提示补齐待办后重试;
endif
:查询报表、核对佣金并登记结算;
stop''','从准备到闭场串起菜单，并显示失败时应回到哪里处理。','catalog.ts；sales.ts；inventory.ts；commissions.ts')

SEQUENCES = [
('UC-01','管理活动与展位','catalog.ts',[
('actor','ui','填写场地、活动、类别、真实日期与税率'),('ui','api','POST /events + CSRF + UUID'),('api','db','command 事务：验证关联并写 DRAFT + 审计'),('db','api','eventId / version'),('ui','api','POST /booths；生成展位库位'),('ui','api','POST /events/{id}/open'),('api','db','锁活动；检查税率政策、有有效展位；写 OPEN'),('api','ui','可排班并开班；冲突则显示原因')]),
('UC-02','维护商品、员工和账户','catalog.ts / index.ts',[
('actor','ui','录入商品价格或员工佣金率'),('ui','api','POST /products 或 /salespeople'),('api','db','验证金额/rate；主数据 + 审计同事务'),('actor','ui','为销售顾问配置账号'),('ui','api','POST /users（临时口令）'),('api','db','锁有效员工；Argon2id 散列；必须首登改密'),('api','ui','账号 ID；不返回密码散列')]),
('UC-03','排班、开班和关班','catalog.ts / catalog-updates.ts',[
('actor','ui','选员工、展位与计划时段'),('ui','api','POST /shifts'),('api','db','锁活动/员工；检查归属、日期、重叠；PLANNED'),('ui','api','POST /shifts/{id}/start'),('api','db','核验本人权限、时间、活动 OPEN；ACTIVE'),('ui','api','POST /shifts/{id}/close'),('api','db','拒绝有待成交单；CLOSED + 审计'),('api','ui','返回当前状态；未开班废弃计划可受控取消')]),
('UC-04','收货、调拨和盘点','inventory.ts',[
('actor','ui','完成线下交接并填写来源/去向/商品/数量'),('ui','api','POST /stock/transfer + handoverConfirmed'),('api','db','锁库位、产品与余额；校验活动和可售数量'),('api','db','写 stock_documents + lines'),('api','db','源余额减、目标加；两条有符号流水'),('api','db','审计 + 幂等响应，一次提交'),('api','ui','调拨完成；无在途与二次接收状态')]),
('UC-05','录入销售草稿','sales.ts',[
('actor','ui','选择 ACTIVE 班次、商品、数量、协商价'),('ui','api','POST /sales（UUID，金额为十进制字符串）'),('api','db','锁归属活动/班次；校验权限与行格式'),('api','db','INSERT sales DRAFT + sale_lines + audit'),('api','ui','返回 id/version；尚未占用库存'),('actor','ui','继续调整草稿；准备后不再编辑行')]),
('UC-06','准备收款','sales.ts',[
('actor','ui','准备收款'),('ui','api','POST /sales/{id}/prepare + version'),('api','db','按顺序锁活动、销售/班次、产品/余额'),('api','db','检查 DRAFT、底价、税率、佣金与可售库存'),('api','db','写价格/成本/税/佣金快照，精确分计算'),('api','db','写 ACTIVE holds、加 reserved、改 CHECKOUT'),('api','ui','固定应收额；任何失败回滚全部副作用')]),
('UC-07','确认成交','sales.ts',[
('actor','actor','核对真实线下现金或终端支付'),('actor','ui','填写现金实收或终端参考号'),('ui','api','POST /sales/{id}/post + UUID'),('api','db','command 检查同键摘要；锁 CHECKOUT 单'),('api','db','检查现金足额/凭证；占用仍有效'),('api','db','扣 onHand/reserved；holds=CONSUMED'),('api','db','销售/库存/佣金/审计/响应同一事务提交'),('api','ui','成交单号；网络不明时同键同体重试')]),
('UC-08','取消与核对待成交单','sales.ts',[
('actor','ui','核对资金未收或已撤销；填写取消原因'),('ui','api','POST /sales/{id}/cancel + 资金/商品双确认'),('api','db','先锁活动再锁销售；校验 DRAFT/CHECKOUT'),('api','db','CHECKOUT 仅管理员；paymentReconciled + goodsRecovered'),('api','db','释放 reserved；holds=RELEASED；CANCELLED'),('api','db','保存原因、审计、幂等响应'),('api','ui','取消成功；POSTED 拒绝此入口，转退货')]),
('UC-09','退货与更正','returns.ts',[
('actor','ui','选原成交单、行、数量、良品/损坏与目标'),('ui','api','POST /returns；随后 authorize'),('api','db','锁活动、原销售、退货；原单无其他 AUTHORIZED；已退+本次不得超售量'),('api','db','按原快照分摊退款与佣金尾差；AUTHORIZED'),('api','ui','返回应退额；管理员线下退款'),('ui','api','POST /returns/{id}/post + refundReference'),('api','db','复核目标；RESTOCK 回库，DAMAGED 不回可售库'),('api','db','POSTED + 负佣金 + 审计同事务'),('api','ui','退货凭证；原销售保持不变')]),
('UC-10','佣金结算','commissions.ts',[
('actor','ui','选择员工准备结算'),('ui','api','POST /commissions/prepare'),('api','db','锁员工；拒绝已有 PREPARED；找未认领流水'),('api','db','净额必须 > 0；结算头/行/claims 同事务'),('api','ui','返回待付金额；管理员线下支付'),('ui','api','POST /commissions/{id}/pay + paymentReference'),('api','db','PREPARED → PAID；保留 claims 与历史'),('api','ui','登记已付；取消准备需核对且释放 claims')]),
('UC-11','查询与导出报表','reports.ts / report-query.ts',[
('actor','ui','选择活动与汇总维度'),('ui','api','GET /reports/sales?group&eventId&limit&offset'),('api','db','权限与筛选相交；POSTED 销售减 POSTED 退货'),('api','db','REPEATABLE READ：count 与当前页同视图'),('api','ui','items / total / hasMore；销售员裁剪毛利'),('actor','ui','管理员选择 CSV 导出'),('ui','api','GET /reports/sales.csv（同筛选范围）'),('api','ui','完整分组，防公式注入；超 10000 组返回 413')]),
('UC-12','账户与审计','index.ts / core.ts',[
('actor','ui','管理员调整账号启停或查看审计'),('ui','api','PATCH /users/{id}/active + CSRF + UUID'),('api','db','锁目标账号；不得禁用最后一个管理员'),('api','db','禁用则撤销会话；同事务 audit() 写事件'),('api','ui','更新结果；审计由应用写入，不是 DB 触发器'),('ui','api','GET /audit（管理员）'),('api','db','按 ID 倒序、limit/offset 分页读取事件'),('api','ui','事件与主体、操作者；越权返回 403')]),
('UC-13','身份认证与会话管理','auth.ts',[
('actor','ui','用户名与密码登录'),('ui','api','POST /auth/login'),('api','db','校验锁定状态、Argon2id；记录失败次数'),('api','db','保存 token/CSRF 摘要与过期时间'),('api','ui','HttpOnly Cookie + user + CSRF'),('actor','ui','首登改密；或主动退出'),('ui','api','POST /auth/password 或 /auth/logout + CSRF'),('api','db','修改散列/撤销会话；首登状态也可安全退出'),('api','ui','回到登录；后续受保护请求返回 401')]),
]
for uc,title,module,steps in SEQUENCES:
    text='actor "操作执行者" as actor\nboundary "React 页面\n边界" as ui\ncontrol "业务路由 / '+module+'\n控制职责" as api\ndatabase "MariaDB 实体表\n数据实体" as db\nautonumber\n'
    for i,(a,b,msg) in enumerate(steps):
        text+=a+(' --> ' if a=='api' and b=='ui' or a=='db' else ' -> ')+b+' : '+msg+'\n'
    shared='登录校验口令；改密/退出需要 Cookie 与 CSRF。认证接口无 UUID 幂等。' if uc=='UC-13' else '业务写入共有：认证/角色/CSRF、UUID 幂等、事务与审计。'
    text+='note over api,db\n'+shared+'\n展示为职责视图；当前控制与 SQL 同处业务路由模块。\nend note'
    diagram('seq-'+uc.lower(),uc+' 系统序列图 · '+title,text,'边界、控制职责和数据实体协作；异常细节见对应规约与源码。',module+'；docs/use-cases.json')

diagram('12-context','系统上下文图 · 真实交互与外部边界','''left to right direction
actor 顾客 as C
actor 管理员 as O
actor 销售员 as S
rectangle "Foxcore Retail\n现场运营系统" as App
rectangle "线下现金 / 独立支付终端\n由人核对，不调用支付 API" as Pay
artifact "CSV / 经营报表" as Report
C --> S : 选购、退货、交付
C --> Pay : 付款 / 收到退款
O --> App : 主数据、库存、售后、佣金与审计
S --> App : 本人班次与销售记录
S --> Pay : 核对线下收款事实
O --> Pay : 线下退款 / 佣金支付
App --> Report : 已过账事实聚合
note bottom of App
没有顾客账号、在线商城或支付网关。
两类账号，单货币 CAD，业务时区 America/Toronto。
end note''','系统范围和外部参与者；线下支付系统不应被误画成已经集成的服务。','用户手册；auth.ts；sales.ts')

diagram('13-conceptual-erd','概念 ERD · 九个核心业务实体','''hide circle
left to right direction
entity "类别 CATEGORY" as C
entity "场地 VENUE" as V
entity "活动 EVENT" as E
entity "展位 BOOTH" as B
entity "销售顾问 SALESPERSON" as P
entity "班次 SHIFT" as S
entity "销售 SALE" as A
entity "商品 PRODUCT" as G
entity "销售明细 PRODUCT_SALE" as L
C ||--o{ E
V ||--o{ E
E ||--o{ B
B ||--o{ S
P ||--o{ S
S ||--o{ A
E ||--o{ A
A ||--|{ L
G ||--o{ L
note bottom of L
销售与商品的多对多由销售明细化为两个一对多。
应用草稿创建必须有行；物理 FK 本身不能强制头至少有一行。
end note
note bottom of E
草稿活动可以没有展位；开放活动必须至少一个有效展位。
概念九实体不等于完整物理数据库；扩展后为 25 张业务表。
end note''','将案例核心实体与扩展运行模型区分，并解释多对多拆分。','db/migrations/001_core.sql；仓库案例 B 模型转述')

diagram('14-navigation','页面与任务导航图 · 按经营顺序组织','''left to right direction
rectangle "工作台\n待办与流程引导" as Home
rectangle "活动与展位" as E
rectangle "商品目录" as P
rectangle "人员与班次" as S
rectangle "库存\n收货/交接/差额盘点" as I
rectangle "销售工作台\n草稿→准备→确认" as Sale
rectangle "退货与核对\n授权→退款登记" as R
rectangle "佣金\n流水→准备→已付" as C
rectangle "报表\n活动/商品/员工" as Report
rectangle "操作日志" as Audit
Home --> E
Home --> Sale
E --> S
P --> I
S --> Sale
I --> Sale
Sale --> R : 已成交更正
Sale --> C : 正向计提
R --> C : 负向冲回
Sale --> Report
R --> Report
Report --> Audit : 管理员追溯
note bottom of Home
导航是任务顺序，不替代服务端权限。
销售员只能操作本人范围，售后/支付/审计由管理员处理。
end note''','解释页面之间的业务衔接；新 UI 引导用户按流程前进。','apps/web/src/main.tsx；服务端权限')

# Parse the authoritative migration; preserve composite keys, nullability and SQL types.
sql=(ROOT/'db/migrations/001_core.sql').read_text(encoding='utf-8')
tables={}
for name,body in re.findall(r'CREATE TABLE (\w+)\s*\((.*?)\) ENGINE=InnoDB;',sql,re.S):
    fields=[]; fks=[]; constraints=[]; pk=[]; uk=[]
    for line in body.splitlines():
        line=line.strip().rstrip(',')
        if not line: continue
        m=re.match(r'(\w+)\s+((?:BIGINT|SMALLINT|INT)(?: UNSIGNED)?|VARCHAR\(\d+\)|CHAR\(\d+\)|DATETIME\(\d+\)|DATE|BOOLEAN|LONGTEXT|ENUM\([^)]*\))(.*)',line)
        if m:
            col,typ,tail=m.groups(); fields.append(dict(name=col,type=typ,nullable='NOT NULL' not in tail and 'PRIMARY KEY' not in tail,sql=line))
            if 'PRIMARY KEY' in tail: pk.append(col)
            if 'UNIQUE' in tail: uk.append([col])
        elif line.startswith('PRIMARY KEY'): pk.extend(re.search(r'\((.*?)\)',line)[1].split(','))
        elif line.startswith('UNIQUE KEY'): uk.append(re.search(r'\((.*?)\)',line)[1].split(','))
        m=re.search(r'CONSTRAINT (\w+) FOREIGN KEY \((.*?)\) REFERENCES (\w+)\((.*?)\)',line)
        if m: fks.append(dict(name=m[1],columns=m[2].split(','),target=m[3],targetColumns=m[4].split(',')))
        if line.startswith(('CONSTRAINT','KEY ','UNIQUE KEY','PRIMARY KEY')): constraints.append(line)
    tables[name]=dict(name=name,fields=fields,pk=pk,unique=uk,fks=fks,constraints=constraints)

groups={
 'master':['event_categories','venues','events','booths','salespeople','shifts','products'],
 'sales':['sales','sale_lines','stock_holds','shifts','products','stock_locations'],
 'inventory':['stock_locations','stock_balances','stock_documents','stock_document_lines','stock_ledger','products','booths'],
 'returns':['returns','return_lines','sales','sale_lines','stock_locations'],
 'commissions':['commission_entries','commission_settlements','commission_settlement_lines','commission_claims','salespeople'],
 'security':['users','sessions','idempotency_keys','audit_events','salespeople']
}
group_titles={'master':'主数据与班次','sales':'销售与占用','inventory':'库存与流水','returns':'退货与原单','commissions':'佣金与结算','security':'账号、会话、幂等与审计'}
def erd(names,overview=False):
    text='hide circle\nleft to right direction\n'
    for name in names:
        t=tables[name]; fkcols={c for fk in t['fks'] for c in fk['columns']}
        text+='entity "'+name+'" as '+name+' {\n'
        for f in t['fields']:
            col=f['name']; marks=[]
            if col in t['pk']: marks.append('PK')
            if col in fkcols: marks.append('FK')
            if [col] in t['unique']: marks.append('UK')
            if overview and not marks: continue
            typ='ENUM' if f['type'].startswith('ENUM') else f['type']
            text+='  {field} '+('* ' if not f['nullable'] else '')+col+' : '+typ+(' <<'+','.join(marks)+'>>' if marks else '')+'\n'
        text+='}\n'
    for name in names:
        for fk in tables[name]['fks']:
            if fk['target'] not in names: continue
            nullable=any(f['nullable'] for f in tables[name]['fields'] if f['name'] in fk['columns'])
            single=fk['columns']==tables[name]['pk'] or fk['columns'] in tables[name]['unique']
            text+=fk['target']+(' |o' if nullable else ' ||')+'--'+('o|' if single else 'o{')+' '+name+' : "'+','.join(fk['columns'])+'"\n'
    if 'returns' in names and 'sale_lines' in names:
        text+='sale_lines .. return_lines : "应用关联：returns.sale_id + sale_line_no\\n无直接物理外键"\n'
    text+='legend bottom\n星号 (*) 表示 NOT NULL；PK 主键；FK 外键；UK 单列唯一。\n实线只表示迁移中真实 FK；标注字段为子表列（含复合 FK）。\n父端 1 / 0..1 由子 FK 可空性决定；子端 0..N / 0..1 由唯一性决定。\n跨域外键及复合 UNIQUE/CHECK 全文见数据字典；图中 ENUM 值缩写。\nendlegend\n'
    return text
diagram('erd-00-overview','物理 ERD 总览 · 25 张业务表（仅键字段）',erd(list(tables),True),'依据迁移自动生成，schema_migrations 为迁移工具表另计。总图适合屏幕放大，逐域图显示全部字段。','db/migrations/001_core.sql')
for key,names in groups.items():
    diagram('erd-'+key,'物理 ERD · '+group_titles[key],erd(names),'字段完整呈现；未连到的跨域 FK 见完整总图和数据字典。','db/migrations/001_core.sql')
(OUT.parent/'schema.json').write_text(json.dumps({'migrationSha256':hashlib.sha256(sql.encode()).hexdigest(),'businessTableCount':len(tables),'tables':tables},ensure_ascii=False,indent=2),encoding='utf-8')
dictionary=['# 数据字典：与迁移逐字段对应','',f'从 `db/migrations/001_core.sql` 生成；{len(tables)} 张业务表，另有迁移器建立的 `schema_migrations`。','',
 '金额采用整数分（BIGINT），费率采用 bps，ID 在 API 中用字符串，避免 JavaScript 安全整数截断。以下 NULL/NOT NULL 为 SQL 约束；“业务必填”可能比数据库更严格。','']
for name,t in tables.items():
    dictionary+=['## '+name,'','| 字段 | SQL 类型 | 可空 | 键 |','|---|---|---|---|']
    for f in t['fields']:
        tags=[]
        if f['name'] in t['pk']: tags.append('PK')
        if any(f['name'] in fk['columns'] for fk in t['fks']): tags.append('FK')
        if any(f['name'] in cols for cols in t['unique']): tags.append('UK（见约束）')
        dictionary+=['| '+f['name']+' | '+f['type']+' | '+('NULL' if f['nullable'] else 'NOT NULL')+' | '+', '.join(tags)+' |']
    dictionary+=['','约束与索引：','']+['- `'+c+'`' for c in t['constraints']]+['']
dictionary+=['## 约束边界','',
 '- `return_lines.sale_line_no` 没有独立物理 FK；应用通过退货头原销售及行号校验。未来若强化数据库约束，应设计新增迁移与历史数据检查，不能改写已应用 001。',
 '- `stock_ledger.source_*`、`commission_entries.source_*` 和 `audit_events.subject_*` 为多态来源，当前没有跨多表物理 FK，靠事务写入与不变量核对。',
 '- `stock_balances(location_id, product_id)`、`sale_lines(sale_id,line_no)`、`commission_settlement_lines(settlement_id,entry_id)` 是复合键的典型应用。',
 '- `commission_claims.entry_id` 唯一，表示一条流水最多被一个当前/已付结算认领；取消只释放 claim，保留结算行。',
 '- 本项目没有商品分类树或会计科目树；自反外键是课程设计模式，不能画成当前已有表。',
 '- `events.status` 虽含 CANCELLED，当前没有公开取消动作；状态枚举不等于已交付业务流程。','']
(OUT.parent/'数据字典.md').write_text('\n'.join(dictionary),encoding='utf-8')
(OUT.parent/'diagram-index.json').write_text(json.dumps(INDEX,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Generated {len(INDEX)} editable diagrams and {len(tables)}-table dictionary.')
