"""Regenerate the checked-in route inventory from the Fastify source."""
import json
import re
from pathlib import Path

sources = sorted(Path('apps/server/src').glob('*.ts'))
spec = {
    'openapi': '3.1.0',
    'info': {'title': 'Foxcore Retail API', 'version': '1.0.0', 'description': '同源 JSON API。金额输入为 CAD 十进制字符串，存储/输出为整数分字符串。写命令需要 CSRF；除登录、登出、改密外均需要 UUID 幂等键。请求字段表为静态源码提取，详细业务规则见 SRS/SDD。'},
    'servers': [{'url': 'http://localhost:3000', 'description': '本地 Compose'}],
    'components': {'securitySchemes': {'session': {'type': 'apiKey', 'in': 'cookie', 'name': 'foxcore_session'}}, 'schemas': {'Error': {'type': 'object', 'required': ['code', 'message', 'requestId'], 'properties': {'code': {'type': 'string'}, 'message': {'type': 'string'}, 'requestId': {'type': 'string'}}}}},
    'paths': {},
}
route_re = re.compile(r"app\.(get|post|patch)\('([^']+)'", re.I)

for source in sources:
    text = source.read_text(encoding='utf-8')
    matches = list(route_re.finditer(text))
    for i, match in enumerate(matches):
        method, path = match.group(1).lower(), match.group(2)
        if not path.startswith('/api/v1/') and not path.startswith('/health/'):
            continue
        segment = text[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        fields_match = re.search(r"body\(req\.body,\s*\[([^\]]*)\]", segment)
        fields = re.findall(r"['\"]([A-Za-z][A-Za-z0-9]*)['\"]", fields_match.group(1)) if fields_match else []
        body_fields = {'/api/v1/auth/login': ['username', 'password'], '/api/v1/auth/password': ['currentPassword', 'newPassword']}
        fields = fields or body_fields.get(path, [])
        public = path in ['/api/v1/auth/login', '/api/v1/auth/me'] or path.startswith('/health/')
        needs_key = method != 'get' and path not in ['/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/auth/password']
        normalized = re.sub(r':([A-Za-z]+)', r'{\1}', path)
        operation = {
            'operationId': re.sub(r'[^A-Za-z0-9]+', '_', method + '_' + path).strip('_'),
            'summary': path.replace('/api/v1/', ''),
            'tags': [path.split('/')[3] if path.startswith('/api/v1/') else 'health'],
            'responses': {'200': {'description': '成功；详细响应字段见 SRS 与实现', 'content': {'application/json': {'schema': {'type': 'object'}}}},
                          '400': {'description': '输入无效'}, '401': {'description': '未登录'}, '403': {'description': '权限或 CSRF 拒绝'}, '409': {'description': '状态、版本或约束冲突'}},
        }
        if not public:
            operation['security'] = [{'session': []}]
        if '{id}' in normalized:
            operation['parameters'] = [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string', 'pattern': '^[1-9][0-9]*$'}}]
        if method != 'get' and path != '/api/v1/auth/login':
            operation.setdefault('parameters', []).append({'name': 'X-CSRF-Token', 'in': 'header', 'required': True, 'schema': {'type': 'string'}})
        if needs_key:
            operation.setdefault('parameters', []).append({'name': 'Idempotency-Key', 'in': 'header', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}})
        if method != 'get':
            operation['requestBody'] = {'content': {'application/json': {'schema': {'type': 'object', 'additionalProperties': False,
                'properties': {field: {'description': '字段语义/条件见 SRS 和服务端校验'} for field in fields}}}}}
        spec['paths'].setdefault(normalized, {})[method] = operation

Path('docs/openapi.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
