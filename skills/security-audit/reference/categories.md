# 12 categorias (fixas, mesma ordem sempre)

Para cada categoria: detecte primeiro o mecanismo equivalente na stack do
projeto alvo, depois audite. Se a stack não tiver a superfície da
categoria, marque `applicable: false` com `na_reason` — nunca force um
achado.

1. **Banco sem tranca (isolamento e injeção)** — em Supabase é RLS ausente;
   em APIs próprias são queries de listagem/busca/agregação/exportação sem
   filtro por utilizador/organização/tenant. Identifique o mecanismo de
   isolamento real (RLS, middleware de tenant, filtro manual por user_id)
   antes de apontar onde falha. Cobre também **SQL/NoSQL injection**:
   qualquer query construída por concatenação/interpolação de string com
   input do utilizador (raw SQL, `$where` do Mongo, filtros dinâmicos
   montados à mão) em vez de query parametrizada/prepared statement ou do
   query builder do ORM. Percorra todo ponto onde input do utilizador
   chega à camada de dados, não só os filtros de tenant.
2. **Permissão definida no navegador** — UI esconde ação por papel
   (isAdmin, canEdit) mas o servidor não valida o mesmo privilégio. Cruze
   cada gate de frontend com o endpoint correspondente.
3. **IDOR** — rota busca/altera/apaga objeto por ID sem verificar posse
   do chamador. Percorra TODOS os handlers, não uma amostra.
4. **Chaves expostas** — segredos hardcoded em código, configs,
   docker-compose, CI, docs; atenção a defaults públicos
   (`${VAR:-default}`) sem validação de startup; verifique histórico git
   e bundle do frontend.
5. **Inputs sem tratamento (XSS)** — frontend: innerHTML/equivalentes,
   markdown/HTML sem sanitização, `javascript:` em href/src, eval. Backend:
   input do utilizador em HTML de e-mail/templates sem escape. Confirme se
   existe lib de sanitização e se é de fato aplicada.
6. **Autenticação, sessões e criptografia** — hashing de palavra-passe, MFA
   em contas privilegiadas, tokens de reset com entropia/rate limit
   adequados. Cobre também **uso indevido de criptografia**: cifra fraca ou
   legada (DES, modo ECB), IV/nonce previsível ou reutilizado, e crypto
   caseira em vez de uma lib/primitiva validada.
7. **SSRF** — URL fornecida pelo utilizador procurada pelo servidor sem
   allowlist, sem bloqueio de IP interno/link-local, seguindo redirects.
8. **Integridade de escrita (CSRF/path/upload/concorrência)** —
   CORS+cookies sem proteção CSRF; nome de ficheiro de upload sem
   normalização (path traversal/zip-slip). Cobre também **race
   conditions/lógica de negócio**: TOCTOU em sequências check-then-act,
   manipulação de preço/quantidade, ações multi-passo sem
   transação/lock que as torne atómicas.
9. **Rate limiting, força bruta e exhaustion** — login/reset/endpoints
   sensíveis sem limite de tentativas. Cobre também **exhaustion de
   recursos**: paginação/page-size sem limite máximo, upload sem tamanho
   máximo, regex com backtracking catastrófico alcançável por input do
   utilizador.
10. **Dependências, IaC e supply-chain** — CVEs alcançáveis, imagens sem
    pin/digest, recursos de infraestrutura (buckets, etc.) com exposição
    indevida. Cobre também **supply-chain além de CVE conhecido**:
    GitHub Actions/CI steps sem pin por SHA, scripts de build/postinstall
    que buscam código remoto, dependências recém-adicionadas com risco de
    typosquatting.
11. **Vazamento de informação** — stack traces em produção, ausência de
    headers de segurança (CSP, HSTS).
12. **Compliance RGPD** — consentimento (Art. 6-7), direitos dos titulares
    (Art. 15-22, especialmente apagamento efetivo Art. 17), minimização e
    retenção (Art. 5), dados sensíveis (Art. 9), decisão automatizada
    (Art. 22), transparência (Art. 12-13), notificação de violação
    (Art. 33-34), processadores/terceiros (Art. 28).
