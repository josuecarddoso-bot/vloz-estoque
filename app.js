/**
 * ═══════════════════════════════════════════════════════════════
 *  VLOZ TELECOM — SISTEMA DE ESTOQUE v3.0
 *  Autor: refatorado com RBAC, prefixos por categoria,
 *         justificativa obrigatória e controle total de permissões
 * ═══════════════════════════════════════════════════════════════
 */

import {
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
} from "./firebase.js";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTES GLOBAIS
   ═══════════════════════════════════════════════════════════════ */

/** Prefixos de código por categoria (id da categoria → prefixo) */
const PREFIXOS_CATEGORIA = {
  // Roteadores / ONU / CPE
  'roteadores':   'ROT',
  'onu':          'ONU',
  'cpe':          'CPE',
  // Cabos / Fibra
  'cabos':        'CAB',
  'fibra':        'FIB',
  // Conectores / Splitters / Passivos
  'conectores':   'CON',
  'splitters':    'SPL',
  'passivos':     'PAS',
  // Ferramentas
  'ferramentas':  'FER',
  // Outros / legado
  'outros':       'VLZ',
};

/** Cores dos badges por prefixo */
const CORES_PREFIXO = {
  ROT: { bg: '#dbeafe', color: '#1d4ed8' },
  ONU: { bg: '#ede9fe', color: '#6d28d9' },
  CPE: { bg: '#e0f2fe', color: '#0369a1' },
  CAB: { bg: '#d1fae5', color: '#065f46' },
  FIB: { bg: '#ecfdf5', color: '#047857' },
  CON: { bg: '#fef9c3', color: '#854d0e' },
  SPL: { bg: '#fff7ed', color: '#c2410c' },
  PAS: { bg: '#fce7f3', color: '#9d174d' },
  FER: { bg: '#f1f5f9', color: '#334155' },
  VLZ: { bg: '#f0fdf4', color: '#15803d' },
};

/** Departamentos — nível superior às categorias */
const DEPARTAMENTOS = [
  { id: 'rede',        nome: 'Infraestrutura de Rede', icone: '🔧', cor: '#162032', corLt: '#e8edf5' },
  { id: 'fisica',      nome: 'Infraestrutura Física',  icone: '🏗️', cor: '#c2410c', corLt: '#fff7ed' },
  { id: 'ferramentas', nome: 'Ferramentas',             icone: '🔨', cor: '#334155', corLt: '#f1f5f9' },
  { id: 'ti',          nome: 'TI / Escritório',         icone: '🖥️', cor: '#6d28d9', corLt: '#ede9fe' },
  { id: 'facilities',  nome: 'Facilities / Limpeza',   icone: '🧹', cor: '#065f46', corLt: '#d1fae5' },
];

function getDepto(id) {
  return DEPARTAMENTOS.find(d => d.id === id) || { id: '', nome: 'Geral', icone: '📦', cor: '#8a95a8', corLt: '#f1f5f9' };
}

/** Permissões por perfil */
const PERMISSOES = {
  admin: {
    deletarProduto:    true,
    cadastrarProduto:  true,
    editarProduto:     true,
    darBaixaProduto:   true,
    gerenciarUsuarios: true,
    verRelatorios:     true,
    limparHistorico:   true,
    exportar:          true,
    gerenciarCats:     true,
  },
  almoxarife: {
    deletarProduto:    false,
    cadastrarProduto:  true,
    editarProduto:     true,
    darBaixaProduto:   true,
    gerenciarUsuarios: false,
    verRelatorios:     true,
    limparHistorico:   false,
    exportar:          true,
    gerenciarCats:     false,
  },
  tecnico: {
    deletarProduto:    false,
    cadastrarProduto:  false,
    editarProduto:     false,
    darBaixaProduto:   true,
    gerenciarUsuarios: false,
    verRelatorios:     true,
    limparHistorico:   false,
    exportar:          false,
    gerenciarCats:     false,
  },
  visualizador: {
    deletarProduto:    false,
    cadastrarProduto:  false,
    editarProduto:     false,
    darBaixaProduto:   false,
    gerenciarUsuarios: false,
    verRelatorios:     true,
    limparHistorico:   false,
    exportar:          false,
    gerenciarCats:     false,
  },
};

/** Frases de boas vindas no login */
const FRASES_LOGIN = [
  'Organize. Controle. Prospere.',
  'Estoque sob controle, empresa em crescimento.',
  'Cada peça no lugar certo.',
  'Gestão inteligente começa aqui.',
  'Visibilidade total do seu inventário.',
  'Tecnologia a serviço da operação.',
];

/* ═══════════════════════════════════════════════════════════════
   APP — IIFE PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
const App = (() => {

  /* ── estado ── */
  let state = {
    sessao:       null,  // { id, nome, login, perfil }
    produtos:     [],
    categorias:   [],
    usuarios:     [],
    historico:    [],
    paginaAtual:  'dashboard',
    unsubscribers: [],
  };

  /* ── helpers ── */
  function pid() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function podeF(acao) {
    const perfil = state.sessao?.perfil || 'visualizador';
    return !!(PERMISSOES[perfil] && PERMISSOES[perfil][acao]);
  }

  function nomeCat(id) {
    return state.categorias.find(c => c.id === id)?.nome || '—';
  }

  function agora() { return new Date().toISOString(); }

  function dataFormatada(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ────────────────────────────────────────────────────────────
     TOAST
  ──────────────────────────────────────────────────────────── */
  function toast(msg, tipo = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast toast-${tipo}`;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  /* ────────────────────────────────────────────────────────────
     PREFIXO / CÓDIGO POR CATEGORIA
  ──────────────────────────────────────────────────────────── */
  function getPrefixoPorCategoria(categoriaId) {
    const cat = state.categorias.find(c => c.id === categoriaId);
    if (!cat) return 'VLZ';
    // Tenta mapear pelo ID primeiro
    if (PREFIXOS_CATEGORIA[categoriaId]) return PREFIXOS_CATEGORIA[categoriaId];
    // Tenta mapear pelo prefixo salvo na categoria
    if (cat.prefixo) return cat.prefixo.toUpperCase().slice(0, 4);
    // Gera automaticamente a partir das 3 primeiras letras do nome
    return cat.nome.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'VLZ';
  }

  function gerarProximoCodigo(categoriaId) {
    const prefixo = getPrefixoPorCategoria(categoriaId);
    const filtrados = state.produtos.filter(p => p.categoriaId === categoriaId);
    const numeros = filtrados.map(p => {
      const partes = (p.codigo || '').split('-');
      return parseInt(partes[partes.length - 1]) || 0;
    });
    const maior = numeros.length ? Math.max(...numeros) : 0;
    return `${prefixo}-${String(maior + 1).padStart(4, '0')}`;
  }

  function badgePrefixo(codigo) {
    if (!codigo) return '';
    const prefix = codigo.split('-')[0];
    const cor = CORES_PREFIXO[prefix] || { bg: '#f1f5f9', color: '#334155' };
    return `<span style="background:${cor.bg};color:${cor.color};padding:2px 8px;border-radius:20px;font-size:.7rem;font-weight:700;font-family:'DM Mono',monospace;letter-spacing:.04em">${prefix}</span>`;
  }

  /* ────────────────────────────────────────────────────────────
     LOGIN / LOGOUT
  ──────────────────────────────────────────────────────────── */
  function renderFraseLogin() {
    const el = document.getElementById('loginFrase');
    if (el) el.textContent = FRASES_LOGIN[Math.floor(Math.random() * FRASES_LOGIN.length)];
  }

  let _loginTentativas = 0;
  let _loginBloqueadoAte = 0;

  function login() {
    const loginVal = document.getElementById('loginUser').value.trim();
    const senhaVal = document.getElementById('loginPass').value;
    const errEl    = document.getElementById('loginError');

    if (Date.now() < _loginBloqueadoAte) {
      const seg = Math.ceil((_loginBloqueadoAte - Date.now()) / 1000);
      errEl.textContent = `Muitas tentativas. Aguarde ${seg}s.`;
      errEl.classList.remove('hidden');
      return;
    }

    if (!loginVal || !senhaVal) {
      errEl.textContent = 'Preencha usuário e senha.';
      errEl.classList.remove('hidden');
      return;
    }

    // ⚠️ CREDENCIAL BOOTSTRAP — remova antes de colocar em produção pública.
    const admPadrao = { id: 'admin_default', nome: 'Administrador', login: 'admin', senha: 'vloz2024', perfil: 'admin' };
    const todos = [...state.usuarios, admPadrao];
    const usuario = todos.find(u => u.login === loginVal && u.senha === senhaVal);

    if (!usuario) {
      errEl.textContent = 'Usuário ou senha incorretos.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    state.sessao = { id: usuario.id, nome: usuario.nome, login: usuario.login, perfil: usuario.perfil || 'almoxarife' };

    _loginTentativas = 0; _loginBloqueadoAte = 0;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    atualizarUIUsuario();
    navigate('dashboard');
    toast(`Bem-vindo, ${usuario.nome}!`, 'success');
  }

  function logout() {
    if (!confirm('Confirmar saída do sistema?')) return;
    state.sessao = null;
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    renderFraseLogin();
  }

  function atualizarUIUsuario() {
    if (!state.sessao) return;
    const { nome, perfil } = state.sessao;
    const avatarEl = document.getElementById('sidebarAvatar');
    const nomeEl   = document.getElementById('sidebarUser');
    const roleEl   = document.getElementById('sidebarRole');

    if (avatarEl) avatarEl.textContent = nome.charAt(0).toUpperCase();
    if (nomeEl)   nomeEl.textContent   = nome;
    if (roleEl)   roleEl.textContent   = labelPerfil(perfil);

    // Mostrar/ocultar itens de menu conforme perfil
    const navUsuarios = document.querySelector('[data-page="usuarios"]');
    const navExportar = document.querySelector('[data-page="exportar"]');
    const navCats     = document.querySelector('[data-page="categorias"]');

    if (navUsuarios) navUsuarios.style.display = podeF('gerenciarUsuarios') ? '' : 'none';
    if (navExportar) navExportar.style.display  = podeF('exportar')          ? '' : 'none';
    if (navCats)     navCats.style.display       = podeF('gerenciarCats')     ? '' : 'none';

    // Botão "Novo Produto" na aba produtos
    const btnNovoProd = document.querySelector('[onclick="App.openModal(\'modalProduto\')"]');
    if (btnNovoProd) btnNovoProd.style.display = podeF('cadastrarProduto') ? '' : 'none';

    // Botão limpar histórico
    const btnLimpar = document.getElementById('btnLimparHistorico');
    if (btnLimpar) btnLimpar.style.display = podeF('limparHistorico') ? '' : 'none';

    // Badge de perfil no header
    const badgePerfil = document.getElementById('badgePerfilHeader');
    if (badgePerfil) {
      badgePerfil.textContent = labelPerfil(perfil);
      badgePerfil.style.cssText = `
        display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;
        font-size:.72rem;font-weight:700;letter-spacing:.04em;
        ${perfil === 'admin'
          ? 'background:#162032;color:#8FBD9A;'
          : 'background:#e8f4eb;color:#065f46;'}
      `;
    }
  }

  function labelPerfil(perfil) {
    const map = { admin: 'Administrador', almoxarife: 'Almoxarife', tecnico: 'Técnico', visualizador: 'Visualizador' };
    return map[perfil] || perfil;
  }

  /* ────────────────────────────────────────────────────────────
     NAVEGAÇÃO
  ──────────────────────────────────────────────────────────── */
  function navigate(pagina) {
    // Verifica se tem permissão
    if (pagina === 'usuarios' && !podeF('gerenciarUsuarios')) {
      // permite visualizar mas sem ações
    }
    if (pagina === 'exportar' && !podeF('exportar')) return;
    if (pagina === 'categorias' && !podeF('gerenciarCats')) return;

    state.paginaAtual = pagina;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${pagina}`);
    if (pageEl) pageEl.classList.add('active');

    const navEl = document.querySelector(`[data-page="${pagina}"]`);
    if (navEl) navEl.classList.add('active');

    document.getElementById('topbarTitle').textContent = {
      dashboard:    'Dashboard',
      produtos:     'Produtos',
      movimentacao: 'Movimentação',
      movrecentes:  'Movimentações Recentes',
      historico:    'Histórico',
      'estoque-cat': 'Estoque por Categoria',
      categorias:   'Categorias',
      usuarios:     'Usuários',
      exportar:     'Exportar & Backup',
    }[pagina] || pagina;

    // Fecha sidebar mobile
    document.getElementById('sidebar').classList.remove('open');

    // Renderiza a página
    const renders = {
      dashboard:      renderDashboard,
      produtos:       renderProdutos,
      movimentacao:   renderMovimentacao,
      movrecentes:    renderMovRecentes,
      historico:      renderHistorico,
      'estoque-cat':  renderEstoqueCat,
      categorias:     renderCategorias,
      usuarios:       renderUsuarios,
    };
    if (renders[pagina]) renders[pagina]();
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  }

  /* ────────────────────────────────────────────────────────────
     FIREBASE LISTENERS
  ──────────────────────────────────────────────────────────── */
  function iniciarFirebase() {
    // Remove listeners anteriores
    state.unsubscribers.forEach(fn => fn());
    state.unsubscribers = [];

    state.unsubscribers.push(
      escutarColecao(COLECOES.produtos, lista => {
        state.produtos = lista;
        atualizarIndicadoresTopbar();
        if (state.paginaAtual === 'produtos')      renderProdutos();
        if (state.paginaAtual === 'dashboard')     renderDashboard();
        if (state.paginaAtual === 'estoque-cat')   renderEstoqueCat();
        populateSelects();
      })
    );

    state.unsubscribers.push(
      escutarColecao(COLECOES.categorias, lista => {
        state.categorias = lista;
        populateSelects();
        if (state.paginaAtual === 'categorias') renderCategorias();
        if (state.paginaAtual === 'dashboard')  renderDashboard();
      })
    );

    state.unsubscribers.push(
      escutarColecao(COLECOES.usuarios, lista => {
        state.usuarios = lista;
        if (state.paginaAtual === 'usuarios') renderUsuarios();
      })
    );

    state.unsubscribers.push(
      escutarColecao(COLECOES.historico, lista => {
        state.historico = lista.sort((a, b) => new Date(b.data) - new Date(a.data));
        if (state.paginaAtual === 'historico')    renderHistorico();
        if (state.paginaAtual === 'movrecentes')  renderMovRecentes();
        if (state.paginaAtual === 'dashboard')    renderDashboard();
      })
    );
  }

  /* ────────────────────────────────────────────────────────────
     POPULATE SELECTS (produtos, categorias)
  ──────────────────────────────────────────────────────────── */
  function populateSelects() {
    // Selects de categoria (com suporte a cascata de departamento)
    ['prodCategoria', 'filterCategoria'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value;

      // Filtra categorias pelo departamento selecionado (só para filterCategoria)
      const deptoSel = id === 'filterCategoria'
        ? (document.getElementById('filterDepto')?.value || '')
        : '';

      if (id === 'filterCategoria') {
        el.innerHTML = '<option value="">Todas as categorias</option>';
      } else {
        el.innerHTML = '<option value="">Selecione a categoria…</option>';
      }

      const lista = deptoSel
        ? state.categorias.filter(c => (c.grupo || '') === deptoSel)
        : state.categorias;

      lista.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        el.appendChild(opt);
      });
      if (cur) el.value = cur;
    });

    // Selects de produto para movimentação
    ['entradaProduto', 'saidaProduto', 'defeitoProduto'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value;
      el.innerHTML = '<option value="">Selecione o produto…</option>';
      [...state.produtos]
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `[${p.codigo}] ${p.nome}`;
          el.appendChild(opt);
        });
      if (cur) el.value = cur;
    });
  }

  /* ────────────────────────────────────────────────────────────
     DASHBOARD
  ──────────────────────────────────────────────────────────── */

  /* ────────────────────────────────────────────────────────────
     DEPARTAMENTO — cascata filtro depto → categoria
  ──────────────────────────────────────────────────────────── */
  function onFiltroDeptoChange() {
    // Reseta categoria ao trocar departamento
    const filtCat = document.getElementById('filterCategoria');
    if (filtCat) filtCat.value = '';
    populateSelects();  // repopula categorias filtradas
    renderProdutos();
  }

  function renderDashboard() {
    // Skeleton enquanto Firebase não respondeu
    if (!state.produtos.length && !state.historico.length) {
      document.querySelectorAll('.sc-val').forEach(el => {
        el.classList.add('skeleton');
        el.style.minWidth = '40px'; el.style.minHeight = '28px';
        el.textContent = '';
      });
    } else {
      document.querySelectorAll('.sc-val').forEach(el => {
        el.classList.remove('skeleton');
        el.style.minWidth = ''; el.style.minHeight = '';
      });
    }

    // Data de hoje
    const dashDate = document.getElementById('dashDate');
    if (dashDate) {
      dashDate.textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    }

    const agora30 = new Date(); agora30.setDate(agora30.getDate() - 30);
    const hist30 = state.historico.filter(h => new Date(h.data) >= agora30);

    const entradas = hist30.filter(h => h.tipo === 'entrada').reduce((s, h) => s + (h.qtd || 0), 0);
    const saidas   = hist30.filter(h => h.tipo === 'saida').reduce((s, h) => s + (h.qtd || 0), 0);

    const alertas = state.produtos.filter(p => p.qtd <= 0 || p.qtd < (p.qtdMin || 0));

    document.getElementById('statTotal').textContent    = state.produtos.length;
    document.getElementById('statEntradas').textContent = entradas;
    document.getElementById('statSaidas').textContent   = saidas;
    document.getElementById('statAlertas').textContent  = alertas.length;

    // Movimentações recentes: removido do dashboard — agora é página própria na sidebar

    // Alertas
    const alertEl = document.getElementById('dashAlertas');
    if (alertEl) {
      const prods = state.produtos.filter(p => p.qtd <= 0 || p.qtd < (p.qtdMin || 0)).slice(0, 10);
      if (!prods.length) {
        alertEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Estoque em dia!</div>';
      } else {
        alertEl.innerHTML = prods.map(p => {
          const zero = p.qtd <= 0;
          const pct  = p.qtdMin > 0 ? Math.round((p.qtd / p.qtdMin) * 100) : 0;
          return `
            <div class="alert-item ${zero ? 'zero-item' : 'warn-item'}">
              <div class="a-name">${badgePrefixo(p.codigo)} ${p.nome}</div>
              <div class="a-right">
                <span class="a-qty">${p.qtd} / ${p.qtdMin}</span>
                <span class="a-pct">${zero ? 'ZERADO' : pct + '% do mínimo'}</span>
              </div>
            </div>`;
        }).join('');
      }
    }

    // Distribuição por categoria: movida para página própria (estoque-cat)

    atualizarIndicadoresTopbar();
  }

  function atualizarIndicadoresTopbar() {
    const zerados = state.produtos.filter(p => p.qtd <= 0).length;
    const baixos  = state.produtos.filter(p => p.qtd > 0 && p.qtd < (p.qtdMin || 0)).length;
    const oks     = state.produtos.filter(p => p.qtd >= (p.qtdMin || 0)).length;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setVal('indZeradoVal', zerados);
    setVal('indBaixoVal',  baixos);
    setVal('indOkVal',     oks);

    const ind = document.querySelector('.stock-indicators');
    if (ind) {
      ind.classList.remove('has-zero', 'has-warn', 'all-ok');
      if (zerados > 0)      ind.classList.add('has-zero');
      else if (baixos > 0)  ind.classList.add('has-warn');
      else                  ind.classList.add('all-ok');
    }
  }

  /* ────────────────────────────────────────────────────────────
     PRODUTOS
  ──────────────────────────────────────────────────────────── */
  function renderProdutos() {
    const search    = (document.getElementById('searchProdutos')?.value || '').toLowerCase();
    const filtDepto = document.getElementById('filterDepto')?.value    || '';
    const filtCat   = document.getElementById('filterCategoria')?.value || '';
    const filtSt    = document.getElementById('filterStatus')?.value   || '';

    let lista = state.produtos.filter(p => {
      const cat         = state.categorias.find(c => c.id === p.categoriaId);
      const deptoId     = cat?.grupo || '';
      const matchSearch = !search    || p.nome.toLowerCase().includes(search) || (p.codigo || '').toLowerCase().includes(search);
      const matchDepto  = !filtDepto || deptoId === filtDepto;
      const matchCat    = !filtCat   || p.categoriaId === filtCat;
      const matchSt     = !filtSt    || p.status === filtSt;
      return matchSearch && matchDepto && matchCat && matchSt;
    });

    const tbody = document.getElementById('tabelaProdutosBody');
    if (!tbody) return;

    if (!lista.length) {
      const _msgVazia = state.produtos.length === 0
        ? '<div class="empty-icon">⬜</div><strong>Nenhum produto cadastrado</strong><p>Clique em "+ Novo Produto" para começar</p>'
        : '<div class="empty-icon">🔍</div><strong>Nenhum resultado</strong><p>Ajuste os filtros de busca</p>';
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">${_msgVazia}</div></td></tr>`;
      return;
    }

    const podeDel   = podeF('deletarProduto');
    const podeEdit  = podeF('editarProduto');
    const podeBaixa = podeF('darBaixaProduto');

    // Agrupar por departamento
    const grupos = {};
    lista.forEach(p => {
      const cat    = state.categorias.find(c => c.id === p.categoriaId);
      const deptoId = cat?.grupo || '';
      if (!grupos[deptoId]) grupos[deptoId] = [];
      grupos[deptoId].push(p);
    });

    // Ordenar produtos dentro de cada grupo por nome
    Object.values(grupos).forEach(g => g.sort((a, b) => a.nome.localeCompare(b.nome)));

    // Ordenar grupos: departamentos conhecidos primeiro, 'Geral' por último
    const ordemDepto = DEPARTAMENTOS.map(d => d.id);
    const gruposOrdenados = Object.keys(grupos).sort((a, b) => {
      const ia = ordemDepto.indexOf(a);
      const ib = ordemDepto.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let html = '';
    gruposOrdenados.forEach(deptoId => {
      const depto    = getDepto(deptoId);
      const produtos = grupos[deptoId];

      // Linha separadora de departamento
      html += `
        <tr class="depto-separator">
          <td colspan="8">
            <div class="depto-sep-inner" style="border-left:3px solid ${depto.cor};background:${depto.corLt}">
              <span class="depto-sep-icon">${depto.icone}</span>
              <span class="depto-sep-nome" style="color:${depto.cor}">${depto.nome}</span>
              <span class="depto-sep-count">${produtos.length} produto${produtos.length !== 1 ? 's' : ''}</span>
            </div>
          </td>
        </tr>`;

      produtos.forEach(p => {
        const zero = p.qtd <= 0;
        const warn = !zero && p.qtd < (p.qtdMin || 0);
        const rowClass = zero ? 'row-zero' : (warn ? 'row-warn' : '');
        const stockBadge = zero
          ? `<span class="stock-zero">${p.qtd}</span>`
          : warn
            ? `<span class="stock-warn">${p.qtd}</span>`
            : `<span class="stock-ok">${p.qtd}</span>`;

        const acoes = [
          podeEdit  ? `<button class="btn-icon" onclick="App.editarProduto('${p.id}')" title="Editar">✏</button>` : '',
          podeBaixa ? `<button class="btn-icon" onclick="App.abrirModalBaixa('${p.id}')" title="Registrar baixa">↑</button>` : '',
          podeDel   ? `<button class="btn-icon danger" onclick="App.deletarProduto('${p.id}')" title="Excluir produto">🗑</button>` : '',
        ].filter(Boolean).join('');

        html += `
          <tr class="${rowClass}">
            <td><span style="font-family:'DM Mono',monospace;font-size:.85rem">${badgePrefixo(p.codigo)} ${p.codigo || '—'}</span></td>
            <td>
              <strong>${p.nome}</strong>
              ${p.descricao ? `<div style="font-size:.75rem;color:var(--text3);margin-top:2px">${p.descricao.slice(0,60)}${p.descricao.length>60?'…':''}</div>` : ''}
            </td>
            <td>${p.marca ? `<span class="marca-tag">${p.marca}</span>` : '<span style="color:var(--text3);font-size:.8rem">—</span>'}</td>
            <td style="font-size:.82rem;color:var(--text2)">${nomeCat(p.categoriaId) || '—'}</td>
            <td>${stockBadge}</td>
            <td style="font-family:'DM Mono',monospace;font-size:.85rem;color:var(--text3)">${p.qtdMin || 0}</td>
            <td><span class="tag-status tag-${p.status || 'novo'}">${p.status || 'novo'}</span></td>
            <td><div style="display:flex;gap:4px">${acoes || '<span style="color:var(--text3);font-size:.78rem">—</span>'}</div></td>
          </tr>`;
      });
    });

    tbody.innerHTML = html;
  }

  /* ── Modal Produto ── */

  /* ────────────────────────────────────────────────────────────
     MARCA — seleção por botão com opção customizada
  ──────────────────────────────────────────────────────────── */
  function selecionarMarca(btn) {
    // Remove seleção anterior
    document.querySelectorAll('.marca-btn').forEach(b => b.classList.remove('ativa'));
    btn.classList.add('ativa');

    const val    = btn.dataset.marca;
    const custom = document.getElementById('prodMarcaCustom');

    if (val === '__outro') {
      // Abre campo livre e limpa hidden
      custom.classList.remove('hidden');
      custom.focus();
      document.getElementById('prodMarca').value = custom.value.trim();
    } else {
      // Marca da lista — esconde campo livre
      custom.classList.add('hidden');
      custom.value = '';
      document.getElementById('prodMarca').value = val;
    }
  }

  function openModalProduto(id = null) {
    if (id) {
      if (!podeF('editarProduto')) { toast('Sem permissão para editar produto', 'error'); return; }
      editarProduto(id);
      return;
    }
    if (!podeF('cadastrarProduto')) { toast('Sem permissão para cadastrar produto', 'error'); return; }

    document.getElementById('modalProdutoTitle').textContent = 'Novo Produto';
    document.getElementById('prodId').value         = '';
    document.getElementById('prodNome').value       = '';
    document.getElementById('prodCodigo').value     = '';
    document.getElementById('prodCategoria').value  = '';
    document.getElementById('prodUnidade').value    = 'unidade';
    document.getElementById('prodQtd').value        = '0';
    document.getElementById('prodQtdMin').value     = '5';
    document.getElementById('prodStatus').value     = 'novo';
    document.getElementById('prodDescricao').value  = '';
    document.getElementById('prodMarca').value       = '';
    document.getElementById('prodMarcaCustom').value = '';
    document.getElementById('prodMarcaCustom').classList.add('hidden');
    document.querySelectorAll('.marca-btn').forEach(b => b.classList.remove('ativa'));

    populateSelects();

    // Gera código automático ao trocar categoria
    const selCat = document.getElementById('prodCategoria');
    selCat.onchange = () => {
      const catId = selCat.value;
      if (!catId) return;
      if (!document.getElementById('prodId').value) {
        document.getElementById('prodCodigo').value = gerarProximoCodigo(catId);
      }
    };

    openModal('modalProduto');
  }

  function editarProduto(id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;

    document.getElementById('modalProdutoTitle').textContent = 'Editar Produto';
    document.getElementById('prodId').value        = p.id;
    document.getElementById('prodNome').value      = p.nome;
    document.getElementById('prodCodigo').value    = p.codigo;
    document.getElementById('prodUnidade').value   = p.unidade || 'unidade';
    document.getElementById('prodQtd').value       = p.qtd;
    document.getElementById('prodQtdMin').value    = p.qtdMin;
    document.getElementById('prodStatus').value    = p.status || 'novo';
    document.getElementById('prodDescricao').value = p.descricao || '';

    populateSelects();
    document.getElementById('prodCategoria').value = p.categoriaId || '';

    // Restaurar seleção de marca
    const marcaVal = p.marca || '';
    const MARCAS_LISTA = ['Intelbras','TP-Link','Huawei','Mikrotik','Ubiquiti',
                          'Draytek','HP','Cisco','D-Link','Furukawa','Datacom'];
    document.getElementById('prodMarca').value = marcaVal;
    document.querySelectorAll('.marca-btn').forEach(b => b.classList.remove('ativa'));
    if (marcaVal && MARCAS_LISTA.includes(marcaVal)) {
      const btn = document.querySelector(`.marca-btn[data-marca="${marcaVal}"]`);
      if (btn) btn.classList.add('ativa');
      document.getElementById('prodMarcaCustom').classList.add('hidden');
      document.getElementById('prodMarcaCustom').value = '';
    } else if (marcaVal) {
      // Marca customizada
      const btnOutro = document.querySelector('.marca-btn[data-marca="__outro"]');
      if (btnOutro) btnOutro.classList.add('ativa');
      document.getElementById('prodMarcaCustom').classList.remove('hidden');
      document.getElementById('prodMarcaCustom').value = marcaVal;
    } else {
      document.getElementById('prodMarcaCustom').classList.add('hidden');
      document.getElementById('prodMarcaCustom').value = '';
    }

    openModal('modalProduto');
  }

  let _salvandoProduto = false;
  async function salvarProduto() {
    if (_salvandoProduto) return;
    _salvandoProduto = true;
    const _btnSalvar = document.querySelector('#modalProduto .btn-primary');
    if (_btnSalvar) _btnSalvar.classList.add('btn-loading');
    const _releaseSalvar = () => {
      _salvandoProduto = false;
      if (_btnSalvar) _btnSalvar.classList.remove('btn-loading');
    };
    const id         = document.getElementById('prodId').value;
    const nome       = document.getElementById('prodNome').value.trim();
    const categoriaId = document.getElementById('prodCategoria').value;
    let   codigo     = document.getElementById('prodCodigo').value.trim();

    if (!nome) { toast('Nome do produto é obrigatório', 'error'); return; }
    if (!categoriaId) { toast('Selecione uma categoria', 'error'); return; }

    // Gera código se vazio
    if (!codigo) codigo = gerarProximoCodigo(categoriaId);

    // Verifica duplicidade de código (exceto ao editar o próprio)
    const jaExiste = state.produtos.find(p => p.codigo === codigo && p.id !== id);
    if (jaExiste) { toast('Código já está em uso por outro produto', 'error'); return; }

    const marcaRaw = document.getElementById('prodMarca').value.trim();

    const dados = {
      nome, codigo, categoriaId,
      marca:     marcaRaw || '',
      unidade:   document.getElementById('prodUnidade').value,
      qtd:       Number(document.getElementById('prodQtd').value)    || 0,
      qtdMin:    Number(document.getElementById('prodQtdMin').value)  || 0,
      status:    document.getElementById('prodStatus').value,
      descricao: document.getElementById('prodDescricao').value.trim(),
    };

    try {
      if (id) {
        const atual = state.produtos.find(p => p.id === id) || {};
        await salvarDoc(COLECOES.produtos, { ...atual, ...dados, id });

        // Registra histórico de edição
        await salvarDoc(COLECOES.historico, {
          id: pid(), tipo: 'edicao', produtoId: id,
          nomeProduto: dados.nome, qtd: 0,
          usuario: state.sessao?.nome || '—',
          perfil:  state.sessao?.perfil || '—',
          data: agora(), detalhe: 'Produto editado',
        });
        toast('Produto atualizado com sucesso');
      } else {
        const novo = { id: pid(), ...dados };
        await salvarDoc(COLECOES.produtos, novo);
        toast('Produto cadastrado com sucesso');
      }
      _releaseSalvar();
      closeModal('modalProduto');
    } catch (e) {
      console.error(e);
      _releaseSalvar();
      toast('Erro ao salvar produto. Tente novamente.', 'error');
    }
  }

  async function deletarProduto(id) {
    if (!podeF('deletarProduto')) {
      toast('Apenas administradores podem excluir produtos', 'error');
      return;
    }
    const prod = state.produtos.find(p => p.id === id);
    if (!prod) return;

    if (!confirm(`Excluir "${prod.nome}" permanentemente?\nEsta ação não pode ser desfeita.`)) return;

    try {
      await excluirDoc(COLECOES.produtos, id);
      // Registra no histórico
      await salvarDoc(COLECOES.historico, {
        id: pid(), tipo: 'exclusao', produtoId: id,
        nomeProduto: prod.nome, qtd: 0,
        usuario: state.sessao?.nome || '—',
        perfil:  state.sessao?.perfil || '—',
        data: agora(), detalhe: 'Produto excluído pelo administrador',
      });
      toast('Produto excluído');
    } catch (e) {
      toast('Erro ao excluir produto', 'error');
    }
  }

  /* ── Modal Baixa (para não-admins que não podem deletar) ── */
  function abrirModalBaixa(produtoId) {
    if (!podeF('darBaixaProduto')) {
      toast('Sem permissão para registrar baixa', 'error');
      return;
    }
    const prod = state.produtos.find(p => p.id === produtoId);
    if (!prod) return;

    const body = document.getElementById('modalMovBody');
    body.innerHTML = `
      <div style="margin-bottom:16px">
        <strong>${prod.nome}</strong>
        <span style="font-family:'DM Mono',monospace;margin-left:8px;color:var(--text3);font-size:.85rem">${badgePrefixo(prod.codigo)} ${prod.codigo}</span>
        <div style="margin-top:6px;font-size:.85rem;color:var(--text3)">Estoque atual: <strong style="color:var(--navy)">${prod.qtd}</strong> ${prod.unidade || 'un'}</div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Quantidade *</label>
          <input type="number" id="baixaQtd" min="1" max="${prod.qtd}" value="1" />
        </div>
        <div class="form-group">
          <label>Motivo da baixa *</label>
          <select id="baixaMotivo">
            <option value="">Selecione…</option>
            <option value="Uso em campo">🔧 Uso em campo</option>
            <option value="Defeito">⚠ Defeito / Avaria</option>
            <option value="Perda">📉 Perda / Extravio</option>
            <option value="Transferência">🔄 Transferência</option>
            <option value="Vencimento">⏰ Vencimento</option>
            <option value="Outros">📝 Outros</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Justificativa detalhada * <span style="color:var(--text3);font-weight:400">(mín. 10 caracteres)</span></label>
          <textarea id="baixaJustificativa" rows="3" placeholder="Descreva detalhadamente o motivo da baixa…"></textarea>
        </div>
      </div>`;

    document.getElementById('modalMovTitle').textContent = 'Registrar Baixa';

    const btnConfirm = document.getElementById('modalMovConfirm');
    btnConfirm.onclick = () => confirmarBaixa(produtoId, prod);

    openModal('modalMovimento');
  }

  async function confirmarBaixa(produtoId, prod) {
    const qtd  = parseInt(document.getElementById('baixaQtd').value) || 0;
    const motivo = document.getElementById('baixaMotivo').value;
    const just   = document.getElementById('baixaJustificativa').value.trim();

    if (qtd <= 0) { toast('Quantidade deve ser maior que zero', 'error'); return; }
    if (qtd > prod.qtd) { toast('Quantidade maior que o estoque disponível', 'error'); return; }
    if (!motivo) { toast('Selecione o motivo da baixa', 'error'); return; }
    if (just.length < 10) { toast('Justificativa deve ter pelo menos 10 caracteres', 'error'); return; }

    try {
      const novaQtd = prod.qtd - qtd;
      await salvarDoc(COLECOES.produtos, { ...prod, qtd: novaQtd });
      await salvarDoc(COLECOES.historico, {
        id: pid(), tipo: 'saida', produtoId,
        nomeProduto: prod.nome, qtd,
        usuario: state.sessao?.nome || '—',
        perfil:  state.sessao?.perfil || '—',
        data: agora(),
        detalhe: `${motivo} — ${just}`,
        motivo, justificativa: just,
      });
      closeModal('modalMovimento');
      toast(`Baixa de ${qtd} ${prod.unidade || 'un'} registrada com sucesso`);
    } catch (e) {
      toast('Erro ao registrar baixa', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     MOVIMENTAÇÃO
  ──────────────────────────────────────────────────────────── */
  function renderMovimentacao() {
    // Badge do usuário na aba saída
    const badgeEl = document.getElementById('saidaUsuarioBadge');
    if (badgeEl && state.sessao) {
      badgeEl.innerHTML = `
        <div class="u-avatar-sm">${state.sessao.nome.charAt(0).toUpperCase()}</div>
        <span>Saída registrada por <strong>${state.sessao.nome}</strong> · ${labelPerfil(state.sessao.perfil)}</span>`;
    }
  }

  function switchMovTab(tab) {
    document.querySelectorAll('.mov-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mov-panel').forEach(p => p.classList.add('hidden'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('hidden');
  }

  function selecionarMotivo(btn) {
    document.querySelectorAll('.motivo-btn').forEach(b => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    document.getElementById('saidaMotivo').value = btn.dataset.motivo;
    const outrosGroup = document.getElementById('saidaOutrosGroup');
    if (outrosGroup) {
      outrosGroup.classList.toggle('hidden', btn.dataset.motivo !== 'Outros');
    }
  }

  async function registrarEntrada() {
    const prodId = document.getElementById('entradaProduto').value;
    const qtd    = parseInt(document.getElementById('entradaQtd').value) || 0;
    const origem = document.getElementById('entradaOrigem').value.trim();
    const nf     = document.getElementById('entradaNF').value.trim();
    const obs    = document.getElementById('entradaObs').value.trim();

    if (!prodId) { toast('Selecione um produto', 'error'); return; }
    if (qtd <= 0) { toast('Quantidade deve ser maior que zero', 'error'); return; }

    const prod = state.produtos.find(p => p.id === prodId);
    if (!prod) { toast('Produto não encontrado', 'error'); return; }

    try {
      await salvarDoc(COLECOES.produtos, { ...prod, qtd: prod.qtd + qtd });
      await salvarDoc(COLECOES.historico, {
        id: pid(), tipo: 'entrada', produtoId: prodId,
        nomeProduto: prod.nome, qtd,
        usuario: state.sessao?.nome || '—',
        perfil:  state.sessao?.perfil || '—',
        data: agora(),
        detalhe: [origem && `Origem: ${origem}`, nf && `NF: ${nf}`, obs].filter(Boolean).join(' | ') || '—',
        origem, nf, obs,
      });

      document.getElementById('entradaProduto').value = '';
      document.getElementById('entradaQtd').value     = '1';
      document.getElementById('entradaOrigem').value  = '';
      document.getElementById('entradaNF').value      = '';
      document.getElementById('entradaObs').value     = '';

      toast(`Entrada de ${qtd} ${prod.unidade || 'un'} registrada!`);
    } catch (e) {
      toast('Erro ao registrar entrada', 'error');
    }
  }

  async function registrarSaida() {
    const prodId = document.getElementById('saidaProduto').value;
    const qtd    = parseInt(document.getElementById('saidaQtd').value) || 0;
    const motivo = document.getElementById('saidaMotivo').value;
    const dest   = document.getElementById('saidaDestino').value.trim();
    const obs    = document.getElementById('saidaObs').value.trim();
    const obsExt = document.getElementById('saidaObsExtra').value.trim();

    if (!prodId) { toast('Selecione um produto', 'error'); return; }
    if (qtd <= 0) { toast('Quantidade deve ser maior que zero', 'error'); return; }
    if (!motivo)  { toast('Selecione o motivo da saída', 'error'); return; }
    if (motivo === 'Outros' && obs.length < 5) { toast('Descreva o motivo com ao menos 5 caracteres', 'error'); return; }

    const prod = state.produtos.find(p => p.id === prodId);
    if (!prod) { toast('Produto não encontrado', 'error'); return; }
    if (prod.qtd < qtd) { toast(`Estoque insuficiente (disponível: ${prod.qtd})`, 'error'); return; }

    const detalhe = [motivo, dest && `OS: ${dest}`, obs || obsExt].filter(Boolean).join(' | ');

    try {
      await salvarDoc(COLECOES.produtos, { ...prod, qtd: prod.qtd - qtd });
      await salvarDoc(COLECOES.historico, {
        id: pid(), tipo: 'saida', produtoId: prodId,
        nomeProduto: prod.nome, qtd,
        usuario: state.sessao?.nome || '—',
        perfil:  state.sessao?.perfil || '—',
        data: agora(), detalhe, motivo,
        justificativa: obs || obsExt,
      });

      document.getElementById('saidaProduto').value = '';
      document.getElementById('saidaQtd').value     = '1';
      document.getElementById('saidaMotivo').value  = '';
      document.getElementById('saidaDestino').value = '';
      document.getElementById('saidaObs').value     = '';
      document.getElementById('saidaObsExtra').value = '';
      document.querySelectorAll('.motivo-btn').forEach(b => b.classList.remove('ativo'));
      document.getElementById('saidaOutrosGroup')?.classList.add('hidden');

      toast(`Saída de ${qtd} ${prod.unidade || 'un'} registrada!`);
    } catch (e) {
      toast('Erro ao registrar saída', 'error');
    }
  }

  async function registrarDefeito() {
    const prodId = document.getElementById('defeitoProduto').value;
    const qtd    = parseInt(document.getElementById('defeitoQtd').value) || 0;
    const motivo = document.getElementById('defeitoMotivo').value.trim();

    if (!prodId) { toast('Selecione um produto', 'error'); return; }
    if (qtd <= 0) { toast('Quantidade deve ser maior que zero', 'error'); return; }
    if (!motivo)  { toast('Descreva o defeito encontrado', 'error'); return; }

    const prod = state.produtos.find(p => p.id === prodId);
    if (!prod) return;
    if (prod.qtd < qtd) { toast('Quantidade maior que o estoque disponível', 'error'); return; }

    try {
      await salvarDoc(COLECOES.produtos, { ...prod, qtd: prod.qtd - qtd });
      await salvarDoc(COLECOES.historico, {
        id: pid(), tipo: 'defeito', produtoId: prodId,
        nomeProduto: prod.nome, qtd,
        usuario: state.sessao?.nome || '—',
        perfil:  state.sessao?.perfil || '—',
        data: agora(), detalhe: motivo, motivo,
      });

      document.getElementById('defeitoProduto').value = '';
      document.getElementById('defeitoQtd').value     = '1';
      document.getElementById('defeitoMotivo').value  = '';

      toast(`Defeito de ${qtd} ${prod.unidade || 'un'} registrado`);
    } catch (e) {
      toast('Erro ao registrar defeito', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     HISTÓRICO
  ──────────────────────────────────────────────────────────── */
  function renderHistorico() {
    const search    = (document.getElementById('histSearch')?.value || '').toLowerCase();
    const filtTipo  = document.getElementById('histTipo')?.value || '';
    const dataIni   = document.getElementById('histDataInicio')?.value;
    const dataFim   = document.getElementById('histDataFim')?.value;

    let lista = state.historico.filter(h => {
      const matchSearch = !search || (h.nomeProduto || '').toLowerCase().includes(search);
      const matchTipo   = !filtTipo || h.tipo === filtTipo;
      const d = new Date(h.data);
      const matchIni  = !dataIni || d >= new Date(dataIni);
      const matchFim  = !dataFim || d <= new Date(dataFim + 'T23:59:59');
      return matchSearch && matchTipo && matchIni && matchFim;
    });

    const tbody = document.getElementById('historicoBody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhum registro encontrado</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(h => `
      <tr>
        <td style="white-space:nowrap;font-size:.8rem;color:var(--text3)">${dataFormatada(h.data)}</td>
        <td><span class="mov-badge badge-${h.tipo}">${h.tipo}</span></td>
        <td>${h.nomeProduto || '—'}</td>
        <td style="font-family:'DM Mono',monospace;font-weight:700">${h.qtd || 0}</td>
        <td>
          <div style="font-size:.85rem">${h.usuario || '—'}</div>
          <div style="font-size:.72rem;color:var(--text3)">${h.perfil ? labelPerfil(h.perfil) : ''}</div>
        </td>
        <td style="font-size:.82rem;color:var(--text2);max-width:280px">
          ${h.detalhe || '—'}
          ${h.justificativa && h.justificativa !== h.detalhe
            ? `<div style="font-size:.72rem;color:var(--text3);margin-top:2px">✎ ${h.justificativa}</div>`
            : ''}
        </td>
      </tr>`).join('');
  }

  async function limparHistorico() {
    if (!podeF('limparHistorico')) { toast('Sem permissão', 'error'); return; }
    if (!confirm('Limpar TODO o histórico? Esta ação não pode ser desfeita.')) return;
    try {
      await Promise.all(state.historico.map(h => excluirDoc(COLECOES.historico, h.id)));
      toast('Histórico limpo');
    } catch (e) {
      toast('Erro ao limpar histórico', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     CATEGORIAS
  ──────────────────────────────────────────────────────────── */

  /* ────────────────────────────────────────────────────────────
     ESTOQUE POR CATEGORIA — página dedicada e completa
  ──────────────────────────────────────────────────────────── */
  function renderEstoqueCat() {
    const grid  = document.getElementById('estoqueCatGrid');
    const sub   = document.getElementById('estoqueCatSub');
    if (!grid) return;

    const CORES = [
      '#5a9e6a','#5b8fff','#f5a623','#8b5cf6',
      '#06b6d4','#e5484d','#10b981','#f59e0b',
      '#ec4899','#0ea5e9','#84cc16','#a855f7',
    ];

    const dados = state.categorias.map((c, i) => {
      const prods   = state.produtos.filter(p => p.categoriaId === c.id);
      const qtdTotal = prods.reduce((s, p) => s + (p.qtd || 0), 0);
      const zerados  = prods.filter(p => p.qtd <= 0).length;
      const baixos   = prods.filter(p => p.qtd > 0 && p.qtd < (p.qtdMin || 0)).length;
      const ok       = prods.filter(p => p.qtd >= (p.qtdMin || 0) && p.qtd > 0).length;
      const cor      = CORES[i % CORES.length];
      return { ...c, prods, qtdTotal, zerados, baixos, ok, cor, nProds: prods.length };
    }).sort((a, b) => b.qtdTotal - a.qtdTotal);

    const totalItens = dados.reduce((s, d) => s + d.qtdTotal, 0);
    const totalProds = dados.reduce((s, d) => s + d.nProds, 0);
    const maxQtd     = Math.max(...dados.map(d => d.qtdTotal), 1);

    if (sub) {
      sub.textContent = `${totalProds} produto${totalProds !== 1 ? 's' : ''} · ${totalItens} itens em estoque`;
    }

    if (!dados.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">◧</div>Nenhuma categoria cadastrada</div>';
      return;
    }

    grid.innerHTML = dados.map(d => {
      const pctBar     = Math.round((d.qtdTotal / maxQtd) * 100);
      const pctTotal   = totalItens > 0 ? ((d.qtdTotal / totalItens) * 100).toFixed(1) : '0.0';
      const statusHtml = [
        d.zerados ? `<span class="ecat-badge ecat-danger">✕ ${d.zerados} zerado${d.zerados > 1 ? 's' : ''}</span>` : '',
        d.baixos  ? `<span class="ecat-badge ecat-warn">▲ ${d.baixos} baixo${d.baixos > 1 ? 's' : ''}</span>`    : '',
        d.ok      ? `<span class="ecat-badge ecat-ok">● ${d.ok} ok</span>`                                        : '',
      ].filter(Boolean).join('');

      const prodRows = d.prods
        .sort((a, b) => a.qtd - b.qtd)
        .slice(0, 5)
        .map(p => {
          const zero = p.qtd <= 0;
          const warn = !zero && p.qtd < (p.qtdMin || 0);
          const cor2 = zero ? 'var(--danger)' : warn ? 'var(--warn-dk)' : 'var(--ok-dk)';
          return `
            <div class="ecat-prod-row">
              <span class="ecat-prod-nome">${p.nome}</span>
              <span class="ecat-prod-qtd" style="color:${cor2}">${p.qtd}</span>
            </div>`;
        }).join('');

      const temMais = d.prods.length > 5;

      return `
        <div class="ecat-card">
          <div class="ecat-card-top">
            <div class="ecat-icon-wrap" style="background:${d.cor}22;color:${d.cor}">
              ${d.icone || '📦'}
            </div>
            <div class="ecat-info">
              <div class="ecat-nome">${d.nome}</div>
              <div class="ecat-grupo">${d.grupo || '—'}</div>
            </div>
            <div class="ecat-total-wrap">
              <div class="ecat-total-val" style="color:${d.cor}">${d.qtdTotal}</div>
              <div class="ecat-total-label">itens</div>
            </div>
          </div>

          <div class="ecat-bar-row">
            <div class="ecat-bar-track">
              <div class="ecat-bar-fill" style="width:${pctBar}%;background:${d.cor}"></div>
            </div>
            <span class="ecat-pct-label">${pctTotal}% do total</span>
          </div>

          <div class="ecat-status-row">${statusHtml || '<span class="ecat-badge ecat-ok">Sem produtos</span>'}</div>

          ${d.prods.length > 0 ? `
          <div class="ecat-prods">
            <div class="ecat-prods-header">Produtos em destaque</div>
            ${prodRows}
            ${temMais ? `<div class="ecat-prods-mais" onclick="App.navigate('produtos')"
              >+ ${d.prods.length - 5} produto${d.prods.length - 5 > 1 ? 's' : ''} · Ver todos →</div>` : ''}
          </div>` : ''}
        </div>`;
    }).join('');
  }

  function renderCategorias() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    if (!state.categorias.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">◧</div>Nenhuma categoria cadastrada</div>';
      return;
    }

    const podeDel  = podeF('gerenciarCats');
    const podeEdit = podeF('gerenciarCats');

    // Agrupar categorias por departamento
    const grupos = {};
    state.categorias.forEach(c => {
      const deptoId = c.grupo || '';
      if (!grupos[deptoId]) grupos[deptoId] = [];
      grupos[deptoId].push(c);
    });
    const ordemDepto = DEPARTAMENTOS.map(d => d.id);
    const gruposOrdenados = Object.keys(grupos).sort((a,b) => {
      const ia = ordemDepto.indexOf(a), ib = ordemDepto.indexOf(b);
      if (ia===-1 && ib===-1) return 0; if (ia===-1) return 1; if (ib===-1) return -1;
      return ia - ib;
    });

    let htmlCat = '';
    gruposOrdenados.forEach(deptoId => {
      const depto = getDepto(deptoId);
      htmlCat += `
        <div class="cat-depto-header" style="border-left:3px solid ${depto.cor};background:${depto.corLt}">
          <span>${depto.icone}</span>
          <span style="color:${depto.cor};font-weight:700;font-size:.85rem">${depto.nome}</span>
          <span style="color:${depto.cor};opacity:.6;font-size:.75rem">${grupos[deptoId].length} categoria${grupos[deptoId].length!==1?'s':''}</span>
        </div>
        <div class="cat-depto-grid">`;

      grupos[deptoId].forEach(c => {
        const count   = state.produtos.filter(p => p.categoriaId === c.id).length;
        const prefixo = getPrefixoPorCategoria(c.id);
        const corPre  = CORES_PREFIXO[prefixo] || { bg: '#f1f5f9', color: '#334155' };
        htmlCat += `
          <div class="cat-card">
            <div class="cat-icon">${c.icone || '📦'}</div>
            <div class="cat-name">${c.nome}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
              <span style="background:${corPre.bg};color:${corPre.color};padding:1px 7px;border-radius:20px;font-size:.65rem;font-weight:700;font-family:'DM Mono',monospace">${prefixo}</span>
            </div>
            <div class="cat-count">${count} produto${count !== 1 ? 's' : ''}</div>
            <div class="cat-actions">
              ${podeEdit ? `<button class="btn-icon" onclick="App.editarCategoria('${c.id}')" title="Editar">✏</button>` : ''}
              ${podeDel  ? `<button class="btn-icon danger" onclick="App.deletarCategoria('${c.id}')" title="Excluir">🗑</button>` : ''}
            </div>
          </div>`;
      });

      htmlCat += `</div>`;
    });

    grid.innerHTML = htmlCat;
  }

  async function salvarCategoria() {
    const nome   = document.getElementById('catNome').value.trim();
    const grupo  = document.getElementById('catGrupo').value;
    const icone  = document.getElementById('catIcone').value.trim() || '📦';
    const prefixo = document.getElementById('catPrefixo')?.value.trim().toUpperCase().slice(0, 4) || '';

    if (!nome) { toast('Nome da categoria é obrigatório', 'error'); return; }

    const id = document.getElementById('catId')?.value || pid();
    try {
      await salvarDoc(COLECOES.categorias, { id, nome, grupo, icone, prefixo });
      closeModal('modalCategoria');
      toast('Categoria salva');
    } catch (e) {
      toast('Erro ao salvar categoria', 'error');
    }
  }

  function editarCategoria(id) {
    const c = state.categorias.find(x => x.id === id);
    if (!c) return;

    document.getElementById('catNome').value  = c.nome;
    document.getElementById('catGrupo').value = c.grupo || '';
    document.getElementById('catIcone').value = c.icone || '';
    if (document.getElementById('catPrefixo'))
      document.getElementById('catPrefixo').value = c.prefixo || '';
    if (document.getElementById('catId'))
      document.getElementById('catId').value = c.id;

    openModal('modalCategoria');
  }

  async function deletarCategoria(id) {
    if (!podeF('gerenciarCats')) { toast('Sem permissão', 'error'); return; }
    const c = state.categorias.find(x => x.id === id);
    if (!c) return;
    const prods = state.produtos.filter(p => p.categoriaId === id).length;
    if (prods > 0) {
      toast(`Não é possível excluir: categoria possui ${prods} produto(s)`, 'warn');
      return;
    }
    if (!confirm(`Excluir categoria "${c.nome}"?`)) return;
    try {
      await excluirDoc(COLECOES.categorias, id);
      toast('Categoria excluída');
    } catch (e) {
      toast('Erro ao excluir categoria', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     USUÁRIOS
  ──────────────────────────────────────────────────────────── */
  function renderUsuarios() {
    const tbody  = document.getElementById('usuariosBody');
    const aviso  = document.getElementById('usuariosAviso');
    const btnNovo = document.querySelector('[onclick="App.openModal(\'modalUsuario\')"]');

    const isAdmin = podeF('gerenciarUsuarios');
    if (aviso)  aviso.style.display  = isAdmin ? 'none' : 'flex';
    if (btnNovo) btnNovo.style.display = isAdmin ? '' : 'none';

    if (!tbody) return;

    const admPadrao = { id: 'admin_default', nome: 'Administrador', login: 'admin', perfil: 'admin' };
    const lista = [admPadrao, ...state.usuarios.filter(u => u.id !== 'admin_default')];

    tbody.innerHTML = lista.map(u => `
      <tr>
        <td style="font-family:'DM Mono',monospace;font-size:.85rem">${u.login}</td>
        <td>${u.nome}</td>
        <td>
          <span style="background:${u.perfil === 'admin' ? '#162032' : '#e8f4eb'};
            color:${u.perfil === 'admin' ? '#8FBD9A' : '#065f46'};
            padding:2px 10px;border-radius:20px;font-size:.72rem;font-weight:700">
            ${labelPerfil(u.perfil)}
          </span>
        </td>
        <td>
          ${isAdmin && u.id !== 'admin_default' ? `
            <div style="display:flex;gap:4px">
              <button class="btn-icon" onclick="App.editarUsuario('${u.id}')" title="Editar">✏</button>
              <button class="btn-icon danger" onclick="App.deletarUsuario('${u.id}')" title="Excluir">🗑</button>
            </div>` : '—'}
        </td>
      </tr>`).join('');
  }

  function editarUsuario(id) {
    const u = state.usuarios.find(x => x.id === id);
    if (!u) return;

    document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
    document.getElementById('userId').value    = u.id;
    document.getElementById('userName').value  = u.nome;
    document.getElementById('userLogin').value = u.login;
    document.getElementById('userPass').value  = '';
    document.getElementById('userRole').value  = u.perfil || 'almoxarife';

    openModal('modalUsuario');
  }

  async function salvarUsuario() {
    if (!podeF('gerenciarUsuarios')) { toast('Sem permissão', 'error'); return; }

    const id    = document.getElementById('userId').value;
    const nome  = document.getElementById('userName').value.trim();
    const login = document.getElementById('userLogin').value.trim();
    const senha = document.getElementById('userPass').value;
    const perfil = document.getElementById('userRole').value;

    if (!nome || !login) { toast('Nome e login são obrigatórios', 'error'); return; }
    if (!id && !senha)   { toast('Senha obrigatória para novo usuário', 'error'); return; }

    // Verifica login duplicado
    const jaExiste = state.usuarios.find(u => u.login === login && u.id !== id);
    if (jaExiste) { toast('Login já está em uso', 'error'); return; }

    const uid = id || pid();
    const atual = id ? state.usuarios.find(u => u.id === id) : {};
    const dados = { ...atual, id: uid, nome, login, perfil };
    if (senha) dados.senha = senha;

    try {
      await salvarDoc(COLECOES.usuarios, dados);
      closeModal('modalUsuario');
      toast(id ? 'Usuário atualizado' : 'Usuário criado');
    } catch (e) {
      toast('Erro ao salvar usuário', 'error');
    }
  }

  async function deletarUsuario(id) {
    if (!podeF('gerenciarUsuarios')) { toast('Sem permissão', 'error'); return; }
    const u = state.usuarios.find(x => x.id === id);
    if (!u) return;
    if (state.sessao?.id === id) { toast('Você não pode excluir seu próprio usuário', 'error'); return; }
    if (!confirm(`Excluir usuário "${u.nome}"?`)) return;
    try {
      await excluirDoc(COLECOES.usuarios, id);
      toast('Usuário excluído');
    } catch (e) {
      toast('Erro ao excluir usuário', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     EXPORTAR
  ──────────────────────────────────────────────────────────── */
  function exportarProdutosCSV() {
    if (!podeF('exportar')) { toast('Sem permissão para exportar', 'error'); return; }
    const header = 'Código,Nome,Categoria,Qtd,Mínimo,Status,Descrição';
    const rows   = state.produtos.map(p =>
      `"${p.codigo}","${p.nome}","${nomeCat(p.categoriaId)}","${p.qtd}","${p.qtdMin}","${p.status}","${p.descricao || ''}"`
    );
    download([header, ...rows].join('\n'), `produtos_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    toast('Exportação concluída');
  }

  function exportarHistoricoCSV() {
    if (!podeF('exportar')) { toast('Sem permissão para exportar', 'error'); return; }
    const header = 'Data,Tipo,Produto,Qtd,Usuário,Perfil,Detalhe,Justificativa';
    const rows   = state.historico.map(h =>
      `"${dataFormatada(h.data)}","${h.tipo}","${h.nomeProduto || ''}","${h.qtd}","${h.usuario || ''}","${h.perfil || ''}","${h.detalhe || ''}","${h.justificativa || ''}"`
    );
    download([header, ...rows].join('\n'), `historico_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    toast('Histórico exportado');
  }

  function exportarBackup() {
    if (!podeF('exportar')) { toast('Sem permissão para exportar', 'error'); return; }
    const backup = {
      versao: '3.0', exportadoEm: agora(),
      exportadoPor: state.sessao?.nome || '—',
      produtos: state.produtos,
      categorias: state.categorias,
      historico: state.historico,
    };
    download(JSON.stringify(backup, null, 2), `backup_vloz_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
    toast('Backup gerado com sucesso');
  }

  async function importarBackup(event) {
    if (!podeF('exportar')) { toast('Sem permissão', 'error'); return; }
    const file = event.target.files[0];
    if (!file) return;

    try {
      const txt    = await file.text();
      const backup = JSON.parse(txt);

      if (!backup.produtos || !backup.categorias) {
        toast('Arquivo de backup inválido', 'error'); return;
      }

      if (!confirm(`Importar backup de ${backup.exportadoEm?.slice(0,10) || '?'}?\nIsso irá SOBRESCREVER dados existentes.`)) return;

      await salvarLote(COLECOES.produtos,    backup.produtos);
      await salvarLote(COLECOES.categorias,  backup.categorias);
      if (backup.historico?.length) await salvarLote(COLECOES.historico, backup.historico);

      toast(`Backup importado: ${backup.produtos.length} produtos, ${backup.categorias.length} categorias`);
    } catch (e) {
      toast('Erro ao importar backup: arquivo corrompido', 'error');
    }
    event.target.value = '';
  }

  function download(conteudo, nome, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ────────────────────────────────────────────────────────────
     MODAIS genéricos
  ──────────────────────────────────────────────────────────── */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function closeModalOutside(event, id) {
    if (event.target.id === id) closeModal(id);
  }

  /* ────────────────────────────────────────────────────────────
     INIT
  ──────────────────────────────────────────────────────────── */

  /* ────────────────────────────────────────────────────────────
     MOV RECENTES — página dedicada
  ──────────────────────────────────────────────────────────── */
  function renderMovRecentes() {
    const listEl = document.getElementById('movRecentesPageList');
    if (!listEl) return;

    const recentes = state.historico.slice(0, 50);

    if (!recentes.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⇄</div>Nenhuma movimentação registrada ainda</div>';
      return;
    }

    listEl.innerHTML = recentes.map(h => {
      const sinal = h.tipo === 'entrada' ? '+' : '-';
      return `
        <div class="mov-item">
          <span class="mov-badge badge-${h.tipo}">${h.tipo}</span>
          <div class="mov-info">
            <div class="mov-name">${h.nomeProduto || '—'}</div>
            <div class="mov-meta">${dataFormatada(h.data)} · ${h.usuario || '—'} · ${h.perfil ? labelPerfil(h.perfil) : ''}</div>
            ${h.detalhe ? `<div class="mov-meta" style="margin-top:2px;color:var(--text3)">${h.detalhe}</div>` : ''}
          </div>
          <span class="mov-qty" style="color:${h.tipo === 'entrada' ? 'var(--ok-dk)' : 'var(--warn-dk)'}">${h.tipo === 'entrada' ? '+' : '-'}${h.qtd}</span>
        </div>`;
    }).join('');
  }

  /* toggleChartExpand: substituída por App._renderCatChart inline no renderDashboard */

  function init() {
    renderFraseLogin();

    // Login ao pressionar Enter
    ['loginUser', 'loginPass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    });

    iniciarFirebase();
  }

  /* ── API pública ── */
  return {
    init,
    login, logout,
    navigate, toggleSidebar,
    // Produtos
    openModal, openModalProduto,
    salvarProduto, editarProduto, deletarProduto,
    abrirModalBaixa, selecionarMarca,
    renderProdutos,
    // Departamento
    onFiltroDeptoChange,
    // Movimentação
    renderMovimentacao,
    switchMovTab, selecionarMotivo,
    registrarEntrada, registrarSaida, registrarDefeito,
    // Histórico
    renderHistorico, limparHistorico,
    // Categorias
    renderCategorias, salvarCategoria, editarCategoria, deletarCategoria,
    // Usuários
    renderUsuarios, salvarUsuario, editarUsuario, deletarUsuario,
    // Exportar
    exportarProdutosCSV, exportarHistoricoCSV, exportarBackup, importarBackup,
    // Modal genérico
    closeModal, closeModalOutside,
    // Dashboard extras
    renderEstoqueCat,
  };

})();

/* ═══════════════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  window.App = App;
  App.init();
});
