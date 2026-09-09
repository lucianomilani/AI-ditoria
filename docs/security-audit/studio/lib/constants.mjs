export const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento)',
  2: 'Permissão definida no navegador',
  3: 'IDOR',
  4: 'Chaves expostas',
  5: 'Inputs sem tratamento (XSS)',
  6: 'Autenticação e sessões',
  7: 'SSRF',
  8: 'Integridade de escrita (CSRF/path/upload)',
  9: 'Rate limiting e força bruta',
  10: 'Dependências e IaC',
  11: 'Fuga de informação',
  12: 'Compliance RGPD',
}

export const SEVERITY_ORDER = ['critica', 'alta', 'media', 'baixa', 'informativa']

export const SEVERITY_COLORS = {
  critica: '#B91C1C',
  alta: '#EA580C',
  media: '#D97706',
  baixa: '#2563EB',
  informativa: '#6B7280',
}

export const STRENGTH_COLOR = '#059669'

export const RGPD_STATUS_VALUES = ['conforme', 'nao_conforme', 'nao_verificada', 'nao_aplicavel']
