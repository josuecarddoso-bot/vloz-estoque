/**
 * ═══════════════════════════════════════════════════════════════
 *  VLOZ TELECOM — SISTEMA DE ESTOQUE v2.0  (Firebase Edition)
 *  Paleta: Azul marinho #162032 + Verde sage #8FBD9A
 *  Sincronização em tempo real via Firebase Firestore
 * ═══════════════════════════════════════════════════════════════
 */

import {
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
} from "./firebase.js";

const App = (() => {

  /* ── CONFIGURAÇÕES ──────────────────────────────────────────── */
  const WARN_MARGIN = 1.50; // 50% acima do mínimo

  /* ── HELPERS DE STATUS ─────────────────────────────────────── */
  function stockStatus(produto) {
    if (produto.qtd === 0)                               return 'zero';
    if (produto.qtd <= produto.qtdMin * WARN_MARGIN)     return 'warn';
    return 'ok';
  }

  function stockPill(produto) {
    const s = stockStatus(produto);
    const qty = `${produto.qtd} ${produto.unidade}`;
    if (s === 'zero') return `<span class="stock-zero">✕ ZERADO</span>`;
    if (s === 'warn') return `<span class="stock-warn">▲ ${qty}</span>`;
    return               `<span class="stock-ok">● ${qty}</span>`;
  }

  function stockPct(produto) {
    if (produto.qtdMin === 0) return null;
    return Math.round((produto.qtd / produto.qtdMin) * 100);
  }

  /* ── CONSTANTES ─────────────────────────────────────────────── */
  const LS_SESSAO = 'vloz_sessao'; // Apenas a sessão fica no localStorage

  const PERFIL_LABEL = { admin: 'Administrador', tecnico: 'Técnico', almoxarife: 'Almoxarife' };

  /* ── SEED DATA (usado apenas na primeira vez, se Firestore estiver vazio) ── */
  const CATEGORIAS_SEED = [
    { id: 'cat1',  nome: 'Fibra / Cabos',             grupo: 'Rede / Provedor', icone: '🔵' },
    { id: 'cat2',  nome: 'SFP / GBIC',                grupo: 'Rede / Provedor', icone: '🔌' },
    { id: 'cat3',  nome: 'ONU / OLT',                 grupo: 'Rede / Provedor', icone: '📡' },
    { id: 'cat4',  nome: 'Roteadores',                grupo: 'Rede / Provedor', icone: '🌐' },
    { id: 'cat5',  nome: 'Switches',                  grupo: 'Rede / Provedor', icone: '🔀' },
    { id: 'cat6',  nome: 'Caixas CTO / Splitters',    grupo: 'Rede / Provedor', icone: '📦' },
    { id: 'cat7',  nome: 'Conectores (SC, LC)',        grupo: 'Rede / Provedor', icone: '🔗' },
    { id: 'cat8',  nome: 'Patch Cords',               grupo: 'Rede / Provedor', icone: '🪢' },
    { id: 'cat9',  nome: 'Ferramentas (OTDR, etc)',   grupo: 'Rede / Provedor', icone: '🔧' },
    { id: 'cat10', nome: 'Mat. de Instalação',        grupo: 'Rede / Provedor', icone: '🏗️' },
    { id: 'cat11', nome: 'Papel / Expediente',        grupo: 'Escritório',      icone: '📄' },
    { id: 'cat12', nome: 'Impressão / Toner',         grupo: 'Escritório',      icone: '🖨️' },
    { id: 'cat13', nome: 'Equipamentos de Escritório',grupo: 'Escritório',      icone: '💻' },
    { id: 'cat14', nome: 'Limpeza Geral',             grupo: 'Limpeza',         icone: '🧹' },
    { id: 'cat15', nome: 'Higiene',                   grupo: 'Limpeza',         icone: '🧴' },
  ];

  const USUARIOS_SEED = [
    { id: 'u1', nome: 'Administrador', login: 'admin',   senha: '1234', perfil: 'admin' },
    { id: 'u2', nome: 'Técnico Demo',  login: 'tecnico', senha: '1234', perfil: 'tecnico' },
  ];

  const PRODUTOS_SEED = [
    { id: pid(), codigo: 'VLZ-001', nome: 'Fibra Óptica Drop 2 fios',      categoriaId: 'cat1',  unidade: 'metro',   qtd: 1500, qtdMin: 200, status: 'novo',  descricao: 'Cabo drop monomodo G.657.A1 2 fios' },
    { id: pid(), codigo: 'VLZ-002', nome: 'ONU GPON Huawei EG8141A5',      categoriaId: 'cat3',  unidade: 'unidade', qtd: 24,   qtdMin: 10,  status: 'novo',  descricao: 'ONU 4 portas LAN + WiFi 2.4/5GHz' },
    { id: pid(), codigo: 'VLZ-003', nome: 'SFP GPON B+ 1.25G',            categoriaId: 'cat2',  unidade: 'unidade', qtd: 8,    qtdMin: 5,   status: 'novo',  descricao: 'Módulo SFP GPON 1490/1310nm' },
    { id: pid(), codigo: 'VLZ-004', nome: 'Roteador TP-Link Archer C6',   categoriaId: 'cat4',  unidade: 'unidade', qtd: 3,    qtdMin: 5,   status: 'novo',  descricao: 'AC1200 Dual Band' },
    { id: pid(), codigo: 'VLZ-005', nome: 'Switch 8p TP-Link TL-SG108',   categoriaId: 'cat5',  unidade: 'unidade', qtd: 6,    qtdMin: 3,   status: 'novo',  descricao: 'Gigabit não gerenciável' },
    { id: pid(), codigo: 'VLZ-006', nome: 'Caixa CTO 8 portas',           categoriaId: 'cat6',  unidade: 'unidade', qtd: 40,   qtdMin: 15,  status: 'novo',  descricao: 'CTO externa 8 saídas SC/APC' },
    { id: pid(), codigo: 'VLZ-007', nome: 'Conector SC/APC',              categoriaId: 'cat7',  unidade: 'unidade', qtd: 200,  qtdMin: 50,  status: 'novo',  descricao: 'Conector campo SC/APC ângulo 8°' },
    { id: pid(), codigo: 'VLZ-008', nome: 'Patch Cord SC/APC–SC/APC 1m',  categoriaId: 'cat8',  unidade: 'unidade', qtd: 30,   qtdMin: 10,  status: 'novo',  descricao: '1 metro simplex' },
    { id: pid(), codigo: 'VLZ-009', nome: 'Abraçadeira Nylon 100mm',      categoriaId: 'cat10', unidade: 'caixa',   qtd: 2,    qtdMin: 5,   status: 'novo',  descricao: 'Caixa com 100 unidades' },
    { id: pid(), codigo: 'VLZ-010', nome: 'Papel A4 75g 500fls',          categoriaId: 'cat11', unidade: 'resma',   qtd: 10,   qtdMin: 5,   status: 'novo',  descricao: 'Resma branca 210x297mm' },
    { id: pid(), codigo: 'VLZ-011', nome: 'Álcool 70% 1L',                categoriaId: 'cat14', unidade: 'unidade', qtd: 0,    qtdMin: 3,   status: 'novo',  descricao: 'Álcool isopropílico 70%' },
    { id: pid(), codigo: 'VLZ-012', nome: 'Clivador de Fibra FC-6S',      categoriaId: 'cat9',  unidade: 'unidade', qtd: 2,    qtdMin: 2,   status: 'usado', descricao: 'Clivador de alta precisão' },
  ];

  /* ── STATE ──────────────────────────────────────────────────── */
  let state = {
    sessao:      null,
    produtos:    [],
    categorias:  [],
    usuarios:    [],
    historico:   [],
    paginaAtual: 'dashboard',
    _seedFeito:  false,       // controla se o seed já foi verificado
  };

  // Guarda as funções unsubscribe dos listeners do Firestore
  let _listeners = {};

  /* ── UTILITÁRIOS ────────────────────────────────────────────── */
  function pid()   { return 'id_' + Math.random().toString(36).slice(2, 10); }
  function agora() { return new Date().toISOString(); }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function ts() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }

  // Sessão ainda usa localStorage (não precisa de sincronização)
  function loadSessao()       { try { return JSON.parse(localStorage.getItem(LS_SESSAO)); } catch { return null; } }
  function saveSessao(sessao) { localStorage.setItem(LS_SESSAO, JSON.stringify(sessao)); }
  function clearSessao()      { localStorage.removeItem(LS_SESSAO); }

  /* ── TOAST ──────────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg, tipo = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast toast-${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3400);
  }

  /* ── MODAL ──────────────────────────────────────────────────── */
  function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
  function closeModalOutside(e, id) { if (e.target.id === id) closeModal(id); }

  /* ── LOADING OVERLAY ────────────────────────────────────────── */
  function showLoading(msg = 'Conectando ao banco de dados…') {
    let el = document.getElementById('fbLoading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fbLoading';
      el.style.cssText = `
        position:fixed;inset:0;background:rgba(22,32,50,.85);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        z-index:9999;color:#fff;font-family:'DM Sans',sans-serif;gap:16px;`;
      el.innerHTML = `
        <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,.2);
          border-top-color:#8FBD9A;border-radius:50%;animation:spin .8s linear infinite"></div>
        <div id="fbLoadingMsg" style="font-size:.95rem;opacity:.9">${msg}</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
      document.body.appendChild(el);
    } else {
      document.getElementById('fbLoadingMsg').textContent = msg;
    }
  }

  function hideLoading() {
    const el = document.getElementById('fbLoading');
    if (el) el.remove();
  }

  /* ── INDICADOR DE SINCRONIZAÇÃO ─────────────────────────────── */
  function showSyncIndicator() {
    let el = document.getElementById('syncDot');
    if (!el) {
      el = document.createElement('div');
      el.id = 'syncDot';
      el.title = 'Sincronizado com Firebase';
      el.style.cssText = `
        position:fixed;bottom:16px;right:16px;
        background:#8FBD9A;color:#fff;font-size:.72rem;font-weight:600;
        padding:5px 10px;border-radius:20px;z-index:1000;
        display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,.15);
        font-family:'DM Sans',sans-serif;`;
      el.innerHTML = `<span style="width:7px;height:7px;background:#fff;border-radius:50%;
        animation:pulse 2s infinite"></span> Sincronizado
        <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>`;
      document.body.appendChild(el);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  FIREBASE — INICIALIZAÇÃO E LISTENERS EM TEMPO REAL
   *  Aqui está o coração da sincronização:
   *  escutarColecao() usa onSnapshot → qualquer mudança no Firestore
   *  (feita por qualquer usuário) atualiza o state e re-renderiza.
   * ════════════════════════════════════════════════════════════ */
  async function iniciarFirebase() {
    showLoading('Carregando dados…');

    return new Promise((resolve) => {
      let carregados = 0;
      const total    = 4; // produtos, categorias, usuarios, historico
      const pronto   = () => { if (++carregados === total) { hideLoading(); showSyncIndicator(); resolve(); } };

      // ── Produtos ──────────────────────────────────────────────
      _listeners.produtos = escutarColecao(COLECOES.produtos, (lista) => {
        state.produtos = lista;
        if (state.paginaAtual === 'produtos')   renderProdutos();
        if (state.paginaAtual === 'dashboard')  renderDashboard();
        if (state.paginaAtual === 'historico')  renderHistorico();
        populateSelects();
        updateAlertBadge();
        pronto();
      });

      // ── Categorias ────────────────────────────────────────────
      _listeners.categorias = escutarColecao(COLECOES.categorias, (lista) => {
        state.categorias = lista;
        if (state.paginaAtual === 'categorias') renderCategorias();
        if (state.paginaAtual === 'dashboard')  renderDashboard();
        populateSelects();
        pronto();
      });

      // ── Usuários ──────────────────────────────────────────────
      _listeners.usuarios = escutarColecao(COLECOES.usuarios, (lista) => {
        state.usuarios = lista;
        if (state.paginaAtual === 'usuarios')   renderUsuarios();
        pronto();
      });

      // ── Histórico (ordenado por data desc) ────────────────────
      _listeners.historico = escutarColecao(COLECOES.historico, (lista) => {
        // Ordena por data decrescente (mais recente primeiro)
        state.historico = lista.sort((a, b) => new Date(b.data) - new Date(a.data));
        if (state.paginaAtual === 'historico')  renderHistorico();
        if (state.paginaAtual === 'dashboard')  renderDashboard();
        pronto();
      });

      // Timeout de segurança: se em 10s não carregar, libera a tela
      setTimeout(() => {
        if (carregados < total) {
          console.warn('[Firebase] Timeout ao carregar dados. Verifique as configurações.');
          hideLoading();
          toast('Atenção: verifique a conexão com o Firebase.', 'error');
          resolve();
        }
      }, 10000);
    });
  }

  /* ── SEED: popula o Firestore na primeira vez ───────────────── */
  async function verificarESeed() {
    if (state._seedFeito) return;
    state._seedFeito = true;

    // Se o Firestore já tem dados, não faz nada
    if (state.categorias.length > 0 || state.produtos.length > 0) return;

    showLoading('Primeira vez? Configurando dados iniciais…');
    try {
      await salvarLote(COLECOES.categorias, CATEGORIAS_SEED);
      await salvarLote(COLECOES.usuarios,   USUARIOS_SEED);
      await salvarLote(COLECOES.produtos,   PRODUTOS_SEED);
      toast('Dados iniciais configurados com sucesso!');
    } catch (e) {
      toast('Erro ao configurar dados iniciais. Verifique o Firebase.', 'error');
    }
    hideLoading();
  }

  /* ── logAction: registra uma ação no histórico do Firestore ─── */
  async function logAction(tipo, prodId, prodNome, qtd, detalhe) {
    const entry = {
      id: pid(), tipo, prodId, prodNome,
      qtd: Number(qtd) || 0, detalhe,
      usuario: state.sessao?.nome  || '—',
      usuLogin: state.sessao?.login || '—',
      data: agora(),
    };
    // Não precisa atualizar state.historico manualmente —
    // o listener onSnapshot vai fazer isso automaticamente.
    await salvarDoc(COLECOES.historico, entry);
    return entry;
  }

  /* ── INIT ───────────────────────────────────────────────────── */
  async function init() {
    const el = document.getElementById('dashDate');
    if (el) el.textContent = new Date().toLocaleDateString('pt-BR',
      { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    _exibirFraseLogin();

    const sess = loadSessao();
    if (sess) {
      state.sessao = sess;
      // Inicia Firebase e aguarda dados antes de mostrar o app
      await iniciarFirebase();
      await verificarESeed();
      showApp();
    } else {
      document.getElementById('loginScreen').classList.remove('hidden');
    }
  }

  const FRASES_LOGIN = [
    'Um estoque bem gerenciado é a base de uma operação eficiente.',
    'Controle hoje para não faltar amanhã.',
    'Organização é a diferença entre o caos e a excelência.',
    'Cada item registrado é um problema a menos no campo.',
    'Transparência começa no almoxarifado.',
    'Quem controla o estoque, controla o negócio.',
    'O sucesso está nos detalhes — inclusive nos do estoque.',
    'Cuide bem do seu inventário e ele cuidará da sua operação.',
    'Precisão no registro hoje evita prejuízo amanhã.',
    'A confiança da equipe começa pelo estoque bem abastecido.',
  ];

  function _exibirFraseLogin() {
    const el = document.getElementById('loginFrase');
    if (!el) return;
    const idx = Math.floor(Math.random() * FRASES_LOGIN.length);
    el.style.animation = 'none';
    el.textContent = '« ' + FRASES_LOGIN[idx] + ' »';
    void el.offsetWidth;
    el.style.animation = '';
  }

  /* ── AUTH ───────────────────────────────────────────────────── */
  async function login() {
    const u = document.getElementById('loginUser').value.trim().toLowerCase();
    const p = document.getElementById('loginPass').value;

    // Se o Firebase ainda não carregou os usuários, tenta carregar agora
    if (state.usuarios.length === 0) {
      showLoading('Verificando credenciais…');
      await iniciarFirebase();
      await verificarESeed();
      hideLoading();
    }

    const found = state.usuarios.find(x => x.login.toLowerCase() === u && x.senha === p);
    if (!found) {
      document.getElementById('loginError').classList.remove('hidden');
      return;
    }

    state.sessao = { id: found.id, nome: found.nome, login: found.login, perfil: found.perfil };
    saveSessao(state.sessao);

    // Inicia listeners do Firebase (se ainda não iniciados)
    if (!_listeners.produtos) {
      await iniciarFirebase();
    }

    showApp();
  }

  function logout() {
    // Para todos os listeners do Firestore ao sair
    Object.values(_listeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); });
    _listeners = {};
    state.sessao = null;
    clearSessao();
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').classList.add('hidden');
    // Remove indicador de sincronização
    const dot = document.getElementById('syncDot');
    if (dot) dot.remove();
  }

  function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('sidebarUser').textContent   = state.sessao.nome;
    document.getElementById('sidebarRole').textContent   = PERFIL_LABEL[state.sessao.perfil] || state.sessao.perfil;
    document.getElementById('sidebarAvatar').textContent = state.sessao.nome.charAt(0).toUpperCase();
    navigate('dashboard');
    populateSelects();
    updateSaidaBadge();
  }

  /* ── NAVEGAÇÃO ──────────────────────────────────────────────── */
  function navigate(page) {
    state.paginaAtual = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    const titles = { dashboard:'Dashboard', produtos:'Produtos', movimentacao:'Movimentação',
      historico:'Histórico', categorias:'Categorias', usuarios:'Usuários', exportar:'Exportar & Backup' };
    document.getElementById('topbarTitle').textContent = titles[page] || page;
    document.getElementById('sidebar').classList.remove('open');

    if (page === 'dashboard')  renderDashboard();
    if (page === 'produtos')   renderProdutos();
    if (page === 'historico')  renderHistorico();
    if (page === 'categorias') renderCategorias();
    if (page === 'usuarios')   renderUsuarios();
  }

  function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

  /* ── SELECTS ────────────────────────────────────────────────── */
  function populateSelects() {
    const filterCat = document.getElementById('filterCategoria');
    if (filterCat) {
      filterCat.innerHTML = '<option value="">Todas as categorias</option>';
      state.categorias.forEach(c => filterCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
    }

    ['entradaProduto','saidaProduto','defeitoProduto'].forEach(selId => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">Selecione o produto…</option>';
      state.produtos.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.codigo} — ${p.nome}</option>`);
      if (cur) sel.value = cur;
    });

    const prodCat = document.getElementById('prodCategoria');
    if (prodCat) {
      const cur = prodCat.value;
      prodCat.innerHTML = '<option value="">Selecione…</option>';
      state.categorias.forEach(c => prodCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
      if (cur) prodCat.value = cur;
    }
  }

  /* ── ALERT BADGE (topbar semáforo) ──────────────────────────── */
  function updateAlertBadge() {
    const zerados = state.produtos.filter(p => p.qtd === 0);
    const aviso   = state.produtos.filter(p => p.qtd > 0 && p.qtd <= p.qtdMin * WARN_MARGIN);
    const ok      = state.produtos.filter(p => p.qtd > p.qtdMin * WARN_MARGIN);

    const elZerado = document.getElementById('indZeradoVal');
    const elBaixo  = document.getElementById('indBaixoVal');
    const elOk     = document.getElementById('indOkVal');
    if (elZerado) elZerado.textContent = zerados.length;
    if (elBaixo)  elBaixo.textContent  = aviso.length;
    if (elOk)     elOk.textContent     = ok.length;

    const container = document.querySelector('.stock-indicators');
    if (container) {
      container.className = 'stock-indicators';
      if (zerados.length > 0)    container.classList.add('has-zero');
      else if (aviso.length > 0) container.classList.add('has-warn');
      else                        container.classList.add('all-ok');
      const total = zerados.length + aviso.length;
      container.title = total === 0
        ? 'Todos os produtos com estoque adequado'
        : zerados.length + ' produto(s) zerado(s) · ' + aviso.length + ' produto(s) com estoque baixo';
    }
  }

  /* ══ DASHBOARD ══════════════════════════════════════════════════ */
  function renderDashboard() {
    const now  = Date.now();
    const ms30 = 30 * 24 * 60 * 60 * 1000;

    const entradas30 = state.historico.filter(h => h.tipo === 'entrada' && (now - new Date(h.data).getTime()) < ms30);
    const saidas30   = state.historico.filter(h => h.tipo === 'saida'   && (now - new Date(h.data).getTime()) < ms30);
    const zerados    = state.produtos.filter(p => p.qtd === 0);
    const aviso      = state.produtos.filter(p => p.qtd > 0 && p.qtd <= p.qtdMin * WARN_MARGIN);

    document.getElementById('statTotal').textContent    = state.produtos.length;
    document.getElementById('statEntradas').textContent = entradas30.length;
    document.getElementById('statSaidas').textContent   = saidas30.length;
    document.getElementById('statAlertas').textContent  = zerados.length + aviso.length;

    const subAlertas = document.getElementById('statAlertasSub');
    if (subAlertas) {
      const z = zerados.length, a = aviso.length;
      if (z === 0 && a === 0) subAlertas.textContent = 'todos os produtos estão ok';
      else {
        const parts = [];
        if (z > 0) parts.push(z + ' zerado' + (z > 1 ? 's' : ''));
        if (a > 0) parts.push(a + ' abaixo do mínimo');
        subAlertas.textContent = parts.join(' · ');
      }
    }

    updateAlertBadge();

    const recentes = state.historico.slice(0, 8);
    const movEl = document.getElementById('dashMovRecentes');
    if (recentes.length === 0) {
      movEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⇄</div>Nenhuma movimentação ainda.</div>';
    } else {
      movEl.innerHTML = recentes.map(h => `
        <div class="mov-item">
          <span class="mov-badge badge-${h.tipo}">${h.tipo}</span>
          <div class="mov-info">
            <div class="mov-name">${h.prodNome}</div>
            <div class="mov-meta">${h.usuario} · ${fmtDate(h.data)}</div>
          </div>
          <span class="mov-qty">${h.tipo === 'saida' || h.tipo === 'defeito' ? '−' : '+'}${h.qtd}</span>
        </div>`).join('');
    }

    const alertEl = document.getElementById('dashAlertas');
    const alertItems = [
      ...zerados.map(p => ({...p, _alertType: 'zero'})),
      ...aviso.map(p   => ({...p, _alertType: 'warn'})),
    ];

    if (alertItems.length === 0) {
      alertEl.innerHTML = `
        <div class="alert-item" style="background:var(--ok-lt);border:1px solid #b6dcc0;justify-content:center;gap:8px">
          <span style="color:var(--ok-dk);font-size:1rem">✓</span>
          <span style="color:var(--ok-dk);font-weight:600">Todos os produtos com estoque adequado</span>
        </div>`;
    } else {
      alertEl.innerHTML = alertItems.slice(0, 8).map(p => {
        const pct = stockPct(p);
        const pctStr = pct !== null ? `${pct}% do mínimo` : '';
        if (p._alertType === 'zero') {
          return `<div class="alert-item zero-item">
            <div class="a-name">${p.nome} <small style="color:var(--text3);font-size:.72rem">${p.codigo}</small></div>
            <div class="a-right">
              <span class="a-qty">ZERADO</span>
              <span class="a-pct">mín: ${p.qtdMin} ${p.unidade}</span>
            </div></div>`;
        } else {
          return `<div class="alert-item warn-item">
            <div class="a-name">${p.nome} <small style="color:var(--text3);font-size:.72rem">${p.codigo}</small></div>
            <div class="a-right">
              <span class="a-qty">${p.qtd} / mín ${p.qtdMin}</span>
              <span class="a-pct">${pctStr}</span>
            </div></div>`;
        }
      }).join('');
    }

    renderBarChart();
  }

  function renderBarChart() {
    const el = document.getElementById('dashChart');
    const counts = {};
    state.produtos.forEach(p => {
      const cat = state.categorias.find(c => c.id === p.categoriaId);
      const label = cat ? cat.nome : 'Sem categoria';
      counts[label] = (counts[label] || 0) + p.qtd;
    });

    const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const max = Math.max(...entries.map(e => e[1]), 1);
    const colors = ['#162032','#8FBD9A','#243348','#6fa67e','#1d2b42','#b6dcc0','#3a5270','#F5C842','#5a9e6a','#E5484D'];

    el.innerHTML = entries.map(([label, count], i) => `
      <div class="bar-col">
        <span class="bar-count">${count}</span>
        <div class="bar" style="height:${Math.max((count/max)*130, 4)}px;background:${colors[i%colors.length]}" title="${label}: ${count}"></div>
        <span class="bar-label" title="${label}">${label}</span>
      </div>`).join('');

    if (entries.length === 0)
      el.innerHTML = '<div class="empty-state" style="width:100%">Sem dados</div>';
  }

  /* ══ PRODUTOS ═══════════════════════════════════════════════════ */
  function renderProdutos() {
    const busca   = document.getElementById('searchProdutos')?.value.toLowerCase() || '';
    const catF    = document.getElementById('filterCategoria')?.value || '';
    const statusF = document.getElementById('filterStatus')?.value || '';

    let lista = state.produtos.filter(p => {
      const textoOk  = !busca   || p.nome.toLowerCase().includes(busca) || p.codigo.toLowerCase().includes(busca);
      const catOk    = !catF    || p.categoriaId === catF;
      const statusOk = !statusF || p.status === statusF;
      return textoOk && catOk && statusOk;
    });

    const tbody = document.getElementById('tabelaProdutosBody');
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">▦</div>Nenhum produto encontrado.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(p => {
      const cat  = state.categorias.find(c => c.id === p.categoriaId);
      const st   = stockStatus(p);
      const rowClass = st === 'zero' ? 'row-zero' : st === 'warn' ? 'row-warn' : '';
      return `
        <tr class="${rowClass}">
          <td><code style="font-family:'DM Mono',monospace;font-size:.8rem;color:var(--navy)">${p.codigo}</code></td>
          <td>
            <div style="font-weight:500">${p.nome}</div>
            <div style="font-size:.75rem;color:var(--text3)">${(p.descricao||'').substring(0,50)}</div>
          </td>
          <td>${cat ? `${cat.icone} ${cat.nome}` : '—'}</td>
          <td>${stockPill(p)}</td>
          <td style="font-family:'DM Mono',monospace;color:var(--text3)">${p.qtdMin} ${p.unidade}</td>
          <td><span class="tag-status tag-${p.status}">${p.status}</span></td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn-icon" title="Entrada" onclick="App.quickEntrada('${p.id}')">↓</button>
              <button class="btn-icon" title="Saída"   onclick="App.quickSaida('${p.id}')">↑</button>
              <button class="btn-icon" title="Editar"  onclick="App.editarProduto('${p.id}')">✎</button>
              <button class="btn-icon danger" title="Excluir" onclick="App.excluirProduto('${p.id}')">✕</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    updateAlertBadge();
  }

  function openModalProduto() {
    document.getElementById('modalProdutoTitle').textContent = 'Novo Produto';
    document.getElementById('prodId').value = '';
    document.getElementById('prodNome').value = '';
    document.getElementById('prodCodigo').value = 'VLZ-' + String(state.produtos.length + 1).padStart(3, '0');
    document.getElementById('prodCategoria').value = '';
    document.getElementById('prodUnidade').value = 'unidade';
    document.getElementById('prodQtd').value = '0';
    document.getElementById('prodQtdMin').value = '5';
    document.getElementById('prodStatus').value = 'novo';
    document.getElementById('prodDescricao').value = '';
    populateSelects();
    openModal('modalProduto');
  }

  function editarProduto(id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalProdutoTitle').textContent = 'Editar Produto';
    document.getElementById('prodId').value        = p.id;
    document.getElementById('prodNome').value      = p.nome;
    document.getElementById('prodCodigo').value    = p.codigo;
    document.getElementById('prodUnidade').value   = p.unidade;
    document.getElementById('prodQtd').value       = p.qtd;
    document.getElementById('prodQtdMin').value    = p.qtdMin;
    document.getElementById('prodStatus').value    = p.status;
    document.getElementById('prodDescricao').value = p.descricao || '';
    populateSelects();
    document.getElementById('prodCategoria').value = p.categoriaId || '';
    openModal('modalProduto');
  }

  async function salvarProduto() {
    const id     = document.getElementById('prodId').value;
    const nome   = document.getElementById('prodNome').value.trim();
    const codigo = document.getElementById('prodCodigo').value.trim();
    if (!nome || !codigo) { toast('Nome e código são obrigatórios.', 'error'); return; }

    const dados = {
      nome, codigo,
      categoriaId: document.getElementById('prodCategoria').value,
      unidade:     document.getElementById('prodUnidade').value,
      qtd:         Number(document.getElementById('prodQtd').value)    || 0,
      qtdMin:      Number(document.getElementById('prodQtdMin').value) || 0,
      status:      document.getElementById('prodStatus').value,
      descricao:   document.getElementById('prodDescricao').value.trim(),
    };

    try {
      if (id) {
        // Atualiza produto existente
        const atual = state.produtos.find(p => p.id === id);
        await salvarDoc(COLECOES.produtos, { ...atual, ...dados, id });
        await logAction('edicao', id, nome, 0, 'Produto editado');
        toast('Produto atualizado!');
      } else {
        // Verifica código duplicado
        if (state.produtos.find(p => p.codigo === codigo)) { toast('Código já cadastrado!', 'error'); return; }
        const novo = { id: pid(), ...dados };
        await salvarDoc(COLECOES.produtos, novo);
        await logAction('entrada', novo.id, nome, dados.qtd, 'Produto cadastrado');
        toast('Produto cadastrado!');
      }
      closeModal('modalProduto');
      // Não precisa chamar renderProdutos() — o listener do Firestore faz isso
    } catch (e) {
      toast('Erro ao salvar. Verifique a conexão.', 'error');
    }
  }

  async function excluirProduto(id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirDoc(COLECOES.produtos, id);
      await logAction('edicao', id, p.nome, 0, 'Produto excluído');
      toast('Produto excluído.');
    } catch (e) {
      toast('Erro ao excluir. Verifique a conexão.', 'error');
    }
  }

  /* ── MOVIMENTAÇÃO RÁPIDA ─────────────────────────────────────── */
  function quickEntrada(id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalMovTitle').textContent = `↓ Entrada — ${p.nome}`;
    document.getElementById('modalMovBody').innerHTML = `
      <div style="margin-bottom:14px">${stockPill(p)}</div>
      <div class="form-grid">
        <div class="form-group"><label>Quantidade *</label>
          <input type="number" id="qMovQtd" min="1" value="1" /></div>
        <div class="form-group"><label>Origem / Fornecedor</label>
          <input type="text" id="qMovOrigem" placeholder="Ex: Fornecedor XYZ" /></div>
        <div class="form-group full"><label>Observação</label>
          <textarea id="qMovObs" rows="2" placeholder="…"></textarea></div>
      </div>`;
    document.getElementById('modalMovConfirm').onclick = async () => {
      const qtd = Number(document.getElementById('qMovQtd').value) || 0;
      if (qtd <= 0) { toast('Quantidade inválida.', 'error'); return; }
      try {
        const novoProduto = { ...p, qtd: p.qtd + qtd };
        await salvarDoc(COLECOES.produtos, novoProduto);
        const detalhe = [document.getElementById('qMovOrigem').value, document.getElementById('qMovObs').value].filter(Boolean).join(' — ');
        await logAction('entrada', p.id, p.nome, qtd, detalhe || 'Entrada de estoque');
        closeModal('modalMovimento');
        toast(`+${qtd} ${p.unidade} adicionados a "${p.nome}".`);
      } catch (e) { toast('Erro ao registrar entrada.', 'error'); }
    };
    openModal('modalMovimento');
  }

  function quickSaida(id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    const usuario = state.sessao?.nome  || '—';
    const login   = state.sessao?.login || '—';

    document.getElementById('modalMovTitle').textContent = `↑ Saída — ${p.nome}`;
    document.getElementById('modalMovBody').innerHTML = `
      <div style="margin-bottom:14px">${stockPill(p)}</div>
      <div class="saida-usuario-badge" style="margin-bottom:16px">
        <div class="u-avatar-sm">${usuario.charAt(0).toUpperCase()}</div>
        <span>Operador: <strong>${usuario}</strong>
          <span style="color:var(--text3);font-size:.78rem;margin-left:4px">(${login})</span>
        </span>
      </div>
      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-group">
          <label>Quantidade *</label>
          <input type="number" id="qMovQtd" min="1" max="${p.qtd}" value="1" />
        </div>
        <div class="form-group">
          <label>OS / Referência</label>
          <input type="text" id="qMovDest" placeholder="OS #1234 / Cliente…" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>Motivo da saída *</label>
        <div class="motivo-grid">
          <button type="button" class="motivo-btn" data-motivo="Instalação"  onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">🔧 Instalação</button>
          <button type="button" class="motivo-btn" data-motivo="Troca"       onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">🔄 Troca</button>
          <button type="button" class="motivo-btn" data-motivo="Venda"       onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">💰 Venda</button>
          <button type="button" class="motivo-btn" data-motivo="Manutenção"  onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">🛠 Manutenção</button>
          <button type="button" class="motivo-btn" data-motivo="Empréstimo"  onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">🤝 Empréstimo</button>
          <button type="button" class="motivo-btn" data-motivo="Outros"      onclick="this.closest('.motivo-grid').querySelectorAll('.motivo-btn').forEach(b=>b.classList.remove('ativo')); this.classList.add('ativo'); document.getElementById('qMovMotivo').value=this.dataset.motivo; document.getElementById('qMovOutrosGroup').classList.toggle('hidden', this.dataset.motivo!=='Outros')">📝 Outros</button>
        </div>
        <input type="hidden" id="qMovMotivo" />
      </div>
      <div class="form-group hidden" id="qMovOutrosGroup" style="margin-bottom:14px">
        <label>Descreva o motivo *</label>
        <textarea id="qMovObs" rows="2" placeholder="Informe o motivo detalhado…"></textarea>
      </div>
      <p style="font-size:.8rem;color:var(--text3)">Estoque atual: <strong>${p.qtd} ${p.unidade}</strong></p>`;

    document.getElementById('modalMovConfirm').onclick = async () => {
      const qtd    = Number(document.getElementById('qMovQtd').value) || 0;
      const motivo = document.getElementById('qMovMotivo').value.trim();
      if (qtd <= 0)   { toast('Quantidade inválida.', 'error'); return; }
      if (qtd > p.qtd){ toast(`Estoque insuficiente! Disponível: ${p.qtd} ${p.unidade}.`, 'error'); return; }
      if (!motivo)    { toast('Selecione o motivo da saída.', 'error'); return; }
      if (motivo === 'Outros') {
        const obs = document.getElementById('qMovObs')?.value.trim();
        if (!obs) { toast('Descreva o motivo para "Outros".', 'error'); return; }
      }
      try {
        const novoProduto = { ...p, qtd: p.qtd - qtd };
        await salvarDoc(COLECOES.produtos, novoProduto);
        const dest    = document.getElementById('qMovDest').value.trim();
        const obsOutr = motivo === 'Outros' ? document.getElementById('qMovObs')?.value.trim() : '';
        const partes  = [
          `Motivo: ${motivo}${obsOutr ? ` — ${obsOutr}` : ''}`,
          dest ? `OS/Ref: ${dest}` : '',
          `Operador: ${usuario} (${login})`,
        ].filter(Boolean);
        await logAction('saida', p.id, p.nome, qtd, partes.join(' | '));
        closeModal('modalMovimento');
        toast(`−${qtd} ${p.unidade} de "${p.nome}" — ${motivo}.`, 'warn');
      } catch (e) { toast('Erro ao registrar saída.', 'error'); }
    };
    openModal('modalMovimento');
  }

  /* ══ MOVIMENTAÇÃO (página) ═════════════════════════════════════ */
  function updateSaidaBadge() {
    const el = document.getElementById('saidaUsuarioBadge');
    if (!el || !state.sessao) return;
    el.innerHTML = `
      <div class="u-avatar-sm">${state.sessao.nome.charAt(0).toUpperCase()}</div>
      <span>Saída será registrada como: <strong>${state.sessao.nome}</strong>
        <span style="color:var(--text3);font-size:.78rem;margin-left:4px">(${state.sessao.login} · ${state.sessao.perfil})</span>
      </span>`;
  }

  function selecionarMotivo(btn) {
    document.querySelectorAll('.motivo-btn').forEach(b => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    const motivo = btn.dataset.motivo;
    document.getElementById('saidaMotivo').value = motivo;
    const outrosGroup = document.getElementById('saidaOutrosGroup');
    if (outrosGroup) {
      outrosGroup.classList.toggle('hidden', motivo !== 'Outros');
      if (motivo !== 'Outros') {
        const obs = document.getElementById('saidaObs');
        if (obs) obs.value = '';
      }
    }
  }

  function switchMovTab(tab) {
    document.querySelectorAll('.mov-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    ['entrada','saida','defeito'].forEach(t => {
      document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`).classList.toggle('hidden', t !== tab);
    });
    if (tab === 'saida') updateSaidaBadge();
  }

  async function registrarEntrada() {
    const id  = document.getElementById('entradaProduto').value;
    const qtd = Number(document.getElementById('entradaQtd').value) || 0;
    if (!id)     { toast('Selecione um produto.', 'error'); return; }
    if (qtd <= 0){ toast('Quantidade inválida.', 'error'); return; }
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    try {
      await salvarDoc(COLECOES.produtos, { ...p, qtd: p.qtd + qtd });
      const origem = document.getElementById('entradaOrigem').value;
      const nf     = document.getElementById('entradaNF').value;
      const obs    = document.getElementById('entradaObs').value;
      const detalhe = [origem && `Origem: ${origem}`, nf && `NF: ${nf}`, obs].filter(Boolean).join(' | ');
      await logAction('entrada', p.id, p.nome, qtd, detalhe || 'Entrada de estoque');
      ['entradaQtd','entradaOrigem','entradaNF','entradaObs'].forEach(f => {
        const el = document.getElementById(f); if (el) el.value = f === 'entradaQtd' ? '1' : '';
      });
      document.getElementById('entradaProduto').value = '';
      toast(`+${qtd} ${p.unidade} adicionados ao estoque de "${p.nome}".`);
    } catch (e) { toast('Erro ao registrar entrada.', 'error'); }
  }

  async function registrarSaida() {
    const id     = document.getElementById('saidaProduto').value;
    const qtd    = Number(document.getElementById('saidaQtd').value) || 0;
    const motivo = document.getElementById('saidaMotivo').value.trim();

    if (!id)     { toast('Selecione um produto.', 'error'); return; }
    if (qtd <= 0){ toast('Quantidade inválida.', 'error'); return; }
    if (!motivo) { toast('Selecione o motivo da saída.', 'error'); return; }
    if (motivo === 'Outros') {
      const obs = document.getElementById('saidaObs').value.trim();
      if (!obs) { toast('Descreva o motivo para "Outros".', 'error'); return; }
    }

    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    if (qtd > p.qtd) { toast(`Estoque insuficiente! Disponível: ${p.qtd} ${p.unidade}.`, 'error'); return; }

    try {
      await salvarDoc(COLECOES.produtos, { ...p, qtd: p.qtd - qtd });
      const dest     = document.getElementById('saidaDestino').value.trim();
      const obsOutr  = motivo === 'Outros' ? document.getElementById('saidaObs').value.trim() : '';
      const obsExtra = document.getElementById('saidaObsExtra').value.trim();
      const usuario  = state.sessao?.nome  || '—';
      const login    = state.sessao?.login || '—';
      const partes   = [
        `Motivo: ${motivo}${obsOutr ? ` — ${obsOutr}` : ''}`,
        dest     ? `OS/Ref: ${dest}`   : '',
        obsExtra ? `Obs: ${obsExtra}`  : '',
        `Operador: ${usuario} (${login})`,
      ].filter(Boolean);
      await logAction('saida', p.id, p.nome, qtd, partes.join(' | '));
      ['saidaQtd','saidaDestino','saidaObs','saidaObsExtra'].forEach(f => {
        const el = document.getElementById(f); if (el) el.value = f === 'saidaQtd' ? '1' : '';
      });
      document.getElementById('saidaProduto').value = '';
      document.getElementById('saidaMotivo').value  = '';
      document.querySelectorAll('.motivo-btn').forEach(b => b.classList.remove('ativo'));
      const outrosGroup = document.getElementById('saidaOutrosGroup');
      if (outrosGroup) outrosGroup.classList.add('hidden');
      toast(`−${qtd} ${p.unidade} de "${p.nome}" — Motivo: ${motivo}.`, 'warn');
    } catch (e) { toast('Erro ao registrar saída.', 'error'); }
  }

  async function registrarDefeito() {
    const id  = document.getElementById('defeitoProduto').value;
    const qtd = Number(document.getElementById('defeitoQtd').value) || 0;
    const mot = document.getElementById('defeitoMotivo').value.trim();
    if (!id)  { toast('Selecione um produto.', 'error'); return; }
    if (qtd<=0){ toast('Quantidade inválida.', 'error'); return; }
    if (!mot) { toast('Informe o motivo.', 'error'); return; }
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    if (qtd > p.qtd) { toast(`Quantidade maior que o estoque! Disponível: ${p.qtd}.`, 'error'); return; }
    try {
      await salvarDoc(COLECOES.produtos, { ...p, qtd: p.qtd - qtd });
      await logAction('defeito', p.id, p.nome, qtd, `Defeito: ${mot}`);
      document.getElementById('defeitoProduto').value = '';
      document.getElementById('defeitoQtd').value = '1';
      document.getElementById('defeitoMotivo').value = '';
      toast(`${qtd} ${p.unidade} de "${p.nome}" registrado(s) como defeituoso(s).`, 'warn');
    } catch (e) { toast('Erro ao registrar defeito.', 'error'); }
  }

  /* ══ HISTÓRICO ═════════════════════════════════════════════════ */
  function renderHistorico() {
    const btnLimpar = document.getElementById('btnLimparHistorico');
    if (btnLimpar) btnLimpar.style.display = isAdmin() ? '' : 'none';

    const busca = document.getElementById('histSearch')?.value.toLowerCase() || '';
    const tipo  = document.getElementById('histTipo')?.value || '';
    const dIni  = document.getElementById('histDataInicio')?.value || '';
    const dFim  = document.getElementById('histDataFim')?.value || '';

    let lista = state.historico.filter(h => {
      const nomeOk = !busca || h.prodNome.toLowerCase().includes(busca);
      const tipoOk = !tipo  || h.tipo === tipo;
      let dateOk = true;
      if (dIni) dateOk = dateOk && new Date(h.data) >= new Date(dIni);
      if (dFim) dateOk = dateOk && new Date(h.data) <= new Date(dFim + 'T23:59:59');
      return nomeOk && tipoOk && dateOk;
    });

    const tbody = document.getElementById('historicoBody');
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">≡</div>Nenhum registro encontrado.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(h => `
      <tr>
        <td style="white-space:nowrap;font-size:.8rem;font-family:'DM Mono',monospace">${fmtDate(h.data)}</td>
        <td><span class="mov-badge badge-${h.tipo}">${h.tipo}</span></td>
        <td>${h.prodNome}</td>
        <td style="font-family:'DM Mono',monospace">${h.tipo === 'edicao' ? '—' : h.qtd}</td>
        <td>${h.usuario}</td>
        <td style="font-size:.8rem;color:var(--text3);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${h.detalhe||''}">${h.detalhe || '—'}</td>
      </tr>`).join('');
  }

  /* ══ CATEGORIAS ════════════════════════════════════════════════ */
  function renderCategorias() {
    const el = document.getElementById('categoriasGrid');
    el.innerHTML = state.categorias.map(c => {
      const total = state.produtos.filter(p => p.categoriaId === c.id).length;
      return `
        <div class="cat-card">
          <div class="cat-icon">${c.icone || '📦'}</div>
          <div class="cat-name">${c.nome}</div>
          <div class="cat-group">${c.grupo}</div>
          <div class="cat-count">${total} produto${total !== 1 ? 's' : ''}</div>
          <div class="cat-actions">
            <button class="btn-icon danger" onclick="App.excluirCategoria('${c.id}')" title="Excluir">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  async function salvarCategoria() {
    const nome  = document.getElementById('catNome').value.trim();
    const grupo = document.getElementById('catGrupo').value;
    const icone = document.getElementById('catIcone').value.trim() || '📦';
    if (!nome) { toast('Informe o nome da categoria.', 'error'); return; }
    try {
      await salvarDoc(COLECOES.categorias, { id: pid(), nome, grupo, icone });
      closeModal('modalCategoria');
      document.getElementById('catNome').value  = '';
      document.getElementById('catIcone').value = '';
      toast('Categoria criada!');
    } catch (e) { toast('Erro ao criar categoria.', 'error'); }
  }

  async function excluirCategoria(id) {
    if (state.produtos.some(p => p.categoriaId === id)) { toast('Categoria em uso. Remova os produtos primeiro.', 'error'); return; }
    if (!confirm('Excluir esta categoria?')) return;
    try {
      await excluirDoc(COLECOES.categorias, id);
      toast('Categoria removida.');
    } catch (e) { toast('Erro ao excluir categoria.', 'error'); }
  }

  /* ══ USUÁRIOS ══════════════════════════════════════════════════ */
  function isAdmin() { return state.sessao?.perfil === 'admin'; }

  function renderUsuarios() {
    const admin = isAdmin();
    const tbody = document.getElementById('usuariosBody');
    const btnNovo = document.querySelector('#page-usuarios .btn-primary');
    if (btnNovo) btnNovo.style.display = admin ? '' : 'none';

    tbody.innerHTML = state.usuarios.map(u => {
      const isSelf = u.id === state.sessao?.id;
      const acoes = admin
        ? `<div style="display:flex;gap:4px">
            <button class="btn-icon" onclick="App.editarUsuario('${u.id}')" title="Editar">✎</button>
            ${!isSelf ? `<button class="btn-icon danger" onclick="App.excluirUsuario('${u.id}')" title="Excluir">✕</button>` : ''}
           </div>`
        : `<span style="font-size:.75rem;color:var(--text3)">—</span>`;

      return `
        <tr>
          <td><code style="font-family:'DM Mono',monospace">${u.login}</code></td>
          <td>${u.nome}</td>
          <td><span class="tag-status" style="background:rgba(22,32,50,.08);color:var(--navy);border:1px solid rgba(22,32,50,.15)">${PERFIL_LABEL[u.perfil]||u.perfil}</span></td>
          <td>${acoes}</td>
        </tr>`;
    }).join('');

    const aviso = document.getElementById('usuariosAviso');
    if (aviso) aviso.style.display = admin ? 'none' : 'flex';
  }

  async function salvarUsuario() {
    if (!isAdmin()) { toast('Acesso restrito. Apenas administradores podem gerenciar usuários.', 'error'); return; }
    const id     = document.getElementById('userId').value;
    const nome   = document.getElementById('userName').value.trim();
    const login  = document.getElementById('userLogin').value.trim().toLowerCase();
    const senha  = document.getElementById('userPass').value;
    const perfil = document.getElementById('userRole').value;
    if (!nome || !login) { toast('Nome e login são obrigatórios.', 'error'); return; }

    try {
      if (id) {
        const atual = state.usuarios.find(u => u.id === id);
        await salvarDoc(COLECOES.usuarios, { ...atual, nome, login, perfil, ...(senha ? {senha} : {}), id });
        toast('Usuário atualizado!');
      } else {
        if (!senha) { toast('Informe a senha.', 'error'); return; }
        if (state.usuarios.find(u => u.login === login)) { toast('Login já cadastrado.', 'error'); return; }
        await salvarDoc(COLECOES.usuarios, { id: pid(), nome, login, senha, perfil });
        toast('Usuário criado!');
      }
      closeModal('modalUsuario');
    } catch (e) { toast('Erro ao salvar usuário.', 'error'); }
  }

  function editarUsuario(id) {
    if (!isAdmin()) { toast('Acesso restrito. Apenas administradores podem editar usuários.', 'error'); return; }
    const u = state.usuarios.find(x => x.id === id);
    if (!u) return;
    document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
    document.getElementById('userId').value    = u.id;
    document.getElementById('userName').value  = u.nome;
    document.getElementById('userLogin').value = u.login;
    document.getElementById('userPass').value  = '';
    document.getElementById('userRole').value  = u.perfil;
    openModal('modalUsuario');
  }

  async function excluirUsuario(id) {
    if (!isAdmin()) { toast('Acesso restrito.', 'error'); return; }
    if (id === state.sessao?.id) { toast('Não é possível excluir seu próprio usuário.', 'error'); return; }
    if (!confirm('Excluir este usuário?')) return;
    try {
      await excluirDoc(COLECOES.usuarios, id);
      toast('Usuário removido.');
    } catch (e) { toast('Erro ao excluir usuário.', 'error'); }
  }

  /* ══ LIMPAR HISTÓRICO (admin only) ════════════════════════════ */
  async function limparHistorico() {
    if (!isAdmin()) { toast('Apenas administradores podem limpar o histórico.', 'error'); return; }
    const total = state.historico.length;
    if (total === 0) { toast('O histórico já está vazio.', 'info'); return; }
    if (!confirm(`Limpar todo o histórico de movimentações?\n\nEsta ação é irreversível e removerá ${total} registro(s).`)) return;
    try {
      showLoading('Limpando histórico…');
      // Exclui todos os registros do histórico (em série para não sobrecarregar)
      for (const h of state.historico) {
        await excluirDoc(COLECOES.historico, h.id);
      }
      hideLoading();
      toast('Histórico limpo com sucesso.', 'info');
    } catch (e) {
      hideLoading();
      toast('Erro ao limpar histórico.', 'error');
    }
  }

  /* ══ EXPORTAR ══════════════════════════════════════════════════ */
  function downloadFile(content, filename, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], {type}));
    a.download = filename; a.click();
  }

  function exportarProdutosCSV() {
    const header = 'Código;Nome;Categoria;Unidade;Quantidade;Mínimo;Status de Estoque;Status;Descrição\n';
    const rows = state.produtos.map(p => {
      const cat = state.categorias.find(c => c.id === p.categoriaId)?.nome || '';
      const st  = stockStatus(p) === 'zero' ? 'ZERADO' : stockStatus(p) === 'warn' ? 'BAIXO' : 'OK';
      return [p.codigo, p.nome, cat, p.unidade, p.qtd, p.qtdMin, st, p.status, p.descricao||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(';');
    }).join('\n');
    downloadFile('\uFEFF' + header + rows, `vloz_produtos_${ts()}.csv`, 'text/csv');
    toast('Produtos exportados!');
  }

  function exportarHistoricoCSV() {
    const header = 'Data;Tipo;Produto;Quantidade;Usuário;Detalhe\n';
    const rows = state.historico.map(h =>
      [fmtDate(h.data), h.tipo, h.prodNome, h.qtd, h.usuario, h.detalhe||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')
    ).join('\n');
    downloadFile('\uFEFF' + header + rows, `vloz_historico_${ts()}.csv`, 'text/csv');
    toast('Histórico exportado!');
  }

  function exportarBackup() {
    const backup = {
      _meta: { versao: '2.0', app: 'Vloz Telecom Estoque (Firebase)', exportado: agora(), warnMargin: WARN_MARGIN },
      produtos: state.produtos, categorias: state.categorias,
      usuarios: state.usuarios.map(u => ({...u, senha: '***'})),
      historico: state.historico,
    };
    downloadFile(JSON.stringify(backup, null, 2), `vloz_backup_${ts()}.json`, 'application/json');
    toast('Backup gerado!');
  }

  async function importarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.produtos || !data.categorias) throw new Error('Arquivo inválido');
        if (!confirm(`Restaurar backup?\nIsso substituirá os dados atuais no Firebase.`)) return;
        showLoading('Importando backup para o Firebase…');
        if (data.categorias?.length) await salvarLote(COLECOES.categorias, data.categorias);
        if (data.produtos?.length)   await salvarLote(COLECOES.produtos,   data.produtos);
        if (data.historico?.length)  await salvarLote(COLECOES.historico,  data.historico);
        hideLoading();
        navigate('dashboard');
        toast('Backup restaurado no Firebase!');
      } catch { hideLoading(); toast('Arquivo de backup inválido.', 'error'); }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  /* ── ENTER LOGIN ────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) login();
  });

  /* ── PUBLIC ──────────────────────────────────────────────────── */
  return {
    init, login, logout, navigate, toggleSidebar,
    openModal, closeModal, closeModalOutside,
    openModalProduto, renderProdutos, salvarProduto, editarProduto, excluirProduto,
    quickEntrada, quickSaida,
    selecionarMotivo, updateSaidaBadge,
    switchMovTab, registrarEntrada, registrarSaida, registrarDefeito,
    renderHistorico,
    renderCategorias, salvarCategoria, excluirCategoria,
    renderUsuarios, salvarUsuario, editarUsuario, excluirUsuario,
    exportarProdutosCSV, exportarHistoricoCSV, exportarBackup, importarBackup,
    limparHistorico,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  const btnNovoProd = document.querySelector('[onclick="App.openModal(\'modalProduto\')"]');
  if (btnNovoProd) btnNovoProd.setAttribute('onclick', 'App.openModalProduto()');
  App.init();
});
