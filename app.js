/**
 * VLOZ TELECOM — SISTEMA DE ESTOQUE v2.1
 * Atualização: Código automático por categoria
 */

import {
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
} from "./firebase.js";

/* ===== PREFIXOS POR CATEGORIA ===== */
const PREFIXOS = {
  'cat1': 'RED','cat2': 'RED','cat3': 'RED','cat4': 'RED','cat5': 'RED',
  'cat6': 'RED','cat7': 'RED','cat8': 'RED','cat9': 'RED','cat10': 'RED',
  'cat11': 'ESC','cat12': 'ESC','cat13': 'ESC',
  'cat14': 'LIM','cat15': 'LIM',
};

function gerarCodigoPorCategoria(categoriaId, produtos) {
  const prefixo = PREFIXOS[categoriaId] || 'GEN';

  const filtrados = produtos.filter(p => p.categoriaId === categoriaId);

  const numeros = filtrados.map(p => {
    const partes = p.codigo?.split('-');
    return parseInt(partes?.[1]) || 0;
  });

  const maior = numeros.length ? Math.max(...numeros) : 0;
  const novoNumero = String(maior + 1).padStart(3, '0');

  return `${prefixo}-${novoNumero}`;
}

const App = (() => {

  let state = {
    sessao: null,
    produtos: [],
    categorias: [],
    usuarios: [],
    historico: [],
    paginaAtual: 'dashboard'
  };

  function pid() {
    return 'id_' + Math.random().toString(36).slice(2, 10);
  }

  function toast(msg, tipo='success') {
    console.log(`[${tipo}]`, msg);
  }

  function populateSelects() {
    const prodCat = document.getElementById('prodCategoria');
    if (prodCat) {
      const cur = prodCat.value;
      prodCat.innerHTML = '<option value="">Selecione…</option>';
      state.categorias.forEach(c => {
        prodCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
      });
      if (cur) prodCat.value = cur;
    }
  }

  /* ===== MODAL PRODUTO ATUALIZADO ===== */
  function openModalProduto() {
    document.getElementById('modalProdutoTitle').textContent = 'Novo Produto';
    document.getElementById('prodId').value = '';
    document.getElementById('prodNome').value = '';
    document.getElementById('prodCodigo').value = '';
    document.getElementById('prodCategoria').value = '';
    document.getElementById('prodUnidade').value = 'unidade';
    document.getElementById('prodQtd').value = '0';
    document.getElementById('prodQtdMin').value = '5';
    document.getElementById('prodStatus').value = 'novo';
    document.getElementById('prodDescricao').value = '';

    populateSelects();

    setTimeout(() => {
      const select = document.getElementById('prodCategoria');

      select.onchange = () => {
        const categoriaId = select.value;
        if (!categoriaId) return;

        const codigo = gerarCodigoPorCategoria(categoriaId, state.produtos);
        document.getElementById('prodCodigo').value = codigo;
      };
    }, 100);

    document.getElementById('modalProduto').classList.remove('hidden');
  }

  /* ===== SALVAR PRODUTO ATUALIZADO ===== */
  async function salvarProduto() {
    const id = document.getElementById('prodId').value;
    const nome = document.getElementById('prodNome').value.trim();

    let codigo = document.getElementById('prodCodigo').value.trim();
    const categoriaId = document.getElementById('prodCategoria').value;

    if (!codigo && categoriaId) {
      codigo = gerarCodigoPorCategoria(categoriaId, state.produtos);
    }

    if (!nome || !codigo) {
      toast('Nome e código são obrigatórios', 'error');
      return;
    }

    const dados = {
      nome,
      codigo,
      categoriaId,
      unidade: document.getElementById('prodUnidade').value,
      qtd: Number(document.getElementById('prodQtd').value) || 0,
      qtdMin: Number(document.getElementById('prodQtdMin').value) || 0,
      status: document.getElementById('prodStatus').value,
      descricao: document.getElementById('prodDescricao').value.trim(),
    };

    try {
      if (id) {
        const atual = state.produtos.find(p => p.id === id);
        await salvarDoc(COLECOES.produtos, { ...atual, ...dados, id });
        toast('Produto atualizado');
      } else {
        if (state.produtos.find(p => p.codigo === codigo)) {
          toast('Código já existe', 'error');
          return;
        }

        const novo = { id: pid(), ...dados };
        await salvarDoc(COLECOES.produtos, novo);
        toast('Produto cadastrado');
      }

      document.getElementById('modalProduto').classList.add('hidden');

    } catch (e) {
      toast('Erro ao salvar produto', 'error');
    }
  }

  /* ===== FIREBASE LISTENER ===== */
  function iniciarFirebase() {
    escutarColecao(COLECOES.produtos, lista => {
      state.produtos = lista;
    });

    escutarColecao(COLECOES.categorias, lista => {
      state.categorias = lista;
      populateSelects();
    });
  }

  function init() {
    iniciarFirebase();
  }

  return {
    init,
    openModalProduto,
    salvarProduto
  };

})();

document.addEventListener('DOMContentLoaded', () => {
  window.App = App;
  App.init();
});
